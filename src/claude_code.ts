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
    inputTokens: number;
    outputTokens: number;
};

export type AgentOptions = {
    prompt: string;
    systemPrompt?: string;
    cwd: string;
    allowedTools?: string[];
    maxTurns?: number;
    appendPrompt?: string;
    timeoutMs?: number;
    attachedFiles?: { base64: string; type: string }[];
    abortSignal?: AbortSignal;
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
    {
        name: "replace_in_file",
        description: "Replace a specific exact string block in a file with another string block. Use this instead of write_file when editing existing large files.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path to the file to modify" },
                targetStr: { type: "string", description: "The EXACT current string in the file to replace (including indentation/newlines)" },
                replacementStr: { type: "string", description: "The new string to put in its place" },
            },
            required: ["path", "targetStr", "replacementStr"],
        },
    },
    {
        name: "web_search",
        description: "Search the web to find up-to-date documentation or fixes for errors.",
        input_schema: {
            type: "object" as const,
            properties: {
                query: { type: "string", description: "Search query (e.g. 'Next.js 14 app router middleware example')" },
            },
            required: ["query"],
        },
    },
    {
        name: "fetch_url",
        description: "Fetch the text content of a generic URL. Useful for reading documentation pages or GitHub issues you found via web_search. Fails on heavy JS single-page-apps.",
        input_schema: {
            type: "object" as const,
            properties: {
                url: { type: "string", description: "The exact URL to scrape" },
            },
            required: ["url"],
        },
    }
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
            case "replace_in_file": {
                const filePath = path.resolve(cwd, input.path);
                let content = await fs.readFile(filePath, "utf-8");
                if (!content.includes(input.targetStr)) {
                    return `Error: Target string not found in file. Ensure exact match including whitespaces.`;
                }
                content = content.replace(input.targetStr, input.replacementStr);
                await fs.writeFile(filePath, content, "utf-8");
                return `Successfully replaced content in ${input.path}`;
            }
            case "web_search": {
                try {
                    // Primitive search parsing DuckDuckGo HTML using standard fetch
                    const encodedQuery = encodeURIComponent(input.query);
                    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
                    });
                    const html = await res.text();

                    const results: string[] = [];
                    // Very basic regex to extract snippet results
                    const snippetBoxes = html.split('class="result__snippet');
                    for (let i = 1; i < Math.min(snippetBoxes.length, 6); i++) {
                        const snippetMatch = snippetBoxes[i].match(/href="([^"]+)">([^<]+)<\/a>/i);
                        const abstractMatch = snippetBoxes[i].match(/>\s*([^<]+)\s*<\/a>/);
                        if (snippetMatch) {
                            results.push(`[${snippetMatch[2]}] URL: ${snippetMatch[1]}`);
                        }
                    }
                    if (results.length === 0) return `No search results found.`;
                    return `Search Results for "${input.query}":\n\n${results.join('\n')}`;
                } catch (e: any) {
                    return `Search failed: ${e.message}`;
                }
            }
            case "fetch_url": {
                try {
                    const res = await fetch(input.url, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                    });
                    if (!res.ok) return `HTTP Error ${res.status} fetching ${input.url}`;
                    let text = await res.text();
                    // Strip HTML tags naively to save tokens
                    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    return text.slice(0, 8000); // 8k chars max to save tokens
                } catch (e: any) {
                    return `Fetch failed: ${e.message}`;
                }
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
const DEFAULT_MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

export function getCurrentModel(): string {
    return DEFAULT_MODEL;
}

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
            inputTokens: 0,
            outputTokens: 0,
        };
    }

    console.log(`[Agent] Starting in ${options.cwd}`);
    console.log(`[Agent] Model: ${DEFAULT_MODEL}, Max turns: ${maxTurns}, Timeout: ${timeoutMs / 1000}s`);

    const client = new Anthropic();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Build full prompt
    let fullPromptText = options.prompt;
    if (options.appendPrompt) {
        fullPromptText += "\n\n--- CONTEXT ---\n" + options.appendPrompt;
    }

    const systemPrompt = options.systemPrompt || "You are a senior software engineer. Write clean, working code.";

    const initialContent: Anthropic.Messages.ContentBlockParam[] = [
        { type: "text", text: fullPromptText }
    ];

    if (options.attachedFiles && options.attachedFiles.length > 0) {
        for (const file of options.attachedFiles) {
            const isImage = file.type.startsWith("image/");
            if (isImage) {
                initialContent.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: file.type as any,
                        data: file.base64,
                    }
                });
                console.log(`[Agent] 📎 Attached Image: ${file.type}`);
            } else if (file.type === "application/pdf") {
                initialContent.push({
                    type: "document",
                    source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: file.base64,
                    }
                });
                console.log(`[Agent] 📎 Attached Document: PDF`);
            }
        }
    }

    // Conversation loop
    const messages: Anthropic.Messages.MessageParam[] = [
        { role: "user", content: initialContent },
    ];

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                console.log(`[Agent] ⏱️ Timeout after ${turn} turns`);
                break;
            }

            console.log(`[Agent] Turn ${turn + 1}/${maxTurns}`);

            // Create API request init with signal if provided
            const requestOptions: any = {};
            if (options.abortSignal) {
                requestOptions.signal = options.abortSignal;
            }

            const response = await client.messages.create({
                model: DEFAULT_MODEL,
                max_tokens: 8192,
                system: systemPrompt + "\n\nRÈGLES ABSOLUES: Ne crée JAMAIS de fichiers de documentation (.md), de tests, de rapports ou de scripts de validation. Concentre-toi uniquement sur le code fonctionnel demandé. Sois concis dans tes réponses textuelles.",
                tools: TOOLS,
                messages,
            }, requestOptions);

            console.log(`[Agent] Response: stop_reason=${response.stop_reason}, ${response.content.length} blocks, tokens: ${response.usage.input_tokens}in/${response.usage.output_tokens}out`);

            totalInputTokens += response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;

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
                        content: result.substring(0, 3000),
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

                // Sliding window: keep initial user message + last 3 exchange pairs
                // to prevent quadratic token growth over many turns
                const KEEP_PAIRS = 3;
                if (messages.length > 1 + KEEP_PAIRS * 2) {
                    const initial = messages[0];
                    const tail = messages.slice(-(KEEP_PAIRS * 2));
                    messages.length = 0;
                    messages.push(initial, ...tail);
                }
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
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
        };

        console.log(`[Agent] Done in ${result.durationMs}ms, ${actions.length} actions, tokens: ${totalInputTokens}in/${totalOutputTokens}out`);
        return result;

    } catch (err: any) {
        const errMsg = String(err.message || err);
        console.error(`[Agent] ❌ Error: ${errMsg}`);

        // Fatal errors that should stop the entire pipeline
        const isFatal =
            errMsg.includes("credit balance is too low") ||
            errMsg.includes("invalid_api_key") ||
            errMsg.includes("permission_error");

        if (isFatal) {
            const fatalErr = new Error(`FATAL: ${errMsg}`);
            (fatalErr as any).fatal = true;
            throw fatalErr;
        }

        return {
            success: false,
            actions,
            error: errMsg,
            durationMs: Date.now() - startTime,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
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

export async function gitPush(cwd: string, message: string, authRemoteUrl?: string): Promise<boolean> {
    return new Promise((resolve) => {
        // If an authenticated URL is provided, update remote before push
        const commands: [string, string[]][] = authRemoteUrl
            ? [
                ["git", ["remote", "set-url", "origin", authRemoteUrl]],
                ["git", ["add", "-A"]],
                ["git", ["commit", "-m", message, "--allow-empty"]],
                ["git", ["push", "origin", "main"]],
            ]
            : [
                ["git", ["add", "-A"]],
                ["git", ["commit", "-m", message, "--allow-empty"]],
                ["git", ["push", "origin", "main"]],
            ];

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
                if (code !== 0) {
                    console.error(`[Git] ${cmd} ${args.join(" ")} failed (code ${code}):\n${stderr}`);
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
