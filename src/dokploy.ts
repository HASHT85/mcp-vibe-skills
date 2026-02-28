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
    sourceType?: "git" | "github" | "gitlab" | "bitbucket" | "docker";
};

// Read at call-time so container .env vars are available after module init
const getDokployUrl = () => process.env.getDokployUrl() || "";
const getDokployToken = () => process.env.DOKPLOY_TOKEN || "";

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "x-api-key": getDokployToken(),
    };
}

export function isDokployConfigured(): boolean {
    return Boolean(getDokployUrl() && getDokployToken());
}

export async function getGithubProviders(): Promise<any[]> {
    if (!isDokployConfigured()) return [];
    try {
        // Try the TRPC endpoint first
        const res = await fetch(`${getDokployUrl()}/api/trpc/github.githubProviders`, {
            method: "GET",
            headers: getHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            const list = data?.result?.data?.json || data?.result?.data;
            if (Array.isArray(list)) return list;
        }
    } catch (e) {
        console.warn("Error fetching github providers:", e);
    }
    return [];
}

export async function getDokployUser(): Promise<any> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    try {
        // Step 1: Get basic session info to find the userId
        console.log(`[Dokploy] Fetching user session from user.get...`);
        const res = await fetch(`${getDokployUrl()}/api/trpc/user.get`, { method: "GET", headers: getHeaders() });

        if (!res.ok) {
            console.warn(`[Dokploy] user.get failed: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const baseUser = data?.result?.data?.json || data?.result?.data;

        if (!baseUser || !baseUser.userId) {
            console.warn("[Dokploy] No userId found in user.get response.");
            return baseUser;
        }

        const userId = baseUser.userId;
        console.log(`[Dokploy] Found userId: ${userId}. Fetching full profile via user.one...`);

        // Step 2: Fetch full user profile with user.one to get relations (like githubInstallations)
        const input = { json: { userId } };
        const oneRes = await fetch(
            `${getDokployUrl()}/api/trpc/user.one?input=${encodeURIComponent(JSON.stringify(input))}`,
            { method: "GET", headers: getHeaders() }
        );

        if (oneRes.ok) {
            const oneData = await oneRes.json();
            const fullUser = oneData?.result?.data?.json || oneData?.result?.data;
            console.log(`[Dokploy] Full User Profile (user.one):`, JSON.stringify(fullUser, null, 2));

            // Check if we found the installation in the profile
            if (fullUser.githubInstallations || fullUser.githubId) {
                return fullUser;
            }
        }

        // Step 3: Experimental probes for GitHub endpoints if not found in user profile
        const probeEndpoints = [
            `${getDokployUrl()}/api/trpc/github.installations`,
            `${getDokployUrl()}/api/trpc/github.get`,
            `${getDokployUrl()}/api/trpc/git.all`,
        ];

        for (const url of probeEndpoints) {
            try {
                console.log(`[Dokploy] Probing ${url}...`);
                const res = await fetch(url, { method: "GET", headers: getHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    const result = data?.result?.data?.json || data?.result?.data;
                    console.log(`[Dokploy] Probe Success ${url}:`, JSON.stringify(result, null, 2));
                    if (result && (Array.isArray(result) || result.installationId)) {
                        // If we found something that looks like installations, attach it
                        return { ...baseUser, githubInstallations: Array.isArray(result) ? result : [result] };
                    }
                } else {
                    console.log(`[Dokploy] Probe Failed ${url}: ${res.status}`);
                }
            } catch (e) {
                console.log(`[Dokploy] Probe Error ${url}:`, e);
            }
        }

        return baseUser; // Fallback to basic user if nothing found

    } catch (e) {
        console.warn("[Dokploy] Fetching user failed:", e);
        return null;
    }
}

export async function listDokployProjects(): Promise<DokployProject[]> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    const res = await fetch(`${getDokployUrl()}/api/trpc/project.all`, {
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

export async function updateDokployProject(projectId: string, name: string): Promise<DokployProject> {
    // Placeholder if needed
    return {} as any;
}

export async function getDokployProject(projectId: string): Promise<DokployProject | null> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    // Input must be wrapped in json for SuperJSON
    const input = { json: { projectId } };
    const res = await fetch(
        `${getDokployUrl()}/api/trpc/project.one?input=${encodeURIComponent(JSON.stringify(input))}`,
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
        `${getDokployUrl()}/api/trpc/application.all?input=${encodeURIComponent(JSON.stringify(input))}`,
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

export async function getApplication(applicationId: string): Promise<DokployApplication | null> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    const input = { json: { applicationId } };
    const res = await fetch(
        `${getDokployUrl()}/api/trpc/application.one?input=${encodeURIComponent(JSON.stringify(input))}`,
        { method: "GET", headers: getHeaders() }
    );

    if (!res.ok) return null;

    const data = await res.json();
    let result = data?.result?.data?.json || data?.result?.data;
    return result || null;
}

export async function getBuildLogs(applicationId: string): Promise<string> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    // We often need to get the latest deployment for the app first
    // But Dokploy might have a direct way or we iterate deployments.
    // Let's assume we fetch application to get current deployment info or just fetch deployments.
    // Probing `deployment.all` for the app
    try {
        const input = { json: { applicationId } };
        const res = await fetch(
            `${getDokployUrl()}/api/trpc/deployment.all?input=${encodeURIComponent(JSON.stringify(input))}`,
            { method: "GET", headers: getHeaders() }
        );

        if (res.ok) {
            const data = await res.json();
            const deployments = data?.result?.data?.json || data?.result?.data;
            if (Array.isArray(deployments) && deployments.length > 0) {
                // Get latest
                const latest = deployments[0];
                return latest.log || "No logs available in deployment object.";
            }
        }
    } catch (e) {
        console.warn("Error fetching build logs:", e);
    }
    return "Could not fetch build logs.";
}

export async function getApplicationLogs(applicationId: string): Promise<string> {
    // Runtime logs
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    // application.readLogs
    try {
        const input = { json: { applicationId } };
        const res = await fetch(
            `${getDokployUrl()}/api/trpc/application.readLogs?input=${encodeURIComponent(JSON.stringify(input))}`,
            { method: "GET", headers: getHeaders() }
        );
        if (res.ok) {
            const data = await res.json();
            const logs = data?.result?.data?.json || data?.result?.data;
            if (Array.isArray(logs)) return logs.join("\n");
            return logs || "";
        }
    } catch (e) {
        console.warn("Error fetching app logs:", e);
    }
    return "";
}

export async function triggerDeploy(applicationId: string): Promise<boolean> {
    if (!isDokployConfigured()) {
        throw new Error("dokploy_not_configured");
    }

    console.log(`[Dokploy] Triggering deploy for app ${applicationId}...`);
    const res = await fetch(`${getDokployUrl()}/api/trpc/application.deploy`, {
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
    } else {
        console.log(`[Dokploy] Deploy triggered successfully.`);
    }

    return res.ok;
}

export async function createDokployProject(name: string, description?: string): Promise<DokployProject> {
    if (!isDokployConfigured()) {
        console.error("Dokploy Config Missing:", {
            URL: process.env.getDokployUrl(),
            TOKEN_SET: !!process.env.DOKPLOY_TOKEN
        });
        throw new Error("dokploy_not_configured");
    }

    console.log(`[Dokploy] Creating project '${name}' at ${getDokployUrl()}...`);

    const res = await fetch(`${getDokployUrl()}/api/trpc/project.create`, {
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
            const envRes = await fetch(`${getDokployUrl()}/api/trpc/environment.all?input=${encodeURIComponent(JSON.stringify({ json: { projectId: listProject.projectId } }))}`, {
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
            const createEnvRes = await fetch(`${getDokployUrl()}/api/trpc/environment.create`, {
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

    // Return the project object with the environmentId
    return { ...listProject, environmentId };
}

export async function createDokployApplication(input: CreateApplicationInput): Promise<DokployApplication & { webhookUrl?: string }> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    console.log(`[Dokploy] Creating app '${input.name}' in project ${input.projectId}...`);

    // 1. Create the Application first (Generic)
    const payload: any = {
        name: input.name,
        projectId: input.projectId,
        description: input.description || "",
        environmentId: input.environmentId,
        buildType: input.buildType || "dockerfile",
    };

    console.log("[Dokploy] Application Create Payload:", JSON.stringify(payload, null, 2));

    const res = await fetch(`${getDokployUrl()}/api/trpc/application.create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: payload }),
    });

    if (!res.ok) {
        let errorBody = "";
        try { errorBody = await res.text(); } catch (e) { }
        console.error(`Dokploy Create App Failed (Status ${res.status}):`, errorBody);
        throw new Error(`dokploy_create_app_error: ${res.status} - ${errorBody}`);
    }

    const data = await res.json();
    const app = data?.result?.data?.json || data?.result?.data;
    const applicationId = app.applicationId;
    console.log(`[Dokploy] Application created. ID: ${applicationId}`);

    // 2. Decide Provider & Link
    if (input.owner && input.repo) {
        // Strategy: GitHub Provider
        console.log(`[Dokploy] Configuring GitHub provider for ${input.owner}/${input.repo}...`);

        // Fetch Github Provider ID (Installation ID)
        const providers = await getGithubProviders();
        console.log(`[Dokploy] Available GitHub Providers:`, JSON.stringify(providers, null, 2));

        const githubId = providers[0]?.githubId || providers[0]?.id;

        if (githubId) {
            console.log(`[Dokploy] Using GitHub ID: ${githubId}`);

            // Link Repo
            const linkPayload = {
                applicationId,
                owner: input.owner,
                repository: input.repo,
                branch: input.branch || "main",
                buildPath: "/Dockerfile", // Fix: Point to file, not dir
                githubId,
                enableSubmodules: false,
                triggerType: "push",
                buildType: "dockerfile",
            };

            console.log(`[Dokploy] Linking GitHub Repo...`);
            const linkRes = await fetch(`${getDokployUrl()}/api/trpc/application.saveGithubProvider`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ json: linkPayload })
            });

            if (!linkRes.ok) {
                console.error(`[Dokploy] Failed to link GitHub repo: ${linkRes.status}`);
                try { console.error(await linkRes.text()); } catch { }
            } else {
                console.log(`[Dokploy] GitHub Repo linked successfully.`);

                // Enable Auto-Deploy
                console.log(`[Dokploy] Enabling Auto-Deploy & Enforcing Dockerfile...`);
                await fetch(`${getDokployUrl()}/api/trpc/application.update`, {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({
                        json: {
                            applicationId,
                            sourceType: "github",
                            autoDeploy: true,
                            buildType: "dockerfile",
                            contextPath: ".",
                            dockerPath: "./Dockerfile",
                            cleanCache: false
                        }
                    })
                });

                // Trigger Deploy
                console.log(`[Dokploy] Triggering initial deploy...`);
                await triggerDeploy(applicationId);
            }
        } else {
            console.warn(`[Dokploy] No GitHub provider found. Skipping GitHub link.`);
        }
    } else if (input.repository) {
        // Strategy: Generic Git
        console.log(`[Dokploy] Configuring Generic Git provider...`);
        const linkPayload = {
            applicationId,
            repository: input.repository,
            branch: input.branch || "main",
            buildPath: "/Dockerfile",
            sourceType: "git",
            provider: "git",
            buildType: "dockerfile",
        };

        // For generic git, usually update application is enough or there might be a saveGitProvider
        // But based on initial code, it seemed update/create keys work. 
        // Let's use application.update to set generic git details if saveGithubProvider is only for github.
        await fetch(`${getDokployUrl()}/api/trpc/application.update`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ json: linkPayload })
        });
    }

    return app;
}

export async function updateApplicationBuildSettings(applicationId: string, settings: any) {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");
    console.log(`[Dokploy] Updating build settings for ${applicationId}...`, JSON.stringify(settings));
    await fetch(`${getDokployUrl()}/api/trpc/application.update`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ json: { applicationId, ...settings } })
    });
}

export async function deleteDokployProject(projectId: string): Promise<boolean> {
    if (!isDokployConfigured()) return false;

    const res = await fetch(`${getDokployUrl()}/api/trpc/project.remove`, {
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

export async function getLatestDeployment(applicationId: string): Promise<any | null> {
    if (!isDokployConfigured()) throw new Error("dokploy_not_configured");

    try {
        const input = { json: { applicationId } };
        const res = await fetch(
            `${getDokployUrl()}/api/trpc/deployment.all?input=${encodeURIComponent(JSON.stringify(input))}`,
            { method: "GET", headers: getHeaders() }
        );

        if (res.ok) {
            const data = await res.json();
            const deployments = data?.result?.data?.json || data?.result?.data;
            if (Array.isArray(deployments) && deployments.length > 0) {
                return deployments[0]; // Return the full deployment object
            }
        }
    } catch (e) {
        console.warn("Error fetching latest deployment:", e);
    }
    return null;
}

/**
 * Create a domain for an application in Dokploy
 * Uses DOKPLOY_BASE_DOMAIN env var (e.g., "hach.dev") to generate subdomains
 */
export async function createDomain(
    applicationId: string,
    slug: string,
    port: number = 3000
): Promise<{ domainId?: string; host: string } | null> {
    if (!isDokployConfigured()) return null;

    const baseDomain = process.env.DOKPLOY_BASE_DOMAIN;
    if (!baseDomain) {
        console.warn("[Dokploy] DOKPLOY_BASE_DOMAIN not set, skipping domain creation");
        return null;
    }

    const host = `${slug}.${baseDomain}`;
    console.log(`[Dokploy] Creating domain ${host} for application ${applicationId} (port ${port})...`);

    try {
        const res = await fetch(`${getDokployUrl()}/api/trpc/domain.create`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                json: {
                    applicationId,
                    host,
                    https: true,
                    certificateType: "letsencrypt",
                    path: "/",
                    port,
                }
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`[Dokploy] Domain creation failed (${res.status}): ${text}`);
            return null;
        }

        const data = await res.json();
        const domainId = data?.result?.data?.json?.domainId;
        console.log(`[Dokploy] ✓ Domain created: https://${host} (id: ${domainId || "unknown"})`);
        return { domainId, host };
    } catch (err: any) {
        console.error(`[Dokploy] Domain creation error: ${err.message}`);
        return null;
    }
}
