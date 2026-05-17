import { EventEmitter } from "node:events";
import type { Pipeline, PipelineEvent, PipelineAgent } from "../types.js";

export type NodeStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export interface NodeContext {
    pipeline: Pipeline;
    workspace: string;
    addEvent: (agentRole: string, emoji: string, action: string, type: PipelineEvent["type"]) => void;
    updateAgentStatus: (role: string, status: PipelineAgent["status"], action?: string) => void;
    checkAbort: () => boolean;
}

export abstract class DagNode {
    public id: string;
    public name: string;
    public dependencies: string[] = [];
    public status: NodeStatus = "PENDING";
    public error?: Error;
    public result?: any;

    constructor(id: string, name: string, dependencies: string[] = []) {
        this.id = id;
        this.name = name;
        this.dependencies = dependencies;
    }

    abstract execute(context: NodeContext): Promise<any>;

    public reset() {
        this.status = "PENDING";
        this.error = undefined;
        this.result = undefined;
    }
}
