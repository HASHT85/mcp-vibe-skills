/**
 * VEIST OpenRouter Adapter — Unified model invocation via OpenAI SDK.
 * Converts between Anthropic-like internal format and OpenAI-compatible API.
 */

import OpenAI from "openai";

export type ModelResponse = {
    stop_reason: string;
    content: any[];
    usage: { input_tokens: number; output_tokens: number };
};

export function createOpenRouterClient(): OpenAI {
    return new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
    });
}

export async function invokeModel(
    model: string,
    systemPrompt: string,
    tools: any[],
    messages: any[],
    openRouterClient: OpenAI,
    abortSignal?: AbortSignal
): Promise<ModelResponse> {
    // Clean model name — remove any legacy prefix
    const actualModel = model.replace(/^openrouter\//, "");

    // Convert Anthropic-format tools to OpenAI function tools
    const openAiTools = tools.map((t: any) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
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
                            arguments: JSON.stringify(block.input),
                        },
                    });
                }
                if (block.type === "tool_result") {
                    openAiMessages.push({
                        role: "tool",
                        tool_call_id: block.tool_use_id,
                        content: String(block.content),
                    });
                }
            }

            if (m.role === "assistant") {
                if (textContent || toolCalls.length > 0) {
                    openAiMessages.push({
                        role: "assistant",
                        content: textContent || null,
                        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
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

    const response = await openRouterClient.chat.completions.create(
        {
            model: actualModel,
            messages: openAiMessages as any,
            tools: openAiTools.length > 0 ? (openAiTools as any) : undefined,
        },
        requestOptions
    );

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
                input: parsedArgs,
            });
        }
    }

    return {
        stop_reason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
        content: contentBlocks,
        usage: {
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0,
        },
    };
}
