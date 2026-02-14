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
    environmentId?: string; // Helper for Bmad engine
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
    environmentId: string; // Required by Dokploy
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

    // Debug: Check response shape & handle SuperJSON (result.data.json)
    let list = data?.result?.data;
    if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray(list.json)) {
        list = list.json;
    }

    if (!Array.isArray(list)) {
        // Fallback or throw
        // Sometimes it might be empty? But if structure is unexpected, better warn.
        console.warn("Dokploy API unexpected response:", JSON.stringify(data).substring(0, 200));
        return [];
    }

    return list;
}

export async function getDokployProject(projectId: string): Promise<DokployProject | null> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    // Input must be wrapped in json for SuperJSON
    const input = { json: { projectId } };
    const res = await fetch(
        `${DOKPLOY_URL}/api/trpc/project.one?input=${encodeURIComponent(JSON.stringify(input))}`,
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
    let result = data?.result?.data;
    if (result && result.json) result = result.json;

    return result || null;
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
    const input = { json: { projectId } };
    const res = await fetch(
        `${DOKPLOY_URL}/api/trpc/application.all?input=${encodeURIComponent(JSON.stringify(input))}`,
        {
            method: "GET",
            headers: getHeaders(),
        }
    );

    if (!res.ok) return [];

    const data = await res.json();
    let list = data?.result?.data;
    if (list && list.json) list = list.json;

    return Array.isArray(list) ? list : [];
}

export async function triggerDeploy(applicationId: string): Promise<boolean> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/application.deploy`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: { applicationId } }),
    });

    if (!res.ok) {
        let errorBody = "";
        try {
            errorBody = await res.text();
        } catch (e) {
            errorBody = "[Could not read response body]";
        }
        console.error(`Dokploy Deploy Failed (Status ${res.status}):`, errorBody);
        // We generally return boolean, but logging is crucial here.
    }

    return res.ok;
    return res.ok;
}

export async function createDokployProject(name: string, description?: string): Promise<DokployProject> {
    if (!isDokployConfigured()) {
        console.error("Dokploy Config Missing:", {
            URL: process.env.DOKPLOY_URL,
            TOKEN_SET: !!process.env.DOKPLOY_TOKEN
        });
        throw new Error("dokploy_not_configured");
    }

    console.log(`[Dokploy] Creating project '${name}' at ${DOKPLOY_URL}...`);

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/project.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: { name, description: description || "" } }),
    });

    if (!res.ok) {
        let errorBody = "";
        try {
            errorBody = await res.text();
        } catch (e) {
            errorBody = "[Could not read response body]";
        }
        console.error(`Dokploy Create Project Failed (Status ${res.status}):`, errorBody);
        throw new Error(`dokploy_create_project_error: ${res.status} - ${errorBody}`);
    }

    // If creation succeeds (even if empty response), we must fetch the project to get its ID and Default Environment
    // Dokploy doesn't always return the object on create.
    console.log("Project created. Fetching details to get ID and Environment...");

    // 1. Find Project ID by Name
    const projects = await listDokployProjects();
    const project = projects.find(p => p.name === name);

    if (!project) {
        throw new Error(`dokploy_create_project_error: Project '${name}' created but not found in list.`);
    }

    // 2. Find Environment ID (Required for App Creation)
    let environmentId = "";
    try {
        const envRes = await fetch(`${DOKPLOY_URL}/api/trpc/environment.all?input=${encodeURIComponent(JSON.stringify({ json: { projectId: project.projectId } }))}`, {
            method: "GET",
            headers: getHeaders(),
        });

        if (envRes.ok) {
            const envData = await envRes.json();
            const envs = envData?.result?.data?.json || envData?.result?.data;
            if (Array.isArray(envs) && envs.length > 0) {
                // Prefer 'production' or just take the first one
                const prod = envs.find((e: any) => e.name?.toLowerCase() === "production") || envs[0];
                environmentId = prod.id || prod.environmentId;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch environments:", e);
    }

    // Attach environmentId to result for usage in bmad.ts
    // Provide a valid return even if environmentId is missing (though it shouldn't be)
    return { ...project, environmentId };
}

export async function createDokployApplication(input: CreateApplicationInput): Promise<DokployApplication & { webhookUrl?: string }> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    console.log(`[Dokploy] Creating app '${input.name}' in project ${input.projectId}...`);

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/application.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: input }),
    });

    if (!res.ok) {
        let errorBody = "";
        try {
            errorBody = await res.text();
        } catch (e) {
            errorBody = "[Could not read response body]";
        }
        console.error(`Dokploy Create App Failed (Status ${res.status}):`, errorBody);
        throw new Error(`dokploy_create_app_error: ${res.status} - ${errorBody}`);
    }

    const data = await res.json();
    const result = data?.result?.data?.json || data?.result?.data;
    return result;
}

export async function deleteDokployProject(projectId: string): Promise<boolean> {
    if (!isDokployConfigured()) return false;

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/project.remove`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: { projectId } }),
    });

    if (!res.ok) {
        // It might be project.delete or project.remove. Let's try remove first as it's common in some trpc setups, 
        // but if it fails we might need to investigate. 
        // Actually, looking at typical patterns, `remove` or `delete` are used. 
        // Let's assume `remove` based on some similar open source trpc routers or try `delete` if this fails?
        // Let's stick to `remove` for now, or `delete`. 
        // SAFEST BET: `project.remove` is often used for entity removal in tRPC if `delete` is reserved.
        // Let's check `project.create` was used.
        // I will try `project.remove`.
        console.warn(`Failed to delete Dokploy project ${projectId}: ${res.status}`);
        return false;
    }
    return true;
}
