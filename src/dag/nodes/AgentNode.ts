import { DagNode, type NodeContext } from "../Node.js";
import { runClaudeAgent } from "../../claude_code.js";

export interface AgentNodeOptions {
    id: string;
    name: string;
    role: string; // The UI display role (e.g. "Architect", "Developer")
    emoji: string;
    dependencies?: string[];
    model?: string;
    allowedTools: string[];
    maxTurns?: number;
}

export abstract class AgentNode extends DagNode {
    protected role: string;
    protected emoji: string;
    protected model?: string;
    protected allowedTools: string[];
    protected maxTurns: number;

    constructor(options: AgentNodeOptions) {
        super(options.id, options.name, options.dependencies || []);
        this.role = options.role;
        this.emoji = options.emoji;
        this.model = options.model;
        this.allowedTools = options.allowedTools;
        this.maxTurns = options.maxTurns || 150;
    }

    protected abstract getPrompt(context: NodeContext): string;
    protected abstract getSystemPrompt(context: NodeContext): string;

    async execute(context: NodeContext): Promise<any> {
        context.updateAgentStatus(this.role, "active", this.name);
        context.addEvent(this.role, this.emoji, `Début : ${this.name}`, "info");

        const result = await runClaudeAgent({
            model: this.model || context.pipeline.model,
            prompt: this.getPrompt(context),
            systemPrompt: this.getSystemPrompt(context),
            cwd: context.workspace,
            allowedTools: this.allowedTools,
            maxTurns: this.maxTurns,
            abortSignal: undefined, // Handled roughly by context.checkAbort if we had a way to pass signal
        });

        if (!result.success) {
            context.updateAgentStatus(this.role, "error", `Erreur: ${result.error}`);
            context.addEvent(this.role, this.emoji, `Échec : ${result.error}`, "error");
            throw new Error(result.error);
        }

        context.updateAgentStatus(this.role, "done", "Terminé");
        context.addEvent(this.role, this.emoji, `✓ Terminé (Tokens: ${result.inputTokens} in / ${result.outputTokens} out)`, "success");

        // Keep track of tokens (pipeline-level)
        if (!context.pipeline.tokenUsage) {
            context.pipeline.tokenUsage = { inputTokens: 0, outputTokens: 0 };
        }
        context.pipeline.tokenUsage.inputTokens += result.inputTokens;
        context.pipeline.tokenUsage.outputTokens += result.outputTokens;

        // Per-agent token tracking
        if (!context.pipeline.agentTokens) context.pipeline.agentTokens = [];
        if (!context.pipeline.tokenHistory) context.pipeline.tokenHistory = [];

        const modelName = this.model || context.pipeline.model || 'unknown';
        const provider = 'openrouter';

        // Calculate cost from OpenRouter pricing cache
        let cost = 0;
        try {
            const fs = require('fs');
            const path = require('path');
            const cachePath = path.join(process.cwd(), '.openrouter_cache.json');
            if (fs.existsSync(cachePath)) {
                const models = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                const m = models.find((mod: any) => modelName.includes(mod.id) || mod.id.includes(modelName));
                if (m) {
                    cost = result.inputTokens * m.pricing.prompt + result.outputTokens * m.pricing.completion;
                }
            }
        } catch { /* fallback: cost stays 0 */ }

        context.pipeline.agentTokens.push({
            agentId: this.id,
            role: this.role,
            emoji: this.emoji,
            provider,
            model: modelName,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cost,
            timestamp: new Date().toISOString()
        });

        context.pipeline.tokenHistory.push({
            timestamp: new Date().toISOString(),
            tokens: result.inputTokens + result.outputTokens,
            agentRole: this.role
        });

        return this.processResult(result.finalResult || "", context);
    }

    protected processResult(output: string, context: NodeContext): any {
        return output;
    }
}
