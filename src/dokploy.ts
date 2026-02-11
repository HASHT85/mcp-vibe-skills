/**
 * Dokploy API Client
 * Connects to Dokploy to manage projects and deployments
 */

export type DokployProject = {
    projectId: string;
    name: string;
    description?: string;
    createdAt: string;
    adminId: string;
};

export type DokployApplication = {
    applicationId: string;
    name: string;
    appName: string;
    projectId: string;
    applicationStatus: string;
    createdAt: string;
};

export type CreateApplicationInput = {
    name: string;
    projectId: string;
    description?: string;
    repository?: string;
    branch?: string;
    buildType?: "dockerfile" | "heroku_buildpacks" | "nixpacks";
    env?: string;
};

const DOKPLOY_URL = process.env.DOKPLOY_URL || "";
const DOKPLOY_TOKEN = process.env.DOKPLOY_TOKEN || "";

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "x-api-key": DOKPLOY_TOKEN,
    };
}

export function isDokployConfigured(): boolean {
    return Boolean(DOKPLOY_URL && DOKPLOY_TOKEN);
}

export async function listDokployProjects(): Promise<DokployProject[]> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/project.all`, {
        method: "GET",
        headers: getHeaders(),
    });

    if (!res.ok) {
        throw new Error(`dokploy_api_error: ${res.status}`);
    }

    const data = await res.json();
    // tRPC returns { result: { data: [...] } }
    return data?.result?.data || [];
}

export async function getDokployProject(projectId: string): Promise<DokployProject | null> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    const res = await fetch(
        `${DOKPLOY_URL}/api/trpc/project.one?input=${encodeURIComponent(JSON.stringify({ projectId }))}`,
        {
            method: "GET",
            headers: getHeaders(),
        }
    );

    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`dokploy_api_error: ${res.status}`);
    }

    const data = await res.json();
    return data?.result?.data || null;
}

export async function listDokployApplications(projectId: string): Promise<DokployApplication[]> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    // Get project with applications
    const project = await getDokployProject(projectId);
    if (!project) return [];

    // Applications are typically nested in project response
    // or fetched via application.all with filter
    const res = await fetch(
        `${DOKPLOY_URL}/api/trpc/application.all?input=${encodeURIComponent(JSON.stringify({ projectId }))}`,
        {
            method: "GET",
            headers: getHeaders(),
        }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return data?.result?.data || [];
}

export async function triggerDeploy(applicationId: string): Promise<boolean> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/application.deploy`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ applicationId }),
    });

    return res.ok;
    return res.ok;
}

export async function createDokployProject(name: string, description?: string): Promise<DokployProject> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/project.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, description }),
    });

    if (!res.ok) throw new Error(`dokploy_create_project_error: ${res.status}`);
    const data = await res.json();
    return data?.result?.data;
}

export async function createDokployApplication(input: CreateApplicationInput): Promise<DokployApplication & { webhookUrl?: string }> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/application.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(input),
    });

    if (!res.ok) throw new Error(`dokploy_create_app_error: ${res.status}`);
    const data = await res.json();
    return data?.result?.data;
}
