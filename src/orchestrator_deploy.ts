/**
 * Orchestrator Deploy — Docker auto-deployment logic
 * Extracted from orchestrator.ts to keep each file under 500 lines.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { slugify } from "./orchestrator_utils.js";

export interface DeployContext {
    pipelineId: string;
    name: string;
    workspace: string;
    github?: { owner?: string; repo: string; url: string };
    model?: string;
    artifacts: Record<string, any>;
    addEvent: (role: string, emoji: string, msg: string, type: string) => void;
}

export async function deployProject(ctx: DeployContext): Promise<void> {
    const { pipelineId: id, name, workspace, github, artifacts, addEvent } = ctx;

    try {
        addEvent("Orchestrator", "🐳", "Déploiement du container projet...", "info");

        const { execSync } = await import("node:child_process");
        const slug = slugify(github?.repo || name);
        const projectName = `veist-${slug}`;
        // Use repo name as subdomain (repo.hach.dev) instead of pipeline ID hash
        const repoSlug = github?.repo ? slugify(github.repo) : slug;
        const hostDomain = `${repoSlug}.hach.dev`;
        // Store deployed URL in artifacts for easy retrieval
        artifacts.deployedUrl = `https://${hostDomain}`;

        // Ensure 'web' network exists (for Traefik)
        try {
            execSync(`docker network create web`, { stdio: "pipe" });
        } catch {
            /* already exists */
        }

        // ─── Multi-Container Path: use docker-compose.prod.yml if it exists ───
        const composeProdPath = path.join(workspace, "docker-compose.prod.yml");
        const hasComposeProd = await fs
            .access(composeProdPath)
            .then(() => true)
            .catch(() => false);

        if (hasComposeProd) {
            console.log(`[Deploy] Found docker-compose.prod.yml — using multi-container deploy`);
            addEvent("Orchestrator", "🐳", "Mode multi-container détecté (docker-compose.prod.yml)", "info");

            // Read and fix compose: ensure web network is external
            let composeContent = await fs.readFile(composeProdPath, "utf-8");

            // Ensure it has the external web network
            if (!composeContent.includes("external: true") && !composeContent.includes("external:true")) {
                if (composeContent.includes("networks:")) {
                    // Already has networks, ensure web is external
                    composeContent = composeContent.replace(
                        /networks:\s*\n(\s+web:\s*\n)/,
                        "networks:\n$1    external: true\n"
                    );
                } else {
                    composeContent += "\n\nnetworks:\n  web:\n    external: true\n";
                }
                await fs.writeFile(composeProdPath, composeContent, "utf-8");
            }

            // Stop old deployment if exists
            try {
                execSync(`docker compose -p ${projectName} -f ${composeProdPath} down --remove-orphans`, {
                    cwd: workspace,
                    stdio: "pipe",
                    timeout: 30000,
                });
            } catch {
                /* didn't exist */
            }

            // Build all images defined in the compose
            addEvent("Orchestrator", "🔨", "Build des images multi-container...", "info");
            try {
                execSync(`docker compose -p ${projectName} -f ${composeProdPath} build --no-cache`, {
                    cwd: workspace,
                    stdio: "pipe",
                    timeout: 600000, // 10 minutes for multi-container builds
                });
            } catch (buildErr: any) {
                const buildStdErr = buildErr.stderr?.toString()?.slice(-500) || buildErr.message;
                console.error(`[Deploy] Multi-container build error: ${buildStdErr}`);
                addEvent("Orchestrator", "⚠️", `Build multi-container échoué: ${buildStdErr}`, "warning");
                throw buildErr;
            }

            // Deploy all containers
            execSync(`docker compose -p ${projectName} -f ${composeProdPath} up -d`, {
                cwd: workspace,
                timeout: 60000,
                stdio: "pipe",
            });

            // Count running services
            try {
                const psOutput = execSync(`docker compose -p ${projectName} ps --format json`, {
                    cwd: workspace,
                    stdio: "pipe",
                    timeout: 10000,
                }).toString();
                const runningServices = psOutput.split("\n").filter(Boolean).length;
                addEvent(
                    "Orchestrator",
                    "🐳",
                    `${runningServices} container(s) déployé(s) ! URL: https://${hostDomain}`,
                    "success"
                );
            } catch {
                addEvent("Orchestrator", "🐳", `Multi-container déployé ! URL: https://${hostDomain}`, "success");
            }

            artifacts.deployed = true;
            artifacts.deployedUrl = `https://${hostDomain}`;
        } else {
            // ─── Single-Container Path (legacy) ───
            const imageName = `veist-${slug}:latest`;
            const containerName = `${projectName}-app`;
            let dockerfilePath = "";
            let buildContext = workspace;

            // 1) Check root Dockerfile (and Dockerfile.prod) — always takes priority
            const rootDockerfile = path.join(workspace, "Dockerfile");
            const rootDockerfileProd = path.join(workspace, "Dockerfile.prod");
            if (
                await fs
                    .access(rootDockerfile)
                    .then(() => true)
                    .catch(() => false)
            ) {
                dockerfilePath = rootDockerfile;
                buildContext = workspace;
                console.log(`[Deploy] Found Dockerfile at root`);
            } else if (
                await fs
                    .access(rootDockerfileProd)
                    .then(() => true)
                    .catch(() => false)
            ) {
                dockerfilePath = rootDockerfileProd;
                buildContext = workspace;
                console.log(`[Deploy] Found Dockerfile.prod at root`);
            } else {
                // 2) Detect monorepo BEFORE scanning subdirs — a monorepo with only
                //    partial Dockerfiles (e.g. backend/Dockerfile) would deploy incorrectly
                const hasFrontendDir = await fs
                    .access(path.join(workspace, "frontend"))
                    .then(() => true)
                    .catch(() => false);
                const hasBackendDir = await fs
                    .access(path.join(workspace, "backend"))
                    .then(() => true)
                    .catch(() => false);

                if (hasFrontendDir && hasBackendDir) {
                    // Check for docker-compose.prod.yml first (ideal monorepo setup)
                    const composeProd = path.join(workspace, "docker-compose.prod.yml");
                    if (
                        await fs
                            .access(composeProd)
                            .then(() => true)
                            .catch(() => false)
                    ) {
                        console.log(
                            `[Deploy] Monorepo detected with docker-compose.prod.yml — skipping to combined Dockerfile generation (single-container deploy)`
                        );
                    }
                    // For single-container deploy: generate a combined root Dockerfile
                    // This ensures both frontend AND backend are served together
                    console.log(`[Deploy] Monorepo detected (frontend+backend), generating combined root Dockerfile`);
                    // dockerfilePath stays empty → will be handled by the fallback generation below
                } else {
                    // 3) Not a monorepo: scan subdirectories for a Dockerfile or Dockerfile.prod
                    const entries = await fs.readdir(workspace, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
                            const subDockerfile = path.join(workspace, entry.name, "Dockerfile");
                            const subDockerfileProd = path.join(workspace, entry.name, "Dockerfile.prod");
                            if (
                                await fs
                                    .access(subDockerfile)
                                    .then(() => true)
                                    .catch(() => false)
                            ) {
                                dockerfilePath = subDockerfile;
                                buildContext = path.join(workspace, entry.name);
                                console.log(`[Deploy] Found Dockerfile in ${entry.name}/, context: ${buildContext}`);
                                break;
                            } else if (
                                await fs
                                    .access(subDockerfileProd)
                                    .then(() => true)
                                    .catch(() => false)
                            ) {
                                dockerfilePath = subDockerfileProd;
                                buildContext = path.join(workspace, entry.name);
                                console.log(
                                    `[Deploy] Found Dockerfile.prod in ${entry.name}/, context: ${buildContext}`
                                );
                                break;
                            }
                        }
                    }
                }
            }

            if (!dockerfilePath) {
                console.log(`[Deploy] No Dockerfile found, creating auto-detected Dockerfile`);
                dockerfilePath = path.join(workspace, "Dockerfile");

                // Detect project type: monorepo (frontend/ + backend/) or flat SPA/API
                const hasFrontend = await fs
                    .access(path.join(workspace, "frontend"))
                    .then(() => true)
                    .catch(() => false);
                const hasBackend = await fs
                    .access(path.join(workspace, "backend"))
                    .then(() => true)
                    .catch(() => false);
                const hasSrc = await fs
                    .access(path.join(workspace, "src"))
                    .then(() => true)
                    .catch(() => false);
                const hasRootPkg = await fs
                    .access(path.join(workspace, "package.json"))
                    .then(() => true)
                    .catch(() => false);

                let defaultDockerfile: string;

                if (hasFrontend && hasBackend) {
                    // Monorepo: frontend (SPA) + backend (Node.js)
                    console.log(`[Deploy] Detected monorepo (frontend+backend), generating multi-service Dockerfile`);
                    defaultDockerfile = `# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
RUN npm run build 2>/dev/null || true

# Stage 3: Production (serve frontend via nginx + run backend)
FROM node:20-alpine
WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx
RUN mkdir -p /run/nginx /usr/share/nginx/html

# Copy built frontend to nginx
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /app/backend ./backend
RUN cd backend && npm install --only=production 2>/dev/null || true

# nginx config (proxy /api to backend on 3001)
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location /api { proxy_pass http://localhost:3001; } location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/http.d/default.conf

# Start script
RUN printf '#!/bin/sh\\nnginx &\\ncd /app/backend && node dist/index.js 2>/dev/null || node src/index.js\\n' > /start.sh && chmod +x /start.sh

EXPOSE 80 3001
CMD ["/start.sh"]`;
                } else if (hasRootPkg && !hasSrc) {
                    // Flat SPA with npm build, output in dist/
                    defaultDockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;
                } else {
                    // Node.js backend style
                    defaultDockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build 2>/dev/null || true

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm install --only=production
EXPOSE 3000
CMD ["node", "dist/index.js"]`;
                }

                await fs.writeFile(dockerfilePath, defaultDockerfile, "utf-8");
            }

            // Ensure .env exists for build args
            const envPath = path.join(buildContext, ".env");
            const envExamplePath = path.join(buildContext, ".env.example");
            const hasEnv = await fs
                .access(envPath)
                .then(() => true)
                .catch(() => false);
            if (!hasEnv) {
                // Also check root .env
                const rootEnvPath = path.join(workspace, ".env");
                const hasRootEnv = await fs
                    .access(rootEnvPath)
                    .then(() => true)
                    .catch(() => false);
                if (hasRootEnv && buildContext !== workspace) {
                    await fs.copyFile(rootEnvPath, envPath);
                } else {
                    const hasEnvExample = await fs
                        .access(envExamplePath)
                        .then(() => true)
                        .catch(() => false);
                    if (hasEnvExample) {
                        await fs.copyFile(envExamplePath, envPath);
                    } else {
                        await fs.writeFile(envPath, "# Auto-generated\nVITE_API_KEY=placeholder\n");
                    }
                }
            }

            // Build the image (legacy builder — VPS lacks buildx)
            try {
                const buildCmd = `docker build -f ${dockerfilePath} -t ${imageName} ${buildContext}`;
                console.log(`[Deploy] Build cmd: ${buildCmd}`);
                execSync(buildCmd, {
                    cwd: workspace,
                    timeout: 10 * 60 * 1000, // 10 min for heavy builds
                    stdio: "pipe",
                });
            } catch (buildErr: any) {
                const stderr = buildErr.stderr ? buildErr.stderr.toString().slice(-500) : buildErr.message;
                console.error(`[Deploy] ❌ Build failed: ${stderr}`);
                addEvent("Orchestrator", "⚠️", `Build image échoué: ${stderr}`, "warning");
                throw buildErr;
            }

            console.log(`[Deploy] Image built. Deploying container ${containerName}`);

            // Generate a deterministic compose file with Traefik labels
            // so it appears as a "project" in Hostinger Docker Manager
            const deployComposeContent = [
                'version: "3.8"',
                "",
                "services:",
                "  app:",
                `    image: ${imageName}`,
                `    container_name: ${containerName}`,
                "    restart: unless-stopped",
                "    networks:",
                "      - web",
                "    labels:",
                '      - "traefik.enable=true"',
                `      - "traefik.http.routers.${projectName}.rule=Host(\`${hostDomain}\`)"`,
                `      - "traefik.http.routers.${projectName}.entrypoints=websecure"`,
                `      - "traefik.http.routers.${projectName}.tls.certresolver=letsencrypt"`,
                `      - "traefik.http.services.${projectName}.loadbalancer.server.port=80"`,
                "",
                "networks:",
                "  web:",
                "    external: true",
            ].join("\n");
            const deployComposePath = path.join(workspace, "docker-compose.deploy.yml");
            await fs.writeFile(deployComposePath, deployComposeContent, "utf-8");
            console.log(`[Deploy] Generated ${deployComposePath}`);

            // Stop old deployment if exists
            try {
                execSync(`docker compose -p ${projectName} -f ${deployComposePath} down`, {
                    cwd: workspace,
                    stdio: "pipe",
                    timeout: 30000,
                });
            } catch {
                /* didn't exist */
            }

            // Deploy using docker compose (creates a "project" visible in Hostinger)
            execSync(`docker compose -p ${projectName} -f ${deployComposePath} up -d`, {
                cwd: workspace,
                timeout: 60 * 1000, // 60s for container startup
                stdio: "pipe",
            });

            artifacts.deployed = true;
            artifacts.deployedUrl = `https://${hostDomain}`;
            addEvent("Orchestrator", "🐳", `Container déployé! Accessible sur ${artifacts.deployedUrl}`, "success");
        } // end else (single-container path)
    } catch (deployErr: any) {
        const errMsg = deployErr.stderr ? deployErr.stderr.toString().slice(-500) : deployErr.message;
        console.error(`[Deploy] ❌ Error: ${errMsg}`);
        addEvent("Orchestrator", "⚠️", `Déploiement container échoué: ${errMsg}`, "warning");
        // Don't throw — the project is still generated successfully
    }
}
