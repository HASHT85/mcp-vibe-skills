/**
 * Quick Deploy — Direct GitHub repo deployment to Hostinger VPS
 * Bypasses the full AI pipeline for existing projects.
 */
import express from "express";
import { gitClone } from "./claude_code.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const router = express.Router();

const HOSTINGER_API = "https://api.hostinger.com";
const HOSTINGER_TOKEN = process.env.HOSTINGER_API_TOKEN || "";
const VM_ID = 1287719; // Hardcoded VPS ID

// ─── Hostinger API Helper ───

async function hostinger<T = unknown>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const res = await fetch(`${HOSTINGER_API}${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${HOSTINGER_TOKEN}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Hostinger API ${res.status}: ${text}`);
    }
    return res.json() as T;
}

// ─── Repo Analysis Helpers ───

async function readSafe(dir: string, filename: string): Promise<string | null> {
    try { return await fs.readFile(path.join(dir, filename), "utf-8"); } catch { return null; }
}

interface RepoAnalysis {
    readme: string | null;
    dockerfile: string | null;
    dockerCompose: string | null;
    goMod: string | null;
    packageJson: string | null;
    dockerHubImage: string | null;
    detectedEnvVars: string[];
    detectedPorts: number[];
    language: string;
    hasDockerfile: boolean;
    hasCompose: boolean;
    deployMode: "hub_image" | "build_from_source" | "existing_compose";
}

function detectDockerHubImage(readme: string | null, dockerfile: string | null): string | null {
    // Check README for docker pull commands
    if (readme) {
        const pullMatch = readme.match(/docker\s+pull\s+([a-zA-Z0-9_./-]+)/);
        if (pullMatch) return pullMatch[1];
        // Check for Docker Hub links
        const hubMatch = readme.match(/hub\.docker\.com\/r\/([a-zA-Z0-9_./-]+)/);
        if (hubMatch) return hubMatch[1];
    }
    // Check Dockerfile FROM (but skip generic base images)
    if (dockerfile) {
        const fromMatch = dockerfile.match(/^FROM\s+([^\s]+)/m);
        if (fromMatch && !["node", "python", "golang", "alpine", "ubuntu", "debian", "rust"].some(b => fromMatch[1].startsWith(b))) {
            return fromMatch[1];
        }
    }
    return null;
}

function detectEnvVars(dockerfile: string | null, compose: string | null, readme: string | null): string[] {
    const vars = new Set<string>();
    
    // From Dockerfile ENV
    if (dockerfile) {
        const envMatches = dockerfile.matchAll(/^ENV\s+(\w+)/gm);
        for (const m of envMatches) vars.add(m[1]);
    }
    // From docker-compose environment
    if (compose) {
        const envMatches = compose.matchAll(/^\s*-\s*(\w+)=/gm);
        for (const m of envMatches) vars.add(m[1]);
        // Also ${VAR} references
        const refMatches = compose.matchAll(/\$\{(\w+)/g);
        for (const m of refMatches) vars.add(m[1]);
    }
    // From README (look for env var patterns like UPPER_CASE=)
    if (readme) {
        const readmeMatches = readme.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b(?=\s*[=:]|\s*—|\s*-\s)/gm);
        for (const m of readmeMatches) {
            if (!["README", "TODO", "NOTE", "WARNING", "IMPORTANT", "DEPRECATED", "API", "URL", "HTTP", "HTTPS", "GET", "POST", "PUT", "DELETE"].includes(m[1])) {
                vars.add(m[1]);
            }
        }
    }
    return Array.from(vars).sort();
}

function detectPorts(dockerfile: string | null, compose: string | null): number[] {
    const ports = new Set<number>();
    if (dockerfile) {
        const matches = dockerfile.matchAll(/^EXPOSE\s+(\d+)/gm);
        for (const m of matches) ports.add(parseInt(m[1]));
    }
    if (compose) {
        const matches = compose.matchAll(/"?(\d+):(\d+)"?/g);
        for (const m of matches) ports.add(parseInt(m[2]));
    }
    return Array.from(ports).sort();
}

function detectLanguage(goMod: string | null, packageJson: string | null, dockerfile: string | null): string {
    if (goMod) return "go";
    if (packageJson) return "node";
    if (dockerfile) {
        const from = dockerfile.match(/^FROM\s+(\w+)/m)?.[1]?.toLowerCase() || "";
        if (from.includes("python")) return "python";
        if (from.includes("node")) return "node";
        if (from.includes("golang") || from.includes("go")) return "go";
        if (from.includes("rust")) return "rust";
    }
    return "unknown";
}

// ─── Generate docker-compose.yml ───

function generateCompose(opts: {
    projectName: string;
    subdomain: string;
    deployMode: string;
    dockerHubImage: string | null;
    githubUrl: string;
    port: number;
    secrets: Record<string, string>;
}): string {
    const image = opts.deployMode === "hub_image" && opts.dockerHubImage
        ? `    image: ${opts.dockerHubImage}`
        : `    build:\n      context: .`;

    const envLines = Object.entries(opts.secrets)
        .map(([k, v]) => `      - ${k}=${v}`)
        .join("\n");

    const envSection = envLines ? `    environment:\n${envLines}` : "";

    return `services:
  app:
${image}
    container_name: ${opts.projectName}
    restart: unless-stopped
${envSection}
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${opts.projectName}.rule=Host(\`${opts.subdomain}.hach.dev\`)"
      - "traefik.http.routers.${opts.projectName}.entrypoints=websecure"
      - "traefik.http.routers.${opts.projectName}.tls.certresolver=letsencrypt"
      - "traefik.http.services.${opts.projectName}.loadbalancer.server.port=${opts.port}"

networks:
  web:
    external: true
`;
}

// ─── Routes ───

// POST /api/quick-deploy/analyze
router.post("/analyze", async (req, res) => {
    const { githubUrl } = req.body;
    if (!githubUrl || typeof githubUrl !== "string") {
        return res.status(400).json({ error: "githubUrl is required" });
    }

    // Extract repo name for temp dir
    const repoMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\.\?\#]+)/);
    if (!repoMatch) {
        return res.status(400).json({ error: "Invalid GitHub URL" });
    }
    const repoName = repoMatch[2].toLowerCase();

    const tmpDir = path.join(os.tmpdir(), `qd-${repoName}-${Date.now()}`);

    try {
        // Clone
        const ok = await gitClone(githubUrl, tmpDir);
        if (!ok) {
            return res.status(500).json({ error: "Failed to clone repository" });
        }

        // Read key files
        const readme = await readSafe(tmpDir, "README.md") ?? await readSafe(tmpDir, "readme.md");
        const dockerfile = await readSafe(tmpDir, "Dockerfile");
        const dockerCompose = await readSafe(tmpDir, "docker-compose.yml") ?? await readSafe(tmpDir, "docker-compose.yaml");
        const goMod = await readSafe(tmpDir, "go.mod");
        const packageJson = await readSafe(tmpDir, "package.json");

        const dockerHubImage = detectDockerHubImage(readme, dockerfile);
        const detectedEnvVars = detectEnvVars(dockerfile, dockerCompose, readme);
        const detectedPorts = detectPorts(dockerfile, dockerCompose);
        const language = detectLanguage(goMod, packageJson, dockerfile);
        const hasDockerfile = !!dockerfile;
        const hasCompose = !!dockerCompose;

        // Determine best deploy mode
        let deployMode: RepoAnalysis["deployMode"] = "build_from_source";
        if (hasCompose) deployMode = "existing_compose";
        else if (dockerHubImage) deployMode = "hub_image";
        else if (hasDockerfile) deployMode = "build_from_source";

        const analysis: RepoAnalysis = {
            readme: readme?.slice(0, 8000) ?? null,
            dockerfile: dockerfile?.slice(0, 3000) ?? null,
            dockerCompose: dockerCompose?.slice(0, 3000) ?? null,
            goMod: goMod?.slice(0, 1500) ?? null,
            packageJson: packageJson?.slice(0, 2000) ?? null,
            dockerHubImage,
            detectedEnvVars,
            detectedPorts,
            language,
            hasDockerfile,
            hasCompose,
            deployMode,
        };

        res.json(analysis);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    } finally {
        // Cleanup temp dir
        try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
});

// POST /api/quick-deploy/launch
router.post("/launch", async (req, res) => {
    const { githubUrl, projectName, subdomain, secrets, deployMode, dockerHubImage, port, composeOverride } = req.body;

    if (!projectName || !subdomain) {
        return res.status(400).json({ error: "projectName and subdomain are required" });
    }

    if (!HOSTINGER_TOKEN) {
        return res.status(500).json({ error: "HOSTINGER_API_TOKEN is not configured" });
    }

    try {
        let composeContent: string;

        if (composeOverride) {
            // User provided or edited compose directly
            composeContent = composeOverride;
        } else if (deployMode === "existing_compose" && githubUrl) {
            // Use the repo's own docker-compose.yml (deployed via GitHub URL)
            // The Hostinger API will pull the compose from the repo
            const result = await hostinger<{ id: number; name: string; state: string }>("POST",
                `/api/vps/v1/virtual-machines/${VM_ID}/projects`, {
                    project_name: projectName,
                    content: githubUrl,
                    environment: Object.entries(secrets || {}).map(([k, v]) => `${k}=${v}`).join("\n"),
                });
            return res.json({ actionId: result.id, state: result.state, mode: "existing_compose" });
        } else {
            // Generate compose
            composeContent = generateCompose({
                projectName,
                subdomain,
                deployMode: deployMode || "hub_image",
                dockerHubImage: dockerHubImage || null,
                githubUrl: githubUrl || "",
                port: port || 8080,
                secrets: secrets || {},
            });
        }

        // Deploy via Hostinger
        const result = await hostinger<{ id: number; name: string; state: string }>("POST",
            `/api/vps/v1/virtual-machines/${VM_ID}/projects`, {
                project_name: projectName,
                content: composeContent,
                environment: Object.entries(secrets || {}).map(([k, v]) => `${k}=${v}`).join("\n"),
            });

        res.json({ actionId: result.id, state: result.state, compose: composeContent });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/quick-deploy/status/:actionId
router.get("/status/:actionId", async (req, res) => {
    const actionId = parseInt(req.params.actionId);
    if (!actionId) {
        return res.status(400).json({ error: "Invalid actionId" });
    }
    if (!HOSTINGER_TOKEN) {
        return res.status(500).json({ error: "HOSTINGER_API_TOKEN is not configured" });
    }

    try {
        const result = await hostinger("GET", `/api/vps/v1/virtual-machines/${VM_ID}/actions/${actionId}`);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/quick-deploy/containers/:projectName
router.get("/containers/:projectName", async (req, res) => {
    if (!HOSTINGER_TOKEN) {
        return res.status(500).json({ error: "HOSTINGER_API_TOKEN is not configured" });
    }
    try {
        const result = await hostinger("GET", `/api/vps/v1/virtual-machines/${VM_ID}/projects/${req.params.projectName}/containers`);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export { router as quickDeployRouter };
