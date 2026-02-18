/**
 * Claude Agent — Direct Anthropic SDK
 * Uses @anthropic-ai/sdk Messages API with tool use for agentic coding.
 * Replaces the Claude Code CLI which hangs in Docker containers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
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
    appendPrompt?: string;
    timeoutMs?: number;
};

// ─── Event Emitter for live streaming ───

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

// ─── Tool Definitions ───

const TOOLS: Anthropic.Messages.Tool[] = [
    {
        name: "read_file",
        description: "Read the contents of a file at the given path.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path to the file to read" },
            },
            required: ["path"],
        },
    },
    {
        name: "write_file",
        description: "Write content to a file. Creates parent directories if needed.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path to write to" },
                content: { type: "string", description: "Content to write" },
            },
            required: ["path", "content"],
        },
    },
    {
        name: "list_dir",
        description: "List files and directories in the given path.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Directory path to list" },
            },
            required: ["path"],
        },
    },
    {
        name: "bash",
        description: "Run a bash command and return its output. Use for npm install, building, testing, etc.",
        input_schema: {
            type: "object" as const,
            properties: {
                command: { type: "string", description: "The bash command to run" },
            },
            required: ["command"],
        },
    },
];

// ─── Tool Executor ───

async function executeTool(name: string, input: Record<string, any>, cwd: string): Promise<string> {
    try {
        switch (name) {
            case "read_file": {
                const filePath = path.resolve(cwd, input.path);
                const content = await fs.readFile(filePath, "utf-8");
                return content;
            }
            case "write_file": {
                const filePath = path.resolve(cwd, input.path);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, input.content, "utf-8");
                return `File written: ${input.path}`;
            }
            case "list_dir": {
                const dirPath = path.resolve(cwd, input.path || ".");
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                return entries
                    .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
                    .join("\n");
            }
            case "bash": {
                return await runBash(input.command, cwd);
            }
            default:
                return `Unknown tool: ${name}`;
        }
    } catch (err: any) {
        return `Error: ${err.message}`;
    }
}

function runBash(command: string, cwd: string): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn("bash", ["-c", command], {
            cwd,
            env: { ...process.env, HOME: "/root" },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });

        // Timeout for bash commands: 60s
        const timeout = setTimeout(() => {
            proc.kill("SIGTERM");
            resolve(`Command timed out after 60s.\nStdout: ${stdout}\nStderr: ${stderr}`);
        }, 60000);

        proc.on("close", (code) => {
            clearTimeout(timeout);
            const output = stdout + (stderr ? `\nStderr: ${stderr}` : "");
            resolve(code === 0 ? output : `Exit code ${code}\n${output}`);
        });
        proc.on("error", (err) => {
            clearTimeout(timeout);
            resolve(`Spawn error: ${err.message}`);
        });
    });
}

// ─── Main Agent Runner ───

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MODEL = "claude-sonnet-4-20250514";

export async function runClaudeAgent(options: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const actions: AgentAction[] = [];
    const maxTurns = options.maxTurns || 10;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    // Pre-flight check
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error("[Agent] ❌ ANTHROPIC_API_KEY is not set!");
        return {
            success: false,
            actions: [],
            error: "ANTHROPIC_API_KEY is not set.",
            durationMs: Date.now() - startTime,
        };
    }

    console.log(`[Agent] Starting in ${options.cwd}`);
    console.log(`[Agent] Max turns: ${maxTurns}, Timeout: ${timeoutMs / 1000}s`);

    const client = new Anthropic();

    // Build full prompt
    let fullPrompt = options.prompt;
    if (options.appendPrompt) {
        fullPrompt += "\n\n--- CONTEXT ---\n" + options.appendPrompt;
    }

    const systemPrompt = options.systemPrompt || "You are a senior software engineer. Write clean, working code.";

    // Conversation loop
    const messages: Anthropic.Messages.MessageParam[] = [
        { role: "user", content: fullPrompt },
    ];

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                console.log(`[Agent] ⏱️ Timeout after ${turn} turns`);
                break;
            }

            console.log(`[Agent] Turn ${turn + 1}/${maxTurns}`);

            const response = await client.messages.create({
                model: MODEL,
                max_tokens: 4096,
                system: systemPrompt,
                tools: TOOLS,
                messages,
            });

            console.log(`[Agent] Response: stop_reason=${response.stop_reason}, ${response.content.length} blocks`);

            // Process response content
            const assistantContent: Anthropic.Messages.ContentBlock[] = response.content;
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

            for (const block of assistantContent) {
                if (block.type === "text") {
                    const action: AgentAction = {
                        type: "text",
                        content: block.text,
                        timestamp: new Date().toISOString(),
                    };
                    actions.push(action);
                    agentEvents.emit("action", action);
                    console.log(`[Agent] 📝 Text: ${block.text.substring(0, 120)}...`);
                } else if (block.type === "tool_use") {
                    const action: AgentAction = {
                        type: "tool_use",
                        tool: block.name,
                        input: block.input as Record<string, unknown>,
                        content: `Tool: ${block.name}`,
                        timestamp: new Date().toISOString(),
                    };
                    actions.push(action);
                    agentEvents.emit("action", action);
                    console.log(`[Agent] 🔧 Tool: ${block.name} → ${JSON.stringify(block.input).substring(0, 100)}`);

                    // Execute tool
                    const result = await executeTool(block.name, block.input as Record<string, any>, options.cwd);

                    const resultAction: AgentAction = {
                        type: "tool_result",
                        tool: block.name,
                        content: result.substring(0, 500),
                        timestamp: new Date().toISOString(),
                    };
                    actions.push(resultAction);
                    agentEvents.emit("action", resultAction);

                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: result.substring(0, 10000), // Limit result size
                    });
                }
            }

            // If no tool use, we're done
            if (response.stop_reason === "end_turn") {
                console.log(`[Agent] ✅ Completed after ${turn + 1} turns`);
                break;
            }

            // If there were tool calls, send results back
            if (toolResults.length > 0) {
                messages.push({ role: "assistant", content: assistantContent });
                messages.push({ role: "user", content: toolResults });
            } else {
                break;
            }
        }

        const finalResult = actions
            .filter(a => a.type === "text" || a.type === "result")
            .map(a => a.content)
            .join("\n");

        const result: AgentResult = {
            success: true,
            actions,
            finalResult: finalResult || undefined,
            durationMs: Date.now() - startTime,
        };

        console.log(`[Agent] Done in ${result.durationMs}ms, ${actions.length} actions`);
        return result;

    } catch (err: any) {
        console.error(`[Agent] ❌ Error:`, err.message);
        return {
            success: false,
            actions,
            error: err.message,
            durationMs: Date.now() - startTime,
        };
    }
}

// ─── Git Helpers (used by orchestrator) ───

export async function gitClone(repoUrl: string, targetDir: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`[Git] Cloning → ${targetDir}`);
        const proc = spawn("git", ["clone", repoUrl, targetDir], {
            env: { ...process.env, HOME: "/root" },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stderr = "";
        proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

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
            console.log(`[Git] ${cmd} ${args.join(" ")}`);
            const proc = spawn(cmd, [...args], {
                cwd,
                env: { ...process.env, HOME: "/root" },
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stderr = "";
            proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

            proc.on("close", (code) => {
                if (code !== 0 && idx <= 2) {
                    console.error(`[Git] ${cmd} ${args[0]} failed: ${stderr}`);
                    resolve(false);
                    return;
                }
                runNext();
            });
            proc.on("error", (err) => {
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
        ] as const;

        let idx = 0;
        function runNext() {
            if (idx >= commands.length) { resolve(true); return; }
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
