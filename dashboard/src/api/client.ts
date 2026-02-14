const API_BASE = import.meta.env.DEV ? '/api' : 'https://mcp.hach.dev';

// Auth Helper
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

export async function createPipeline(projectId: string, description: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
    };

    const res = await fetch(`${API_BASE}/pipeline/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId, description }),
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to create pipeline');
    return res.json();
}

export async function getPipeline(projectId: string) {
    const res = await fetch(`${API_BASE}/pipeline/${projectId}`, {
        headers: getAuthHeaders()
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to get pipeline');
    return res.json();
}

export async function getProjects() {
    const res = await fetch(`${API_BASE}/projects`, {
        headers: getAuthHeaders()
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to get projects');
    const data = await res.json();
    return data.projects || [];
}

export async function deleteProject(projectId: string) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error('Failed to delete project');
    return res.json();
}

export async function sendMessage(projectId: string, message: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
    };

    const res = await fetch(`${API_BASE}/pipeline/${projectId}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
}
