/**
 * VEIST Agent Types
 * Shared types used across the agent engine and orchestrator.
 */

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
}
