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
import { AnalysisNode, ArchitectureNode, ScaffoldNode, DevelopmentNode, QANode, DeployNode } from "./dag/nodes/veistCraftNodes.js";
import { SupervisorNode } from "./dag/nodes/SupervisorNode.js";
import { fetchOpenRouterModels } from "./openrouter_models.js";
import { SkillsEnrichmentNode } from "./dag/nodes/SkillsEnrichmentNode.js";
import { ResearchNode } from "./dag/nodes/ResearchNode.js";
import { createRepo } from "./github_api.js";
import { SecretsService, getSecretsService } from "./secrets_service.js";


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
    public ready: Promise<void>;

    constructor() {
        super();
        this.ready = this.init();

        agentEvents.on("action", (action: AgentAction) => {
            // @ts-ignore
            this.emit("agent-action", action);
        });
    }

    private async init() {
        try {
            await loadPipelinesState(this.pipelines);
        } catch (err) {
            console.error("[Orchestrator] FAILED to load pipelines state:", err);
        }
    }

    // ─── Pipeline Management ───

    async launchIdea(description: string, name?: string, model?: string, files?: { base64: string; type: string }[], templateId?: string, githubUrl?: string): Promise<Pipeline> {
        // #14: Prevent too many concurrent pipelines
        const MAX_CONCURRENT = 3;
        if (this.running.size >= MAX_CONCURRENT) {
            throw new Error(`Maximum de ${MAX_CONCURRENT} pipelines simultanés atteint. Attendez qu'un pipeline se termine.`);
        }
        
        const id = crypto.randomUUID().slice(0, 8);
        const projectName = name || slugify(description);
        const workspace = path.join(WORKSPACE_ROOT, id);

        await fs.mkdir(workspace, { recursive: true });

        // Auto-detect template if not provided
        const { detectTemplate, getTemplateById } = await import("./templates/registry.js");
        const template = templateId ? getTemplateById(templateId) : detectTemplate(description);
        const resolvedTemplateId = template?.id || "web-spa";

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
            agentTokens: [],
            tokenHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            templateId: resolvedTemplateId,
            sourceGithubUrl: githubUrl,
        };

        if (files && files.length > 0) pipeline.artifacts.initialFiles = files;

        this.pipelines.set(id, pipeline);
        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🚀", `Pipeline créé: "${description}" [Template: ${template?.emoji || "🌐"} ${template?.name || resolvedTemplateId}]`, "info");
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
        const p = this.pipelines.get(id);
        this.killPipeline(id);
        
        // #13: Stop and remove Docker containers for this project
        if (p && p.artifacts.deployed) {
            try {
                const { execSync } = await import("node:child_process");
                const pName = `veist-${slugify(p.name)}`;
                // Try multi-container first
                const composeProd = path.join(p.workspace, "docker-compose.prod.yml");
                const composeDeploy = path.join(p.workspace, "docker-compose.deploy.yml");
                const hasProd = await fs.access(composeProd).then(() => true).catch(() => false);
                const hasDeploy = await fs.access(composeDeploy).then(() => true).catch(() => false);
                if (hasProd) {
                    execSync(`docker compose -p ${pName} -f ${composeProd} down --remove-orphans -v`, {
                        cwd: p.workspace, stdio: "pipe", timeout: 30000
                    });
                } else if (hasDeploy) {
                    execSync(`docker compose -p ${pName} -f ${composeDeploy} down --remove-orphans -v`, {
                        cwd: p.workspace, stdio: "pipe", timeout: 30000
                    });
                }
                console.log(`[Delete] Cleaned up Docker containers for ${pName}`);
            } catch (err: any) {
                console.warn(`[Delete] Container cleanup failed: ${err.message}`);
            }
        }
        
        // Clean up secrets
        try {
            const secretsSvc = getSecretsService();
            secretsSvc.deleteAllSecrets(id);
        } catch { /* optional */ }
        
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

    // ─── Smart Retry (resume from failure) ───

    async retryPipeline(id: string): Promise<Pipeline | null> {
        const p = this.pipelines.get(id);
        if (!p) return null;
        if (p.phase !== "FAILED") return null;
        if (this.running.has(id)) return null;

        // Count how many nodes completed
        const completedCount = Object.values(p.nodeStatuses || {}).filter(s => s === "COMPLETED").length;
        const totalCount = (p.topology || []).length;

        // Reset phase but keep everything else
        p.phase = "QUEUED";
        p.error = undefined;
        p.progress = totalCount > 0 ? Math.floor((completedCount / totalCount) * 100) : 0;

        // Reset agents UI status for non-completed nodes
        if (p.agents && p.nodeStatuses) {
            for (const agent of p.agents) {
                // Find the matching topology node
                const topoNode = (p.topology || []).find(t => t.role === agent.role);
                if (topoNode && p.nodeStatuses[topoNode.id] === "COMPLETED") {
                    agent.status = "done";
                } else {
                    agent.status = "waiting";
                }
            }
        }

        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔄", `Resume: ${completedCount}/${totalCount} nodes déjà complétés — reprise au point d'échec`, "info");
        await savePipelinesState(this.pipelines);

        // Re-execute (executePipeline will read nodeStatuses to skip completed nodes)
        this.executePipeline(id).catch(err => {
            console.error(`[Orchestrator] Retry pipeline ${id} failed:`, err);
            setPipelinePhase(this, this.pipelines, id, "FAILED", String(err.message || err));
        });

        return p;
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
                setAgentStatus(this, this.pipelines, id, "Developer", "done");
                setAgentStatus(this, this.pipelines, id, "Debugger", "done"); // Skipped in modify mode
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
                        addPipelineEvent(this, this.pipelines, id, "QA", "✅", "Aucun changement par QA — code déjà correct", "info");
                    }
                }
            }

            delete p.artifacts.pendingModification;

            // ─── Rebuild and redeploy Docker container after modification ───
            // Deploy if: already deployed OR workspace has deploy files (initial deploy may have failed)
            const hasDockerfile = await fs.access(path.join(p.workspace, "Dockerfile")).then(() => true).catch(() => false);
            const hasComposeProdForDeploy = await fs.access(path.join(p.workspace, "docker-compose.prod.yml")).then(() => true).catch(() => false);
            if (p.artifacts.deployed || hasDockerfile || hasComposeProdForDeploy) {
                try {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", "Reconstruction du container avec les modifications...", "info");
                    const { execSync } = await import("node:child_process");
                    const slug = slugify(p.name);
                    const projectName = `veist-${slug}`;

                    // Re-inject secrets into .env before rebuild (#10)
                    // Vault secrets OVERWRITE existing keys (fixes placeholder bug)
                    try {
                        const secretsSvc = getSecretsService();
                        const envContent = secretsSvc.toEnvString(id);
                        if (envContent) {
                            const envPath = path.join(p.workspace, ".env");
                            const hasExisting = await fs.access(envPath).then(() => true).catch(() => false);
                            if (hasExisting) {
                                const existing = await fs.readFile(envPath, "utf-8");
                                const vaultKeys = new Map<string, string>();
                                for (const line of envContent.split("\n").filter(Boolean)) {
                                    const eqIdx = line.indexOf("=");
                                    if (eqIdx > 0) vaultKeys.set(line.slice(0, eqIdx), line.slice(eqIdx + 1));
                                }
                                // Replace existing keys with vault values, keep non-vault keys
                                const updatedLines = existing.split("\n").map(line => {
                                    const eqIdx = line.indexOf("=");
                                    if (eqIdx > 0) {
                                        const key = line.slice(0, eqIdx);
                                        if (vaultKeys.has(key)) {
                                            const val = vaultKeys.get(key)!;
                                            vaultKeys.delete(key);
                                            return `${key}=${val}`;
                                        }
                                    }
                                    return line;
                                });
                                // Append any vault keys not already in file
                                for (const [key, val] of vaultKeys) {
                                    updatedLines.push(`${key}=${val}`);
                                }
                                await fs.writeFile(envPath, updatedLines.join("\n"));
                            } else {
                                await fs.writeFile(envPath, envContent);
                            }
                        }
                    } catch { /* secrets injection optional */ }

                    // Check for multi-container (docker-compose.prod.yml) first
                    const composeProdPath = path.join(p.workspace, "docker-compose.prod.yml");
                    const hasComposeProd = await fs.access(composeProdPath).then(() => true).catch(() => false);

                    if (hasComposeProd) {
                        // Multi-container rebuild
                        console.log(`[Deploy-Modify] Multi-container rebuild via docker-compose.prod.yml`);
                        try {
                            execSync(`docker compose -p ${projectName} -f ${composeProdPath} down --remove-orphans`, {
                                cwd: p.workspace, stdio: "pipe", timeout: 30000
                            });
                        } catch { /* didn't exist */ }
                        execSync(`docker compose -p ${projectName} -f ${composeProdPath} build --no-cache`, {
                            cwd: p.workspace, timeout: 10 * 60 * 1000, stdio: "pipe"
                        });
                        execSync(`docker compose -p ${projectName} -f ${composeProdPath} up -d`, {
                            cwd: p.workspace, timeout: 60000, stdio: "pipe",
                        });
                    } else {
                        // Single-container rebuild (legacy)
                        const imageName = `veist-${slug}:latest`;
                        const rootDockerfile = path.join(p.workspace, "Dockerfile");
                        const rootDockerfileProd = path.join(p.workspace, "Dockerfile.prod");
                        let dockerfilePath = rootDockerfile;
                        if (await fs.access(rootDockerfileProd).then(() => true).catch(() => false)) {
                            dockerfilePath = rootDockerfileProd;
                        }

                        const buildCmd = `docker build --no-cache -f ${dockerfilePath} -t ${imageName} ${p.workspace}`;
                        console.log(`[Deploy-Modify] Rebuilding: ${buildCmd}`);
                        execSync(buildCmd, { cwd: p.workspace, timeout: 10 * 60 * 1000, stdio: "pipe" });

                        const deployComposePath = path.join(p.workspace, "docker-compose.deploy.yml");
                        if (await fs.access(deployComposePath).then(() => true).catch(() => false)) {
                            try {
                                execSync(`docker compose -p ${projectName} -f ${deployComposePath} down`, {
                                    cwd: p.workspace, stdio: "pipe", timeout: 30000
                                });
                            } catch { /* didn't exist */ }
                            execSync(`docker compose -p ${projectName} -f ${deployComposePath} up -d`, {
                                cwd: p.workspace, timeout: 60000, stdio: "pipe",
                            });
                        }
                    }

                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", `Container reconstruit et redéployé! ${p.artifacts.deployedUrl || ''}`, "success");
                } catch (deployErr: any) {
                    const errMsg = deployErr.stderr ? deployErr.stderr.toString().slice(-300) : deployErr.message;
                    console.error(`[Deploy-Modify] ❌ Rebuild failed: ${errMsg}`);
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Rebuild container échoué: ${errMsg}`, "warning");
                    // Don't throw — code was pushed, just container rebuild failed
                }
            }

            p.progress = 100;
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
            // ─── GitHub Setup (skip on resume) ───
            const isResume = p.nodeStatuses && Object.keys(p.nodeStatuses).length > 0;
            if (p.sourceGithubUrl && !p.github && !isResume) {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", `Clonage du repo: ${p.sourceGithubUrl}`, "info");
                const success = await gitClone(p.sourceGithubUrl, p.workspace);
                if (success) {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", `Repo cloné avec succès.`, "success");
                    const match = p.sourceGithubUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
                    if (match) {
                        p.github = { owner: match[1], repo: match[2], url: p.sourceGithubUrl };
                    }
                    await savePipelinesState(this.pipelines);
                } else {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Échec du clonage de ${p.sourceGithubUrl} — on continue sans repo`, "warning");
                }
            } else if (getGithubToken() && !p.github && !isResume) {
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
            } else if (isResume && p.github) {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔗", `GitHub repo existant: ${p.github.url}`, "info");
            }

            const context: NodeContext = {
                pipeline: p,
                workspace: p.workspace,
                addEvent: (role, emoji, action, type) => addPipelineEvent(this, this.pipelines, id, role, emoji, action, type),
                updateAgentStatus: (role, status, action) => setAgentStatus(this, this.pipelines, id, role, status, action),
                checkAbort: () => abortController.signal.aborted
            };

            // ─── Planner / Dynamic Topology ───
            let dynamicNodes: import("./types.js").NodeTopology[] = [];
            let dynamicIds: string[] = [];

            const baseNodeIds = ["research", "analysis", "skills_enrichment", "architecture", "scaffold", "supervisor_for_scaffold", "qa", "deploy"];

            if (isResume && p.topology && p.topology.length > 0) {
                // Resume mode: reuse existing topology, extract dynamic nodes
                addPipelineEvent(this, this.pipelines, id, "Planner", "🛸", `Resume: réutilisation de la topologie existante (${p.topology.length} nodes)`, "info");
                dynamicNodes = p.topology.filter(t => !baseNodeIds.includes(t.id) && !t.id.startsWith("supervisor_for_"));
                dynamicIds = dynamicNodes.map(d => d.id);
            } else {
                // Fresh run: use planner to generate dynamic topology
                addPipelineEvent(this, this.pipelines, id, "Planner", "🛸", "Analyse de la demande: Création de l'essaim d'agents...", "info");
            
                const userModel = p.model || "claude-sonnet-4-6";

                const plannerPrompt = `Analyze the project: "${p.description}"

We have standard pipeline agents for Research, Analysis, Architecture, and Scaffold.
Your goal: generate the DEVELOPMENT sub-agents that will actually BUILD the project after the scaffold.

RULES:
- Create 2-6 specialized agents depending on project complexity
- Each agent should handle a clear domain (frontend, backend, API, styling, etc.)
- Assign the right model per agent complexity:
  - "claude-sonnet-4-6" → complex tasks (fullstack dev, architecture, API design, business logic)
  - "claude-haiku-4-5" → simpler tasks (formatting, docs, basic config, tests, CSS-only)
- ALWAYS use provider "anthropic"
- Dependencies: use [] if the agent can work in parallel, or specify other agent ids for sequential work
- Each agent MUST have a detailed systemPrompt in French explaining its exact role and responsibilities

EXAMPLES:

For a portfolio website:
[
  {"id": "frontend_dev", "role": "Frontend Developer", "emoji": "🎨", "description": "React components + animations + responsive design", "systemPrompt": "Tu es un expert React/TypeScript. Tu crées tous les composants, pages et animations. Tu utilises Framer Motion pour les animations fluides. Tu assures le responsive design et l'accessibilité.", "provider": "anthropic", "model": "claude-sonnet-4-6", "dependencies": []},
  {"id": "styling_dev", "role": "UI Designer", "emoji": "🎭", "description": "CSS design system + Tailwind config + visual polish", "systemPrompt": "Tu es un expert en design UI/UX. Tu crées le design system complet: couleurs, typographie, spacing, composants Tailwind, dark mode. Tu assures une identité visuelle cohérente et premium.", "provider": "anthropic", "model": "claude-haiku-4-5", "dependencies": ["frontend_dev"]}
]

For a fullstack app with DB:
[
  {"id": "backend_api", "role": "Backend Developer", "emoji": "⚙️", "description": "API REST + DB schema + authentification", "systemPrompt": "Tu es un expert backend Node.js/Express. Tu crées l'API REST, le schéma de base de données, les migrations, et l'authentification JWT.", "provider": "anthropic", "model": "claude-sonnet-4-6", "dependencies": []},
  {"id": "frontend_app", "role": "Frontend Developer", "emoji": "🎨", "description": "Interface React + routing + state management", "systemPrompt": "Tu es un expert frontend React/TypeScript. Tu crées l'interface utilisateur complète avec routing, state management, et intégration API.", "provider": "anthropic", "model": "claude-sonnet-4-6", "dependencies": []},
  {"id": "integration", "role": "Integration Engineer", "emoji": "🔗", "description": "Connexion frontend-backend + Docker config", "systemPrompt": "Tu es un intégrateur. Tu connectes le frontend au backend, configures les variables d'environnement, et assures que tout fonctionne ensemble en Docker.", "provider": "anthropic", "model": "claude-haiku-4-5", "dependencies": ["backend_api", "frontend_app"]}
]

Output ONLY a valid JSON array. No text before or after. No markdown code blocks.`;

                let dynamicTopology: import("./types.js").NodeTopology[] = [];
                try {
                    const plannerResult = await runClaudeAgent({
                        model: userModel,
                        prompt: plannerPrompt,
                        systemPrompt: "You are the VEIST Planner. Output ONLY a valid JSON array of agent objects. No text, no markdown, no explanation. Just the JSON array.",
                        cwd: p.workspace,
                        allowedTools: [],
                        maxTurns: 1,
                        abortSignal: abortController.signal
                    });
                    
                    let out = plannerResult.finalResult?.trim() || "[]";
                    // Strip markdown code fences
                    out = out.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
                    // Try to extract JSON array from mixed text output
                    if (!out.startsWith("[")) {
                        const jsonMatch = out.match(/(\[\s*\{[\s\S]*\}\s*\])/);  
                        if (jsonMatch) {
                            out = jsonMatch[1];
                        }
                    }
                    dynamicTopology = JSON.parse(out);
                    addTokenUsage(this.pipelines, id, plannerResult);
                } catch (err: any) {
                    console.error("[Planner] Failed to parse dynamic topology:", err);
                    dynamicTopology = [{
                        id: "development",
                        role: "Developer",
                        emoji: "💻",
                        description: "Fullstack Development",
                        systemPrompt: "Tu es un Développeur Senior. Implémente le plan de l'Architecte.",
                        provider: "anthropic",
                        model: userModel,
                        dependencies: []
                    }];
                }

                const baseTopology: import("./types.js").NodeTopology[] = [
                    { id: "research", role: "Researcher", emoji: "🌐", description: "Veille technologique", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: [] },
                    { id: "analysis", role: "Analyst", emoji: "🔎", description: "Analyse des besoins", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["research"] },
                    { id: "skills_enrichment", role: "Tech Lead", emoji: "📚", description: "Injection de best practices", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["analysis"] },
                    { id: "architecture", role: "Architect", emoji: "🏗️", description: "Conception architecturale", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["skills_enrichment"] },
                    { id: "scaffold", role: "DevOps", emoji: "🔨", description: "Génération de la base", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["architecture"] },
                    { id: "supervisor_for_scaffold", role: "Supervisor", emoji: "👁️", description: "Validation Scaffold", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["scaffold"] },
                ];

                // Dynamic agents: keep Planner's model choice, fallback to userModel
                dynamicNodes = dynamicTopology.map(t => ({
                    ...t,
                    provider: t.provider || "anthropic",
                    model: t.model || userModel,
                    dependencies: t.dependencies.length > 0 ? t.dependencies : ["supervisor_for_scaffold"]
                }));

                dynamicIds = dynamicNodes.map(d => d.id);
                const endTopology: import("./types.js").NodeTopology[] = [
                    { id: "qa", role: "QA Engineer", emoji: "🧪", description: "Tests finaux", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: dynamicIds },
                    { id: "deploy", role: "Release Manager", emoji: "🚀", description: "Déploiement", systemPrompt: "", provider: "anthropic", model: userModel, dependencies: ["qa"] }
                ];

                p.topology = [...baseTopology, ...dynamicNodes, ...endTopology];
                
                // Sync traditional agents array for UI backward compatibility
                p.agents = p.topology.map(t => ({
                    role: t.role,
                    emoji: t.emoji,
                    status: "waiting",
                }));
            } // end of fresh-run else block
            await savePipelinesState(this.pipelines);

            const manager = new GraphManager(context);

            manager.on("node-start", (node: any) => {
                const phaseMap: Record<string, import("./types.js").PipelinePhase> = {
                    "research": "ANALYSIS",
                    "analysis": "ANALYSIS",
                    "skills_enrichment": "ANALYSIS",
                    "architecture": "ARCHITECTURE",
                    "scaffold": "SCAFFOLD",
                    "qa": "QA",
                    "deploy": "DEPLOYING"
                };
                if (phaseMap[node.id]) {
                    setPipelinePhase(this, this.pipelines, id, phaseMap[node.id]);
                } else if (dynamicIds.includes(node.id)) {
                    setPipelinePhase(this, this.pipelines, id, "DEVELOPMENT");
                }
            });

            manager.on("node-complete", ({ node }: { node: any }) => {
                // Save node status for smart resume
                if (!p.nodeStatuses) p.nodeStatuses = {};
                p.nodeStatuses[node.id] = "COMPLETED";
                // Let's just do a simple linear progression calculation
                const totalNodes = p.topology!.length;
                const completedNodes = Array.from((manager as any).nodes.values()).filter((n: any) => n.status === "COMPLETED" || n.status === "SKIPPED").length;
                p.progress = Math.floor((completedNodes / totalNodes) * 100);
                savePipelinesState(this.pipelines).catch(() => {});
            });

            // Add all base nodes — pass model/provider from topology for multi-model routing
            const topo = (nodeId: string) => p.topology?.find(t => t.id === nodeId);
            manager.addNode(new ResearchNode(topo("research")?.model, topo("research")?.provider));
            manager.addNode(new AnalysisNode(topo("analysis")?.model, topo("analysis")?.provider));
            manager.addNode(new SkillsEnrichmentNode());
            manager.addNode(new ArchitectureNode(topo("architecture")?.model, topo("architecture")?.provider));
            manager.addNode(new ScaffoldNode(topo("scaffold")?.model, topo("scaffold")?.provider));
            manager.addNode(new SupervisorNode("scaffold", ["scaffold"], topo("supervisor_for_scaffold")?.model, topo("supervisor_for_scaffold")?.provider));
            
            // Add dynamic agents
            const { DynamicAgentNode } = await import("./dag/nodes/DynamicAgentNode.js");
            for (const dn of dynamicNodes) {
                manager.addNode(new DynamicAgentNode(dn));
            }

            // End nodes
            manager.addNode(new QANode(dynamicIds, topo("qa")?.model, topo("qa")?.provider)); 
            manager.addNode(new DeployNode(topo("deploy")?.model, topo("deploy")?.provider));

            // ─── Smart Resume: skip already-completed nodes ───
            if (p.nodeStatuses) {
                for (const [nodeId, status] of Object.entries(p.nodeStatuses)) {
                    if (status === "COMPLETED") {
                        manager.markCompleted(nodeId);
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⏭️", `Skip: ${nodeId} (déjà complété)`, "info");
                    }
                }
            }

            // ─── Inject Secrets into .env (never passed to AI) ───
            // Vault secrets OVERWRITE existing keys (fixes placeholder bug)
            try {
                const secretsSvc = getSecretsService();
                const envContent = secretsSvc.toEnvString(id);
                if (envContent) {
                    const envPath = path.join(p.workspace, ".env");
                    const hasExisting = await fs.access(envPath).then(() => true).catch(() => false);
                    if (hasExisting) {
                        const existing = await fs.readFile(envPath, "utf-8");
                        const vaultKeys = new Map<string, string>();
                        for (const line of envContent.split("\n").filter(Boolean)) {
                            const eqIdx = line.indexOf("=");
                            if (eqIdx > 0) vaultKeys.set(line.slice(0, eqIdx), line.slice(eqIdx + 1));
                        }
                        // Replace existing keys with vault values, keep non-vault keys
                        const updatedLines = existing.split("\n").map(line => {
                            const eqIdx = line.indexOf("=");
                            if (eqIdx > 0) {
                                const key = line.slice(0, eqIdx);
                                if (vaultKeys.has(key)) {
                                    const val = vaultKeys.get(key)!;
                                    vaultKeys.delete(key);
                                    return `${key}=${val}`;
                                }
                            }
                            return line;
                        });
                        // Append any vault keys not already in file
                        for (const [key, val] of vaultKeys) {
                            updatedLines.push(`${key}=${val}`);
                        }
                        await fs.writeFile(envPath, updatedLines.join("\n"));
                    } else {
                        await fs.writeFile(envPath, "# ─── Injected by Secrets Vault ───\n" + envContent);
                    }
                    const keyCount = envContent.split("\n").filter(Boolean).length;
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔐", `${keyCount} secret(s) injecté(s) dans .env`, "info");
                }
            } catch (secretsErr: any) {
                console.error("[Orchestrator] Failed to inject secrets:", secretsErr);
            }

            await manager.executeAll();

            // ─── Generate Professional README ───
            try {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "📝", "Génération du README professionnel...", "info");
                
                const analysis = p.artifacts.analysis || {};
                const architecture = p.artifacts.architecture || {};
                const topology = p.topology || [];
                
                const readmeResult = await runClaudeAgent({
                    model: p.model,
                    prompt: `Generate a professional, comprehensive README.md for this project.

PROJECT NAME: ${p.name}
DESCRIPTION: ${p.description}

ANALYSIS (tech stack, features):
${JSON.stringify(analysis, null, 2)}

ARCHITECTURE:
${JSON.stringify(architecture, null, 2)}

PIPELINE AGENTS USED: ${topology.map((t: any) => `${t.emoji} ${t.role}`).join(', ')}

Write the README in English (or match the project language if description is in French).
Include these sections:
1. **Project Title** with a short tagline
2. **Overview** — What the project does, in 2-3 sentences
3. **Features** — Bullet list of key features
4. **Tech Stack** — Frontend, Backend, Database, etc. with version info
5. **Getting Started** — Prerequisites, installation, environment variables (.env.example), and how to run locally
6. **Project Structure** — Tree of important directories/files
7. **Architecture** — High-level architecture overview
8. **Deployment** — Docker deployment steps (docker-compose.prod.yml + Traefik)
9. **Environment Variables** — Table of required env vars
10. **License** — MIT

Use proper markdown formatting with emojis for section headers.
Make it look PROFESSIONAL — like a real open-source project README.
Do NOT include any chat context, conversation logs, or pre-pipeline discussion.
Output ONLY the raw markdown content of the README, nothing else.`,
                    systemPrompt: "You are a technical documentation expert. Generate only the README.md content. No code blocks wrapping the output, no explanations — just the raw markdown.",
                    cwd: p.workspace,
                    allowedTools: ["list_dir", "read_file"],
                    maxTurns: 5,
                    timeoutMs: 3 * 60 * 1000,
                    abortSignal: abortController.signal,
                });

                addTokenUsage(this.pipelines, id, readmeResult);

                if (readmeResult.success && readmeResult.finalResult) {
                    let readmeContent = readmeResult.finalResult.trim();
                    // Strip markdown code fences if the model wrapped it
                    if (readmeContent.startsWith("```")) {
                        readmeContent = readmeContent.replace(/^```(?:markdown|md)?\n?/, "").replace(/\n?```$/, "").trim();
                    }
                    const readmePath = path.join(p.workspace, "README.md");
                    await fs.writeFile(readmePath, readmeContent, "utf-8");
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "📝", "README.md professionnel généré ✓", "success");
                } else {
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", "README generation skipped (agent error)", "warning");
                }
            } catch (readmeErr: any) {
                addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `README generation failed: ${readmeErr.message}`, "warning");
                // Non-fatal — continue with push
            }

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
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", "Déploiement du container projet...", "info");

                    const { execSync } = await import("node:child_process");
                    const slug = slugify(p.name);
                    const projectName = `veist-${slug}`;
                    const hostDomain = `${id}.hach.dev`;

                    // Ensure 'web' network exists (for Traefik)
                    try { execSync(`docker network create web`, { stdio: "pipe" }); } catch { /* already exists */ }

                    // ─── Multi-Container Path: use docker-compose.prod.yml if it exists ───
                    const composeProdPath = path.join(p.workspace, "docker-compose.prod.yml");
                    const composeDevPath = path.join(p.workspace, "docker-compose.yml");
                    const hasComposeProd = await fs.access(composeProdPath).then(() => true).catch(() => false);

                    if (hasComposeProd) {
                        console.log(`[Deploy] Found docker-compose.prod.yml — using multi-container deploy`);
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", "Mode multi-container détecté (docker-compose.prod.yml)", "info");

                        // Read and fix compose: ensure web network is external
                        let composeContent = await fs.readFile(composeProdPath, "utf-8");
                        
                        // Ensure it has the external web network
                        if (!composeContent.includes("external: true") && !composeContent.includes("external:true")) {
                            if (composeContent.includes("networks:")) {
                                // Already has networks, ensure web is external
                                composeContent = composeContent.replace(
                                    /networks:\s*\n(\s+web:\s*\n)/,
                                    'networks:\n$1    external: true\n'
                                );
                            } else {
                                composeContent += '\n\nnetworks:\n  web:\n    external: true\n';
                            }
                            await fs.writeFile(composeProdPath, composeContent, "utf-8");
                        }

                        // Stop old deployment if exists
                        try {
                            execSync(`docker compose -p ${projectName} -f ${composeProdPath} down --remove-orphans`, {
                                cwd: p.workspace, stdio: "pipe", timeout: 30000
                            });
                        } catch { /* didn't exist */ }

                        // Build all images defined in the compose
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🔨", "Build des images multi-container...", "info");
                        try {
                            execSync(`docker compose -p ${projectName} -f ${composeProdPath} build --no-cache`, {
                                cwd: p.workspace, stdio: "pipe", timeout: 600000 // 10 minutes for multi-container builds
                            });
                        } catch (buildErr: any) {
                            const buildStdErr = buildErr.stderr?.toString()?.slice(-500) || buildErr.message;
                            console.error(`[Deploy] Multi-container build error: ${buildStdErr}`);
                            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Build multi-container échoué: ${buildStdErr}`, "warning");
                            throw buildErr;
                        }

                        // Deploy all containers
                        execSync(`docker compose -p ${projectName} -f ${composeProdPath} up -d`, {
                            cwd: p.workspace,
                            timeout: 60000,
                            stdio: "pipe",
                        });

                        // Count running services
                        try {
                            const psOutput = execSync(`docker compose -p ${projectName} ps --format json`, {
                                cwd: p.workspace, stdio: "pipe", timeout: 10000
                            }).toString();
                            const runningServices = psOutput.split('\n').filter(Boolean).length;
                            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", `${runningServices} container(s) déployé(s) ! URL: https://${hostDomain}`, "success");
                        } catch {
                            addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", `Multi-container déployé ! URL: https://${hostDomain}`, "success");
                        }

                        p.artifacts.deployed = true;
                        p.artifacts.deployedUrl = `https://${hostDomain}`;
                    } else {
                    // ─── Single-Container Path (legacy) ───
                    const imageName = `veist-${slug}:latest`;
                    const containerName = `${projectName}-app`;
                    let dockerfilePath = "";
                    let buildContext = p.workspace;

                    // 1) Check root Dockerfile (and Dockerfile.prod) — always takes priority
                    const rootDockerfile = path.join(p.workspace, "Dockerfile");
                    const rootDockerfileProd = path.join(p.workspace, "Dockerfile.prod");
                    if (await fs.access(rootDockerfile).then(() => true).catch(() => false)) {
                        dockerfilePath = rootDockerfile;
                        buildContext = p.workspace;
                        console.log(`[Deploy] Found Dockerfile at root`);
                    } else if (await fs.access(rootDockerfileProd).then(() => true).catch(() => false)) {
                        dockerfilePath = rootDockerfileProd;
                        buildContext = p.workspace;
                        console.log(`[Deploy] Found Dockerfile.prod at root`);
                    } else {
                        // 2) Detect monorepo BEFORE scanning subdirs — a monorepo with only
                        //    partial Dockerfiles (e.g. backend/Dockerfile) would deploy incorrectly
                        const hasFrontendDir = await fs.access(path.join(p.workspace, "frontend")).then(() => true).catch(() => false);
                        const hasBackendDir = await fs.access(path.join(p.workspace, "backend")).then(() => true).catch(() => false);

                        if (hasFrontendDir && hasBackendDir) {
                            // Check for docker-compose.prod.yml first (ideal monorepo setup)
                            const composeProd = path.join(p.workspace, "docker-compose.prod.yml");
                            if (await fs.access(composeProd).then(() => true).catch(() => false)) {
                                console.log(`[Deploy] Monorepo detected with docker-compose.prod.yml — skipping to combined Dockerfile generation (single-container deploy)`);
                            }
                            // For single-container deploy: generate a combined root Dockerfile
                            // This ensures both frontend AND backend are served together
                            console.log(`[Deploy] Monorepo detected (frontend+backend), generating combined root Dockerfile`);
                            // dockerfilePath stays empty → will be handled by the fallback generation below
                        } else {
                            // 3) Not a monorepo: scan subdirectories for a Dockerfile or Dockerfile.prod
                            const entries = await fs.readdir(p.workspace, { withFileTypes: true });
                            for (const entry of entries) {
                                if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
                                    const subDockerfile = path.join(p.workspace, entry.name, "Dockerfile");
                                    const subDockerfileProd = path.join(p.workspace, entry.name, "Dockerfile.prod");
                                    if (await fs.access(subDockerfile).then(() => true).catch(() => false)) {
                                        dockerfilePath = subDockerfile;
                                        buildContext = path.join(p.workspace, entry.name);
                                        console.log(`[Deploy] Found Dockerfile in ${entry.name}/, context: ${buildContext}`);
                                        break;
                                    } else if (await fs.access(subDockerfileProd).then(() => true).catch(() => false)) {
                                        dockerfilePath = subDockerfileProd;
                                        buildContext = path.join(p.workspace, entry.name);
                                        console.log(`[Deploy] Found Dockerfile.prod in ${entry.name}/, context: ${buildContext}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (!dockerfilePath) {
                        console.log(`[Deploy] No Dockerfile found, creating auto-detected Dockerfile`);
                        dockerfilePath = path.join(p.workspace, "Dockerfile");

                        // Detect project type: monorepo (frontend/ + backend/) or flat SPA/API
                        const hasFrontend = await fs.access(path.join(p.workspace, "frontend")).then(() => true).catch(() => false);
                        const hasBackend = await fs.access(path.join(p.workspace, "backend")).then(() => true).catch(() => false);
                        const hasSrc = await fs.access(path.join(p.workspace, "src")).then(() => true).catch(() => false);
                        const hasRootPkg = await fs.access(path.join(p.workspace, "package.json")).then(() => true).catch(() => false);

                        let defaultDockerfile: string;

                        if (hasFrontend && hasBackend) {
                            // Monorepo: frontend (SPA) + backend (Node.js)
                            console.log(`[Deploy] Detected monorepo (frontend+backend), generating multi-service Dockerfile`);
                            defaultDockerfile = `# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
RUN npm run build 2>/dev/null || true

# Stage 3: Production (serve frontend via nginx + run backend)
FROM node:20-alpine
WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx
RUN mkdir -p /run/nginx /usr/share/nginx/html

# Copy built frontend to nginx
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /app/backend ./backend
RUN cd backend && npm install --only=production 2>/dev/null || true

# nginx config (proxy /api to backend on 3001)
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location /api { proxy_pass http://localhost:3001; } location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/http.d/default.conf

# Start script
RUN printf '#!/bin/sh\\nnginx &\\ncd /app/backend && node dist/index.js 2>/dev/null || node src/index.js\\n' > /start.sh && chmod +x /start.sh

EXPOSE 80 3001
CMD ["/start.sh"]`;
                        } else if (hasRootPkg && !hasSrc) {
                            // Flat SPA with npm build, output in dist/
                            defaultDockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;
                        } else {
                            // Node.js backend style
                            defaultDockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build 2>/dev/null || true

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm install --only=production
EXPOSE 3000
CMD ["node", "dist/index.js"]`;
                        }

                        await fs.writeFile(dockerfilePath, defaultDockerfile, "utf-8");
                    }

                    // Ensure .env exists for build args
                    const envPath = path.join(buildContext, ".env");
                    const envExamplePath = path.join(buildContext, ".env.example");
                    const hasEnv = await fs.access(envPath).then(() => true).catch(() => false);
                    if (!hasEnv) {
                        // Also check root .env
                        const rootEnvPath = path.join(p.workspace, ".env");
                        const hasRootEnv = await fs.access(rootEnvPath).then(() => true).catch(() => false);
                        if (hasRootEnv && buildContext !== p.workspace) {
                            await fs.copyFile(rootEnvPath, envPath);
                        } else {
                            const hasEnvExample = await fs.access(envExamplePath).then(() => true).catch(() => false);
                            if (hasEnvExample) {
                                await fs.copyFile(envExamplePath, envPath);
                            } else {
                                await fs.writeFile(envPath, "# Auto-generated\nVITE_API_KEY=placeholder\n");
                            }
                        }
                    }

                    // Build the image (legacy builder — VPS lacks buildx)
                    try {
                        const buildCmd = `docker build -f ${dockerfilePath} -t ${imageName} ${buildContext}`;
                        console.log(`[Deploy] Build cmd: ${buildCmd}`);
                        execSync(buildCmd, {
                            cwd: p.workspace,
                            timeout: 10 * 60 * 1000, // 10 min for heavy builds
                            stdio: "pipe",
                        });
                    } catch (buildErr: any) {
                        const stderr = buildErr.stderr ? buildErr.stderr.toString().slice(-500) : buildErr.message;
                        console.error(`[Deploy] ❌ Build failed: ${stderr}`);
                        addPipelineEvent(this, this.pipelines, id, "Orchestrator", "⚠️", `Build image échoué: ${stderr}`, "warning");
                        throw buildErr;
                    }

                    console.log(`[Deploy] Image built. Deploying container ${containerName}`);

                    // Generate a deterministic compose file with Traefik labels
                    // so it appears as a "project" in Hostinger Docker Manager
                    const deployComposeContent = [
                        'version: "3.8"',
                        '',
                        'services:',
                        '  app:',
                        `    image: ${imageName}`,
                        `    container_name: ${containerName}`,
                        '    restart: unless-stopped',
                        '    networks:',
                        '      - web',
                        '    labels:',
                        '      - "traefik.enable=true"',
                        `      - "traefik.http.routers.${projectName}.rule=Host(\`${hostDomain}\`)"`,
                        `      - "traefik.http.routers.${projectName}.entrypoints=websecure"`,
                        `      - "traefik.http.routers.${projectName}.tls.certresolver=letsencrypt"`,
                        `      - "traefik.http.services.${projectName}.loadbalancer.server.port=80"`,
                        '',
                        'networks:',
                        '  web:',
                        '    external: true',
                    ].join('\n');
                    const deployComposePath = path.join(p.workspace, "docker-compose.deploy.yml");
                    await fs.writeFile(deployComposePath, deployComposeContent, "utf-8");
                    console.log(`[Deploy] Generated ${deployComposePath}`);

                    // Stop old deployment if exists
                    try {
                        execSync(`docker compose -p ${projectName} -f ${deployComposePath} down`, {
                            cwd: p.workspace, stdio: "pipe", timeout: 30000
                        });
                    } catch { /* didn't exist */ }

                    // Deploy using docker compose (creates a "project" visible in Hostinger)
                    execSync(`docker compose -p ${projectName} -f ${deployComposePath} up -d`, {
                        cwd: p.workspace,
                        timeout: 60 * 1000, // 60s for container startup
                        stdio: "pipe",
                    });

                    p.artifacts.deployed = true;
                    p.artifacts.deployedUrl = `https://${hostDomain}`;
                    addPipelineEvent(this, this.pipelines, id, "Orchestrator", "🐳", `Container déployé! Accessible sur ${p.artifacts.deployedUrl}`, "success");
                    } // end else (single-container path)
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
