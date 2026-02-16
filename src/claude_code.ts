/**
 * Claude Code Agent SDK Wrapper
 * Spawns Claude Code CLI in print mode for programmatic agent execution.
 * Runs inside Docker container on VPS.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// ─── Types ───

export type AgentAction = {
    type: "text" | "tool_use" | "tool_result" | "result" | "error" | "system";
    content?: string;
    tool?: string;
    input?: Record<string, unknown>;
    timestamp: string;
};

export type AgentResult = {
    success: boolean;
    actions: AgentAction[];
    finalResult?: string;
    error?: string;
    durationMs: number;
};

export type AgentOptions = {
    prompt: string;
    systemPrompt?: string;
    cwd: string;
    allowedTools?: string[];
    maxTurns?: number;
    appendPrompt?: string;  // Appended context (skills, PRD, etc.)
};

// ─── Event Emitter for live streaming ───

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

// ─── Main Runner ───

export async function runClaudeAgent(options: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const actions: AgentAction[] = [];

    return new Promise((resolve) => {
        const args: string[] = [
            "-p",  // Print mode (non-interactive)
            "--output-format", "stream-json",
            "--dangerously-skip-permissions",
        ];

        // System prompt
        if (options.systemPrompt) {
            args.push("--system-prompt", options.systemPrompt);
        }

        // Allowed tools
        if (options.allowedTools && options.allowedTools.length > 0) {
            args.push("--allowedTools", options.allowedTools.join(","));
        }

        // Max turns
        if (options.maxTurns) {
            args.push("--max-turns", String(options.maxTurns));
        }

        // Build full prompt with context
        let fullPrompt = options.prompt;
        if (options.appendPrompt) {
            fullPrompt += "\n\n--- CONTEXT ---\n" + options.appendPrompt;
        }
        args.push(fullPrompt);

        console.log(`[ClaudeCode] Spawning agent in ${options.cwd}`);
        console.log(`[ClaudeCode] Args: claude ${args.slice(0, 5).join(" ")}...`);

        let proc: ChildProcess;
        try {
            proc = spawn("claude", args, {
                cwd: options.cwd,
                env: {
                    ...process.env,
                    HOME: "/root",  // Required for Claude Code in Docker
                },
                stdio: ["pipe", "pipe", "pipe"],
            });
        } catch (err: any) {
            resolve({
                success: false,
                actions: [],
                error: `Failed to spawn claude: ${err.message}`,
                durationMs: Date.now() - startTime,
            });
            return;
        }

        let buffer = "";

        proc.stdout?.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();

            // Parse NDJSON (newline-delimited JSON)
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";  // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    const action = parseStreamEvent(event);
                    if (action) {
                        actions.push(action);
                        // Emit live event
                        agentEvents.emit("action", action);
                    }
                } catch {
                    // Skip unparseable lines
                }
            }
        });

        let stderr = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        proc.on("close", (code) => {
            // Process remaining buffer
            if (buffer.trim()) {
                try {
                    const event = JSON.parse(buffer);
                    const action = parseStreamEvent(event);
                    if (action) actions.push(action);
                } catch { /* ignore */ }
            }

            const finalResult = actions
                .filter(a => a.type === "result" || a.type === "text")
                .map(a => a.content)
                .join("\n");

            resolve({
                success: code === 0,
                actions,
                finalResult: finalResult || undefined,
                error: code !== 0 ? (stderr || `Process exited with code ${code}`) : undefined,
                durationMs: Date.now() - startTime,
            });
        });

        proc.on("error", (err) => {
            resolve({
                success: false,
                actions,
                error: `Process error: ${err.message}`,
                durationMs: Date.now() - startTime,
            });
        });
    });
}

// ─── Stream Event Parser ───

function parseStreamEvent(event: any): AgentAction | null {
    const now = new Date().toISOString();

    if (event.type === "assistant" && event.message) {
        // Text content from assistant
        const textBlock = event.message.content?.find((c: any) => c.type === "text");
        if (textBlock) {
            return { type: "text", content: textBlock.text, timestamp: now };
        }

        // Tool use
        const toolBlock = event.message.content?.find((c: any) => c.type === "tool_use");
        if (toolBlock) {
            return {
                type: "tool_use",
                tool: toolBlock.name,
                input: toolBlock.input,
                content: `Using tool: ${toolBlock.name}`,
                timestamp: now,
            };
        }
    }

    if (event.type === "result") {
        const resultText = event.result?.map((r: any) => r.text || "").join("") || "";
        return { type: "result", content: resultText, timestamp: now };
    }

    if (event.type === "error") {
        return { type: "error", content: event.error?.message || "Unknown error", timestamp: now };
    }

    return null;
}

// ─── Git Helpers (used by orchestrator) ───

export async function gitClone(repoUrl: string, targetDir: string): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn("git", ["clone", repoUrl, targetDir], {
            env: { ...process.env, HOME: "/root" },
            stdio: ["pipe", "pipe", "pipe"],
        });

        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
    });
}

export async function gitPush(cwd: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const commands = [
            ["git", ["add", "-A"]],
            ["git", ["commit", "-m", message, "--allow-empty"]],
            ["git", ["push", "origin", "main"]],
        ] as const;

        let idx = 0;
        function runNext() {
            if (idx >= commands.length) { resolve(true); return; }
            const [cmd, args] = commands[idx++];
            const proc = spawn(cmd, [...args], {
                cwd,
                env: { ...process.env, HOME: "/root" },
                stdio: ["pipe", "pipe", "pipe"],
            });
            proc.on("close", (code) => {
                if (code !== 0 && idx <= 2) { resolve(false); return; } // allow push to fail softly
                runNext();
            });
            proc.on("error", () => resolve(false));
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
        ] as const;

        let idx = 0;
        function runNext() {
            if (idx >= commands.length) { resolve(true); return; }
            const [cmd, args] = commands[idx++];
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
