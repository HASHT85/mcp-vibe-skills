/**
 * Orchestrator — Multi-Pipeline Manager
 * Manages N project pipelines in parallel, each going through BMAD phases.
 * Uses Claude Code Agent SDK for actual development work.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import { runClaudeAgent, gitInit, gitPush, agentEvents, type AgentAction } from "./claude_code.js";
import { findSkillsForContext } from "./skills.js";
import {
    isDokployConfigured,
    createDokployProject,
    createDokployApplication,
    createDomain,
    triggerDeploy,
    getBuildLogs,
    getLatestDeployment,
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
    agents: PipelineAgent[];
    events: PipelineEvent[];
    workspace: string;         // /workspace/<id>
    github?: {
        owner: string;
        repo: string;
        url: string;
    };
    dokploy?: {
        projectId: string;
        applicationId: string;
        url?: string;
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
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

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

    async launchIdea(description: string, name?: string): Promise<Pipeline> {
        const id = crypto.randomUUID().slice(0, 8);
        const projectName = name || this.slugify(description);
        const workspace = path.join(WORKSPACE_ROOT, id);

        await fs.mkdir(workspace, { recursive: true });

        const pipeline: Pipeline = {
            id,
            name: projectName,
            description,
            phase: "QUEUED",
            progress: 0,
            agents: DEFAULT_AGENTS.map(a => ({ ...a, status: "waiting" as AgentStatus })),
            events: [],
            workspace,
            artifacts: {},
            tokenUsage: { inputTokens: 0, outputTokens: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

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
        this.executePipeline(id).catch(console.error);
        return true;
    }

    async deletePipeline(id: string): Promise<boolean> {
        this.running.delete(id);
        this.pipelines.delete(id);
        await this.saveState();
        return true;
    }

    // ─── Pipeline Execution ───

    private async executePipeline(id: string) {
        if (this.running.has(id)) return;
        this.running.add(id);

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

            // Done!
            this.setPhase(id, "COMPLETED");
            this.setAgentStatus(id, "QA", "done");
            this.addEvent(id, "Orchestrator", "🎉", "Projet terminé et déployé!", "success");

        } catch (err: any) {
            this.setPhase(id, "FAILED", err.message);
            this.addEvent(id, "Orchestrator", "❌", `Erreur: ${err.message}`, "error");
        } finally {
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
            prompt: `Analyse cette idée de projet et crée un document PRD (Product Requirements Document) concis.

Idée: "${p.description}"

Réponds en JSON avec cette structure:
{
  "name": "nom du projet",
  "summary": "résumé en 2-3 phrases",
  "features": ["feature 1", "feature 2", ...],
  "userStories": [{"story": "...", "priority": "High|Medium|Low"}],
  "stack": {"frontend": "...", "backend": "...", "database": "..."},
  "targetAudience": "..."
}`,
            systemPrompt: "Tu es un analyste produit senior. Sois concis et pragmatique.",
            cwd: p.workspace,
            maxTurns: 3,
        });

        if (result.success && result.finalResult) {
            p.artifacts.analysis = this.tryParseJson(result.finalResult);
            this.setAgentStatus(id, "Analyst", "done", "PRD créé");
            this.addEvent(id, "Analyst", "🔍", "✓ PRD créé avec analyse complète", "success");
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
            ...(analysis?.features?.slice(0, 3) || []),
        ].filter(Boolean).map(String);

        const skills = await findSkillsForContext(keywords, 5);
        const skillsContext = skills.length > 0
            ? `\n\nSkills disponibles sur skills.sh:\n${skills.map(s => `- ${s.title}: ${s.content?.substring(0, 200)}...`).join("\n")}`
            : "";

        this.addEvent(id, "Architect", "📐", `Skills assignés: ${skills.map(s => s.title).join(", ") || "aucun"}`, "info");

        const result = await runClaudeAgent({
            prompt: `Conçois l'architecture technique pour ce projet.

PRD: ${JSON.stringify(analysis, null, 2)}
${skillsContext}

Crée un document d'architecture avec:
1. Stack technique précise
2. Structure de fichiers
3. Endpoints API (si applicable)
4. Schéma de données
5. Plan de déploiement (Docker + Dokploy)

Réponds en JSON:
{
  "stack": {"frontend": "...", "backend": "...", "database": "...", "deployment": "Docker"},
  "fileStructure": [{"path": "...", "description": "..."}],
  "endpoints": [{"method": "GET", "path": "/api/...", "description": "..."}],
  "features": ["feature à implémenter 1", "feature 2", ...]
}`,
            systemPrompt: "Tu es un architecte logiciel senior. Choisis des stacks simples et éprouvées.",
            cwd: p.workspace,
            maxTurns: 3,
            appendPrompt: skillsContext,
        });

        if (result.success && result.finalResult) {
            p.artifacts.architecture = this.tryParseJson(result.finalResult);
            p.artifacts.skills = skills.map(s => ({ title: s.title, href: s.href }));
            this.setAgentStatus(id, "Architect", "done", "Architecture définie");
            this.addEvent(id, "Architect", "📐", "✓ Architecture technique définie", "success");
        } else {
            this.setAgentStatus(id, "Architect", "error", result.error || "Échec");
            this.addEvent(id, "Architect", "📐", `✗ Architecture échouée: ${result.error}`, "error");
            throw new Error(`Architecture failed: ${result.error}`);
        }
        this.addTokens(id, result);
        await this.saveState();
    }

    private async runScaffold(id: string) {
        this.setPhase(id, "SCAFFOLD");
        this.setAgentStatus(id, "Developer", "active", "Création du scaffold...");

        const p = this.pipelines.get(id)!;
        const repoName = `vibecraft-${p.name}`;

        // Create GitHub repo
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

                    // Clone the repo
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
        const result = await runClaudeAgent({
            prompt: `Crée le scaffold initial de ce projet dans le répertoire courant.

Architecture: ${JSON.stringify(architecture, null, 2)}

Instructions:
1. Crée tous les fichiers de base (package.json, Dockerfile, etc.)
2. Implémente un hello world fonctionnel qui build
3. Assure-toi que le Dockerfile produit une image qui démarre correctement
4. NE génère PAS toutes les features, juste le squelette

RÈGLES CRITIQUES POUR LE DOCKERFILE:
- NE JAMAIS utiliser "COPY ... 2>/dev/null || true" — la syntaxe shell ne marche PAS dans COPY
- Utiliser des fichiers simples et basiques dans le Dockerfile
- Le Dockerfile doit être simple : FROM, WORKDIR, COPY, RUN, EXPOSE, CMD
- NE PAS modifier le Dockerfile dans les features suivantes sauf si absolument nécessaire

Le projet doit builder et démarrer avec: docker build . && docker run -p 3000:3000`,
            systemPrompt: "Tu es un développeur senior. Crée un scaffold minimal mais fonctionnel. Utilise les meilleures pratiques.",
            cwd: p.workspace,
            allowedTools: ["Write", "Edit", "Bash"],
            maxTurns: 20,
        });

        if (!result.success) {
            this.addEvent(id, "Developer", "💻", `Erreur scaffold: ${result.error}`, "error");
        }
        this.addTokens(id, result);

        // Push to GitHub
        if (p.github) {
            await gitPush(p.workspace, "feat: initial scaffold by VibeCraft AI");
            this.addEvent(id, "Developer", "💻", "Push GitHub → scaffold initial", "success");
        }

        // Deploy to Dokploy
        if (isDokployConfigured() && p.github) {
            this.setPhase(id, "DEPLOYING");
            try {
                const dokProject = await createDokployProject(repoName, p.description);
                const app = await createDokployApplication({
                    name: repoName,
                    projectId: dokProject.projectId,
                    environmentId: dokProject.environmentId || "",
                    owner: p.github.owner,
                    repo: p.github.repo,
                    branch: "main",
                    buildType: "dockerfile",
                });

                p.dokploy = {
                    projectId: dokProject.projectId,
                    applicationId: app.applicationId,
                };

                // Create domain for the application
                const domain = await createDomain(app.applicationId, repoName);
                if (domain) {
                    p.dokploy.url = `https://${domain.host}`;
                    this.addEvent(id, "Dokploy", "🌐", `Domain créé → https://${domain.host}`, "success");
                }

                this.addEvent(id, "Dokploy", "🚀", `Déployé dans Dokploy → ${repoName}`, "deploy");
            } catch (err: any) {
                this.addEvent(id, "Dokploy", "🚀", `Erreur Dokploy: ${err.message}`, "error");
            }
        }

        this.addEvent(id, "Developer", "💻", "✓ Scaffold créé et déployé", "success");
        await this.saveState();
    }

    private async runDevelopment(id: string) {
        this.setPhase(id, "DEVELOPMENT");
        this.setAgentStatus(id, "Developer", "active", "Développement des features...");

        const p = this.pipelines.get(id)!;
        const architecture = p.artifacts.architecture as any;
        const features = architecture?.features || [];

        for (let i = 0; i < features.length; i++) {
            if (this.shouldStop(id)) return;

            const feature = features[i];
            this.setAgentStatus(id, "Developer", "active", `Feature ${i + 1}/${features.length}: ${feature}`);
            this.addEvent(id, "Developer", "💻", `Feature ${i + 1}/${features.length}: ${feature}`, "info");

            // Update progress proportionally within Development phase
            const devProgress = 40 + Math.round((i / features.length) * 30);
            const pipeline = this.pipelines.get(id)!;
            pipeline.progress = devProgress;

            const result = await runClaudeAgent({
                prompt: `Implémente cette feature dans le projet existant:

Feature: "${feature}"

Architecture: ${JSON.stringify(architecture, null, 2)}

Instructions:
1. Lis le code existant pour comprendre la structure
2. Implémente la feature de manière propre
3. Assure-toi que le code compile sans erreur
4. Ne casse pas les features existantes`,
                systemPrompt: "Tu es un développeur senior. Écris du code propre et fonctionnel. Gère les erreurs correctement.",
                cwd: p.workspace,
                allowedTools: ["Read", "Write", "Edit", "Bash", "ListDir"],
                maxTurns: 30,
            });

            if (!result.success) {
                this.addEvent(id, "Developer", "💻", `Erreur feature "${feature}": ${result.error}`, "warning");
            }
            this.addTokens(id, result);

            // Push after each feature
            if (p.github) {
                await gitPush(p.workspace, `feat: ${feature}`);
                this.addEvent(id, "Developer", "💻", `Push → feat: ${feature}`, "success");
            }

            // Wait for deploy and check build
            if (p.dokploy) {
                await this.waitForBuild(id);
            }
        }

        this.setAgentStatus(id, "Developer", "done", `${features.length} features implémentées`);
        await this.saveState();
    }

    private async waitForBuild(id: string, maxRetries = 3) {
        const p = this.pipelines.get(id)!;
        if (!p.dokploy) return;

        // Wait a bit for Dokploy to start building
        await this.sleep(10000);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const deployment = await getLatestDeployment(p.dokploy.applicationId);
                if (!deployment) continue;

                if (deployment.status === "done") {
                    this.addEvent(id, "Dokploy", "🚀", `✓ Build réussi`, "deploy");
                    return;
                }

                if (deployment.status === "error") {
                    // Build failed — activate debugger
                    const logs = await getBuildLogs(p.dokploy.applicationId);
                    this.addEvent(id, "Dokploy", "🚀", `✗ Build échoué`, "error");

                    await this.runDebugger(id, logs);

                    // Re-push and retry
                    if (p.github) {
                        await gitPush(p.workspace, "fix: build error correction");
                        await triggerDeploy(p.dokploy.applicationId);
                        await this.sleep(15000);
                    }
                }
            } catch (err) {
                console.warn(`[Orchestrator] Build check error:`, err);
            }

            await this.sleep(10000);
        }
    }

    private async runDebugger(id: string, errorLogs: string) {
        this.setAgentStatus(id, "Debugger", "active", "Correction des erreurs...");
        this.addEvent(id, "Debugger", "🔧", "Analyse des logs de build...", "info");

        const p = this.pipelines.get(id)!;

        const result = await runClaudeAgent({
            prompt: `Le build Docker a échoué. Voici les logs d'erreur:

${errorLogs}

Instructions:
1. Analyse les erreurs
2. Corrige les fichiers problématiques
3. Assure-toi que le Dockerfile et le code sont corrects
4. Le build doit passer après ta correction`,
            systemPrompt: "Tu es un debugger expert. Analyse les erreurs de build et corrige-les de manière ciblée.",
            cwd: p.workspace,
            allowedTools: ["Read", "Write", "Edit", "Bash", "ListDir"],
            maxTurns: 15,
        });

        if (result.success) {
            this.setAgentStatus(id, "Debugger", "done", "Corrections appliquées");
            this.addEvent(id, "Debugger", "🔧", "✓ Corrections appliquées", "success");
        } else {
            this.addEvent(id, "Debugger", "🔧", `Erreur debugger: ${result.error}`, "error");
        }
        this.addTokens(id, result);
    }

    private async runQA(id: string) {
        this.setPhase(id, "QA");
        this.setAgentStatus(id, "QA", "active", "Review du code...");

        const p = this.pipelines.get(id)!;

        const result = await runClaudeAgent({
            prompt: `Fais un review complet du projet:

1. Vérifie que le code compile sans erreur
2. Vérifie la structure du projet
3. Vérifie les bonnes pratiques de sécurité
4. Corrige les problèmes trouvés
5. Assure-toi que le Dockerfile est correct

Résumé: donne une note /10 et liste les problèmes trouvés.`,
            systemPrompt: "Tu es un QA engineer senior. Sois thorough mais pragmatique.",
            cwd: p.workspace,
            allowedTools: ["Read", "Write", "Edit", "Bash", "ListDir"],
            maxTurns: 15,
        });

        if (result.success && p.github) {
            await gitPush(p.workspace, "chore: QA fixes");
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
