/**
 * VEIST Agent Engine — Compatibility Re-export Layer
 *
 * This file has been refactored into focused modules:
 *   - Types          → src/agent/types.ts
 *   - Agent runner   → src/agent/index.ts
 *   - OpenRouter     → src/agent/openrouter.ts
 *   - File tools     → src/tools/file.ts
 *   - System tools   → src/tools/system.ts
 *   - Web tools      → src/tools/web.ts
 *   - Tool executor  → src/tools/executor.ts
 *   - Git helpers    → src/agent/git.ts (unchanged below)
 *
 * This file re-exports everything so existing importers don't need to change.
 */

// ─── Re-exports from new modules ───
export type { AgentAction, AgentResult, AgentOptions } from "./agent/types.js";
export { agentEvents, runVeistAgent, DEFAULT_MODEL, getCurrentModel } from "./agent/index.js";
export { invokeModel } from "./agent/openrouter.js";

// ─── Git Helpers (kept here — used by orchestrator) ───

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function gitClone(repoUrl: string, targetDir: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`[Git] Cloning → ${targetDir}`);
        const proc = spawn("git", ["clone", repoUrl, targetDir], {
            env: { ...process.env, HOME: "/root" },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stderr = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        proc.on("close", (code) => {
            if (code !== 0) console.error(`[Git] Clone failed: ${stderr}`);
            else console.log(`[Git] Clone OK`);
            resolve(code === 0);
        });
        proc.on("error", (err) => {
            console.error(`[Git] Clone error:`, err);
            resolve(false);
        });
    });
}

export async function gitPush(
    cwd: string,
    message: string,
    authRemoteUrl?: string
): Promise<boolean> {
    // Ensure .gitignore exists to prevent staging node_modules, dist, etc.
    try {
        const gitignorePath = path.join(cwd, ".gitignore");
        const hasGitignore = await fs
            .access(gitignorePath)
            .then(() => true)
            .catch(() => false);
        if (!hasGitignore) {
            console.log(`[Git] No .gitignore found, creating default one`);
            await fs.writeFile(
                gitignorePath,
                "node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n",
                "utf-8"
            );
        } else {
            const content = await fs.readFile(gitignorePath, "utf-8");
            if (!content.includes("node_modules")) {
                console.log(`[Git] Adding node_modules to existing .gitignore`);
                await fs.appendFile(gitignorePath, "\nnode_modules/\n");
            }
        }
    } catch (e: any) {
        console.warn(`[Git] .gitignore check failed: ${e.message}`);
    }

    return new Promise((resolve) => {
        const commands: [string, string[]][] = authRemoteUrl
            ? [
                  ["git", ["config", "--global", "user.email", "veist@auto.dev"]],
                  ["git", ["config", "--global", "user.name", "veist"]],
                  ["git", ["remote", "set-url", "origin", authRemoteUrl]],
                  ["git", ["add", "-A"]],
                  ["git", ["commit", "-m", message]],
                  ["git", ["push", "--force", "origin", "main"]],
              ]
            : [
                  ["git", ["config", "--global", "user.email", "veist@auto.dev"]],
                  ["git", ["config", "--global", "user.name", "veist"]],
                  ["git", ["add", "-A"]],
                  ["git", ["commit", "-m", message]],
                  ["git", ["push", "origin", "main"]],
              ];

        let idx = 0;
        function runNext() {
            if (idx >= commands.length) {
                resolve(true);
                return;
            }
            const [cmd, args] = commands[idx++];
            console.log(`[Git] ${cmd} ${args.join(" ")}`);
            const proc = spawn(cmd, [...args], {
                cwd,
                env: { ...process.env, HOME: "/root" },
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stderr = "";
            proc.stderr?.on("data", (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            const cmdTimeout = setTimeout(() => {
                console.error(`[Git] ${cmd} ${args.join(" ")} timed out after 120s — killing`);
                proc.kill("SIGTERM");
                resolve(false);
            }, 120_000);

            proc.on("close", (code) => {
                clearTimeout(cmdTimeout);
                if (code !== 0) {
                    console.error(
                        `[Git] ${cmd} ${args.join(" ")} failed (code ${code}):\n${stderr}`
                    );
                    resolve(false);
                    return;
                }
                runNext();
            });
            proc.on("error", (err) => {
                clearTimeout(cmdTimeout);
                console.error(`[Git] Error:`, err);
                resolve(false);
            });
        }
        runNext();
    });
}

export async function gitInit(cwd: string, remoteUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
        const commands = [
            ["git", ["init"]],
            ["git", ["remote", "add", "origin", remoteUrl]],
            ["git", ["checkout", "-b", "main"]],
            ["git", ["config", "--global", "user.email", "veist@auto.dev"]],
            ["git", ["config", "--global", "user.name", "veist"]],
        ] as const;

        let idx = 0;
        function runNext() {
            if (idx >= commands.length) {
                resolve(true);
                return;
            }
            const [cmd, args] = commands[idx++];
            console.log(`[Git] ${cmd} ${args.join(" ")}`);
            const proc = spawn(cmd, [...args], {
                cwd,
                env: { ...process.env, HOME: "/root" },
                stdio: ["pipe", "pipe", "pipe"],
            });
            proc.on("close", () => runNext());
            proc.on("error", () => resolve(false));
        }
        runNext();
    });
}
