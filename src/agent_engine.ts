// SEC-41: @ts-nocheck removed — type safety restored on agent engine
/**
 * VEIST Agent Engine — OpenRouter (OpenAI-compatible)
 * Uses OpenAI SDK pointed at OpenRouter for multi-model agentic coding.
 * Supports all models available on OpenRouter (Claude, GPT, Gemini, DeepSeek, etc.)
 * 
 * NOTE: This file was renamed from claude_code.ts to agent_engine.ts
 * to reflect the multi-model architecture of VEIST.
 */

import OpenAI from "openai";
import { spawn } from "node:child_process";
import { promises as fs, realpathSync } from "node:fs";
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

const TOOLS: any[] = [
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

// ─── Security: Path Traversal Guard (SEC-01 + QUAL-42) ───

function safePath(cwd: string, userPath: string): string {
    const resolved = path.resolve(cwd, userPath);
    // Ensure the resolved path stays within the workspace
    if (!resolved.startsWith(cwd)) {
        throw new Error(`🚫 Path traversal blocked: "${userPath}" resolves outside workspace.`);
    }
    // QUAL-42: Resolve symlinks to prevent symlink-based traversal
    try {
        const real = realpathSync(resolved);
        if (!real.startsWith(cwd)) {
            throw new Error(`🚫 Symlink traversal blocked: "${userPath}" resolves outside workspace via symlink.`);
        }
        return real;
    } catch (e: any) {
        // File doesn't exist yet (write_file) — allow if path itself is safe
        if (e.code === 'ENOENT') return resolved;
        throw e;
    }
}

// ─── Tool Executor ───

async function executeTool(name: string, input: Record<string, any>, cwd: string): Promise<string> {
    try {
        switch (name) {
            case "read_file": {
                const filePath = safePath(cwd, input.path);
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
                const filePath = safePath(cwd, input.path);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, input.content, "utf-8");
                return `File written: ${input.path}`;
            }
            case "list_dir": {
                const dirPath = safePath(cwd, input.path || ".");
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                return entries
                    .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
                    .join("\n");
            }
            case "bash": {
                return await runBash(input.command, cwd);
            }
            case "replace_in_file": {
                const filePath = safePath(cwd, input.path);
                let content = await fs.readFile(filePath, "utf-8");
                if (content.includes(input.targetStr)) {
                    content = content.replace(input.targetStr, input.replacementStr);
                    await fs.writeFile(filePath, content, "utf-8");
                    return `Successfully replaced content in ${input.path}`;
                }

                // SEC-HARDENED: No fuzzy matching — agent must provide exact target string
                return `Error: Target string not found in file. Ensure EXACT match including all whitespace and newlines. No fuzzy fallback is available.`;
            }
            case "web_search": {
                try {
                    const query = input.query;
                    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
                    if (!TAVILY_API_KEY) {
                        return "Error: TAVILY_API_KEY is not set in environment or .env. Web search is disabled.";
                    }
                    const searchController = new AbortController();
                    const searchTimeout = setTimeout(() => searchController.abort(), 15_000);
                    const res = await fetch("https://api.tavily.com/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        signal: searchController.signal,
                        body: JSON.stringify({
                            api_key: TAVILY_API_KEY,
                            query: query,
                            search_depth: "basic",
                            include_answer: true,
                            max_results: 5
                        })
                    });
                    clearTimeout(searchTimeout);
                    if (!res.ok) {
                        return `Error: Web search failed with API status ${res.status}`;
                    }
                    const data = await res.json();
                    
                    if (!data.results || data.results.length === 0) {
                        return `No search results found for "${query}". Try alternative keywords.`;
                    }
                    
                    const resultsStr = data.results.map((r: any) => `[${r.title}] URL: ${r.url}\nSnippet: ${r.content}`).join('\n\n');
                    let finalOutput = `Search Results for "${query}":\n\n`;
                    if (data.answer) {
                        finalOutput += `AI Summary Answer: ${data.answer}\n\n`;
                    }
                    finalOutput += resultsStr;
                    return finalOutput;
                } catch (e: any) {
                    return `Search failed: ${e.message}.`;
                }
            }
            case "fetch_url": {
                try {
                    // SEC-42: SSRF protection — block dangerous URLs
                    const urlStr = String(input.url || "");
                    try {
                        const parsed = new URL(urlStr);
                        // Block non-HTTP protocols
                        if (!['http:', 'https:'].includes(parsed.protocol)) {
                            return `🚫 Blocked: only http/https URLs are allowed (got ${parsed.protocol})`;
                        }
                        // Block private/internal IPs and metadata endpoints
                        const host = parsed.hostname.toLowerCase();
                        const BLOCKED_HOSTS = [
                            'localhost', '127.0.0.1', '0.0.0.0', '::1',
                            '169.254.169.254', // AWS/GCP metadata
                            'metadata.google.internal',
                        ];
                        if (BLOCKED_HOSTS.includes(host) ||
                            host.endsWith('.internal') ||
                            host.startsWith('10.') ||
                            host.startsWith('192.168.') ||
                            /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
                            return `🚫 Blocked: cannot fetch internal/private URLs (${host})`;
                        }
                    } catch {
                        return `Error: Invalid URL "${urlStr}"`;
                    }

                    const fetchController = new AbortController();
                    const fetchTimeout = setTimeout(() => fetchController.abort(), 15_000);
                    const res = await fetch(urlStr, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                        signal: fetchController.signal,
                    });
                    clearTimeout(fetchTimeout);
                    if (!res.ok) return `HTTP Error ${res.status} fetching ${urlStr}`;
                    const text = await res.text();

                    const $ = cheerio.load(text);
                    // Remove useless noisy tags
                    $('script, style, noscript, svg, nav, footer, header, aside, .sidebar, #sidebar, .ad, .advertisement').remove();

                    // Extract text
                    let cleanText = $('body').text().replace(/\s+/g, ' ').trim();
                    if (!cleanText) {
                        cleanText = $.text().replace(/\s+/g, ' ').trim();
                    }

                    return cleanText.slice(0, 10000);
                } catch (e: any) {
                    return `Fetch failed: ${e.message} `;
                }
            }
            case "read_memory": {
                try {
                    const memPath = path.resolve(cwd, ".veist_memory.json");
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
                    const memPath = path.resolve(cwd, ".veist_memory.json");
                    let memStr = "{}";
                    try { memStr = await fs.readFile(memPath, "utf-8"); } catch { }
                    const mem = JSON.parse(memStr);
                    mem[input.key] = input.value;
                    // QUAL-43: Atomic write to prevent corruption on crash
                    const memTmp = `${memPath}.tmp`;
                    await fs.writeFile(memTmp, JSON.stringify(mem, null, 2), "utf-8");
                    await fs.rename(memTmp, memPath);
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
    // ─── Phase 3: Sandbox — block dangerous commands ───
    const BLOCKED_PATTERNS = [
        // Filesystem destruction
        { pattern: /rm\s+(-rf?|--recursive)\s+\/(?!\w)/, label: "rm -rf /" },
        { pattern: /mkfs\./, label: "mkfs (format disk)" },
        { pattern: /dd\s+if=\/dev/, label: "dd raw device write" },
        { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, label: "fork bomb" },
        { pattern: /chmod\s+777\s+\/(?!\w)/, label: "chmod 777 /" },
        { pattern: />\s*\/dev\/sd/, label: "write to raw device" },
        // Remote code execution
        { pattern: /curl\s+.*\|\s*(?:sudo\s+)?(?:ba)?sh/, label: "curl pipe to shell" },
        { pattern: /wget\s+.*\|\s*(?:sudo\s+)?(?:ba)?sh/, label: "wget pipe to shell" },
        { pattern: /base64\s+.*\|\s*(?:ba)?sh/, label: "base64 pipe to shell" },
        // Container escape (SEC-02)
        { pattern: /\bdocker\s+run\b/, label: "docker run (container escape)" },
        { pattern: /\bdocker\s+exec\b.*\bveist\b/, label: "docker exec on veist" },
        // Data exfiltration
        { pattern: /\benv\b.*\bcurl\b/, label: "env exfiltration via curl" },
        { pattern: /\benv\b.*\bwget\b/, label: "env exfiltration via wget" },
        { pattern: /\/proc\/self\/environ/, label: "process env read" },
        // Secrets access
        { pattern: /cat\s+\/data\/secrets/, label: "secrets file read" },
        { pattern: /cat\s+\/data\/store/, label: "store file read" },
        // Interpreter escapes
        { pattern: /python[3]?\s+-c\s+.*(?:shutil|subprocess|os\.system)/, label: "python destructive command" },
        { pattern: /node\s+-e\s+.*(?:child_process|fs\.rm|fs\.unlink)/, label: "node destructive command" },
    ];

    for (const { pattern, label } of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
            return Promise.resolve(`🚫 BLOCKED: Command not allowed in sandbox mode (${label}). Use safer alternatives.`);
        }
    }

    // SEC-16: Only propagate safe env vars to agent sandbox — never leak secrets
    const SAFE_ENV_KEYS = new Set([
        "PATH", "HOME", "LANG", "LC_ALL", "TERM", "SHELL", "USER", "LOGNAME",
        "NODE_PATH", "NODE_ENV", "NPM_CONFIG_PREFIX", "NPM_CONFIG_CACHE",
        "TMPDIR", "TMP", "TEMP", "HOSTNAME", "SHLVL", "PWD",
    ]);
    const safeEnv: Record<string, string> = { HOME: "/root" };
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && (SAFE_ENV_KEYS.has(k) || k.startsWith("npm_"))) {
            safeEnv[k] = v;
        }
    }

    return new Promise((resolve) => {
        const proc = spawn("bash", ["-c", command], {
            cwd,
            env: safeEnv,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        // PERF-07: Cap output buffers at 256KB to prevent OOM on large outputs
        const MAX_OUTPUT = 256 * 1024;
        proc.stdout.on("data", (d) => { if (stdout.length < MAX_OUTPUT) stdout += d.toString(); });
        proc.stderr.on("data", (d) => { if (stderr.length < MAX_OUTPUT) stderr += d.toString(); });

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
export const DEFAULT_MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4";

export function getCurrentModel(): string {
    return DEFAULT_MODEL;
}

export async function runVeistAgent(options: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const actions: AgentAction[] = [];
    const maxTurns = options.maxTurns || 50;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxTokenBudget = options.maxTokenBudget || parseInt(process.env.MAX_TOKENS_PER_AGENT || "0") || 0;

    // Pre-flight check
    if (!process.env.OPENROUTER_API_KEY) {
        console.error("[Agent] ❌ OPENROUTER_API_KEY is not set!");
        return {
            success: false,
            actions: [],
            error: "OPENROUTER_API_KEY is not set.",
            durationMs: Date.now() - startTime,
            inputTokens: 0,
            outputTokens: 0,
        };
    }

    console.log(`[Agent] Starting in ${options.cwd} `);
    const finalModel = options.model || DEFAULT_MODEL;
    console.log(`[Agent] Model: ${finalModel}, Max turns: ${maxTurns}, Budget: ${maxTokenBudget || 'unlimited'}, Timeout: ${timeoutMs / 1000} s`);

    const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
    });
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Build full prompt
    let fullPromptText = options.prompt;
    if (options.appendPrompt) {
        fullPromptText += "\n\n--- CONTEXT ---\n" + options.appendPrompt;
    }

    const systemPrompt = options.systemPrompt || "You are a senior software engineer. Write clean, working code.";

    const initialContent: any[] = [
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

    // Conversation loop — stored in Anthropic-like format internally,
    // converted to OpenAI format in invokeModel()
    const messages: any[] = [
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
            const assistantContent: any[] = response.content;
            const toolResults: any[] = [];

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
                        const memPath = path.resolve(options.cwd, ".veist_memory.json");
                        const memStr = await fs.readFile(memPath, "utf-8").catch(() => "{}");
                        const mem = JSON.parse(memStr);
                        if (mem.dev_progress) {
                            progressHint = `\n\n📋 YOUR PROGRESS SO FAR: ${mem.dev_progress}\n⚠️ Do NOT recreate files that are already DONE. Continue from where you left off.`;
                        }
                    } catch {}

                    const summaryMsg: any = {
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
                ["git", ["config", "--global", "user.email", "veist@auto.dev"]],
                ["git", ["config", "--global", "user.name", "veist"]],
                ["git", ["remote", "set-url", "origin", authRemoteUrl]],
                ["git", ["add", "-A"]],
                ["git", ["commit", "-m", message]],
                // --force only on first push (authRemoteUrl = fresh repo with README conflict)
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
            ["git", ["config", "--global", "user.email", "veist@auto.dev"]],
            ["git", ["config", "--global", "user.name", "veist"]],
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

// ─── Unified OpenRouter Adapter ───

export async function invokeModel(
    model: string,
    systemPrompt: string,
    tools: any[],
    messages: any[],
    openRouterClient: OpenAI,
    abortSignal?: AbortSignal
): Promise<{
    stop_reason: string;
    content: any[];
    usage: { input_tokens: number; output_tokens: number };
}> {
    // Clean model name — remove any legacy prefix
    const actualModel = model.replace(/^openrouter\//, "");

    // Convert Anthropic-format tools to OpenAI function tools
    const openAiTools = tools.map((t: any) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }
    }));

    // Convert Anthropic-format messages to OpenAI format
    const openAiMessages: any[] = [];
    if (systemPrompt) {
        openAiMessages.push({ role: "system", content: systemPrompt });
    }

    for (const m of messages) {
        if (typeof m.content === "string") {
            openAiMessages.push({ role: m.role, content: m.content });
        } else if (Array.isArray(m.content)) {
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

    const response = await openRouterClient.chat.completions.create({
        model: actualModel,
        messages: openAiMessages as any,
        tools: openAiTools.length > 0 ? openAiTools as any : undefined,
    }, requestOptions);

    const choice = response.choices[0];
    const msg = choice.message;

    // Convert back to Anthropic-like format for internal consistency
    const contentBlocks: any[] = [];
    if (msg.content) {
        contentBlocks.push({ type: "text", text: msg.content });
    }

    if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
            // SEC-44: Safe parse of tool arguments to prevent crash on malformed response
            let parsedArgs: Record<string, unknown> = {};
            try {
                parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
                console.warn(`[Agent] ⚠️ Malformed tool arguments for ${tc.function.name}, using empty object`);
            }
            contentBlocks.push({
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
                input: parsedArgs
            });
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
}
