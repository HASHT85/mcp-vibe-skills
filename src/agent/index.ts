/**
 * VEIST Agent Engine — Main runner
 * Uses OpenRouter (OpenAI-compatible) for multi-model agentic coding.
 * Supports all models available on OpenRouter (Claude, GPT, Gemini, DeepSeek, etc.)
 *
 * NOTE: This module was refactored from the monolithic agent_engine.ts.
 * Tools → src/tools/  |  OpenRouter adapter → src/agent/openrouter.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

import { invokeModel, createOpenRouterClient } from "./openrouter.js";
import { executeTool, TOOLS } from "../tools/executor.js";
import type { AgentAction, AgentResult, AgentOptions } from "./types.js";

// ─── Event Emitter for live streaming ───

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

// ─── Constants ───

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4";

export function getCurrentModel(): string {
    return DEFAULT_MODEL;
}

// ─── Main Agent Runner ───

export async function runVeistAgent(options: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const actions: AgentAction[] = [];
    const maxTurns = options.maxTurns || 50;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxTokenBudget =
        options.maxTokenBudget || parseInt(process.env.MAX_TOKENS_PER_AGENT || "0") || 0;

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
    console.log(
        `[Agent] Model: ${finalModel}, Max turns: ${maxTurns}, Budget: ${maxTokenBudget || "unlimited"}, Timeout: ${timeoutMs / 1000} s`
    );

    const client = createOpenRouterClient();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Build full prompt
    let fullPromptText = options.prompt;
    if (options.appendPrompt) {
        fullPromptText += "\n\n--- CONTEXT ---\n" + options.appendPrompt;
    }

    const systemPrompt =
        options.systemPrompt || "You are a senior software engineer. Write clean, working code.";

    const initialContent: any[] = [{ type: "text", text: fullPromptText }];

    if (options.attachedFiles && options.attachedFiles.length > 0) {
        for (const file of options.attachedFiles) {
            const isImage = file.type.startsWith("image/");
            if (isImage) {
                initialContent.push({
                    type: "image",
                    source: { type: "base64", media_type: file.type as any, data: file.base64 },
                });
                console.log(`[Agent] 📎 Attached Image: ${file.type} `);
            } else if (file.type === "application/pdf") {
                initialContent.push({
                    type: "document",
                    source: { type: "base64", media_type: "application/pdf", data: file.base64 },
                });
                console.log(`[Agent] 📎 Attached Document: PDF`);
            }
        }
    }

    // Conversation loop — stored in Anthropic-like format internally,
    // converted to OpenAI format in invokeModel()
    const messages: any[] = [{ role: "user", content: initialContent }];

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                console.log(`[Agent] ⏱️ Timeout after ${turn} turns`);
                break;
            }

            // Check token budget
            if (maxTokenBudget > 0 && totalInputTokens >= maxTokenBudget) {
                console.log(
                    `[Agent] 💰 Token budget exhausted: ${totalInputTokens}/${maxTokenBudget} input tokens after ${turn} turns`
                );
                break;
            }

            console.log(`[Agent] Turn ${turn + 1} `);

            const fullSystemPrompt =
                systemPrompt +
                "\n\nRÈGLES ABSOLUES: Ne crée JAMAIS de fichiers de documentation (.md), de tests, de rapports ou de scripts de validation. Concentre-toi uniquement sur le code fonctionnel demandé. Sois concis dans tes réponses textuelles.";

            const response = await invokeModel(
                finalModel,
                fullSystemPrompt,
                TOOLS,
                messages,
                client,
                options.abortSignal
            );

            console.log(
                `[Agent] Response: stop_reason = ${response.stop_reason}, ${response.content.length} blocks, tokens: ${response.usage.input_tokens}in/${response.usage.output_tokens}out`
            );

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
                    console.log(
                        `[Agent] 🔧 Tool: ${block.name} → ${JSON.stringify(block.input).substring(0, 100)}`
                    );

                    // Execute tool
                    const result = await executeTool(
                        block.name,
                        block.input as Record<string, any>,
                        options.cwd
                    );

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
                    } catch {
                        // ignore
                    }

                    const summaryMsg: any = {
                        role: "user",
                        content: `[SYSTEM: ${droppedCount} earlier message(s) were trimmed to save context. Do NOT re-read or re-create files you already processed. Focus on WRITING new code and making progress.${progressHint}]`,
                    };
                    messages.length = 0;
                    messages.push(initial, summaryMsg, ...tail);
                }
            } else {
                break;
            }
        }

        const finalResult = actions
            .filter((a) => a.type === "text" || a.type === "result")
            .map((a) => a.content)
            .join("\n");

        const result: AgentResult = {
            success: true,
            actions,
            finalResult: finalResult || undefined,
            durationMs: Date.now() - startTime,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
        };

        console.log(
            `[Agent] Done in ${result.durationMs}ms, ${actions.length} actions, tokens: ${totalInputTokens}in/${totalOutputTokens}out`
        );
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
