import { AgentNode, type AgentNodeOptions } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import type { NodeTopology } from "../../types.js";

// --- DYNAMIC AGENT NODE ---
export class DynamicAgentNode extends AgentNode {
    private topology: NodeTopology;

    constructor(topology: NodeTopology) {
        super({
            id: topology.id,
            name: topology.description.slice(0, 30) + (topology.description.length > 30 ? "..." : ""),
            role: topology.role,
            emoji: topology.emoji,
            model: topology.model,
            dependencies: topology.dependencies.concat(["planner_setup_fake_dep"]), // We'll handle this in orchestrator
            maxTurns: 30, // Default dynamic turns
            allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir", "read_memory", "write_memory", "web_search", "fetch_url"]
        });
        
        // Remove the fake dependency, it's just to satisfy the constructor types temporarily if needed
        this.dependencies = topology.dependencies; 
        
        this.topology = topology;
    }

    protected getPrompt(context: NodeContext): string {
        return `Project Goal: "${context.pipeline.description}"
        
Your task: ${this.topology.description}

You are part of a swarm of automated agents. Your dependencies (agents that ran before you) should have completed their work.
Review the workspace using list_dir and read_file to see what exists.
Use bash to install dependencies if needed.
Accomplish your task according to your system prompt, then stop.`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return this.topology.systemPrompt;
    }

    protected processResult(output: string, context: NodeContext): any {
        return { success: true, output };
    }
}
