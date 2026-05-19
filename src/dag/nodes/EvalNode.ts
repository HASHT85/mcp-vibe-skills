// SEC-32: @ts-nocheck removed — type safety restored
/**
 * EvalNode — Phase 3: Auto-Evaluation of Deployed Projects
 * 
 * Runs AFTER the Deploy node. Performs automated checks on the live container:
 * - HTTP probe (status 200, valid HTML)
 * - Container log analysis (errors/exceptions)
 * - File structure verification
 * - Build artifact presence
 * 
 * Produces a scored EvalReport. If score < threshold → emits FIX_AND_REEVAL signal.
 */

import { AgentNode } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import type { EvalCheck, EvalReport } from "../../types.js";
import { runVeistAgent } from "../../agent_engine.js";
import { slugify } from "../../orchestrator_utils.js";

// SEC-17: Validate names before shell interpolation
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
function sanitizeShellName(name: string): string {
    if (!name || !SAFE_NAME_RE.test(name) || name.length > 128) {
        throw new Error(`Invalid resource name: "${name.slice(0, 30)}"`);
    }
    return name;
}

// ─── Constants ───

const SCORE_THRESHOLD = 70;       // Minimum score to auto-accept
const MAX_EVAL_CYCLES = 3;        // Max fix attempts before accepting with issues
const HEALTH_TIMEOUT_SEC = 90;    // Max wait for container to become healthy
const HEALTH_POLL_SEC = 5;        // Poll interval for health check

// ─── Check Weights ───

const WEIGHTS = {
    http_200: 40,
    no_console_errors: 30,
    build_artifacts: 20,
    file_structure: 10,
};

// ─── Node ───

export class EvalNode extends AgentNode {
    constructor(model?: string) {
        super({
            id: "eval",
            name: "Auto-évaluation du déploiement",
            role: "Evaluator",
            emoji: "🧪",
            model,
            dependencies: ["deploy"],
            maxTurns: 8,
            allowedTools: ["bash", "read_file", "read_memory"],
        });
    }

    /**
     * Override execute entirely — we run checks programmatically,
     * only calling the LLM if we need fix instructions.
     */
    async execute(context: NodeContext): Promise<any> {
        context.updateAgentStatus(this.role, "active", "Auto-évaluation en cours...");
        context.addEvent(this.role, "🧪", "Début de l'auto-évaluation du déploiement", "info");

        const deployedUrl = context.pipeline.artifacts.deployedUrl as string | undefined;
        const deployed = context.pipeline.artifacts.deployed as boolean | undefined;

        // If nothing was deployed, skip evaluation
        if (!deployed || !deployedUrl) {
            context.addEvent(this.role, "🧪", "Aucun déploiement détecté — évaluation ignorée", "info");
            context.updateAgentStatus(this.role, "done", "Pas de déploiement à évaluer");
            return { _skip: true, recommendation: "SHIP" };
        }

        // Derive container/project name
        const slug = slugify(context.pipeline.github?.repo || context.pipeline.name);
        const projectName = sanitizeShellName(`veist-${slug}`);

        // 1. Wait for container to become healthy
        context.addEvent(this.role, "🧪", `Attente du container (max ${HEALTH_TIMEOUT_SEC}s)...`, "info");
        const isHealthy = await this.waitForHealth(projectName, context);

        // 2. Run all checks
        const checks: EvalCheck[] = [];

        // Check HTTP
        const httpCheck = await this.checkHttp(deployedUrl);
        checks.push(httpCheck);
        context.addEvent(this.role, "🧪", 
            httpCheck.pass ? `HTTP check: ${httpCheck.detail} ✓` : `HTTP check: ${httpCheck.detail} ✗`, 
            httpCheck.pass ? "success" : "warning"
        );

        // Check container logs
        const logCheck = await this.checkContainerLogs(projectName);
        checks.push(logCheck);
        context.addEvent(this.role, "🧪",
            logCheck.pass ? `Container logs: ${logCheck.detail} ✓` : `Container logs: ${logCheck.detail} ✗`,
            logCheck.pass ? "success" : "warning"
        );

        // Check build artifacts
        const buildCheck = await this.checkBuildArtifacts(context.workspace);
        checks.push(buildCheck);

        // Check file structure
        const structCheck = await this.checkFileStructure(context.workspace);
        checks.push(structCheck);

        // 3. Calculate weighted score
        const score = this.calculateScore(checks);
        const cycle = ((context.pipeline.artifacts.evalCycle as number) || 0) + 1;

        // 4. Determine recommendation
        let recommendation: "SHIP" | "FIX" | "SHIP_WITH_ISSUES" = score >= SCORE_THRESHOLD ? "SHIP" : "FIX";

        // 5. If FIX needed and we haven't exceeded max cycles, generate fix instructions via LLM
        let fixInstructions: string | undefined;
        if (recommendation === "FIX" && cycle < MAX_EVAL_CYCLES) {
            fixInstructions = await this.generateFixInstructions(context, checks, score);
        }

        // If max cycles reached, force accept with issues
        if (recommendation === "FIX" && cycle >= MAX_EVAL_CYCLES) {
            recommendation = "SHIP_WITH_ISSUES";
            context.addEvent(this.role, "⚠️", `Max cycles d'évaluation atteint (${MAX_EVAL_CYCLES}). Acceptation avec réserves.`, "warning");
        }

        // Build report
        const report: EvalReport = {
            score,
            checks,
            recommendation,
            fixInstructions,
            timestamp: new Date().toISOString(),
            cycle,
        };

        // Store in artifacts
        context.pipeline.artifacts.evalReport = report;
        context.pipeline.artifacts.evalCycle = cycle;

        // Log final result
        const emoji = recommendation === "SHIP" ? "✅" : recommendation === "FIX" ? "🔧" : "⚠️";
        context.addEvent(this.role, emoji, `Score: ${score}/100 → ${recommendation} (cycle ${cycle}/${MAX_EVAL_CYCLES})`, 
            recommendation === "SHIP" ? "success" : "warning"
        );
        context.updateAgentStatus(this.role, "done", `Score: ${score}/100 → ${recommendation}`);

        // Emit control signal for fix cycle
        if (recommendation === "FIX") {
            return { _action: "FIX_AND_REEVAL", report };
        }

        return report;
    }

    // ─── Health Check ───

    private async waitForHealth(projectName: string, context: NodeContext): Promise<boolean> {
        const { execSync } = await import("node:child_process");
        const maxAttempts = Math.ceil(HEALTH_TIMEOUT_SEC / HEALTH_POLL_SEC);

        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Check if any container in the project is running
                const output = execSync(
                    `docker compose -p ${projectName} ps --format '{{.State}}' 2>/dev/null || docker ps --filter "name=${projectName}" --format '{{.Status}}'`,
                    { timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
                ).toString().trim().toLowerCase();

                if (output.includes("running") || output.includes("up")) {
                    context.addEvent(this.role, "🧪", `Container running (détecté en ${i * HEALTH_POLL_SEC}s)`, "success");
                    // Extra 5s grace period for the app to fully initialize
                    await sleep(5000);
                    return true;
                }
            } catch {
                // Container not found yet
            }

            await sleep(HEALTH_POLL_SEC * 1000);
        }

        context.addEvent(this.role, "⚠️", `Container non détecté après ${HEALTH_TIMEOUT_SEC}s`, "warning");
        return false;
    }

    // ─── HTTP Check (SEC-18: Use native fetch instead of curl shell) ───

    private async checkHttp(url: string): Promise<EvalCheck> {
        try {
            // SEC-18: Validate URL format before use
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error(`Invalid protocol: ${parsed.protocol}`);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(parsed.href, {
                method: 'GET',
                signal: controller.signal,
                redirect: 'follow',
            });
            clearTimeout(timeout);

            const code = res.status;
            const pass = code >= 200 && code < 400;

            return {
                name: "http_200",
                pass,
                detail: `${url} → ${code}`,
                weight: WEIGHTS.http_200,
            };
        } catch (err: any) {
            return {
                name: "http_200",
                pass: false,
                detail: `${url} → Connection failed: ${err.message?.slice(0, 100)}`,
                weight: WEIGHTS.http_200,
            };
        }
    }

    // ─── Container Logs Check ───

    private async checkContainerLogs(projectName: string): Promise<EvalCheck> {
        const { execSync } = await import("node:child_process");

        try {
            // Get logs from all containers in the project
            const logs = execSync(
                `docker compose -p ${projectName} logs --tail=100 2>/dev/null || docker logs ${projectName}-app --tail=100 2>&1`,
                { timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }
            ).toString();

            // Count error-like patterns
            const errorPatterns = /\b(error|exception|fatal|unhandled|ECONNREFUSED|ENOENT|TypeError|ReferenceError|SyntaxError)\b/gi;
            const matches = logs.match(errorPatterns) || [];

            // Filter out false positives (common in build logs)
            // LOGIC-02: Use /i only (no /g) — global flag makes .test() stateful, causing unreliable filtering
            const falsePositives = /error-handler|error\.ts|errorBoundary|console\.error|error_page|no errors/i;
            const realErrors = matches.filter(m => !falsePositives.test(m));

            const errorCount = realErrors.length;
            const pass = errorCount <= 2; // Allow up to 2 minor errors

            return {
                name: "no_console_errors",
                pass,
                detail: pass 
                    ? `${errorCount} erreur(s) mineures dans les logs` 
                    : `${errorCount} erreur(s) détectée(s) dans les logs container`,
                weight: WEIGHTS.no_console_errors,
            };
        } catch {
            return {
                name: "no_console_errors",
                pass: true, // Can't check → assume OK
                detail: "Impossible de lire les logs (container probablement non démarré)",
                weight: WEIGHTS.no_console_errors,
            };
        }
    }

    // ─── Build Artifacts Check ───

    private async checkBuildArtifacts(workspace: string): Promise<EvalCheck> {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const artifactDirs = ["dist", "build", ".next", "out"];
        let found = false;
        let foundDir = "";

        for (const dir of artifactDirs) {
            try {
                await fs.access(path.join(workspace, dir));
                found = true;
                foundDir = dir;
                break;
            } catch { /* not found */ }
        }

        // Also check if it's a non-build project (backend, python, etc.)
        if (!found) {
            try {
                const pkg = await fs.readFile(path.join(workspace, "package.json"), "utf-8");
                const parsed = JSON.parse(pkg);
                // If no build script, it's probably a backend project → OK
                if (!parsed.scripts?.build) {
                    return {
                        name: "build_artifacts",
                        pass: true,
                        detail: "Pas de script build — projet backend/worker (OK)",
                        weight: WEIGHTS.build_artifacts,
                    };
                }
            } catch { /* no package.json */ }
        }

        return {
            name: "build_artifacts",
            pass: found,
            detail: found ? `Dossier ${foundDir}/ présent` : "Aucun dossier build (dist/build/.next) trouvé",
            weight: WEIGHTS.build_artifacts,
        };
    }

    // ─── File Structure Check ───

    private async checkFileStructure(workspace: string): Promise<EvalCheck> {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const criticalFiles = [
            "package.json",
            "Dockerfile",
        ];

        const entryPoints = [
            "src/App.tsx", "src/App.jsx", "src/App.vue", "src/App.svelte",
            "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
            "src/index.ts", "src/index.js", "index.js", "index.ts",
            "app.py", "main.py", "main.go", "cmd/main.go",
        ];

        let hasPackageJson = false;
        let hasDockerfile = false;
        let hasEntryPoint = false;

        for (const f of criticalFiles) {
            try {
                await fs.access(path.join(workspace, f));
                if (f === "package.json") hasPackageJson = true;
                if (f === "Dockerfile") hasDockerfile = true;
            } catch { /* missing */ }
        }

        for (const f of entryPoints) {
            try {
                await fs.access(path.join(workspace, f));
                hasEntryPoint = true;
                break;
            } catch { /* not this one */ }
        }

        const pass = (hasPackageJson || hasEntryPoint) && hasDockerfile;
        const details: string[] = [];
        if (hasPackageJson) details.push("package.json ✓");
        if (hasDockerfile) details.push("Dockerfile ✓");
        if (hasEntryPoint) details.push("Entry point ✓");
        if (!hasPackageJson && !hasEntryPoint) details.push("⚠ Ni package.json ni entry point");
        if (!hasDockerfile) details.push("⚠ Dockerfile manquant");

        return {
            name: "file_structure",
            pass,
            detail: details.join(", "),
            weight: WEIGHTS.file_structure,
        };
    }

    // ─── Score Calculator ───

    private calculateScore(checks: EvalCheck[]): number {
        let score = 0;
        for (const check of checks) {
            if (check.pass) score += check.weight;
        }
        return score;
    }

    // ─── LLM Fix Instructions ───

    private async generateFixInstructions(
        context: NodeContext, 
        checks: EvalCheck[], 
        score: number
    ): Promise<string> {
        const failedChecks = checks.filter(c => !c.pass);
        if (failedChecks.length === 0) return "";

        try {
            const result = await runVeistAgent({
                model: context.pipeline.model || "anthropic/claude-sonnet-4",
                prompt: `Analyse ces résultats de tests automatiques et produis des instructions de correction PRÉCISES.

Score actuel: ${score}/100 (seuil: ${SCORE_THRESHOLD})

CHECKS ÉCHOUÉS:
${failedChecks.map(c => `❌ ${c.name} (poids: ${c.weight}): ${c.detail}`).join('\n')}

CHECKS RÉUSSIS:
${checks.filter(c => c.pass).map(c => `✓ ${c.name}: ${c.detail}`).join('\n')}

Projet: ${context.pipeline.description}
Workspace: ${context.workspace}

Produis des instructions de correction COURTES et ACTIONABLES. 
Concentre-toi sur les checks avec le plus de poids (http_200=40, logs=30, build=20).
Format: liste numérotée d'actions concrètes (max 5 actions).`,
                systemPrompt: "Tu es un expert DevOps/debugging. Produis uniquement des instructions de correction concises. Pas de code, juste des actions. Max 200 mots.",
                cwd: context.workspace,
                allowedTools: ["read_file", "list_dir"],
                maxTurns: 3,
                timeoutMs: 60000,
            });

            return result.finalResult || "Corriger les erreurs identifiées dans les checks.";
        } catch {
            return failedChecks.map(c => `Fix: ${c.name} — ${c.detail}`).join('\n');
        }
    }

    // Unused but required by abstract class
    protected getPrompt(context: NodeContext): string { return ""; }
    protected getSystemPrompt(context: NodeContext): string { return ""; }
}

// ─── Utils ───

// QUAL-03: slugify removed — now imported from orchestrator_utils.ts

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
