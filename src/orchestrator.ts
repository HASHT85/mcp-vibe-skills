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

import { runClaudeAgent, gitPush, gitClone, gitInit, agentEvents, type AgentAction } from "./claude_code.js";
import { GraphManager } from "./dag/Graph.js";
import type { NodeContext } from "./dag/Node.js";
import { AnalysisNode, ArchitectureNode, ScaffoldNode, DevelopmentNode, QANode, DeployNode } from "./dag/nodes/VibeCraftNodes.js";
import { SupervisorNode } from "./dag/nodes/SupervisorNode.js";
import { SkillsEnrichmentNode } from "./dag/nodes/SkillsEnrichmentNode.js";
import { createRepo } from "./github_api.js";

import type { Pipeline, PipelinePhase, AgentStatus, PipelineAgent, PipelineEvent } from "./orchestrator_types.js";
import { savePipelinesState, loadPipelinesState } from "./orchestrator_state.js";
import { addPipelineEvent, setAgentStatus, setPipelinePhase, addTokenUsage } from "./orchestrator_events.js";
import { WORKSPACE_ROOT, getGithubToken, slugify } from "./orchestrator_utils.js";

export type { PipelineEvent };

const DEFAULT_AGENTS: Omit<PipelineAgent, "status">[] = [
    { role: "Analyst", emoji: "🔍" },
    { role: "Architect", emoji: "📐" },
    { role: "Developer", emoji: "💻" },
    { role: "Debugger", emoji: "🔧" },
    { role: "QA", emoji: "🧪" },
];

export class Orchestrator extends EventEmitter {
    private pipelines: Map<string, Pipeline> = new Map();
    private running: Set<string> = new Set();
    private abortControllers: Map<string, AbortController> = new Map();

    constructor() {
        super();
        loadPipelinesState(this.pipelines).catch(() => { /* first run */ });

        agentEvents.on("action", (action: AgentAction) => {
            // @ts-ignore
            this.emit("agent-action", action);
        });
    }

    // ─── Pipeline Management ───

    async launchIdea(description: string, name?: string, model?: string, files?: { base64: string; type: string }[]): Promise<Pipeline> {
        const id = crypto.randomUUID().slice(0, 8);
        const projectName = name || slugify(description);
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

        if (files && files.length > 0) pipeline.artifacts.initialFiles = files;

        this.pipelines.set(id, pipeline);
        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🚀", `Pipeline créé: "${description}"`, "info");
        await savePipelinesState(this.pipelines);

        this.executePipeline(id).catch(err => {
            console.error(`[Orchestrator] Pipeline ${id} failed:`, err);
            setPipelinePhase(this, this.pipelines, id, "FAILED", String(err.message || err));
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
        setPipelinePhase(this, this.pipelines, id, "PAUSED");
        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⏸️", "Pipeline mis en pause", "warning");
        await savePipelinesState(this.pipelines);
        return true;
    }

    async resumePipeline(id: string): Promise<boolean> {
        const p = this.pipelines.get(id);
        if (!p || p.phase !== "PAUSED") return false;
        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "▶️", "Pipeline repris", "info");

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
        await savePipelinesState(this.pipelines);
        return true;
    }

    async killPipeline(id: string): Promise<boolean> {
        const p = this.pipelines.get(id);
        if (!p) return false;

        const controller = this.abortControllers.get(id);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(id);
        }

        this.running.delete(id);

        if (p.phase !== "COMPLETED" && p.phase !== "FAILED") {
            setPipelinePhase(this, this.pipelines, id, "FAILED", "Pipeline arrêté manuellement via le Kill Switch.");
            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🛑", "Processus arrêté de force.", "error");
        }
        await savePipelinesState(this.pipelines);
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

        p.phase = "DEVELOPMENT";
        p.progress = 50;
        p.error = undefined;
        p.artifacts.pendingModification = instructions;
        if (files && files.length > 0) {
            (p.artifacts as any).pendingModificationFiles = files;
        }

        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "✏️", `Modification demandée: ${instructions.slice(0, 100)}...${(files && files.length > 0) ? ` (avec ${files.length} fichiers)` : ''}`, "info");
        await savePipelinesState(this.pipelines);

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
            setPipelinePhase(this, this.pipelines, id, "ANALYSIS");
            addPipelineEvent(this, this.pipelines, id, "Analyst", "🧠", "Analyse de la demande de modification...", "info");
            setAgentStatus(this, this.pipelines, id, "Analyst", "active", "Analyse de la modification...");

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

            addTokenUsage(this.pipelines, id, analystResult);
            if (!analystResult.success) {
                addPipelineEvent(this, this.pipelines, id, "Analyst", "⚠️", `Erreur d'analyse: ${analystResult.error}`, "warning");
                throw new Error("Analyst failed");
            }

            let modType = "bugfix";
            let modPlan = instructions;
            try {
                // @ts-ignore
                const jsonMatch = analystResult.output?.match(/\{[\s\S]*?\}/);
                // @ts-ignore
                addTokenUsage(this.pipelines, id, { usage: (analystResult as any).output?.usage ?? {} });
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    modType = parsed.type === "structural" ? "structural" : "bugfix";
                    if (parsed.plan) modPlan = parsed.plan;
                    addPipelineEvent(this, this.pipelines, id, "Analyst", "🧠", `Type identifié: ${modType}. Plan généré.`, "success");
                }
            } catch (e) {
                addPipelineEvent(this, this.pipelines, id, "Analyst", "⚠️", "Impossible de parser l'analyse, mode bugfix par défaut.", "warning");
            }
            setAgentStatus(this, this.pipelines, id, "Analyst", "done");

            if (modType === "structural") {
                setPipelinePhase(this, this.pipelines, id, "ARCHITECTURE");
                setAgentStatus(this, this.pipelines, id, "Architect", "active", "Restructuration (Architecture)...");
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

                addTokenUsage(this.pipelines, id, archResult);
                if (!archResult.success) {
                    addPipelineEvent(this, this.pipelines, id, "Architect", "⚠️", `Erreur architecture: ${archResult.error}`, "warning");
                    if (p.github) {
                        try {
                            const { execSync } = await import("node:child_process");
                            execSync("git reset --hard && git clean -fd", { cwd: p.workspace });
                        } catch { }
                    }
                    throw new Error("Architect failed");
                }
                addPipelineEvent(this, this.pipelines, id, "Architect", "🏗️", "Scaffolding structurel terminé.", "success");
                setAgentStatus(this, this.pipelines, id, "Architect", "done");
            }

            setPipelinePhase(this, this.pipelines, id, "DEVELOPMENT");
            setAgentStatus(this, this.pipelines, id, "Developer", "active", "Modification en cours...");

            if (p.github) {
                const workspaceExists = await fs.access(p.workspace).then(() => true).catch(() => false);
                if (!workspaceExists) {
                    addPipelineEvent(this, this.pipelines, id, "Developer", "💻", "Re-clonage du workspace...", "info");
                    await gitClone(
                        `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`,
                        p.workspace
                    );
                }
            }

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
                addPipelineEvent(this, this.pipelines, id, "Developer", "⚠️", `Erreur agent: ${result.error}`, "warning");
                if (p.github) {
                    try {
                        const { execSync } = await import("child_process");
                        execSync("git reset --hard && git clean -fd", { cwd: p.workspace });
                    } catch { }
                }
                throw new Error(`Developer agent failed to complete: ${result.error}`);
            }
            addTokenUsage(this.pipelines, id, result);

            if (p.github) {
                let hasChanges = false;
                try {
                    const { execSync } = await import("child_process");
                    const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                    hasChanges = status.length > 0;
                } catch { hasChanges = false; }

                if (!hasChanges) {
                    addPipelineEvent(this, this.pipelines, id, "Developer", "⚠️", "Aucun fichier modifié — l'agent n'a pas écrit de code. Reformule ta demande en étant plus précis sur les fichiers à modifier.", "warning");
                } else {
                    const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                    const pushed = await gitPush(p.workspace, `mod: ${instructions.slice(0, 50)}`, authUrl);
                    if (pushed) {
                        addPipelineEvent(this, this.pipelines, id, "Developer", "💻", "Push → modification appliquée", "success");
                    } else {
                        addPipelineEvent(this, this.pipelines, id, "Developer", "⚠️", "Push échoué — relance la modification", "warning");
                    }
                }

                setPipelinePhase(this, this.pipelines, id, "QA");
                setAgentStatus(this, this.pipelines, id, "QA", "active", "Vérification post-modification...");

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
                    addPipelineEvent(this, this.pipelines, id, "QA", "⚠️", `Erreur agent QA: ${qaResult.error}`, "warning");
                    if (p.github) {
                        try {
                            const { execSync } = await import("node:child_process");
                            execSync("git reset --hard && git clean -fd", { cwd: p.workspace });
                        } catch { }
                    }
                    throw new Error(`QA agent failed to complete: ${qaResult.error}`);
                }
                addTokenUsage(this.pipelines, id, qaResult);
                setAgentStatus(this, this.pipelines, id, "QA", "done");

                if (p.github) {
                    let hasQhanges = false;
                    try {
                        const { execSync } = await import("node:child_process");
                        const status = execSync("git status --porcelain", { cwd: p.workspace }).toString().trim();
                        hasQhanges = status.length > 0;
                    } catch { hasQhanges = false; }

                    if (hasQhanges) {
                        const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                        const pushed = await gitPush(p.workspace, `fix: QA auto-corrections applied`, authUrl);
                        addPipelineEvent(this, this.pipelines, id, "QA", "💻", "Push → correctifs QA appliqués", "success");
                    } else {
                        addPipelineEvent(this, this.pipelines, id, "QA", "⚠️", "Push QA échoué", "warning");
                    }
                }
            }

            delete p.artifacts.pendingModification;
            setPipelinePhase(this, this.pipelines, id, "COMPLETED");
            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🎉", "Modification terminée et déployée!", "success");

        } catch (err: any) {
            if (err.name === 'AbortError') {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🛑", "Modification annulée.", "error");
            } else {
                setPipelinePhase(this, this.pipelines, id, "FAILED", err.message);
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "❌", `Erreur modification: ${err.message}`, "error");
            }
        } finally {
            this.abortControllers.delete(id);
            this.running.delete(id);
            await savePipelinesState(this.pipelines);
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
            // ─── GitHub Setup ───
            if (getGithubToken()) {
                try {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", "Création du repo GitHub...", "info");
                    const repo = await createRepo(p.name, p.description);
                    p.github = { owner: repo.owner, repo: repo.name, url: repo.url };
                    await gitInit(p.workspace, `https://${getGithubToken()}@github.com/${repo.owner}/${repo.name}.git`);
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", `Repo GitHub créé: ${repo.url}`, "success");
                    await savePipelinesState(this.pipelines);
                } catch (gitErr: any) {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `GitHub setup échoué: ${gitErr.message} — on continue sans GitHub`, "warning");
                }
            }

            const context: NodeContext = {
                pipeline: p,
                workspace: p.workspace,
                addEvent: (role, emoji, action, type) => addPipelineEvent(this, this.pipelines, id, role, emoji, action, type),
                updateAgentStatus: (role, status, action) => setAgentStatus(this, this.pipelines, id, role, status, action),
                checkAbort: () => abortController.signal.aborted
            };

            const manager = new GraphManager(context);

            manager.on("node-start", (node: any) => {
                const phaseMap: Record<string, PipelinePhase> = {
                    "analysis": "ANALYSIS",
                    "skills_enrichment": "ANALYSIS",
                    "architecture": "ARCHITECTURE",
                    "scaffold": "SCAFFOLD",
                    "development": "DEVELOPMENT",
                    "qa": "QA",
                    "deploy": "DEPLOYING"
                };
                if (phaseMap[node.id]) setPipelinePhase(this, this.pipelines, id, phaseMap[node.id]);
            });

            manager.on("node-complete", ({ node }: { node: any }) => {
                const progressMap: Record<string, number> = {
                    "analysis": 10,
                    "skills_enrichment": 15,
                    "architecture": 30,
                    "scaffold": 50,
                    "development": 70,
                    "qa": 85,
                    "deploy": 100
                };
                if (progressMap[node.id]) p.progress = progressMap[node.id];
            });

            manager.addNode(new AnalysisNode());
            manager.addNode(new SkillsEnrichmentNode());
            manager.addNode(new ArchitectureNode());
            manager.addNode(new ScaffoldNode());
            manager.addNode(new SupervisorNode("scaffold", ["scaffold"]));
            manager.addNode(new DevelopmentNode());
            manager.addNode(new SupervisorNode("development", ["development"]));
            manager.addNode(new QANode());
            manager.addNode(new DeployNode());

            await manager.executeAll();

            // ─── Final GitHub Push ───
            if (p.github) {
                try {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", "Push final vers GitHub...", "info");
                    const authUrl = `https://${getGithubToken()}@github.com/${p.github.owner}/${p.github.repo}.git`;
                    const pushed = await gitPush(p.workspace, "feat: initial project generation", authUrl);
                    if (pushed) {
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", `Push OK → ${p.github.url}`, "success");
                    } else {
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", "Push GitHub échoué", "warning");
                    }
                } catch (pushErr: any) {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Push échoué: ${pushErr.message}`, "warning");
                }
            }

            // ─── Auto-Deploy: spawn project as its own Docker container ───
            try {
                const prodComposePath = path.join(p.workspace, "docker-compose.prod.yml");
                const hasProdCompose = await fs.access(prodComposePath).then(() => true).catch(() => false);

                if (hasProdCompose) {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", "Déploiement du container projet...", "info");

                    // Ensure .env exists so docker compose build doesn't fail on missing vars
                    const envPath = path.join(p.workspace, ".env");
                    const envExamplePath = path.join(p.workspace, ".env.example");
                    const hasEnv = await fs.access(envPath).then(() => true).catch(() => false);
                    if (!hasEnv) {
                        const hasEnvExample = await fs.access(envExamplePath).then(() => true).catch(() => false);
                        if (hasEnvExample) {
                            await fs.copyFile(envExamplePath, envPath);
                        } else {
                            await fs.writeFile(envPath, "# Auto-generated\nVITE_OPENWEATHER_API_KEY=placeholder\n");
                        }
                    }

                    // Read VITE_ vars from .env
                    const envContent = await fs.readFile(envPath, "utf-8").catch(() => "");
                    const viteVars: Record<string, string> = {};
                    for (const line of envContent.split("\n")) {
                        const match = line.match(/^(VITE_[A-Z0-9_]+)=(.*)$/);
                        if (match) viteVars[match[1]] = match[2];
                    }

                    // Patch generated Dockerfiles to inject ARG declarations for VITE_ vars.
                    // `docker compose up --build` does NOT support --build-arg on the CLI;
                    // ARG must be declared in Dockerfile itself for build-time availability.
                    if (Object.keys(viteVars).length > 0) {
                        const argBlock = Object.entries(viteVars)
                            .map(([k, v]) => `ARG ${k}=${v}`)
                            .join("\n") + "\n";
                        const { execSync: execS } = await import("node:child_process");
                        const dfList = execS(
                            `find . -name "Dockerfile*" -not -path "*/node_modules/*"`,
                            { cwd: p.workspace, encoding: "utf-8" }
                        ).split("\n").filter(Boolean);
                        for (const df of dfList) {
                            const dfPath = path.join(p.workspace, df);
                            const dfContent = await fs.readFile(dfPath, "utf-8").catch(() => "");
                            // Only inject if ARGs not already present
                            if (dfContent && !dfContent.includes("ARG VITE_")) {
                                const patched = dfContent.replace(
                                    /(FROM\s+\S+(?:\s+AS\s+\S+)?\r?\n)/i,
                                    `$1${argBlock}`
                                );
                                await fs.writeFile(dfPath, patched, "utf-8");
                            }
                        }
                    }

                    // Use host path for build-arg env vars, but cwd must be the CONTAINER path
                    // because execSync runs inside the container.
                    // Docker CLI reads the compose file from its local filesystem and sends
                    // the build context as a tar archive to the daemon — no host path needed for cwd.
                    const hostWorkspace = process.env.HOST_WORKSPACE_PATH || "/opt/vibecraft/workspace";
                    const hostProjectPath = path.join(hostWorkspace, id);

                    const { execSync } = await import("node:child_process");

                    const projectName = `vibe-${id}`;

                    console.log(`[Deploy] Container project path: ${p.workspace}`);
                    console.log(`[Deploy] Host project path: ${hostProjectPath}`);

                    execSync(
                        `docker compose -p ${projectName} -f docker-compose.prod.yml up -d --build`,
                        {
                            cwd: p.workspace,  // MUST be container path — execSync runs inside container
                            env: {
                                ...process.env,
                                ...viteVars,
                                COMPOSE_PROJECT_NAME: projectName,
                                HOST_PROJECT_PATH: hostProjectPath,
                            },
                            timeout: 5 * 60 * 1000,
                            stdio: "pipe",
                        }
                    );

                    p.artifacts.deployed = true;
                    p.artifacts.deployedUrl = `https://${p.id}.hach.dev`;
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", `Container déployé! Accessible sur ${p.artifacts.deployedUrl}`, "success");
                } else {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", "Pas de docker-compose.prod.yml — déploiement ignoré", "warning");
                }
            } catch (deployErr: any) {
                const errMsg = deployErr.stderr ? deployErr.stderr.toString().slice(-500) : deployErr.message;
                console.error(`[Deploy] ❌ Error: ${errMsg}`);
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Déploiement container échoué: ${errMsg}`, "warning");
                // Don't throw — the project is still generated successfully
            }

            setPipelinePhase(this, this.pipelines, id, "COMPLETED");
            setAgentStatus(this, this.pipelines, id, "QA", "done");
            const completedMsg = p.github
                ? `Projet terminé! Repo GitHub: ${p.github.url}${p.artifacts.deployed ? ` | Live: ${p.artifacts.deployedUrl}` : ""}`
                : `Projet terminé!${p.artifacts.deployed ? ` Live: ${p.artifacts.deployedUrl}` : ""}`;
            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🎉", completedMsg, "success");

        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'Pipeline Aborted') {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🛑", "Pipeline annulé.", "error");
            } else {
                setPipelinePhase(this, this.pipelines, id, "FAILED", err.message);
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "❌", `Erreur: ${err.message}`, "error");
            }
        } finally {
            this.abortControllers.delete(id);
            this.running.delete(id);
            await savePipelinesState(this.pipelines);
        }
    }
}

// ─── Singleton ───

let instance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
    if (!instance) instance = new Orchestrator();
    return instance;
}
