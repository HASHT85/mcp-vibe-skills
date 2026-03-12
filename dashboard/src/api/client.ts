const API_BASE = import.meta.env.DEV ? '/api' : 'https://api.veist.hach.dev';

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

export async function launchIdea(description: string, name?: string, model?: string, files?: { base64: string; type: string }[]) {
    return api<{ pipeline: Pipeline }>('/pipeline/launch', {
        method: 'POST',
        body: JSON.stringify({ description, name, model, files }),
    });
}

export async function listPipelines() {
    return api<{ pipelines: Pipeline[] }>('/pipeline/list');
}

export async function getPipelineStatus(id: string) {
    return api<{ pipeline: Pipeline }>(`/pipeline/${id}/status`);
}

export async function getPipeline(id: string) {
    return api<{ pipeline: Pipeline }>(`/pipeline/${id}`);
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
    let es: EventSource | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
        if (closed) return;
        const auth = localStorage.getItem('vibe_auth');
        const url = `${API_BASE}/pipeline/events/all${auth ? `?auth=${btoa(auth)}` : ''}`;
        es = new EventSource(url);

        es.onopen = () => {
            console.log('[SSE] Connected to live events');
        };

        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                onEvent(data);
            } catch { /* skip */ }
        };

        es.onerror = () => {
            console.warn('[SSE] Connection lost, reconnecting in 3s...');
            es?.close();
            if (!closed) {
                reconnectTimer = setTimeout(connect, 3000);
            }
        };
    }

    connect();

    return () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        es?.close();
    };
}

export async function modifyPipeline(id: string, instructions: string, model?: string, files?: { base64: string; type: string }[]) {
    return api<{ pipeline: Pipeline }>(`/pipeline/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ instructions, model, files }),
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

export type NodeTopology = {
    id: string;
    role: string;
    emoji: string;
    description: string;
    dependencies: string[];
    systemPrompt: string;
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
    topology?: NodeTopology[];
    artifacts: Record<string, unknown>;
    tokenUsage?: { inputTokens: number; outputTokens: number };
    createdAt: string;
    updatedAt?: string;
    error?: string;
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

// ─── 📂 Repo Context ───

export async function getRepoContext(pipelineId: string): Promise<string> {
    try {
        const data = await api<{ context: string }>(`/pipeline/${pipelineId}/repo-context`);
        return data.context || '';
    } catch {
        return '';
    }
}

// ─── 🐳 Container Management ───

export type Container = {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    created: string;
    url: string | null;
};

export async function listContainers() {
    return api<{ containers: Container[] }>('/containers');
}

export async function stopContainer(name: string) {
    return api('/containers/' + name + '/stop', { method: 'POST' });
}

export async function startContainer(name: string) {
    return api('/containers/' + name + '/start', { method: 'POST' });
}

export async function restartContainer(name: string) {
    return api('/containers/' + name + '/restart', { method: 'POST' });
}

export async function deleteContainer(name: string) {
    return api('/containers/' + name, { method: 'DELETE' });
}

export async function getContainerLogs(name: string, lines = 100) {
    return api<{ logs: string }>(`/containers/${name}/logs?lines=${lines}`);
}

// ─── 🔄 Pipeline Retry ───

export async function retryPipeline(id: string) {
    return api<{ pipeline: Pipeline; retriedFrom: string }>(`/pipeline/${id}/retry`, {
        method: 'POST',
    });
}

// ─── 🔐 Secrets Vault ───

export async function saveSecrets(pipelineId: string, secrets: Record<string, string>) {
    return api<{ ok: boolean; count: number }>(`/pipeline/${pipelineId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ secrets }),
    });
}

export async function getSecrets(pipelineId: string) {
    return api<{ secrets: Record<string, string> }>(`/pipeline/${pipelineId}/secrets`);
}

// ─── 💬 Chat Mode ───

export type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
};

export type ChatSession = {
    id: string;
    model: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
};

export async function createChatSession(model?: string) {
    return api<{ session: ChatSession }>('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ model }),
    });
}

export async function sendChatMessage(sessionId: string, content: string, files?: { base64: string; type: string }[]) {
    return api<{ reply: string; session: ChatSession }>(`/chat/sessions/${sessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({ content, files }),
    });
}

export async function getChatSession(sessionId: string) {
    return api<{ session: ChatSession }>(`/chat/sessions/${sessionId}`);
}

export async function listChatSessions() {
    return api<{ sessions: ChatSession[] }>('/chat/sessions');
}

export async function launchFromChat(sessionId: string, name?: string) {
    return api<{ pipeline: Pipeline; brief: any }>(`/chat/sessions/${sessionId}/launch`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

export async function deleteChatSession(sessionId: string) {
    return api('/chat/sessions/' + sessionId, { method: 'DELETE' });
}
