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
    repository?: string; // Full URL
    owner?: string; // Repo owner (required for github provider)
    repo?: string; // Repo name (required for github provider)
    branch?: string;
    buildType?: "dockerfile" | "heroku_buildpacks" | "nixpacks";
    env?: string;
    environmentId: string; // Required by Dokploy
    provider?: "git" | "github" | "gitlab" | "bitbucket" | "docker";
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

export async function getDokployUser(): Promise<any> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    // Try multiple endpoints to find the user
    const endpoints = [
        `${DOKPLOY_URL}/api/trpc/user.get`,
        `${DOKPLOY_URL}/api/trpc/auth.get`,
        `${DOKPLOY_URL}/api/trpc/user.one`,
        `${DOKPLOY_URL}/api/trpc/settings.get`,
        `${DOKPLOY_URL}/api/trpc/admin.get`,
    ];

    for (const url of endpoints) {
        try {
            console.log(`[Dokploy] Fetching user details from ${url}...`);
            const res = await fetch(url, { method: "GET", headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                const user = data?.result?.data?.json || data?.result?.data;
                if (user) {
                    console.log(`[Dokploy] User found via ${url}`);
                    console.log("[Dokploy] User Details:", JSON.stringify(user, null, 2)); // Added detailed logging
                    return user;
                }
            }
        } catch (e) {
            // ignore
        }
    }
    console.warn("[Dokploy] Could not fetch user details from any known endpoint.");
    return null;
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
    const listProject = projects.find(p => p.name === name);

    if (!listProject) {
        throw new Error(`dokploy_create_project_error: Project '${name}' created but not found in list.`);
    }

    // Fetch full details to check for nested environments
    const project = await getDokployProject(listProject.projectId);
    // cast to any to access potentially hidden properties
    const fullProject = project as any;
    console.log("Full Project Details:", JSON.stringify(fullProject, null, 2));

    // 2. Find Environment ID (Required for App Creation)
    let environmentId = "";

    // Strategy A: Check if environment is already nested in project
    if (fullProject && Array.isArray(fullProject.environments) && fullProject.environments.length > 0) {
        console.log(`[Dokploy] Found nested environments in project response.`);
        const prod = fullProject.environments.find((e: any) => e.name?.toLowerCase() === "production") || fullProject.environments[0];
        environmentId = prod.id || prod.environmentId;
        console.log(`[Dokploy] Using nested environment: ${prod.name} (${environmentId})`);
    }

    // Strategy B: Fetch via environment.all (if Strategy A failed)
    if (!environmentId) {
        try {
            console.log(`[Dokploy] Fetching environments via API for project ${listProject.projectId}...`);
            const envRes = await fetch(`${DOKPLOY_URL}/api/trpc/environment.all?input=${encodeURIComponent(JSON.stringify({ json: { projectId: listProject.projectId } }))}`, {
                method: "GET",
                headers: getHeaders(),
            });

            if (envRes.ok) {
                const envData = await envRes.json();
                const envs = envData?.result?.data?.json || envData?.result?.data;
                console.log(`[Dokploy] Environments found via API: ${Array.isArray(envs) ? envs.length : 'Not an array'}`, JSON.stringify(envs));

                if (Array.isArray(envs) && envs.length > 0) {
                    const prod = envs.find((e: any) => e.name?.toLowerCase() === "production") || envs[0];
                    environmentId = prod.id || prod.environmentId;
                    console.log(`[Dokploy] Found existing environment via API: ${prod.name} (${environmentId})`);
                }
            } else {
                console.warn(`[Dokploy] Could not fetch environments via API (Status ${envRes.status}).`);
            }
        } catch (e) {
            console.warn("Error fetching environments:", e);
        }
    }

    // Strategy C: Create 'production' environment (if A and B failed)
    if (!environmentId) {
        console.log(`[Dokploy] No environment ID found. Attempting to create 'production' environment...`);
        try {
            const createEnvRes = await fetch(`${DOKPLOY_URL}/api/trpc/environment.create`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ json: { projectId: listProject.projectId, name: "production", description: "Default environment" } }),
            });

            if (createEnvRes.ok) {
                const createEnvData = await createEnvRes.json();
                const newEnv = createEnvData?.result?.data?.json || createEnvData?.result?.data;
                environmentId = newEnv?.id || newEnv?.environmentId;
                console.log(`[Dokploy] Successfully created 'production' environment: ${environmentId}`);
            } else {
                console.error(`[Dokploy] Failed to create environment: ${createEnvRes.status}`);
                try {
                    const errText = await createEnvRes.text();
                    console.error("Create Env Error Body:", errText);
                } catch { }
            }
        } catch (e) {
            console.error("Error creating environment:", e);
        }
    }

    // Attach environmentId to result for usage in bmad.ts
    // Return the project object with the environmentId
    return { ...listProject, environmentId };
}

export async function createDokployApplication(input: CreateApplicationInput): Promise<DokployApplication & { webhookUrl?: string }> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    console.log(`[Dokploy] Creating app '${input.name}' in project ${input.projectId}...`);

    // Fetch user to check for connected providers
    const user = await getDokployUser();

    let payload: any = {
        name: input.name,
        projectId: input.projectId,
        description: input.description || "",
        environmentId: input.environmentId,
        buildType: input.buildType || "dockerfile",
        env: input.env || "",
    };

    // Determine Provider Strategy
    if (user && user.githubId && input.owner && input.repo) {
        // Strategy 1: Use connected GitHub App (Best for integration)
        console.log(`[Dokploy] Detected connected GitHub account (ID: ${user.githubId}). using 'github' provider.`);
        payload = {
            ...payload,
            sourceType: "github",
            githubRepository: input.repo,
            githubOwner: input.owner,
            githubBranch: input.branch || "main",
            githubId: user.githubId, // The installation ID
            githubBuildPath: "/"
        };
    } else {
        // Strategy 2: Use generic Git URL (Fallback)
        console.log(`[Dokploy] Using generic 'git' provider (No GitHub connection detected or missing owner/repo).`);
        payload = {
            ...payload,
            sourceType: "git",
            gitRepository: input.repository, // Full URL
            gitBranch: input.branch || "main",
            gitBuildPath: "/",
            // gitOwner: input.owner, // might be needed for some git providers but usually URL is enough for generic git
        };
    }

    console.log("[Dokploy] Application Create Payload:", JSON.stringify(payload, null, 2));

    const res = await fetch(`${DOKPLOY_URL}/api/trpc/application.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: payload }),
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
        console.warn(`Failed to delete Dokploy project ${projectId}: ${res.status}`);
        return false;
    }
    return true;
}
