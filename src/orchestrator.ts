/**
 * Orchestrator — Multi-Pipeline Manager
 * Manages N project pipelines in parallel, each going through BMAD phases.
 * Uses Claude Code Agent SDK for actual development work.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import { runClaudeAgent, gitInit, gitPush, gitClone, agentEvents, type AgentAction } from "./claude_code.js";
import { findSkillsForContext } from "./skills.js";
import {
    isDokployConfigured,
    createDokployProject,
    createDokployApplication,
    createDomain,
    triggerDeploy,
    getBuildLogs,
    getLatestDeployment,
    getApplicationLogs,
    getDokployUrl,
} from "./dokploy.js";

// ─── Types ───

export type PipelinePhase =
    | "QUEUED"
    | "ANALYSIS"
    | "ARCHITECTURE"
    | "SCAFFOLD"
    | "DEPLOYING"
    | "DEVELOPMENT"
    | "DEBUGGING"
    | "QA"
    | "COMPLETED"
    | "FAILED"
    | "PAUSED";
export type ProjectType = "static" | "spa" | "fullstack" | "api" | "python-worker" | "node-worker" | "postgres" | "redis" | "unknown";
export type ProjectService = {
    name: string;
    type: ProjectType;
    stack?: string;
};

export type AgentStatus = "waiting" | "active" | "done" | "error";

export type PipelineAgent = {
    role: string;
    emoji: string;
    status: AgentStatus;
    currentAction?: string;
    startedAt?: string;
    completedAt?: string;
    output?: string;
};

export type PipelineEvent = {
    id: string;
    pipelineId: string;
    timestamp: string;
    agentRole: string;
    agentEmoji: string;
    action: string;
    type: "info" | "success" | "error" | "warning" | "deploy";
};

export type Pipeline = {
    id: string;
    name: string;
    description: string;
    phase: PipelinePhase;
    progress: number;          // 0-100
    services: ProjectService[];
    agents: PipelineAgent[];
    events: PipelineEvent[];
    workspace: string;         // /workspace/<id>
    model?: string;
    github?: {
        owner: string;
        repo: string;
        url: string;
    };
    dokploy?: {
        projectId: string;
        applicationId?: string;
        domainId?: string;
        url?: string;
        apps?: {
            name: string;
            type: ProjectType;
            applicationId: string;
            domainId?: string;
            url?: string;
        }[];
    };
    artifacts: Record<string, unknown>;
    tokenUsage: { inputTokens: number; outputTokens: number };
    createdAt: string;
    updatedAt: string;
    error?: string;
};

// ─── Constants ───

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "/workspace";
const STORE_PATH = process.env.PIPELINES_STORE || "/data/pipelines.json";

// Read at call-time (not at module init) so env vars from .env container work
const getGithubOwner = () => process.env.GITHUB_OWNER || "";
const getGithubToken = () => process.env.GITHUB_TOKEN || "";

const DEFAULT_AGENTS: Omit<PipelineAgent, "status">[] = [
    { role: "Analyst", emoji: "🔍" },
    { role: "Architect", emoji: "📐" },
    { role: "Developer", emoji: "💻" },
    { role: "Debugger", emoji: "🔧" },
    { role: "QA", emoji: "🧪" },
];

// ─── Phase weights for progress calculation ───
const PHASE_PROGRESS: Record<PipelinePhase, number> = {
    QUEUED: 0,
    ANALYSIS: 10,
    ARCHITECTURE: 25,
    SCAFFOLD: 35,
    DEPLOYING: 40,
    DEVELOPMENT: 70,
    DEBUGGING: 75,
    QA: 90,
    COMPLETED: 100,
    FAILED: 0,
    PAUSED: 0,
};

// ─── Orchestrator Class ───

export class Orchestrator extends EventEmitter {
    private pipelines: Map<string, Pipeline> = new Map();
    private running: Set<string> = new Set();
    private abortControllers: Map<string, AbortController> = new Map();

    constructor() {
        super();
        this.setMaxListeners(50);
        this.loadState().catch(() => { /* first run, no state file */ });

        // Forward agent events
        agentEvents.on("action", (action: AgentAction) => {
            this.emit("agent-action", action);
        });
    }

    // ─── Pipeline Management ───

    async launchIdea(description: string, name?: string, model?: string, files?: { base64: string; type: string }[]): Promise<Pipeline> {
        const id = crypto.randomUUID().slice(0, 8);
        const projectName = name || this.slugify(description);
        const workspace = path.join(WORKSPACE_ROOT, id);

        await fs.mkdir(workspace, { recursive: true });

        const pipeline: Pipeline = {
            id,
            name: projectName,
            description,
            model,
            phase: "QUEUED",
            progress: 0,
            services: [],
            agents: DEFAULT_AGENTS.map(a => ({ ...a, status: "waiting" as AgentStatus })),
            events: [],
            workspace,
            artifacts: {},
            tokenUsage: { inputTokens: 0, outputTokens: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (files && files.length > 0) {
            pipeline.artifacts.initialFiles = files;
        }

        this.pipelines.set(id, pipeline);
        this.addEvent(id, "Orchestrator", "🚀", `Pipeline créé: "${description}"`, "info");
        await this.saveState();

        // Start async execution
        this.executePipeline(id).catch(err => {
            console.error(`[Orchestrator] Pipeline ${id} failed:`, err);
            this.setPhase(id, "FAILED", String(err.message || err));
        });

        return pipeline;
    }

    listPipelines(): Pipeline[] {
        return Array.from(this.pipelines.values());
    }

    getPipeline(id: string): Pipeline | undefined {
        return this.pipelines.get(id);
    }

    async pausePipeline(id: string): Promise<boolean> {
        const p = this.pipelines.get(id);
        if (!p || p.phase === "COMPLETED" || p.phase === "FAILED") return false;
        p.phase = "PAUSED";
        p.updatedAt = new Date().toISOString();
        this.addEvent(id, "Orchestrator", "⏸️", "Pipeline mis en pause", "warning");
        await this.saveState();
        return true;
    }

    async resumePipeline(id: string): Promise<boolean> {
        const p = this.pipelines.get(id);
        if (!p || p.phase !== "PAUSED") return false;
        this.addEvent(id, "Orchestrator", "▶️", "Pipeline repris", "info");
        // If project already has dokploy/github, it was a modification — don't re-run full pipeline
        const pendingMod = p.artifacts.pendingModification as string | undefined;
        if (pendingMod) {
            this.executeModification(id, pendingMod).catch(console.error);
        } else if (p.dokploy) {
            // Already deployed — resume from development
            this.executeFromDevelopment(id).catch(console.error);
        } else {
            this.executePipeline(id).catch(console.error);
        }
        return true;
    }

    async deletePipeline(id: string): Promise<boolean> {
        this.killPipeline(id);
        this.running.delete(id);
        this.pipelines.delete(id);
        await this.saveState();
        return true;
    }

    async killPipeline(id: string): Promise<boolean> {
        const p = this.pipelines.get(id);
        if (!p) return false;

        // Abort running Anthropic streams or scripts
        const controller = this.abortControllers.get(id);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(id);
        }

        this.running.delete(id);

        if (p.phase !== "COMPLETED" && p.phase !== "FAILED") {
            this.setPhase(id, "FAILED", "Pipeline arrêté manuellement via le Kill Switch.");
            this.addEvent(id, "Orchestrator", "🛑", "Processus arrêté de force.", "error");
        }
        await this.saveState();
        return true;
    }

    // ─── Modify Existing Pipeline ───

    async modifyPipeline(id: string, instructions: string, model?: string, files?: { base64: string; type: string }[]): Promise<Pipeline | null> {
        const p = this.pipelines.get(id);
        if (p && model) p.model = model;
        if (!p) return null;
        if (this.running.has(id)) throw new Error("Pipeline is already running");
        if (!["COMPLETED", "FAILED"].includes(p.phase)) {
            throw new Error("Pipeline must be COMPLETED or FAILED to modify");
        }

        // Reset state for modification
        p.phase = "DEVELOPMENT";
        p.progress = 50;
        p.error = undefined;
        p.artifacts.pendingModification = instructions; // used by resumePipeline
        if (files && files.length > 0) {
            (p.artifacts as any).pendingModificationFiles = files;
        }

        p.events.push({
            id: crypto.randomUUID(),
            pipelineId: id,
            timestamp: new Date().toISOString(),
            agentRole: "Orchestrator",
            agentEmoji: "✏️",
            action: `Modification demandée: ${instructions.slice(0, 100)}...${(files && files.length > 0) ? ` (avec ${files.length} fichiers)` : ''}`,
            type: "info",
        });
        await this.saveState();

        // Run modification in background
        this.executeModification(id, instructions, files).catch(err => {
            console.error(`[Orchestrator] Modify error for ${id}:`, err);
        });

        return p;
    }

    private async executeModification(id: string, instructions: string, files?: { base64: string; type: string }[]) {
        if (this.running.has(id)) return;
        this.running.add(id);

        const abortController = new AbortController();
        this.abortControllers.set(id, abortController);

        const p = this.pipelines.get(id)!;

        try {
            this.setPhase(id, "DEVELOPMENT");
            this.setAgentStatus(id, "Developer", "active", "Modification en cours...");

            // Clone the repo if workspace doesn't exist (container was rebuilt)
            if (p.github) {
                const workspaceExists = await fs.access(p.workspace).then(() => true).catch(() => false);
                if (!workspaceExists) {
                    this.addEvent(id, "Developer", "💻", "Re-clonage du workspace...", "info");
                    await gitClone(
                        `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`,
                        p.workspace
                    );
                }
            }

            // Run developer agent with modification instructions
            const result = await runClaudeAgent({
                model: p.model,
                prompt: `Tu as un projet existant à modifier. Voici les instructions:

${instructions}

PROCESSUS OBLIGATOIRE - respecte cet ordre:
1. Utilise list_dir sur ".": liste tous les fichiers du projet
2. Utilise read_file sur les fichiers clés (main.py, server.py, requirements.txt, package.json, etc.)
3. IDENTIFIE ce qui doit changer
4. UTILISE write_file ou replace_in_file pour sauvegarder chaque fichier modifié (OBLIGATOIRE - sinon la tâche est un échec)
5. Confirme la liste des fichiers écrits

RÈGLES ABSOLUES:
- Tu DOIS utiliser l'outil write_file ou replace_in_file au moins une fois
- Si tu détectes des imports cassés (ex: from src.xxx import), réécris le fichier entier avec le code corrigé
- Vérifie que tous les packages importés sont dans requirements.txt
- 0 fichier écrit = tâche invalide`,
                attachedFiles: files,
                systemPrompt: "Tu es un développeur senior. Tu DOIS écrire des fichiers avec write_file ou replace_in_file. Lire sans écrire = tâche échouée. Si tu vois un bug tu dois le corriger en écrivant le fichier fixé.",
                cwd: p.workspace,
                allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir"],
                maxTurns: 150,
                timeoutMs: 15 * 60 * 1000,
                abortSignal: this.abortControllers.get(id)?.signal,
            });

            if (!result.success) {
                this.addEvent(id, "Developer", "💻", `Erreur modification: ${result.error}`, "warning");
            }
            this.addTokens(id, result);

            // Push to GitHub
            if (p.github) {
                // Check if there's anything to commit
                const { execSync } = await import("node:child_process");
                let hasChanges = false;
                try {
                    const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                    hasChanges = status.length > 0;
                } catch { hasChanges = false; }

                if (!hasChanges) {
                    this.addEvent(id, "Developer", "⚠️", "Aucun fichier modifié — l'agent n'a pas écrit de code. Reformule ta demande en étant plus précis sur les fichiers à modifier.", "warning");
                } else {
                    const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                    const pushed = await gitPush(p.workspace, `mod: ${instructions.slice(0, 50)}`, authUrl);
                    if (pushed) {
                        this.addEvent(id, "Developer", "💻", "Push → modification appliquée", "success");
                    } else {
                        this.addEvent(id, "Developer", "⚠️", "Push échoué — relance la modification", "warning");
                    }
                }
            }


            // Wait for Dokploy build
            if (p.dokploy) {
                await this.waitForBuild(id);
            }

            // Run QA
            this.setPhase(id, "QA");
            this.setAgentStatus(id, "QA", "active", "Vérification post-modification...");

            const qaResult = await runClaudeAgent({
                model: p.model,
                prompt: `Vérifie que le projet fonctionne correctement après les modifications:
"${instructions}"

1. Vérifie que le build fonctionne
2. Vérifie qu'il n'y a pas d'erreurs dans le code
3. Vérifie que les modifications sont correctes`,
                systemPrompt: "Tu es un QA engineer. Vérifie le code de manière rigoureuse.",
                cwd: p.workspace,
                allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir"],
                maxTurns: 50,
                abortSignal: abortController.signal,
            });
            this.addTokens(id, qaResult);
            this.setAgentStatus(id, "QA", "done");

            // Push any fixes applied during QA
            if (p.github) {
                const { execSync } = await import("node:child_process");
                let hasQhanges = false;
                try {
                    const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                    hasQhanges = status.length > 0;
                } catch { hasQhanges = false; }

                if (hasQhanges) {
                    const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                    const pushed = await gitPush(p.workspace, `fix: QA auto-corrections applied`, authUrl);
                    if (pushed) {
                        this.addEvent(id, "QA", "💻", "Push → correctifs QA appliqués", "success");
                    } else {
                        this.addEvent(id, "QA", "⚠️", "Push QA échoué", "warning");
                    }
                }
            }

            // Auto-fix loop if website is down
            if (p.dokploy) {
                await this.verifyAndAutoFix(id);
            }

            // Done
            delete p.artifacts.pendingModification;
            this.setPhase(id, "COMPLETED");
            this.addEvent(id, "Orchestrator", "🎉", "Modification terminée et déployée!", "success");

        } catch (err: any) {
            if (err.name === 'AbortError') {
                this.addEvent(id, "Orchestrator", "🛑", "Modification annulée.", "error");
            } else {
                this.setPhase(id, "FAILED", err.message);
                this.addEvent(id, "Orchestrator", "❌", `Erreur modification: ${err.message}`, "error");
            }
        } finally {
            this.abortControllers.delete(id);
            this.running.delete(id);
            await this.saveState();
        }
    }

    // ─── Resume from Development (after pause on already-deployed project) ───

    private async executeFromDevelopment(id: string) {
        if (this.running.has(id)) return;
        this.running.add(id);
        try {
            await this.runDevelopment(id);
            if (!this.shouldStop(id)) await this.runQA(id);
            this.setPhase(id, "COMPLETED");
            this.addEvent(id, "Orchestrator", "🎉", "Projet terminé et déployé!", "success");
        } catch (err: any) {
            this.setPhase(id, "FAILED", err.message);
        } finally {
            this.running.delete(id);
            await this.saveState();
        }
    }

    // ─── Pipeline Execution ───

    private async executePipeline(id: string) {
        if (this.running.has(id)) return;
        this.running.add(id);

        const abortController = new AbortController();
        this.abortControllers.set(id, abortController);

        const p = this.pipelines.get(id)!;

        try {
            // Phase 1: Analysis
            await this.runAnalysis(id);
            if (this.shouldStop(id)) return;

            // Phase 2: Architecture
            await this.runArchitecture(id);
            if (this.shouldStop(id)) return;

            // Phase 3: Scaffold + Deploy
            await this.runScaffold(id);
            if (this.shouldStop(id)) return;

            // Phase 4: Development (iterative)
            await this.runDevelopment(id);
            if (this.shouldStop(id)) return;

            // Phase 5: QA
            await this.runQA(id);

            // Auto-fix loop if website is down
            if (p.dokploy) {
                await this.verifyAndAutoFix(id);
            }

            // Done!
            this.setPhase(id, "COMPLETED");
            this.setAgentStatus(id, "QA", "done");
            const p_done = this.pipelines.get(id);
            const completedMsg = p_done?.dokploy
                ? `Projet terminé et déployé! → ${p_done.dokploy.url || "voir Dokploy"}`
                : p_done?.github
                    ? `Projet terminé! Repo GitHub: ${p_done.github.url} (Dokploy: vérifie DOKPLOY_URL dans les variables d'env)`
                    : "Projet terminé! Configure GITHUB_TOKEN et DOKPLOY_URL pour le déploiement.";
            this.addEvent(id, "Orchestrator", "🎉", completedMsg, "success");

        } catch (err: any) {
            if (err.name === 'AbortError') {
                this.addEvent(id, "Orchestrator", "🛑", "Pipeline annulé.", "error");
            } else {
                this.setPhase(id, "FAILED", err.message);
                this.addEvent(id, "Orchestrator", "❌", `Erreur: ${err.message}`, "error");
            }
        } finally {
            this.abortControllers.delete(id);
            this.running.delete(id);
            await this.saveState();
        }
    }

    // ─── Phase Runners ───

    private async runAnalysis(id: string) {
        this.setPhase(id, "ANALYSIS");
        this.setAgentStatus(id, "Analyst", "active", "Analyse du projet...");

        const p = this.pipelines.get(id)!;

        const result = await runClaudeAgent({
            model: p.model,
            prompt: `Analyse cette idée de projet et crée un document PRD (Product Requirements Document) concis.

Idée: "${p.description}"

Réponds en JSON avec cette structure:
{
  "name": "nom du projet",
  "summary": "résumé en 2-3 phrases",
  "services": [
    {
      "name": "frontend-dashboard",
      "type": "spa",
      "stack": "React, Tailwind"
    },
    {
      "name": "data-scraper-worker",
      "type": "python-worker",
      "stack": "Python, CCXT"
    },
    {
      "name": "database",
      "type": "postgres",
      "stack": "PostgreSQL"
    }
  ],
  "features": ["feature 1", "feature 2", ...],
  "userStories": [{"story": "...", "priority": "High|Medium|Low"}],
  "targetAudience": "..."
}

Règles pour le champ "type" de chaque service:
- "static" : HTML/CSS/JS vanilla, pas de build tool, pas de backend
- "spa" : React, Vue, Svelte, Angular, Vite, Next.js... (nécessite npm run build)
- "fullstack" : déprécié, sépare plutôt en un service "spa" et un service "api".
- "api" : backend/API uniquement (Node.js/Express ou Python/FastAPI)
- "python-worker": Tâche d'arrière plan en Python (bot, scraper, daemon, IA). IMPORTANT: ne PAS utiliser pour une API web. Pas de port exposé.
- "node-worker": Tâche d'arrière plan en Node.js (bot, cron). Pas de port exposé.
- "postgres" ou "redis": Bases de données si nécessaire.
SI le projet est simple, tu PEUX ne lister qu'un seul service dans le tableau.`,
            systemPrompt: "Tu es un analyste produit senior. Sois concis et pragmatique. IMPORTANT: si le projet est un bot/scraper/daemon Python avec un dashboard web, choisis 'python-worker' (pas 'fullstack') — le dashboard Flask est automatiquement intégré par notre infra.",
            cwd: p.workspace,
            maxTurns: 3,
            attachedFiles: (p.artifacts.initialFiles as any),
            abortSignal: this.abortControllers.get(id)?.signal,
        });

        if (result.success && result.finalResult) {
            const analysis = this.tryParseJson(result.finalResult);
            p.artifacts.analysis = analysis;
            // Parse services array from JSON
            p.services = Array.isArray(analysis?.services)
                ? analysis.services
                : [{ name: "main", type: this.detectProjectType(analysis) }];

            const typesStr = p.services.map(s => s.type).join(', ');
            this.setAgentStatus(id, "Analyst", "done", "PRD créé");
            this.addEvent(id, "Analyst", "🔍", `✓ PRD créé — services: ${typesStr}`, "success");
        } else {
            this.setAgentStatus(id, "Analyst", "error", result.error || "Échec");
            this.addEvent(id, "Analyst", "🔍", `✗ Analyse échouée: ${result.error}`, "error");
            throw new Error(`Analysis failed: ${result.error}`);
        }
        this.addTokens(id, result);
        await this.saveState();
    }

    private async runArchitecture(id: string) {
        this.setPhase(id, "ARCHITECTURE");
        this.setAgentStatus(id, "Architect", "active", "Conception de l'architecture...");

        const p = this.pipelines.get(id)!;

        // Find relevant skills from skills.sh
        const analysis = p.artifacts.analysis as any;
        const keywords = [
            ...(analysis?.stack ? Object.values(analysis.stack) : []),
            ...(analysis?.techStack ? Object.values(analysis.techStack) : []),
            ...(analysis?.technologies || []),
            p.description,
        ].filter(Boolean).map(String);

        const skills = await findSkillsForContext(keywords, 5);
        const skillsContext = skills.length > 0
            ? `\n\nSkills disponibles sur skills.sh:\n${skills.map(s => `- ${s.title}: ${s.content?.substring(0, 200)}...`).join("\n")}`
            : "";

        this.addEvent(id, "Architect", "📐", `Skills assignés: ${skills.map(s => s.title).join(", ") || "aucun"}`, "info");

        const servicesInfos = p.services.map(s => {
            const dockerfile = this.getDockerfileTemplate(s.type, analysis?.stack);
            const guidance = this.getArchitectureGuidance(s.type);
            return `Service: ${s.name} (Type: ${s.type})\n${guidance}\n[Dockerfile Recommandé]\n\`\`\`dockerfile\n${dockerfile}\n\`\`\``;
        }).join("\n\n---\n\n");

        const needsMultimodal = /pdf|image|vision|multimodal|multi-modal/i.test(p.description);
        const multimodalContext = needsMultimodal
            ? "\n\nRECOMMANDATION MULTIMODAL/PDF:\n- L'utilisateur a demandé des capacités PDF/Multimodales. Prévois l'intégration d'un SDK d'IA (ex: @anthropic-ai/sdk ou openai) ainsi que des librairies de parsing de base comme pdf-parse pour le backend, ou react-pdf/pdfjs-dist coté frontend."
            : "";

        const result = await runClaudeAgent({
            model: p.model,
            prompt: `Conçois l'architecture technique multi-services pour ce projet.

PRD: ${JSON.stringify(analysis, null, 2)}

SERVICES DÉTECTÉS PAR L'ANALYSTE:
${servicesInfos}
${multimodalContext}
${skillsContext}

Crée un document d'architecture détaillé avec:
1. Stack technique précise pour CHAQUE service
2. Arborescence des fichiers (séparée par dossiers de services, ex: /frontend, /backend)
3. Endpoints API inter-services (si applicable)
4. Schéma de données
5. Plan de déploiement (Docker Compose ou multi-containers)

Réponds en JSON:
{
  "architectureOverview": "Résumé de l'architecture retenue",
  "servicesStack": {
    "NOM_DU_SERVICE": {"stack": "...", "deployment": "Docker"}
  },
  "fileStructure": [{"path": "/frontend/...", "description": "..."}, {"path": "/backend/...", "description": "..."}],
  "endpoints": [{"method": "GET", "path": "/api/...", "description": "..."}],
  "features": ["feature à implémenter 1", "feature 2", ...]
}`,
            systemPrompt: "Tu es un architecte logiciel senior. Conçois des architectures micro-services intelligentes (frontend, api, workers) basées sur la demande.",
            cwd: p.workspace,
            maxTurns: 3,
            appendPrompt: skillsContext,
            abortSignal: this.abortControllers.get(id)?.signal,
        });

        if (result.success && result.finalResult) {
            p.artifacts.architecture = this.tryParseJson(result.finalResult);
            p.artifacts.skills = skills.map(s => ({ title: s.title, href: s.href }));
            this.setAgentStatus(id, "Architect", "done", "Architecture définie");
            this.addEvent(id, "Architect", "📐", "✓ Architecture technique définie", "success");
        } else {
            this.setAgentStatus(id, "Architect", "error", result.error || "Échec");
            this.addEvent(id, "Architect", "📐", `✗ Architecture échouée: ${result.error} `, "error");
            throw new Error(`Architecture failed: ${result.error} `);
        }
        this.addTokens(id, result);
        await this.saveState();
    }

    private async runScaffold(id: string) {
        this.setPhase(id, "SCAFFOLD");
        this.setAgentStatus(id, "Developer", "active", "Création du scaffold...");

        const p = this.pipelines.get(id)!;
        const repoName = `vibecraft-${this.slugify(p.name)}`;

        // Create GitHub repo
        const GITHUB_OWNER = getGithubOwner();
        const GITHUB_TOKEN = getGithubToken();
        if (GITHUB_OWNER && GITHUB_TOKEN) {
            try {
                const createRes = await fetch("https://api.github.com/user/repos", {
                    method: "POST",
                    headers: {
                        Authorization: `token ${GITHUB_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: repoName,
                        private: false,
                        auto_init: true,
                        description: p.description,
                    }),
                });

                if (createRes.ok) {
                    const repo = await createRes.json() as any;
                    p.github = {
                        owner: GITHUB_OWNER,
                        repo: repoName,
                        url: repo.html_url,
                    };
                    this.addEvent(id, "Developer", "💻", `Repo GitHub créé: ${GITHUB_OWNER}/${repoName}`, "success");
                } else {
                    // Repo already exists (422) or other error — attempt to reuse existing repo
                    const errText = await createRes.text().catch(() => "");
                    if (createRes.status === 422 || createRes.status === 409) {
                        this.addEvent(id, "Developer", "💻", `Repo GitHub déjà existant, réutilisation: ${GITHUB_OWNER}/${repoName}`, "warning");
                        p.github = {
                            owner: GITHUB_OWNER,
                            repo: repoName,
                            url: `https://github.com/${GITHUB_OWNER}/${repoName}`,
                        };
                    } else {
                        this.addEvent(id, "Developer", "💻", `Erreur GitHub (${createRes.status}): ${errText.slice(0, 150)}`, "error");
                    }
                }

                // Clone repo if github is now set
                if (p.github) {
                    const cloneUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repoName}.git`;
                    const { gitClone } = await import("./claude_code.js");
                    await gitClone(cloneUrl, p.workspace);

                    // Configure git
                    const { spawn } = await import("node:child_process");
                    await new Promise<void>((resolve) => {
                        const proc = spawn("git", ["config", "user.email", "vibecraft@ai.dev"], { cwd: p.workspace });
                        proc.on("close", () => resolve());
                    });
                    await new Promise<void>((resolve) => {
                        const proc = spawn("git", ["config", "user.name", "VibeCraft AI"], { cwd: p.workspace });
                        proc.on("close", () => resolve());
                    });
                }
            } catch (err: any) {
                this.addEvent(id, "Developer", "💻", `Erreur GitHub: ${err.message}`, "warning");
            }
        }

        // Use Claude Code to scaffold the project
        const architecture = p.artifacts.architecture as any;

        const servicesGuidance = p.services.map(s => {
            return `Service: ${s.name} (Type: ${s.type})\n${this.getScaffoldGuidance(s.type)}\n\n[Dockerfile Recommandé]\n\`\`\`dockerfile\n${this.getDockerfileTemplate(s.type, architecture?.servicesStack?.[s.name]?.stack || architecture?.stack)}\n\`\`\``;
        }).join("\n\n---\n\n");

        const result = await runClaudeAgent({
            model: p.model,
            prompt: `Crée le scaffold initial de ce projet multi-services dans le répertoire courant.

Types de services à créer: ${p.services.map(s => s.type).join(', ')}
Architecture globale: ${JSON.stringify(architecture, null, 2)}

INSTRUCTIONS PAR SERVICE:
${servicesGuidance}

RÈGLES CRITIQUES POUR LES DOCKERFILE:
- NE JAMAIS utiliser "COPY ... 2>/dev/null || true" — la syntaxe shell ne marche PAS dans COPY
- Chaque Dockerfile doit être placé à la racine du dossier de son service (ex: /frontend/Dockerfile)
- Pour les projets static: expose le port 80 (nginx)
- Pour les spa: build multi-stage (node puis nginx)
- Pour les api/worker/fullstack: expose le port 3000 ou 8080 en fonction du code`,
            systemPrompt: "Tu es un développeur senior. Crée un scaffold propre avec une arborescence claire (un dossier par service).",
            cwd: p.workspace,
            allowedTools: ["write_file", "replace_in_file", "bash", "list_dir"],
            maxTurns: 15,
            abortSignal: this.abortControllers.get(id)?.signal,
        });

        if (!result.success) {
            this.addEvent(id, "Developer", "💻", `Erreur scaffold: ${result.error}`, "error");
        }
        this.addTokens(id, result);

        // Push to GitHub
        if (p.github) {
            const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
            const pushed = await gitPush(p.workspace, "feat: initial scaffold by VibeCraft AI", authUrl);
            if (pushed) {
                this.addEvent(id, "Developer", "💻", "Push GitHub → scaffold initial", "success");
            } else {
                this.addEvent(id, "Developer", "💻", "❌ Push scaffold échoué — vérifier logs container", "error");
            }
        }

        // Deploy to Dokploy — only if not already deployed
        if (isDokployConfigured() && p.github && !p.dokploy) {
            this.setPhase(id, "DEPLOYING");
            try {
                const dokProject = await createDokployProject(repoName, p.description);

                p.dokploy = {
                    projectId: dokProject.projectId,
                    apps: []
                };

                for (const service of p.services) {
                    if (service.type === "postgres" || service.type === "redis") {
                        this.addEvent(id, "Dokploy", "⚠️", `Création de BDD ${service.type} automatique non supportée actuellement (à faire manuellement)`, "warning");
                        continue;
                    }

                    const appName = `${repoName}-${service.name}`.substring(0, 30);
                    const app = await createDokployApplication({
                        name: appName,
                        projectId: dokProject.projectId,
                        environmentId: dokProject.environmentId || "",
                        owner: p.github.owner,
                        repo: p.github.repo,
                        branch: "main",
                        buildType: "dockerfile",
                        buildPath: `/${service.name}/Dockerfile`,
                        env: `DOKPLOY_SUB_PATH=/${service.name}`
                    });

                    // Port logic
                    const containerPort = (service.type === "static" || service.type === "spa") ? 80
                        : service.type === "python-worker" ? 8080
                            : 3000;

                    let domainUrl;
                    let domainId;

                    // only web apps get a domain
                    if (service.type !== "python-worker" && service.type !== "node-worker") {
                        const domain = await createDomain(app.applicationId, appName, containerPort);
                        if (domain) {
                            domainUrl = `https://${domain.host}`;
                            domainId = domain.domainId;
                            this.addEvent(id, "Dokploy", "🌐", `${service.name}: Domain créé → ${domainUrl}`, "success");
                        }
                    } else {
                        // Workers get internal domain or just internal mapping, no public domain created by default, or maybe an internal domain.
                        this.addEvent(id, "Dokploy", "⚙️", `${service.name} (worker): Pas de domaine public configuré`, "info");
                    }

                    p.dokploy.apps!.push({
                        name: service.name,
                        type: service.type,
                        applicationId: app.applicationId,
                        domainId: domainId,
                        url: domainUrl
                    });
                }

                // Set the main URL to the first app that has one
                const mainApp = p.dokploy.apps!.find(a => a.url);
                if (mainApp) p.dokploy.url = mainApp.url;

                this.addEvent(id, "Dokploy", "🚀", `Déployé dans Dokploy → ${p.dokploy.apps!.length} service(s)`, "deploy");
            } catch (err: any) {
                this.addEvent(id, "Dokploy", "🚀", `Erreur Dokploy: ${err.message}`, "error");
            }
        }

        const scaffoldMsg = p.dokploy
            ? "✓ Scaffold créé et déployé sur Dokploy"
            : p.github
                ? "✓ Scaffold créé et pushé sur GitHub (Dokploy non configuré)"
                : "✓ Scaffold créé (GitHub/Dokploy non configurés)";
        this.addEvent(id, "Developer", "💻", scaffoldMsg, p.dokploy ? "success" : "warning");
        await this.saveState();
    }

    private async runDevelopment(id: string) {
        this.setPhase(id, "DEVELOPMENT");
        this.setAgentStatus(id, "Developer", "active", "Développement des features...");

        const p = this.pipelines.get(id)!;
        const architecture = p.artifacts.architecture as any;
        const features = architecture?.features || [];
        const projectTypes = p.services.map(s => s.type).join(', ');

        for (let i = 0; i < features.length; i++) {
            if (this.shouldStop(id)) return;

            const feature = features[i];
            this.setAgentStatus(id, "Developer", "active", `Feature ${i + 1}/${features.length}: ${feature}`);
            this.addEvent(id, "Developer", "💻", `Feature ${i + 1}/${features.length}: ${feature}`, "info");

            const devProgress = 40 + Math.round((i / features.length) * 30);
            p.progress = devProgress;

            const devSystemPrompt = "Tu es un développeur senior fullstack. Écris du code propre et fonctionnel pour implémenter la feature demandée. Gère proprement le code pour les différents services.";

            const result = await runClaudeAgent({
                model: p.model,
                prompt: `Implémente cette feature dans le projet existant (services: ${projectTypes}):

Feature: "${feature}"

Architecture: ${JSON.stringify(architecture, null, 2)}

Instructions:
1. Lis le code existant pour comprendre la structure multi-services
2. Implémente la feature de manière propre (API, Frontend, etc. selon le cas)
3. Assure-toi que le code compile/fonctionne sans erreur
4. Ne casse pas les features existantes
5. NE modifie pas le Dockerfile sauf si absolument nécessaire`,
                systemPrompt: devSystemPrompt,
                cwd: p.workspace,
                allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir"],
                maxTurns: 12,
                abortSignal: this.abortControllers.get(id)?.signal,
            });

            if (!result.success) {
                this.addEvent(id, "Developer", "💻", `Erreur feature "${feature}": ${result.error}`, "warning");
            }
            this.addTokens(id, result);

            // Push after each feature
            if (p.github) {
                const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                // Uses dynamically imported gitPush if needed, but it's available via previous imports
                const { gitPush } = await import("./claude_code.js");
                const pushed = await gitPush(p.workspace, `feat: ${feature}`, authUrl);
                if (pushed) {
                    this.addEvent(id, "Developer", "💻", `Push → feat: ${feature}`, "success");
                } else {
                    this.addEvent(id, "Developer", "💻", `❌ Push échoué: feat: ${feature}`, "error");
                }
            }

            // Wait for deploy and check build for all apps
            if (p.dokploy && p.dokploy.apps && p.dokploy.apps.length > 0) {
                await this.waitForBuild(id);
            }
        }

        this.setAgentStatus(id, "Developer", "done", `${features.length} features implémentées`);
        await this.saveState();
    }

    private async waitForBuild(id: string, maxRetries = 3) {
        const p = this.pipelines.get(id)!;
        if (!p.dokploy || !p.dokploy.apps) return;

        // Wait a bit for Dokploy to start building
        await this.sleep(10000);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (this.shouldStop(id)) return;

            let allDone = true;
            for (const app of p.dokploy.apps) {
                try {
                    const deployment = await getLatestDeployment(app.applicationId);
                    if (!deployment) {
                        allDone = false;
                        continue;
                    }

                    if (deployment.status === "error") {
                        // Build failed — activate debugger
                        const logs = await getBuildLogs(app.applicationId);
                        this.addEvent(id, "Dokploy", "🚀", `✗ Build échoué pour ${app.name}`, "error");

                        await this.runDebugger(id, logs, app.name);

                        // Re-push and retry
                        if (p.github) {
                            const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                            const { gitPush } = await import("./claude_code.js");
                            await gitPush(p.workspace, `fix: build error correction for ${app.name}`, authUrl);

                            // Re-trigger deploy for all apps to be safe, or just this one
                            await triggerDeploy(app.applicationId);
                            await this.sleep(15000);
                        }

                        // We reset allDone and break out of the inner loop to start a new retry
                        allDone = false;
                        break;
                    } else if (deployment.status !== "done") {
                        allDone = false; // still deploying
                    }
                } catch (err) {
                    console.warn(`[Orchestrator] Build check error for ${app.name}:`, err);
                    allDone = false;
                }
            }

            if (allDone) {
                this.addEvent(id, "Dokploy", "🚀", `✓ Tous les builds réussis`, "deploy");
                return;
            }

            await this.sleep(10000);
        }
    }

    private async runDebugger(id: string, errorLogs: string, appName: string = "") {
        this.setAgentStatus(id, "Debugger", "active", "Correction des erreurs...");
        this.addEvent(id, "Debugger", "🔧", `Analyse des logs de build(${appName})...`, "info");

        const p = this.pipelines.get(id)!;

        const debugResult = await runClaudeAgent({
            model: p.model,
            prompt: `Tu dois implémenter ces directives d'architecture:

${p.description}

Règles:
1. Utilise read_file pour vérifier le code généré
2. Utilise bash pour installer les dépendances (npm, pip)
3. Utilise write_file/replace_in_file pour corriger les bugs
4. Ne sors que si c'est parfait`,
            systemPrompt: "Tu es un debugger expert. Analyse les erreurs de build et corrige-les de manière ciblée.",
            cwd: p.workspace,
            allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir", "web_search", "fetch_url"],
            maxTurns: 150,
            abortSignal: this.abortControllers.get(id)?.signal,
        });

        if (debugResult.success) {
            this.setAgentStatus(id, "Debugger", "done", "Corrections appliquées");
            this.addEvent(id, "Debugger", "🔧", `✓ Corrections appliquées`, "success");
        } else {
            this.addEvent(id, "Debugger", "🔧", `Erreur debugger: ${debugResult.error} `, "error");
        }
        this.addTokens(id, debugResult);
    }

    private async runQA(id: string) {
        this.setPhase(id, "QA");
        this.setAgentStatus(id, "QA", "active", "Review du code...");

        const p = this.pipelines.get(id)!;

        const result = await runClaudeAgent({
            model: p.model,
            prompt: `Fais un review complet du projet:

                            1. Vérifie que le code compile sans erreur
                            2. Vérifie la structure du projet
                            3. Vérifie les bonnes pratiques de sécurité
                            4. Corrige les problèmes trouvés
                            5. Assure - toi que le Dockerfile est correct

                            Résumé: donne une note / 10 et liste les problèmes trouvés.`,
            systemPrompt: "Tu es un Architecte Logiciel Senior. Structure le code logiquement et proprement.",
            cwd: p.workspace,
            allowedTools: ["Read", "ListDir"],
            maxTurns: 5,
            abortSignal: this.abortControllers.get(id)?.signal,
        });

        if (result.success) {
            if (p.github) {
                const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                await gitPush(p.workspace, "chore: QA fixes", authUrl);
            }
            this.addEvent(id, "QA", "🧪", "✓ Review complet", "success");
        }
        this.addTokens(id, result);

        this.setAgentStatus(id, "QA", "done", "Review terminé");
        await this.saveState();
    }

    // ─── Helpers ───

    private setPhase(id: string, phase: PipelinePhase, error?: string) {
        const p = this.pipelines.get(id);
        if (!p) return;
        p.phase = phase;
        p.progress = PHASE_PROGRESS[phase] || p.progress;
        p.updatedAt = new Date().toISOString();
        if (error) p.error = error;
        this.emit("phase-change", { pipelineId: id, phase });
    }

    private setAgentStatus(id: string, role: string, status: AgentStatus, action?: string) {
        const p = this.pipelines.get(id);
        if (!p) return;
        const agent = p.agents.find(a => a.role === role);
        if (!agent) return;
        agent.status = status;
        if (action) agent.currentAction = action;
        if (status === "active" && !agent.startedAt) agent.startedAt = new Date().toISOString();
        if (status === "done") agent.completedAt = new Date().toISOString();
        this.emit("agent-status", { pipelineId: id, role, status, action });
    }

    private addEvent(id: string, agentRole: string, emoji: string, action: string, type: PipelineEvent["type"]) {
        const p = this.pipelines.get(id);
        if (!p) return;

        const event: PipelineEvent = {
            id: crypto.randomUUID().slice(0, 8),
            pipelineId: id,
            timestamp: new Date().toISOString(),
            agentRole,
            agentEmoji: emoji,
            action,
            type,
        };

        p.events.push(event);
        // Keep last 100 events per pipeline
        if (p.events.length > 100) p.events = p.events.slice(-100);

        this.emit("event", event);
    }

    private shouldStop(id: string): boolean {
        const p = this.pipelines.get(id);
        return !p || p.phase === "PAUSED" || p.phase === "FAILED";
    }

    private addTokens(id: string, result: { inputTokens: number; outputTokens: number }) {
        const p = this.pipelines.get(id);
        if (!p) return;
        if (!p.tokenUsage) p.tokenUsage = { inputTokens: 0, outputTokens: 0 };
        p.tokenUsage.inputTokens += result.inputTokens;
        p.tokenUsage.outputTokens += result.outputTokens;
    }

    // ─── Project Type Helpers ───

    private detectProjectType(analysis: any): ProjectType {
        // Trust the model's own detection first
        const declared = (analysis?.type || "").toLowerCase();
        if (["static", "spa", "fullstack", "api", "python-worker", "node-worker"].includes(declared)) {
            return declared as ProjectType;
        }

        // Fallback: infer from description and stack
        const desc = (analysis?.summary || "").toLowerCase();
        const frontend = (analysis?.stack?.frontend || "").toLowerCase();
        const backend = (analysis?.stack?.backend || "").toLowerCase();

        const hasBackend = backend && !["none", "aucun", "n/a", "-", ""].includes(backend);
        const hasFrontend = frontend && !["none", "aucun", "n/a", "-", ""].includes(frontend);
        const isSPA = /react|vue|svelte|angular|vite|next|nuxt|remix/.test(frontend);

        // Python bot/worker detection — even with a web dashboard, prefer python-worker
        const isPythonBot = backend.includes("python") || /python|flask|fastapi|django|pandas|scraper|scraping|bot\s|cron|daemon|trading|data.sci|machine.learn|ia\s|ml\s/.test(desc);
        const isNodeBot = (backend.includes("node") || backend.includes("express")) && /bot\s|scraper|cron|daemon|worker/.test(desc);

        if (isPythonBot) return "python-worker";
        if (isNodeBot) return "node-worker";

        if (!hasBackend) return isSPA ? "spa" : "static";
        if (!hasFrontend) return "api";
        return "fullstack";
    }

    private getDockerfileTemplate(type: ProjectType, stack?: any): string {
        switch (type) {
            case "static":
                return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;

            case "spa":
                return `# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;

            case "api":
                return `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]`;

            case "python-worker":
                return `FROM python:3.11-slim
WORKDIR /app
# Install supervisor to run bot + web server concurrently
RUN apt-get update && apt-get install -y supervisor && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Supervisor config must be created at /etc/supervisor/conf.d/app.conf by the agent
EXPOSE 8080
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]`;

            case "node-worker":
                return `FROM node:20-slim
WORKDIR /app
RUN npm install -g concurrently
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
# Run bot worker + express dashboard server concurrently
CMD ["npx", "concurrently", "node bot.js", "node server.js"]`;

            case "fullstack":
            default:
                return `FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]`;
        }
    }

    private getArchitectureGuidance(type: ProjectType): string {
        switch (type) {
            case "static":
                return `CONTRAINTES ARCHITECTURE (site statique):
- Pas de backend, pas de build tool (juste HTML/CSS/JS vanilla)
- Dockerfile: nginx:alpine, COPY vers /usr/share/nginx/html, port 80
- Pas de package.json nécessaire (sauf si on utilise npm pour des libs)
- Structure simple: index.html, style.css, script.js`;

            case "spa":
                return `CONTRAINTES ARCHITECTURE (SPA):
- Framework frontend uniquement (React/Vue/Svelte avec Vite)
- Dockerfile multi-stage: node build → nginx serve, port 80
- Pas de backend: utilise des services externes (Supabase, Firebase) si besoin de data
- Build: npm run build → dist/ → nginx`;

            case "api":
                return `CONTRAINTES ARCHITECTURE (API backend):
- Pas de frontend, uniquement des endpoints REST/GraphQL
- Dockerfile: node:20-slim, port 3000
- Inclure un endpoint /health pour le healthcheck Dokploy`;

            case "fullstack":
                return `CONTRAINTES ARCHITECTURE (fullstack):
- Frontend + Backend dans le même repo
- Backend expose une API REST sur /api/*
- Frontend servi statiquement ou via le backend
- Dockerfile: multi-stage build, port 3000`;

            case "python-worker":
                return `CONTRAINTES ARCHITECTURE (Python Bot + Dashboard Web):
- Ce projet contient DEUX composants dans le même container:
  1. LE BOT (main.py) : logique principale tout-en-un (boucle, fetch API, calculs).
     - Le bot écrit ses résultats dans data/data.json après chaque cycle.
  2. LE SERVEUR WEB (server.py) : Flask sur le port 8080.
     - GET / : page HTML dashboard (graphiques Chart.js, dark mode, auto-refresh)
     - GET /api/data : retourne data/data.json en JSON
- STRUCTURE OBLIGATOIRE (FLAT - PAS DE SOUS-DOSSIERS src/):
  main.py, server.py, requirements.txt, supervisord.conf, Dockerfile, templates/index.html, data/data.json
  INTERDIT: src/, lib/, modules/, utils/ ou tout import de sous-module custom
- requirements.txt DOIT inclure: flask, requests + toutes déps du bot.
  Si tu utilises SocketIO: ajoute flask-socketio dans requirements.txt
- supervisord lance main.py + server.py simultanément.
- EXPOSE 8080.`;

            case "node-worker":
                return `CONTRAINTES ARCHITECTURE (Node Bot + Dashboard Web):
- Ce projet contient DEUX composants dans le même container:
  1. LE BOT (bot.js) : logique principale (scraping, fetch API, traitement data, cron, etc.)
     - Le bot écrit ses résultats dans data/data.json via fs.writeFileSync.
  2. LE SERVEUR WEB (server.js) : Express.js sur le port 3000 qui sert :
     - GET / : une page HTML dashboard (graphiques Chart.js, design dark mode moderne)
     - GET /api/data : le contenu de data/data.json
     - La page HTML fait du polling toutes les 10 secondes.
- package.json démarre les deux via concurrently: "node bot.js" + "node server.js".
- EXPOSE 3000 dans le Dockerfile.`;

            default:
                return "";
        }
    }

    private getScaffoldGuidance(type: ProjectType): string {
        switch (type) {
            case "static":
                return `INSTRUCTIONS SCAFFOLD (site statique):
1. Crée index.html, style.css, et script.js directement
2. Le Dockerfile est nginx:alpine — COPY directement les fichiers HTML/CSS/JS
3. Aucun npm install nécessaire
4. Assure-toi que index.html est à la racine du projet`;

            case "spa":
                return `INSTRUCTIONS SCAFFOLD (SPA):
1. Initialise un projet Vite (react-ts ou vue-ts selon l'archi)
2. Le Dockerfile build en 2 étapes: npm run build → dist/ → nginx
3. Vérifie que npm run build fonctionne avant de committer`;

            case "api":
                return `INSTRUCTIONS SCAFFOLD (API):
1. Crée un serveur Express/Fastify minimal avec au moins GET /health et GET /
2. package.json avec scripts start et build si TypeScript
3. Port d'écoute: 3000`;

            case "fullstack":
                return `INSTRUCTIONS SCAFFOLD (fullstack):
1. Structure claire backend/ et frontend/ ou src/ avec routing
2. Backend: Express sur port 3000, sert aussi le frontend en production
3. Frontend: pages de base avec routing`;

            case "python-worker":
                return `INSTRUCTIONS SCAFFOLD (Python Bot + Dashboard Web):
1. Crée data/data.json: {"entries": [], "lastUpdate": null}
2. Crée main.py: TOUT le code bot dans ce seul fichier (pas d'imports depuis src/ ou sous-dossiers)
   - boucle infinie ou APScheduler, fetch API, écriture dans data/data.json
3. Crée server.py: TOUT le code serveur dans ce seul fichier
   - from flask import Flask, render_template, jsonify
   - app = Flask(__name__, template_folder='templates')
   - DERNIERE LIGNE OBLIGATOIRE: app.run(host='0.0.0.0', port=8080, debug=False)
   - Si tu utilises SocketIO: from flask_socketio import SocketIO (ET ajoute flask-socketio dans requirements.txt)
   - PORT = 8080 TOUJOURS (JAMAIS 5000)
4. Crée templates/index.html: dark mode Chart.js, polling GET /api/data toutes les 5s
5. requirements.txt: flask, requests + déps du bot + flask-socketio si utilisé
6. supervisord.conf:
[supervisord]
nodaemon=true
[program:bot]
command=python /app/main.py
directory=/app
autostart=true
autorestart=true
[program:server]
command=python /app/server.py
directory=/app
autostart=true
autorestart=true
7. Dockerfile: COPY supervisord.conf /etc/supervisor/conf.d/app.conf
   CMD ["supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]
   EXPOSE 8080
REGLE ABSOLUE: Aucun import depuis un module local (pas de from src.xxx import, pas de from utils import)`;

            case "node-worker":
                return `INSTRUCTIONS SCAFFOLD (Node Bot + Dashboard Web):
1. Crée data/ avec un data.json vide: {"entries": [], "lastUpdate": null}
2. Crée bot.js: logique du bot qui écrit dans data/data.json avec fs.writeFileSync
3. Crée server.js: Express sur port 3000 avec:
   - GET / : sert dashboard.html
   - GET /api/data : lit et retourne data/data.json
4. Crée dashboard.html: page moderne dark mode avec Chart.js et polling auto
5. package.json: "start": "concurrently 'node bot.js' 'node server.js'"
6. Dépendances: express, concurrently + déps du bot`;

            default:
                return "";
        }
    }

    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 30);
    }

    private tryParseJson(text: string): any {
        try {
            // Try to find JSON in the text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch { /* ignore */ }
        return { raw: text };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Post-Deploy Auto-Fix ───

    private async verifyWebDisplay(url: string, maxRetries = 10, delayMs = 5000): Promise<{ ok: boolean, status: number, error?: string, html?: string }> {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await fetch(url, { redirect: "follow" });
                if (res.status !== 502 && res.status !== 503 && res.status !== 404) {
                    const html = await res.text().catch(() => "");
                    return { ok: true, status: res.status, html: html.slice(0, 3000) };
                }
            } catch (err: any) {
                console.log(`[HealthCheck] Attempt ${i + 1} failed: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, delayMs));
        }
        try {
            const res = await fetch(url, { redirect: "follow" });
            const html = await res.text().catch(() => "");
            return { ok: res.status !== 502 && res.status !== 503 && res.status !== 404, status: res.status, html: html.slice(0, 3000) };
        } catch (err: any) {
            return { ok: false, status: 0, error: err.message };
        }
    }

    private async verifyAndAutoFix(id: string, maxFixRetries = 2) {
        const p = this.pipelines.get(id);
        if (!p || !p.dokploy || !p.dokploy.apps) return;

        for (const app of p.dokploy.apps) {
            if (!app.url) {
                let logs = "";
                let hasRuntimeError = false;
                try {
                    const fullLogs = await getApplicationLogs(app.applicationId);
                    logs = fullLogs.length > 5000 ? "... " + fullLogs.slice(-5000) : fullLogs;
                    hasRuntimeError = logs.includes("Traceback (most recent") ||
                        logs.includes("Exception:") ||
                        logs.includes("Error: listen EADDRINUSE");
                } catch (e) { }

                if (hasRuntimeError) {
                    this.addEvent(id, "QA", "⚠️", `${app.name}: Crash backend détecté dans les logs.`, "warning");
                } else {
                    this.addEvent(id, "QA", "✅", `${app.name}: Service démarré sans logs d'erreur majeurs.`, "success");
                }
                continue;
            }

            for (let attempt = 1; attempt <= maxFixRetries; attempt++) {
                this.setAgentStatus(id, "QA", "active", `Vérification HTTP de ${app.url}...`);
                this.addEvent(id, "QA", "🔍", `Vérification HTTP de ${app.url}`, "info");

                const health = await this.verifyWebDisplay(app.url);

                let logs = "";
                let hasRuntimeError = false;
                try {
                    const fullLogs = await getApplicationLogs(app.applicationId);
                    logs = fullLogs.length > 5000 ? "... " + fullLogs.slice(-5000) : fullLogs;
                    const lowerLogs = logs.toLowerCase();
                    hasRuntimeError = logs.includes("Traceback (most recent") ||
                        logs.includes("Exception:") ||
                        logs.includes("Error: listen EADDRINUSE") ||
                        lowerLogs.includes("bad gateway") ||
                        lowerLogs.includes("segmentation fault");
                } catch (err) { }

                if (health.ok && !hasRuntimeError) {
                    this.addEvent(id, "QA", "✅", `${app.name}: Le site répond correctement (HTTP ${health.status}) et aucun crash détecté.`, "success");
                    break; // Move to next app
                }

                const errorType = !health.ok ? `HTTP ${health.status || health.error}` : "Crash silencieux (Logs d'erreur détectés)";
                this.addEvent(id, "QA", "⚠️", `${app.name}: Problème: ${errorType}. Auto-Correction (Essai ${attempt}/${maxFixRetries})...`, "warning");

                // Injection du script pour changer le port sur Dokploy si besoin
                let dokployScriptInfo = "";
                if (app.domainId) {
                    const apiScriptPath = path.join(p.workspace, `update_dokploy_port_${app.name}.sh`);
                    const apiScriptContent = `#!/bin/bash
if [ -z "$1" ]; then echo "Usage: ./update_dokploy_port_${app.name}.sh <POST_NUMBER>"; exit 1; fi
curl -X POST "${getDokployUrl()}/api/trpc/domain.update" \\
     -H "Content-Type: application/json" -H "x-api-key: $DOKPLOY_TOKEN" \\
     -d '{"json": {"domainId": "${app.domainId}", "port": '$1', "https": true, "certificateType": "letsencrypt", "path": "/"}}'
curl -X POST "${getDokployUrl()}/api/trpc/application.deploy" \\
     -H "Content-Type: application/json" -H "x-api-key: $DOKPLOY_TOKEN" \\
     -d '{"json": {"applicationId": "${app.applicationId}"}}'
echo "Dokploy port updated to $1 and deployment triggered for ${app.name}."
`;
                    await fs.writeFile(apiScriptPath, apiScriptContent, { mode: 0o755 });
                    dokployScriptInfo = `ATTENTION: Par défaut, le service Dokploy a été configuré pour pointer sur un port spécifique. Si tu découvres que ton code écoute sur un port différent (ex: app.run(port=5000) mais Dokploy pointe vers autre chose), tu peux SOIT corriger le code pour correspondre à Dokploy, SOIT modifier le port de Dokploy lui-même en exécutant:
./update_dokploy_port_${app.name}.sh <NOUVEAU_PORT> (ex: ./update_dokploy_port_${app.name}.sh 5000)
(Ne commite surtout pas ce fichier script update_dokploy_port_${app.name}.sh dans git!)`;
                }

                const instructions = `URGENT AUTO-FIX: Le service ${app.name} vient d'être déployé mais une erreur est détectée en production.
Symptôme actuel : ${!health.ok ? 'Le site web retourne une erreur ' + (health.status || health.error) + ' (Bad Gateway / Plantage).' : 'Le site retourne 200 OK, mais le contenu semble vide ou le backend/bot a crashé de manière silencieuse.'}

Voici l'aperçu du code HTML tel qu'il est renvoyé par le site (te permet de voir si l'UI a chargé, ou si c'est une vue d'erreur) :
<html>
${health.html || 'Aucun contenu HTML retourné.'}
</html>

Voici les logs du serveur en production (les dernières lignes) :
<logs>
${logs || 'Aucun log disponible.'}
</logs>

Vérifie les points suivants :
1. Les logs ci-dessus te montrent exactement où ça plante (Traceback, imports, EADDRINUSE, etc.).
2. Le code refuse de démarrer (erreur syntaxe ou import d'un module inexistant comme src.xxx).
3. Le port exposé dans le code (ex: 8080 ou 5000) ne correspond pas au port configuré dans le conteneur/Dokploy.
4. Une dépendance manque dans requirements.txt ou package.json (ex: flask-socketio).

${dokployScriptInfo}

Corrige le problème pour que le serveur (et le bot) démarre(nt) correctement sans erreur.`;

                this.setAgentStatus(id, "Developer", "active", "Auto-Correction en cours...");

                const result = await runClaudeAgent({
                    model: p.model,
                    prompt: `Tu as un projet existant à modifier pour corriger un crash en prod. (Tentative ${attempt} / ${maxFixRetries})
Voici le problème:
                        ${instructions}
${attempt > 1 ? '\nATTENTION: Ta tentative précédente n\'a rien écrit ou n\'a pas résolu le souci. Tu DOIS ESSAYER UNE AUTRE APPROCHE (comme changer le port via ./update_dokploy_port_' + app.name + '.sh ou fixer les imports).\n' : ''}
PROCESSUS OBLIGATOIRE - respecte cet ordre:
                1. Utilise ListDir sur "." pour comprendre la structure.
2. Utilise Read sur le code, package.json, requirements.txt, supervisord.conf, etc.
3. IDENTIFIE la cause du crash(regarde attentivement les imports et le port serveur).
4. UTILISE WRITE pour sauvegarder chaque fichier corrigé(OBLIGATOIRE) ou exécute le script bash pour changer de port.
5. Confirme l'action effectuée.

RÈGLES ABSOLUES:
                - Si tu utilises./ update_dokploy_port_${app.name}.sh, tu dois quand même t'assurer que le code écoute bien sur ce port.
                    - IMPORTANT: Si 0 fichier est écrit ET aucune commande de port n'est exécutée, la tâche échoue.`,
                    systemPrompt: "Tu es un développeur de crise. Tu DOIS utiliser l'outil Write pour sauvegarder tes correctifs et fixer le bug.",
                    cwd: p.workspace,
                    allowedTools: ["Read", "Write", "Bash", "ListDir"],
                    maxTurns: 15,
                    timeoutMs: 10 * 60 * 1000,
                    abortSignal: this.abortControllers.get(id)?.signal,
                });

                this.addTokens(id, result);

                const { execSync } = await import("node:child_process");
                let hasChanges = false;
                try {
                    const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                    hasChanges = status.length > 0;
                } catch { hasChanges = false; }

                if (hasChanges && p.github) {
                    const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                    const { gitPush } = await import("./claude_code.js");
                    const pushed = await gitPush(p.workspace, `fix: auto-correction ${app.name} HTTP ${health.status || health.error}`, authUrl);
                    if (pushed) {
                        this.addEvent(id, "Developer", "💻", `${app.name}: Push auto-correction appliqué`, "success");
                    } else {
                        this.addEvent(id, "Developer", "⚠️", `${app.name}: Push échoué, revérification...`, "warning");
                    }
                } else {
                    this.addEvent(id, "Developer", "ℹ️", `${app.name}: Aucune modification git, attente d'un éventuel redéploiement Dokploy...`, "info");
                }

                // On attend toujours car le script bash a pu déclencher un déploiement Dokploy.
                await this.waitForBuild(id);
            } // end retry loop

            // Verify a final time and report failure for this app if it didn't succeed
            const finalHealth = await this.verifyWebDisplay(app.url);
            let finalLogs = "";
            try { finalLogs = await getApplicationLogs(app.applicationId); } catch (e) { }
            const finalHasRuntimeError = finalLogs.includes("Traceback (most recent") || finalLogs.includes("Exception:") || finalLogs.includes("Error: listen EADDRINUSE");

            if (!finalHealth.ok || finalHasRuntimeError) {
                const finalErr = !finalHealth.ok ? `HTTP ${finalHealth.status || finalHealth.error}` : "Crash backend (Logs)";
                this.addEvent(id, "QA", "❌", `${app.name}: Le site est toujours cassé après auto-correction (${finalErr}).`, "error");
            } else {
                this.addEvent(id, "QA", "✅", `${app.name}: Auto-correction réussie! (HTTP ${finalHealth.status} et aucun crash)`, "success");
            }
        }

        this.setAgentStatus(id, "QA", "done");
    }

    // ─── Persistence ───

    private async saveState() {
        try {
            const data = Object.fromEntries(this.pipelines);
            await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
        } catch (err) {
            console.warn("[Orchestrator] Failed to save state:", err);
        }
    }

    private async loadState() {
        try {
            const raw = await fs.readFile(STORE_PATH, "utf-8");
            const data = JSON.parse(raw);
            for (const [k, v] of Object.entries(data)) {
                this.pipelines.set(k, v as Pipeline);
            }
            console.log(`[Orchestrator] Loaded ${this.pipelines.size} pipelines from state`);
        } catch {
            // No state file yet
        }
    }
}

// ─── Singleton ───

let instance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
    if (!instance) instance = new Orchestrator();
    return instance;
}
