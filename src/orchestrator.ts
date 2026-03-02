/**
 * Orchestrator — Multi-Pipeline Manager
 * Manages N project pipelines in parallel, each going through BMAD phases.
 * Uses Claude Code Agent SDK for actual development work.
 */

// @ts-ignore
import * as fs from "node:fs/promises";
// @ts-ignore
import * as path from "node:path";
// @ts-ignore
import * as crypto from "node:crypto";
// @ts-ignore
import { EventEmitter } from "node:events";

import { runClaudeAgent, gitInit, gitPush, gitClone, agentEvents, type AgentAction } from "./claude_code.js";
import { GraphManager } from "./dag/Graph.js";
import type { NodeContext } from "./dag/Node.js";
import { AnalysisNode, ArchitectureNode, ScaffoldNode, DevelopmentNode, QANode, DeployNode } from "./dag/nodes/VibeCraftNodes.js";
import { SupervisorNode } from "./dag/nodes/SupervisorNode.js";
import { tryParseJson, slugify } from "./utils/project_helpers.js";
import type { Pipeline, PipelinePhase, ProjectType, ProjectService, AgentStatus, PipelineAgent, PipelineEvent } from "./types.js";
export type { PipelineEvent };




// ─── Constants ───

// @ts-ignore
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "/workspace";
// @ts-ignore
const STORE_PATH = process.env.PIPELINES_STORE || "/data/pipelines.json";

// Read at call-time (not at module init) so env vars from .env container work
// @ts-ignore
const getGithubOwner = () => process.env.GITHUB_OWNER || "";
// @ts-ignore
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
        this.loadState().catch(() => { /* first run, no state file */ });

        // Forward agent events
        agentEvents.on("action", (action: AgentAction) => {
            // @ts-ignore
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
        // @ts-ignore
        if (typeof (abortController.signal as any).setMaxListeners === "function") {
            // @ts-ignore
            (abortController.signal as any).setMaxListeners(50);
        }
        this.abortControllers.set(id, abortController);

        const p = this.pipelines.get(id)!;

        try {
            // 1. Analyst Phase: Classification & Planning
            this.setPhase(id, "ANALYSIS");
            this.addEvent(id, "Analyst", "🧠", "Analyse de la demande de modification...", "info");
            this.setAgentStatus(id, "Analyst", "active", "Analyse de la modification...");

            const analystResult = await runClaudeAgent({
                model: p.model,
                prompt: `Un utilisateur veut modifier ce projet existant.
Voici ses instructions :
"${instructions}"

Analyse la demande et retourne UNIQUEMENT un objet JSON valide avec ce format :
{
  "type": "structural" | "bugfix",
  "plan": "Instructions étape par étape claires pour le développeur. Ex: 1. Modifier le fichier X... 2. Créer Y..."
}

"structural" : Ajout de micro-services, changement de framework, nouvelle base de données, restructuration majeure.
"bugfix" : Correction de bug, petite feature, modification UI, refacto de code existant.`,
                systemPrompt: "Tu es un Analyste IA. Tu ne réponds que par un objet JSON valide, sans bloc de markdown ni texte autour.",
                cwd: p.workspace,
                allowedTools: ["list_dir", "read_file", "bash"],
                maxTurns: 10,
                timeoutMs: 5 * 60 * 1000,
                abortSignal: this.abortControllers.get(id)?.signal,
            });

            this.addTokens(id, analystResult);
            if (!analystResult.success) {
                this.addEvent(id, "Analyst", "⚠️", `Erreur d'analyse: ${analystResult.error}`, "warning");
                throw new Error("Analyst failed");
            }

            let modType = "bugfix";
            let modPlan = instructions;
            try {
                // @ts-ignore
                const jsonMatch = analystResult.output?.match(/\{[\s\S]*?\}/);
                // @ts-ignore
                this.addTokens(id, { usage: (analystResult as any).output?.usage ?? {} });
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    modType = parsed.type === "structural" ? "structural" : "bugfix";
                    if (parsed.plan) modPlan = parsed.plan;
                    this.addEvent(id, "Analyst", "🧠", `Type identifié: ${modType}. Plan généré.`, "success");
                }
            } catch (e) {
                this.addEvent(id, "Analyst", "⚠️", "Impossible de parser l'analyse, mode bugfix par défaut.", "warning");
            }
            this.setAgentStatus(id, "Analyst", "done");

            // 2. Architect Phase (only if structural)
            if (modType === "structural") {
                this.setPhase(id, "ARCHITECTURE");
                this.setAgentStatus(id, "Architect", "active", "Restructuration (Architecture)...");
                const archResult = await runClaudeAgent({
                    model: p.model,
                    prompt: `L'utilisateur a demandé une modification structurelle majeure : "${instructions}".
Le plan de l'Analyste est :
${modPlan}

Exécute les commandes ou crée les fichiers nécessaires (nouveaux dossiers, docker-compose.yml mis à jour, nouveaux Dockerfile).
N'ÉCRASE PAS les fichiers de code logique existants. Contente-toi du Scaffolding pour préparer le terrain au développeur.
Ne boucle pas indéfiniment. Arrête-toi dès que le Scaffolding est prêt.`,
                    systemPrompt: "Tu es l'Architecte. Structure le projet en suivant le plan. Utilise write_file ou bash (npx, pip) pour le Scaffolding.",
                    cwd: p.workspace,
                    allowedTools: ["bash", "list_dir", "read_file", "write_file"],
                    maxTurns: 20,
                    timeoutMs: 8 * 60 * 1000,
                    abortSignal: this.abortControllers.get(id)?.signal,
                });

                this.addTokens(id, archResult);
                if (!archResult.success) {
                    this.addEvent(id, "Architect", "⚠️", `Erreur architecture: ${archResult.error}`, "warning");
                    if (p.github) {
                        // @ts-ignore
                        const { execSync } = await import("node:child_process");
                        try { execSync("git reset --hard && git clean -fd", { cwd: p.workspace }); } catch { }
                    }
                    throw new Error("Architect failed");
                }
                this.addEvent(id, "Architect", "🏗️", "Scaffolding structurel terminé.", "success");
                this.setAgentStatus(id, "Architect", "done");
            }

            // 3. Developer Phase
            this.setPhase(id, "DEVELOPMENT");
            this.setAgentStatus(id, "Developer", "active", "Modification en cours...");

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

            // Run developer agent with modification plan
            const result = await runClaudeAgent({
                model: p.model,
                prompt: `Tu dois implémenter ces modifications dans le projet :
Demande originale: "${instructions}"

PLAN D'EXÉCUTION DE L'ANALYSTE :
${modPlan}

PROCESSUS OBLIGATOIRE - respecte cet ordre:
1. Utilise list_dir sur ".": liste tous les fichiers
2. Utilise read_file sur les fichiers clés pour COMPRENDRE le code
3. UTILISE write_file ou replace_in_file pour appliquer le PLAN D'EXÉCUTION
4. SI tous les points du PLAN sont DÉJÀ complétés, STOPPE IMMÉDIATEMENT tes recherches et réponds en texte que tout est fait.

RÈGLES ABSOLUES:
- Ne boucle pas indéfiniment. Si tu as implémenté le PLAN, arrête-toi.
- Vérifie que tous les packages importés sont dans le requirements.txt ou package.json du service ciblé.`,
                attachedFiles: files,
                systemPrompt: "Tu es un développeur senior. Ton but est de suivre le PLAN D'EXÉCUTION généré par l'Analyste et de l'implémenter exactement. Tu dois modifier ou écrire les fichiers demandés, et arrêter dès que le plan est entièrement implémenté.",
                cwd: p.workspace,
                allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir"],
                maxTurns: 150,
                timeoutMs: 15 * 60 * 1000,
                abortSignal: this.abortControllers.get(id)?.signal,
            });

            if (!result.success) {
                this.addEvent(id, "Developer", "⚠️", `Erreur agent: ${result.error}`, "warning");
                if (p.github) {
                    // @ts-ignore
                    // @ts-ignore
                    const { execSync } = await import("child_process");
                    try { execSync("git reset --hard && git clean -fd", { cwd: p.workspace }); } catch { }
                }
                throw new Error(`Developer agent failed to complete: ${result.error}`);
            }
            this.addTokens(id, result);

            // Push to GitHub
            if (p.github) {
                // Check if there's anything to commit
                // @ts-ignore
                const { execSync } = await import("child_process");
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
                    maxTurns: 100,
                    abortSignal: abortController.signal,
                });
                if (!qaResult.success) {
                    this.addEvent(id, "QA", "⚠️", `Erreur agent QA: ${qaResult.error}`, "warning");
                    if (p.github) {
                        // @ts-ignore
                        const { execSync } = await import("node:child_process");
                        try { execSync("git reset --hard && git clean -fd", { cwd: p.workspace }); } catch { }
                    }
                    throw new Error(`QA agent failed to complete: ${qaResult.error}`);
                }
                this.addTokens(id, qaResult);
                this.setAgentStatus(id, "QA", "done");

                // Push any fixes applied during QA
                if (p.github) {
                    // @ts-ignore
                    const { execSync } = await import("node:child_process");
                    let hasQhanges = false;
                    try {
                        const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                        hasQhanges = status.length > 0;
                    } catch { hasQhanges = false; }

                    if (hasQhanges) {
                        const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                        const pushed = await gitPush(p.workspace, `fix: QA auto-corrections applied`, authUrl);
                        this.addEvent(id, "QA", "💻", "Push → correctifs QA appliqués", "success");
                    } else {
                        this.addEvent(id, "QA", "⚠️", "Push QA échoué", "warning");
                    }
                }
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

    // ─── Pipeline Execution ───

    private async executePipeline(id: string) {
        if (this.running.has(id)) return;
        this.running.add(id);

        const abortController = new AbortController();
        // @ts-ignore
        if (typeof (abortController.signal as any).setMaxListeners === "function") {
            // @ts-ignore
            (abortController.signal as any).setMaxListeners(50);
        }
        this.abortControllers.set(id, abortController);

        const p = this.pipelines.get(id)!;

        try {
            const context: NodeContext = {
                pipeline: p,
                workspace: p.workspace,
                addEvent: (role, emoji, action, type) => this.addEvent(id, role, emoji, action, type),
                updateAgentStatus: (role, status, action) => this.setAgentStatus(id, role, status, action),
                checkAbort: () => abortController.signal.aborted
            };

            const manager = new GraphManager(context);

            // Link node-start/complete events to Phase changes and progress
            // @ts-ignore
            manager.on("node-start", (node: any) => {
                const phaseMap: Record<string, PipelinePhase> = {
                    "analysis": "ANALYSIS",
                    "architecture": "ARCHITECTURE",
                    "scaffold": "SCAFFOLD",
                    "development": "DEVELOPMENT",
                    "qa": "QA",
                    "deploy": "DEPLOYING"
                };
                if (phaseMap[node.id]) this.setPhase(id, phaseMap[node.id]);
            });

            // @ts-ignore
            manager.on("node-complete", ({ node }: { node: any }) => {
                const progressMap: Record<string, number> = {
                    "analysis": 15,
                    "architecture": 30,
                    "scaffold": 50,
                    "development": 70,
                    "qa": 85,
                    "deploy": 100
                };
                if (progressMap[node.id]) p.progress = progressMap[node.id];
            });

            manager.addNode(new AnalysisNode());
            manager.addNode(new ArchitectureNode());
            manager.addNode(new ScaffoldNode());
            manager.addNode(new SupervisorNode("scaffold", ["scaffold"]));
            manager.addNode(new DevelopmentNode());
            manager.addNode(new SupervisorNode("development", ["development"]));
            manager.addNode(new QANode());
            manager.addNode(new DeployNode());

            await manager.executeAll();

            this.setPhase(id, "COMPLETED");
            this.setAgentStatus(id, "QA", "done");
            const completedMsg = p.github
                ? `Projet terminé! Repo GitHub: ${p.github.url}`
                : "Projet terminé!";
            this.addEvent(id, "Orchestrator", "🎉", completedMsg, "success");

        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'Pipeline Aborted') {
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

    // ─── Utility Methods ───

    private addEvent(id: string, role: string, emoji: string, action: string, type: "info" | "success" | "warning" | "error" = "info") {
        const p = this.pipelines.get(id);
        if (!p) return;
        const e: PipelineEvent = { id: crypto.randomUUID(), pipelineId: id, timestamp: new Date().toISOString(), agentRole: role, agentEmoji: emoji, action, type };
        p.events.push(e);
        // @ts-ignore
        this.emit("event", e);
    }

    private setAgentStatus(id: string, role: string, status: AgentStatus, action?: string) {
        const p = this.pipelines.get(id);
        if (!p) return;
        const agent = p.agents.find(a => a.role === role);
        if (agent) { agent.status = status; if (action) agent.currentAction = action; }
        // @ts-ignore
        this.emit("agent-status", { pipelineId: id, role, status, action });
    }

    private setPhase(id: string, phase: PipelinePhase, error?: string) {
        const p = this.pipelines.get(id);
        if (!p) return;
        p.phase = phase;
        if (error) p.error = error;
        p.updatedAt = new Date().toISOString();
        // @ts-ignore
        this.emit("phase", { pipelineId: id, phase, error });
    }

    private addTokens(id: string, result: { inputTokens?: number; outputTokens?: number }) {
        const p = this.pipelines.get(id);
        if (!p) return;
        if (!p.tokenUsage) p.tokenUsage = { inputTokens: 0, outputTokens: 0 };
        p.tokenUsage.inputTokens += result.inputTokens || 0;
        p.tokenUsage.outputTokens += result.outputTokens || 0;
    }

    private tryParseJson(text: string): any {
        try {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch { /* ignore */ }
        return { raw: text };
    }

    private detectProjectType(analysis: any): ProjectType {
        const declared = (analysis?.type || "").toLowerCase();
        if (["static", "spa", "fullstack", "api", "python-worker", "node-worker"].includes(declared)) return declared as ProjectType;
        return "api"; // default
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    }
}

// ─── Singleton ───

let instance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
    if (!instance) instance = new Orchestrator();
    return instance;
}
