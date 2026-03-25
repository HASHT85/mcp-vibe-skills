/**
 * Middleware Chain — Agent Execution Hooks (DeerFlow Pattern)
 * 
 * Provides modular pre/post processing around Claude agent calls.
 * Inspired by DeerFlow's agents/middlewares/ system.
 * 
 * Built-in middlewares:
 * - MemoryMiddleware: injects memory context, queues outputs for extraction
 * - LoopDetectionMiddleware: detects agent stuck loops
 * - TokenTrackingMiddleware: tracks and logs token usage
 */

import { getMemoryService } from "./memory_service.js";

// ─── Types ───

export interface AgentCallContext {
    pipelineId: string;
    nodeId: string;
    prompt: string;
    systemPrompt: string;
    model?: string;
    cwd?: string;
    [key: string]: any; // extensible
}

export interface AgentCallResult {
    success: boolean;
    output?: string;
    error?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    [key: string]: any;
}

export interface Middleware {
    name: string;
    /** Modify context before agent call (e.g., inject memory into prompt) */
    beforeAgent?(context: AgentCallContext): Promise<AgentCallContext>;
    /** Process result after agent call (e.g., extract facts, detect loops) */
    afterAgent?(context: AgentCallContext, result: AgentCallResult): Promise<AgentCallResult>;
}

// ─── Middleware Chain Runner ───

export class MiddlewareChain {
    private middlewares: Middleware[] = [];

    use(middleware: Middleware): this {
        this.middlewares.push(middleware);
        console.log(`⚙️ [Middleware] Registered: ${middleware.name}`);
        return this;
    }

    async runBefore(context: AgentCallContext): Promise<AgentCallContext> {
        let ctx = { ...context };
        for (const mw of this.middlewares) {
            if (mw.beforeAgent) {
                try {
                    ctx = await mw.beforeAgent(ctx);
                } catch (err) {
                    console.error(`⚙️ [Middleware:${mw.name}] beforeAgent error:`, err);
                }
            }
        }
        return ctx;
    }

    async runAfter(context: AgentCallContext, result: AgentCallResult): Promise<AgentCallResult> {
        let res = { ...result };
        for (const mw of this.middlewares) {
            if (mw.afterAgent) {
                try {
                    res = await mw.afterAgent(context, res);
                } catch (err) {
                    console.error(`⚙️ [Middleware:${mw.name}] afterAgent error:`, err);
                }
            }
        }
        return res;
    }
}

// ─── Built-in: Memory Middleware ───

export const MemoryMiddleware: Middleware = {
    name: "Memory",

    async beforeAgent(context: AgentCallContext): Promise<AgentCallContext> {
        try {
            const memory = getMemoryService();
            const memoryBlock = memory.buildMemoryBlock();
            if (memoryBlock) {
                context.systemPrompt = context.systemPrompt + memoryBlock;
                console.log(`⚙️ [Middleware:Memory] Injected memory context (${memoryBlock.length} chars)`);
            }
        } catch (err) {
            console.warn("⚙️ [Middleware:Memory] Failed to inject memory:", err);
        }
        return context;
    },

    async afterAgent(context: AgentCallContext, result: AgentCallResult): Promise<AgentCallResult> {
        // Queue the agent interaction for memory extraction
        if (result.success && result.output) {
            try {
                const memory = getMemoryService();
                memory.queueConversation(`pipeline:${context.pipelineId}:${context.nodeId}`, [
                    { role: "user", content: context.prompt },
                    { role: "assistant", content: result.output.slice(0, 2000) },
                ]);
            } catch (err) {
                console.warn("⚙️ [Middleware:Memory] Failed to queue for extraction:", err);
            }
        }
        return result;
    },
};

// ─── Built-in: Loop Detection Middleware ───

const loopHistories = new Map<string, string[]>();

export const LoopDetectionMiddleware: Middleware = {
    name: "LoopDetection",

    async afterAgent(context: AgentCallContext, result: AgentCallResult): Promise<AgentCallResult> {
        if (!result.success || !result.output) return result;

        const key = `${context.pipelineId}:${context.nodeId}`;
        const history = loopHistories.get(key) || [];

        // Fingerprint: first 200 chars of output
        const fingerprint = result.output.slice(0, 200).trim().toLowerCase();
        history.push(fingerprint);

        // Keep only last 5
        if (history.length > 5) history.shift();
        loopHistories.set(key, history);

        // Detect: same fingerprint 3+ times in a row
        if (history.length >= 3) {
            const last3 = history.slice(-3);
            if (last3.every(h => h === last3[0])) {
                console.warn(`⚙️ [Middleware:LoopDetection] Agent stuck loop detected for ${key}!`);
                result.output += "\n\n⚠️ [LOOP DETECTED] Agent appears to be repeating the same output. Consider different approach.";
            }
        }

        return result;
    },
};

// ─── Built-in: Token Tracking Middleware ───

const tokenTotals = new Map<string, { input: number; output: number }>();

export const TokenTrackingMiddleware: Middleware = {
    name: "TokenTracking",

    async afterAgent(context: AgentCallContext, result: AgentCallResult): Promise<AgentCallResult> {
        const usage = result.usage;
        if (usage) {
            const key = context.pipelineId;
            const prev = tokenTotals.get(key) || { input: 0, output: 0 };
            prev.input += usage.input_tokens || 0;
            prev.output += usage.output_tokens || 0;
            tokenTotals.set(key, prev);
            console.log(`⚙️ [Middleware:TokenTracking] Pipeline ${key} node ${context.nodeId}: +${usage.input_tokens || 0}in +${usage.output_tokens || 0}out (total: ${prev.input}in/${prev.output}out)`);
        }
        return result;
    },
};

// ─── Default Chain ───

let _defaultChain: MiddlewareChain | null = null;

export function getDefaultMiddlewareChain(): MiddlewareChain {
    if (!_defaultChain) {
        _defaultChain = new MiddlewareChain()
            .use(MemoryMiddleware)
            .use(LoopDetectionMiddleware)
            .use(TokenTrackingMiddleware);
    }
    return _defaultChain;
}

export function getTokenTotals(pipelineId: string): { input: number; output: number } | undefined {
    return tokenTotals.get(pipelineId);
}
