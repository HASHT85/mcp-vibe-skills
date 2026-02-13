const API_BASE = import.meta.env.DEV ? '/api' : 'https://mcp.hach.dev';

export async function createPipeline(projectId: string, description: string) {
    const res = await fetch(`${API_BASE}/pipeline/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, description }),
    });
    if (!res.ok) throw new Error('Failed to create pipeline');
    return res.json();
}

export async function getPipeline(projectId: string) {
    const res = await fetch(`${API_BASE}/pipeline/${projectId}`);
    if (!res.ok) throw new Error('Failed to get pipeline');
    return res.json();
}

export async function getProjects() {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to get projects');
    const data = await res.json();
    return data.projects || [];
}

export async function sendMessage(projectId: string, message: string) {
    const res = await fetch(`${API_BASE}/pipeline/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
}
