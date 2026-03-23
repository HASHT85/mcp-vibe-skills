export type PipelinePhase =
    | "QUEUED"
    | "ANALYSIS"
    | "ARCHITECTURE"
    | "SCAFFOLD"
    | "DEPLOYING"
    | "DEVELOPMENT"
    | "DEBUGGING"
    | "QA"
    | "COMPLETED"
    | "FAILED"
    | "PAUSED";

export type ProjectType = "static" | "spa" | "fullstack" | "api" | "python-worker" | "node-worker" | "postgres" | "redis" | "unknown";

export type ProjectService = {
    name: string;
    type: ProjectType;
    stack?: string;
};

export type AgentStatus = "waiting" | "active" | "done" | "error";

export type PipelineAgent = {
    role: string;
    emoji: string;
    status: AgentStatus;
    currentAction?: string;
    startedAt?: string;
    completedAt?: string;
    output?: string;
};

export type PipelineEvent = {
    id: string;
    pipelineId: string;
    timestamp: string;
    agentRole: string;
    agentEmoji: string;
    action: string;
    type: "info" | "success" | "error" | "warning" | "deploy";
};

export type NodeTopology = {
    id: string;
    role: string;
    emoji: string;
    description: string;
    systemPrompt: string;
    dependencies: string[];
    provider?: string; // always "openrouter" — kept for backward compat
    model?: string;
};

export type ModifyRun = {
    id: string;              // "mod_1", "mod_2", etc.
    instructions: string;    // Short summary of what was requested
    startedAt: string;
    topology: NodeTopology[];
    agents: PipelineAgent[];
    nodeStatuses: Record<string, 'COMPLETED' | 'FAILED' | 'PENDING'>;
    phase: PipelinePhase;
};

export type AgentTokenRecord = {
    agentId: string;
    role: string;
    emoji: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    timestamp: string;
};

export type Pipeline = {
    id: string;
    name: string;
    description: string;
    phase: PipelinePhase;
    progress: number;
    services: ProjectService[];
    agents: PipelineAgent[];
    events: PipelineEvent[];
    workspace: string;
    model?: string;
    github?: {
        owner: string;
        repo: string;
        url: string;
    };
    sourceGithubUrl?: string;
    topology?: NodeTopology[];
    modifyRuns?: ModifyRun[];
    nodeStatuses?: Record<string, "COMPLETED" | "FAILED" | "PENDING">;
    artifacts: Record<string, unknown>;
    tokenUsage: { inputTokens: number; outputTokens: number };
    agentTokens: AgentTokenRecord[];
    tokenHistory: { timestamp: string; tokens: number; agentRole?: string }[];
    createdAt: string;
    updatedAt: string;
    error?: string;
    dokploy?: { applicationId?: string; url?: string };
    projectType?: string;
    templateId?: string;
};
