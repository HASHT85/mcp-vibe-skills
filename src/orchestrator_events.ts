import type { Pipeline, PipelineEvent, PipelinePhase, AgentStatus } from "./types.js";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";

export function addPipelineEvent(
    emitter: EventEmitter,
    pipelines: Map<string, Pipeline>,
    id: string,
    role: string,
    emoji: string,
    action: string,
    type: "info" | "success" | "warning" | "error" = "info"
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
    // @ts-ignore
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
    // @ts-ignore
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
    // @ts-ignore
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
