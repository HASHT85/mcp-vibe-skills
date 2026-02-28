const API_BASE = import.meta.env.DEV ? '/api' : 'https://mcp.hach.dev';

// ─── Auth ───

const getAuthHeaders = (): Record<string, string> => {
    const auth = localStorage.getItem('vibe_auth');
    if (auth) {
        return { 'Authorization': `Basic ${btoa(auth)}` };
    }
    return {};
};

export function setAuth(user: string, pass: string) {
    localStorage.setItem('vibe_auth', `${user}:${pass}`);
}

export function checkAuth() {
    return !!localStorage.getItem('vibe_auth');
}

// ─── API Fetch Helper ───

async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...(options?.headers || {}),
        },
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// ─── Pipeline (Orchestrator) ───

export async function launchIdea(description: string, name?: string, files?: { base64: string; type: string }[]) {
    return api<{ pipeline: Pipeline }>('/pipeline/launch', {
        method: 'POST',
        body: JSON.stringify({ description, name, files }),
    });
}

export async function listPipelines() {
    return api<{ pipelines: Pipeline[] }>('/pipeline/list');
}

export async function getPipelineStatus(id: string) {
    return api<{ pipeline: Pipeline }>(`/pipeline/${id}/status`);
}

export async function pausePipeline(id: string) {
    return api('/pipeline/' + id + '/pause', { method: 'POST' });
}

export async function resumePipeline(id: string) {
    return api('/pipeline/' + id + '/resume', { method: 'POST' });
}

export async function killPipeline(id: string) {
    return api('/pipeline/' + id + '/kill', { method: 'POST' });
}

export async function deletePipeline(id: string) {
    return api('/pipeline/' + id, { method: 'DELETE' });
}

// ─── SSE (Server-Sent Events) ───

export function connectPipelineSSE(id: string, onEvent: (event: PipelineEvent) => void): () => void {
    const auth = localStorage.getItem('vibe_auth');
    const url = `${API_BASE}/pipeline/${id}/events${auth ? `?auth=${btoa(auth)}` : ''}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            onEvent(data);
        } catch { /* skip */ }
    };

    es.onerror = () => {
        // Auto-reconnect after 3s
        setTimeout(() => {
            es.close();
            connectPipelineSSE(id, onEvent);
        }, 3000);
    };

    return () => es.close();
}

export function connectAllSSE(onEvent: (event: PipelineEvent) => void): () => void {
    const auth = localStorage.getItem('vibe_auth');
    const url = `${API_BASE}/pipeline/events/all${auth ? `?auth=${btoa(auth)}` : ''}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            onEvent(data);
        } catch { /* skip */ }
    };

    return () => es.close();
}

export async function modifyPipeline(id: string, instructions: string, files?: { base64: string; type: string }[]) {
    return api<{ pipeline: Pipeline }>(`/pipeline/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ instructions, files }),
    });
}

// ─── Legacy ───

export async function getProjects() {
    const data = await api<{ projects: Project[] }>('/projects');
    return data.projects || [];
}

export async function deleteProject(projectId: string) {
    return api('/projects/' + projectId, { method: 'DELETE' });
}

// ─── Types ───

export type AgentStatus = 'waiting' | 'active' | 'done' | 'error';

export type PipelineAgent = {
    role: string;
    emoji: string;
    status: AgentStatus;
    currentAction?: string;
    startedAt?: string;
    completedAt?: string;
};

export type PipelineEvent = {
    id: string;
    pipelineId: string;
    timestamp: string;
    agentRole: string;
    agentEmoji: string;
    action: string;
    type: 'info' | 'success' | 'error' | 'warning' | 'deploy';
};

export type Pipeline = {
    id: string;
    name: string;
    description: string;
    phase: string;
    progress: number;
    agents: PipelineAgent[];
    events: PipelineEvent[];
    projectType?: string;
    github?: {
        owner: string;
        repo: string;
        url: string;
    };
    dokploy?: {
        projectId: string;
        applicationId: string;
        url?: string;
    };
    createdAt: string;
    updatedAt?: string;
    error?: string;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
    };
};

export type Project = {
    id: string;
    name: string;
    description: string;
    phase: string;
    progress: number;
    agents: PipelineAgent[];
    type: string;
    createdAt: string;
    github?: Pipeline['github'];
    dokploy?: Pipeline['dokploy'];
};
