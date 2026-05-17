import type { Pipeline, PipelineEvent, PipelinePhase, AgentStatus } from "./types.js";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";

export function addPipelineEvent(
    emitter: EventEmitter,
    pipelines: Map<string, Pipeline>,
    id: string,
    role: string,
    emoji: string,
    action: string,
    type: PipelineEvent["type"] = "info"
) {
    const p = pipelines.get(id);
    if (!p) return;
    const e: PipelineEvent = {
        id: crypto.randomUUID(),
        pipelineId: id,
        timestamp: new Date().toISOString(),
        agentRole: role,
        agentEmoji: emoji,
        action,
        type
    };
    p.events.push(e);
    emitter.emit("event", e);
}

export function setAgentStatus(
    emitter: EventEmitter,
    pipelines: Map<string, Pipeline>,
    id: string,
    role: string,
    status: AgentStatus,
    action?: string
) {
    const p = pipelines.get(id);
    if (!p) return;
    const agent = p.agents.find(a => a.role === role);
    if (agent) {
        agent.status = status;
        if (action) agent.currentAction = action;
    }
    emitter.emit("agent-status", { pipelineId: id, role, status, action });
}

export function setPipelinePhase(
    emitter: EventEmitter,
    pipelines: Map<string, Pipeline>,
    id: string,
    phase: PipelinePhase,
    error?: string
) {
    const p = pipelines.get(id);
    if (!p) return;
    p.phase = phase;
    if (error) p.error = error;
    p.updatedAt = new Date().toISOString();
    emitter.emit("phase", { pipelineId: id, phase, error });
}

export function addTokenUsage(
    pipelines: Map<string, Pipeline>,
    id: string,
    result: { inputTokens?: number; outputTokens?: number }
) {
    const p = pipelines.get(id);
    if (!p) return;
    if (!p.tokenUsage) p.tokenUsage = { inputTokens: 0, outputTokens: 0 };
    p.tokenUsage.inputTokens += result.inputTokens || 0;
    p.tokenUsage.outputTokens += result.outputTokens || 0;
}

export function addAgentTokenUsage(
    pipelines: Map<string, Pipeline>,
    id: string,
    agentId: string,
    role: string,
    emoji: string,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
) {
    const p = pipelines.get(id);
    if (!p) return;
    if (!p.agentTokens) p.agentTokens = [];
    if (!p.tokenHistory) p.tokenHistory = [];

    // Calculate cost based on model pricing
    // OpenRouter pricing is per-token, Anthropic Sonnet 4.6 ~ $3/$15 per 1M
    let cost = 0;
    if (provider === "anthropic") {
        cost = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
    } else {
        // Try to load from cache
        try {
            // SEC-31: Use persistent /data/ volume, matching openrouter_models.ts
            const cachePath = path.join(path.dirname(process.env.STORE_PATH || '/data/store.json'), '.openrouter_cache.json');
            if (fs.existsSync(cachePath)) {
                const models = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                const m = models.find((mod: any) => model.replace('openrouter/', '').includes(mod.id) || mod.id.includes(model.replace('openrouter/', '')));
                if (m) {
                    cost = inputTokens * m.pricing.prompt + outputTokens * m.pricing.completion;
                }
            }
        } catch { /* fallback to 0 */ }
    }

    const record = {
        agentId,
        role,
        emoji,
        provider,
        model: model.replace('openrouter/', ''),
        inputTokens,
        outputTokens,
        cost,
        timestamp: new Date().toISOString()
    };

    p.agentTokens.push(record);
    p.tokenHistory.push({
        timestamp: record.timestamp,
        tokens: inputTokens + outputTokens,
        agentRole: role
    });
}
