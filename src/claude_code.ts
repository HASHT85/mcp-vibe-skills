// @ts-nocheck
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
import * as cheerio from "cheerio";

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

export interface AgentOptions {
    prompt: string;
    systemPrompt?: string;
    cwd: string;
    model?: string;
    allowedTools?: string[];
    maxTurns?: number;
    maxTokenBudget?: number;
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
    },
    {
        name: "read_memory",
        description: "Read a value from the shared project memory space.",
        input_schema: {
            type: "object" as const,
            properties: {
                key: { type: "string", description: "The memory key to read" },
            },
            required: ["key"],
        },
    },
    {
        name: "write_memory",
        description: "Write a value to the shared project memory space so that other agents can see it.",
        input_schema: {
            type: "object" as const,
            properties: {
                key: { type: "string", description: "The memory key to write" },
                value: { type: "string", description: "The string value to save" },
            },
            required: ["key", "value"],
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
                const lines = content.split("\n");
                const MAX_LINES = 500;
                if (lines.length > MAX_LINES) {
                    const chunk = lines.slice(0, MAX_LINES).join("\n");
                    return `${chunk}\n\n[⚠️ FILE TRUNCATED: ${lines.length} total lines, showing first ${MAX_LINES}. Use bash with sed to read specific line ranges: sed -n '501,1000p' ${input.path}]`;
                }
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
                if (content.includes(input.targetStr)) {
                    content = content.replace(input.targetStr, input.replacementStr);
                    await fs.writeFile(filePath, content, "utf-8");
                    return `Successfully replaced content in ${input.path}`;
                }

                // Fallback: Fuzzy matching ignoring exact whitespace/newlines
                const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
                const normTarget = normalize(input.targetStr);

                // Extremely simple fuzzy replace for agent convenience
                const lines = content.split('\n');
                let found = false;

                // Try to find a window of lines that matches the normalized target
                for (let windowSize = 1; windowSize <= 20; windowSize++) {
                    for (let i = 0; i <= lines.length - windowSize; i++) {
                        const windowContent = lines.slice(i, i + windowSize).join('\n');
                        if (normalize(windowContent) === normTarget) {
                            lines.splice(i, windowSize, input.replacementStr);
                            content = lines.join('\n');
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }

                if (found) {
                    await fs.writeFile(filePath, content, "utf-8");
                    return `Successfully replaced content in ${input.path} (using secondary fuzzy whitespace match).`;
                }

                return `Error: Target string not found in file. Ensure exact match including whitespaces or use sed via bash.`;
            }
            case "web_search": {
                try {
                    const encodedQuery = encodeURIComponent(input.query);
                    const controller = new AbortController();
                    const searchTimeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
                    
                    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
                        signal: controller.signal
                    });
                    clearTimeout(searchTimeout);
                    const html = await res.text();

                    const $ = cheerio.load(html);
                    const results: string[] = [];

                    // Try primary selectors, then fallback alternatives
                    const selectors = [
                        { container: '.result', title: '.result__title a', url: '.result__a', snippet: '.result__snippet' },
                        { container: '.web-result', title: '.result__a', url: '.result__url', snippet: '.result__snippet' },
                        { container: '[data-testid="result"]', title: 'a[data-testid="result-title-a"]', url: 'a', snippet: '[data-testid="result-snippet"]' },
                    ];

                    for (const sel of selectors) {
                        $(sel.container).each((i, el) => {
                            if (i >= 5) return false;
                            const title = $(el).find(sel.title).text().trim();
                            const url = $(el).find(sel.url).attr('href') || '';
                            const snippet = $(el).find(sel.snippet).text().trim();

                            if (title && url) {
                                let realUrl = url;
                                if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
                                    realUrl = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
                                }
                                results.push(`[${title}] URL: ${realUrl}\nSnippet: ${snippet}`);
                            }
                        });
                        if (results.length > 0) break; // Found results with this selector
                    }

                    if (results.length === 0) return `No search results found for "${input.query}". Try alternative keywords.`;
                    return `Search Results for "${input.query}":\n\n${results.join('\n\n')}`;
                } catch (e: any) {
                    return `Search failed: ${e.message}. The agent can continue without web search results.`;
                }
            }
            case "fetch_url": {
                try {
                    const res = await fetch(input.url, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                    });
                    if (!res.ok) return `HTTP Error ${res.status} fetching ${input.url}`;
                    const text = await res.text();

                    const $ = cheerio.load(text);
                    // Remove useless noisy tags
                    $('script, style, noscript, svg, nav, footer, header, aside, .sidebar, #sidebar, .ad, .advertisement').remove();

                    // Extract text
                    let cleanText = $('body').text().replace(/\s+/g, ' ').trim();
                    if (!cleanText) {
                        cleanText = $.text().replace(/\s+/g, ' ').trim();
                    }

                    return cleanText.slice(0, 10000); // 10k chars max to save tokens but read plenty of context
                } catch (e: any) {
                    return `Fetch failed: ${e.message} `;
                }
            }
            case "read_memory": {
                try {
                    const memPath = path.resolve(cwd, ".veistcraft_memory.json");
                    let memStr = "{}";
                    try { memStr = await fs.readFile(memPath, "utf-8"); } catch { }
                    const mem = JSON.parse(memStr);
                    if (mem[input.key] !== undefined) {
                        return String(mem[input.key]);
                    }
                    return `Memory key "${input.key}" is empty/undefined.`;
                } catch (err: any) {
                    return `Memory read error: ${err.message}`;
                }
            }
            case "write_memory": {
                try {
                    const memPath = path.resolve(cwd, ".veistcraft_memory.json");
                    let memStr = "{}";
                    try { memStr = await fs.readFile(memPath, "utf-8"); } catch { }
                    const mem = JSON.parse(memStr);
                    mem[input.key] = input.value;
                    await fs.writeFile(memPath, JSON.stringify(mem, null, 2), "utf-8");
                    return `Saved "${input.key}" to shared memory.`;
                } catch (err: any) {
                    return `Memory write error: ${err.message}`;
                }
            }
            default:
                return `Unknown tool: ${name} `;
        }
    } catch (err: any) {
        return `Error: ${err.message} `;
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

        // Timeout for bash commands: 180s (npm install on heavy projects can take 2-3 min)
        const timeout = setTimeout(() => {
            proc.kill("SIGTERM");
            resolve(`Command timed out after 180s.\nStdout: ${stdout} \nStderr: ${stderr} `);
        }, 180000);

        proc.on("close", (code) => {
            clearTimeout(timeout);
            const output = stdout + (stderr ? `\nStderr: ${stderr} ` : "");
            resolve(code === 0 ? output : `Exit code ${code} \n${output} `);
        });
        proc.on("error", (err) => {
            clearTimeout(timeout);
            resolve(`Spawn error: ${err.message} `);
        });
    });
}

// ─── Main Agent Runner ───

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

export function getCurrentModel(): string {
    return DEFAULT_MODEL;
}

export async function runClaudeAgent(options: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const actions: AgentAction[] = [];
    const maxTurns = options.maxTurns || 50;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxTokenBudget = options.maxTokenBudget || parseInt(process.env.MAX_TOKENS_PER_AGENT || "0") || 0;

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

    console.log(`[Agent] Starting in ${options.cwd} `);
    const finalModel = options.model || DEFAULT_MODEL;
    console.log(`[Agent] Model: ${finalModel}, Max turns: ${maxTurns}, Budget: ${maxTokenBudget || 'unlimited'}, Timeout: ${timeoutMs / 1000} s`);

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
                console.log(`[Agent] 📎 Attached Image: ${file.type} `);
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

            // Check token budget
            if (maxTokenBudget > 0 && totalInputTokens >= maxTokenBudget) {
                console.log(`[Agent] 💰 Token budget exhausted: ${totalInputTokens}/${maxTokenBudget} input tokens after ${turn} turns`);
                break;
            }

            console.log(`[Agent] Turn ${turn + 1} `);

            const fullSystemPrompt = systemPrompt + "\n\nRÈGLES ABSOLUES: Ne crée JAMAIS de fichiers de documentation (.md), de tests, de rapports ou de scripts de validation. Concentre-toi uniquement sur le code fonctionnel demandé. Sois concis dans tes réponses textuelles.";

            const response = await invokeModel(finalModel, fullSystemPrompt, TOOLS, messages, client, options.abortSignal);

            console.log(`[Agent] Response: stop_reason = ${response.stop_reason}, ${response.content.length} blocks, tokens: ${response.usage.input_tokens}in/${response.usage.output_tokens}out`);

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

                // Sliding window: keep initial user message + last N exchange pairs
                // to prevent quadratic token growth over many turns.
                // NOTE: 3 was too aggressive — agents forgot their own reads and looped.
                // 8 was still losing context on complex multi-file projects.
                const KEEP_PAIRS = 12;
                if (messages.length > 1 + KEEP_PAIRS * 2) {
                    const initial = messages[0];
                    const tail = messages.slice(-(KEEP_PAIRS * 2));
                    const droppedCount = messages.length - 1 - KEEP_PAIRS * 2;

                    // Read dev_progress from shared memory to prevent agent from re-doing work
                    let progressHint = "";
                    try {
                        const memPath = path.resolve(options.cwd, ".veistcraft_memory.json");
                        const memStr = await fs.readFile(memPath, "utf-8").catch(() => "{}");
                        const mem = JSON.parse(memStr);
                        if (mem.dev_progress) {
                            progressHint = `\n\n📋 YOUR PROGRESS SO FAR: ${mem.dev_progress}\n⚠️ Do NOT recreate files that are already DONE. Continue from where you left off.`;
                        }
                    } catch {}

                    const summaryMsg: Anthropic.Messages.MessageParam = {
                        role: "user",
                        content: `[SYSTEM: ${droppedCount} earlier message(s) were trimmed to save context. Do NOT re-read or re-create files you already processed. Focus on WRITING new code and making progress.${progressHint}]`
                    };
                    messages.length = 0;
                    messages.push(initial, summaryMsg, ...tail);
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
    // Ensure .gitignore exists to prevent staging node_modules, dist, etc.
    try {
        const gitignorePath = path.join(cwd, ".gitignore");
        const hasGitignore = await fs.access(gitignorePath).then(() => true).catch(() => false);
        if (!hasGitignore) {
            console.log(`[Git] No .gitignore found, creating default one`);
            await fs.writeFile(gitignorePath, "node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n", "utf-8");
        } else {
            // Ensure node_modules is in .gitignore
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
        // If an authenticated URL is provided, update remote before push
        const commands: [string, string[]][] = authRemoteUrl
            ? [
                ["git", ["config", "--global", "user.email", "veistcraft@auto.dev"]],
                ["git", ["config", "--global", "user.name", "veistCraft"]],
                ["git", ["remote", "set-url", "origin", authRemoteUrl]],
                ["git", ["add", "-A"]],
                ["git", ["commit", "-m", message]],
                // --force only on first push (authRemoteUrl = fresh repo with README conflict)
                ["git", ["push", "--force", "origin", "main"]],
            ]
            : [
                ["git", ["config", "--global", "user.email", "veistcraft@auto.dev"]],
                ["git", ["config", "--global", "user.name", "veistCraft"]],
                ["git", ["add", "-A"]],
                ["git", ["commit", "-m", message]],
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

            // Timeout per command: 2 minutes (push can be slow but should not hang forever)
            const cmdTimeout = setTimeout(() => {
                console.error(`[Git] ${cmd} ${args.join(" ")} timed out after 120s — killing`);
                proc.kill("SIGTERM");
                resolve(false);
            }, 120_000);

            proc.on("close", (code) => {
                clearTimeout(cmdTimeout);
                if (code !== 0) {
                    console.error(`[Git] ${cmd} ${args.join(" ")} failed (code ${code}):\n${stderr}`);
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
            // Configure git user for commits (global so it persists)
            ["git", ["config", "--global", "user.email", "veistcraft@auto.dev"]],
            ["git", ["config", "--global", "user.name", "veistCraft"]],
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

// ─── Multi-Model Adapter ───

export async function invokeModel(
    model: string,
    systemPrompt: string,
    tools: Anthropic.Messages.Tool[],
    messages: Anthropic.Messages.MessageParam[],
    anthropicClient: Anthropic,
    abortSignal?: AbortSignal
): Promise<{
    stop_reason: string;
    content: Anthropic.Messages.ContentBlock[];
    usage: { input_tokens: number; output_tokens: number };
}> {
    // Pass the exact model string from the UI directly to the underlying proxy/client

    if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) {
        // OpenAI Adapter
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Convert tools
        const openAiTools = tools.map((t: any) => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema
            }
        }));

        // Convert messages
        const openAiMessages: any[] = [];
        if (systemPrompt) {
            openAiMessages.push({ role: "system", content: systemPrompt });
        }

        for (const m of messages) {
            if (typeof m.content === "string") {
                openAiMessages.push({ role: m.role, content: m.content });
            } else if (Array.isArray(m.content)) {
                // Anthropic content blocks to OpenAI
                let textContent = "";
                const toolCalls: any[] = [];
                for (const block of m.content) {
                    if (block.type === "text") textContent += block.text;
                    if (block.type === "tool_use") {
                        toolCalls.push({
                            id: block.id,
                            type: "function",
                            function: {
                                name: block.name,
                                arguments: JSON.stringify(block.input)
                            }
                        });
                    }
                    if (block.type === "tool_result") {
                        openAiMessages.push({
                            role: "tool",
                            tool_call_id: block.tool_use_id,
                            content: String(block.content)
                        });
                    }
                }

                if (m.role === "assistant") {
                    if (textContent || toolCalls.length > 0) {
                        openAiMessages.push({
                            role: "assistant",
                            content: textContent || null,
                            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                        });
                    }
                } else {
                    if (textContent && openAiMessages[openAiMessages.length - 1]?.role !== "tool") {
                        openAiMessages.push({ role: "user", content: textContent });
                    }
                }
            }
        }

        const requestOptions: any = {};
        if (abortSignal) requestOptions.signal = abortSignal;

        const response = await client.chat.completions.create({
            model: model,
            messages: openAiMessages as any,
            tools: openAiTools as any,
        }, requestOptions);

        const choice = response.choices[0];
        const msg = choice.message;

        const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
        if (msg.content) {
            contentBlocks.push({ type: "text", text: msg.content } as any);
        }

        if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                contentBlocks.push({
                    type: "tool_use",
                    id: tc.id,
                    name: tc.function.name,
                    input: JSON.parse(tc.function.arguments)
                } as any);
            }
        }

        return {
            stop_reason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
            content: contentBlocks,
            usage: {
                input_tokens: response.usage?.prompt_tokens || 0,
                output_tokens: response.usage?.completion_tokens || 0
            }
        };

    } else if (model.includes("gemini")) {
        // Google GenAI Adapter
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });

        const geminiTools = [{
            functionDeclarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: {
                    type: "OBJECT",
                    properties: (t.input_schema as any).properties,
                    required: (t.input_schema as any).required
                }
            }))
        }];

        const geminiMessages: any[] = [];
        for (const m of messages) {
            const role = m.role === "user" ? "user" : "model";
            const parts: any[] = [];

            if (typeof m.content === "string") {
                parts.push({ text: m.content });
            } else if (Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.type === "text") parts.push({ text: block.text });
                    if (block.type === "tool_use") {
                        parts.push({
                            functionCall: {
                                name: block.name,
                                args: block.input
                            }
                        });
                    }
                    if (block.type === "tool_result") {
                        geminiMessages.push({
                            role: "user",
                            parts: [{
                                functionResponse: {
                                    name: (block as unknown as any).name || "ExecuteCommand", // Fallback name since we don't have it natively in tool_result here
                                    response: { result: block.content }
                                }
                            }]
                        });
                    }
                }
            }
            if (parts.length > 0) {
                geminiMessages.push({ role, parts });
            }
        }

        // Generate ID for tools since Gemini may not provide an ID
        const generateId = () => Math.random().toString(36).substring(2, 10);

        const response = await ai.models.generateContent({
            model: model,
            contents: geminiMessages,
            config: {
                systemInstruction: systemPrompt,
                tools: geminiTools as any,
                temperature: 0.2
            }
        });

        const contentBlocks: Anthropic.Messages.ContentBlock[] = [];

        if (response.text) {
            contentBlocks.push({ type: "text", text: response.text } as any);
        }

        let stopReason = "end_turn";
        if (response.functionCalls && response.functionCalls.length > 0) {
            stopReason = "tool_use";
            for (const fc of response.functionCalls) {
                contentBlocks.push({
                    type: "tool_use",
                    id: "call_" + Math.random().toString(36).substring(7),
                    name: fc.name,
                    input: fc.args as any
                } as any);
            }
        }

        return {
            stop_reason: stopReason,
            content: contentBlocks,
            usage: {
                input_tokens: response.usageMetadata?.promptTokenCount || 0,
                output_tokens: response.usageMetadata?.candidatesTokenCount || 0
            }
        };

    } else {
        // Default Anthropic
        const requestOptions: any = {};
        if (abortSignal) requestOptions.signal = abortSignal;

        const response = await anthropicClient.messages.create({
            model: model,
            max_tokens: 8192,
            system: systemPrompt,
            tools: tools,
            messages: messages,
        }, requestOptions);

        return {
            stop_reason: response.stop_reason as string,
            content: response.content,
            usage: {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens
            }
        };
    }
}
