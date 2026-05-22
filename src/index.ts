import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import { slugify } from "./orchestrator_utils.js";
import { loadConfig } from "./config.js";

// ─── Validate environment at startup — fail fast with clear error ───
loadConfig();



import { AgentsStore } from "./agents_store.js";
import { ProjectsStore } from "./projects_store.js";

import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { PROFILES, getProfile } from "./profiles.js";
import { TEMPLATES } from "./templates.js";
import { getOrchestrator, type PipelineEvent } from "./orchestrator.js";
import { getCurrentModel } from "./agent_engine.js";
import { quickDeployRouter } from "./quickDeploy.js";
import rateLimit from "express-rate-limit";

const app = express();
const storePath = process.env.STORE_PATH || '/data/store.json';

// SEC-46: Security headers (HSTS, X-Frame-Options, CSP, noSniff, etc.)
app.use(helmet({
    contentSecurityPolicy: false,  // API-only — no HTML served
}));

// SEC-03: Restrict CORS to dashboard origin
app.use(cors({
    origin: [
        "https://veist.hach.dev",
        "http://localhost:5173",  // dev mode
        "http://localhost:3000",
    ],
    credentials: true,
}));

// SEC-10: Reduce default body limit (50mb only on launch route)
app.use(express.json({ limit: "5mb" }));

// SEC-12: Rate limiting
const launchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many pipeline launches. Max 10/min." },
    standardHeaders: true,
    legacyHeaders: false,
});
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "Too many chat messages. Max 30/min." },
    standardHeaders: true,
    legacyHeaders: false,
});

// SEC-13: Sanitize container/resource names before shell use
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
function sanitizeName(name: string): string {
    if (!name || !SAFE_NAME_RE.test(name) || name.length > 128) {
        throw new Error(`Invalid resource name: "${name.slice(0, 30)}"`);
    }
    return name;
}

// Basic Auth Middleware
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
    console.warn("⚠️ WARNING: ADMIN_USER or ADMIN_PASS is not set. API is secure but might be inaccessible.");
}

// SEC-04: Ephemeral Token System (for SSE which can't send headers)
const TOKEN_SECRET = ADMIN_PASS || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = 5 * 60 * 1000; // 5 minutes

function generateToken(): string {
    const expires = Date.now() + TOKEN_TTL;
    const payload = `${ADMIN_USER}:${expires}`;
    const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64');
}

function verifyToken(token: string): boolean {
    try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [user, expiresStr, sig] = decoded.split(':');
        const expires = parseInt(expiresStr);
        if (Date.now() > expires) return false; // expired
        const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET)
            .update(`${user}:${expiresStr}`).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch {
        return false;
    }
}

const authMiddleware = (req: Request, res: Response, next: Function) => {
    let user = "", pass = "";
    const authHeader = req.headers.authorization;
    const tokenQuery = req.query.token as string | undefined;  // SEC-04: token-based

    if (authHeader) {
        const decoded = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString();
        [user, pass] = decoded.split(':');
    } else if (tokenQuery && verifyToken(tokenQuery)) {
        // SEC-04: Valid ephemeral token — allow access
        return next();
    }

    // SEC-21: Timing-safe credential comparison to prevent timing attacks
    const userMatch = user.length === (ADMIN_USER || '').length &&
        crypto.timingSafeEqual(Buffer.from(user), Buffer.from(ADMIN_USER || ''));
    const passMatch = pass.length === (ADMIN_PASS || '').length &&
        crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASS || ''));

    if (userMatch && passMatch) {
        next();
    } else {
        return res.status(401).json({ error: 'Authentication required' });
    }
};

// Apply Auth to API routes (except health/public)
app.use('/projects', authMiddleware);
app.use('/pipeline', authMiddleware);
app.use('/agents', authMiddleware);
app.use('/containers', authMiddleware);
app.use('/chat', authMiddleware);
app.use('/api/quick-deploy', authMiddleware);
app.use('/vps', authMiddleware);
app.use('/embeddings', authMiddleware);
// SEC-20: Protect events route (exposes pipeline activity history)
app.use('/events', authMiddleware);
// SEC-24: Protect auxiliary routes
app.use('/skills', authMiddleware);
app.use('/profiles', authMiddleware);
app.use('/templates', authMiddleware);
// Initialize Stores
const agentsStore = new AgentsStore(storePath);
const projectsStore = new ProjectsStore(storePath);

// Initialize Orchestrator
const orchestrator = getOrchestrator();

// Health
app.get("/", (_req: Request, res: Response) => res.json({ service: "veist", status: "running" }));
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// SEC-04: Token endpoint — returns ephemeral token for SSE connections
app.post("/auth/token", authMiddleware, (_req: Request, res: Response) => {
    res.json({ token: generateToken(), expiresIn: TOKEN_TTL / 1000 });
});

// ─────────────────────────────────────
// Pipeline (New Orchestrator)
// ─────────────────────────────────────

// Launch a new idea → creates full pipeline
// SEC-10: Higher body limit for file uploads on this route only
// SEC-12: Rate limited to 10/min
app.post("/pipeline/launch", launchLimiter, express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
        const description = String(req.body?.description ?? "").trim();
        const name = req.body?.name ? String(req.body.name).trim() : undefined;
        const model = req.body?.model ? String(req.body.model).trim() : undefined;
        let files = req.body?.files as { base64: string; type: string }[] | undefined;
        const templateId = req.body?.templateId ? String(req.body.templateId).trim() : undefined;
        const githubUrl = req.body?.githubUrl ? String(req.body.githubUrl).trim() : undefined;

        if (!description) {
            return res.status(400).json({ error: "missing_description" });
        }

        // SEC-07: Validate uploaded files
        if (files && Array.isArray(files)) {
            const MAX_FILES = 5;
            const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB decoded
            const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

            if (files.length > MAX_FILES) {
                return res.status(400).json({ error: `Too many files. Max ${MAX_FILES}.` });
            }
            for (const file of files) {
                if (!ALLOWED_MIMES.has(file.type)) {
                    return res.status(400).json({ error: `File type not allowed: ${file.type}` });
                }
                const sizeBytes = Buffer.byteLength(file.base64, 'base64');
                if (sizeBytes > MAX_FILE_SIZE) {
                    return res.status(400).json({ error: `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max 5MB.` });
                }
            }
        }

        const pipeline = await orchestrator.launchIdea(description, name, model, files, templateId, githubUrl);
        res.json({ pipeline });
    } catch (err: any) {
        console.error("Pipeline launch error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get available project templates (dynamic import for ESM compat)
app.get("/templates", async (_req: Request, res: Response) => {
    try {
        const { TEMPLATE_REGISTRY, suggestTemplates } = await import("./templates/registry.js");
        const query = _req.query.q ? String(_req.query.q) : undefined;
        if (query) {
            const suggestions = suggestTemplates(query);
            res.json({ templates: suggestions.map((t: any) => ({ id: t.id, name: t.name, emoji: t.emoji, description: t.description, defaultStack: t.defaultStack })) });
        } else {
            res.json({ templates: TEMPLATE_REGISTRY.map((t: any) => ({ id: t.id, name: t.name, emoji: t.emoji, description: t.description, defaultStack: t.defaultStack })) });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// List all pipelines
app.get("/pipeline/list", (_req: Request, res: Response) => {
    const pipelines = orchestrator.listPipelines();
    res.json({ pipelines });
});

// Get pipeline status
app.get("/pipeline/:id/status", (req: Request, res: Response) => {
    const pipeline = orchestrator.getPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "pipeline_not_found" });
    res.json({ pipeline });
});

// SSE stream for pipeline events
app.get("/pipeline/:id/events", (req: Request, res: Response) => {
    const pipeline = orchestrator.getPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "pipeline_not_found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send existing events
    for (const event of pipeline.events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // SSE heartbeat to prevent proxy timeouts (Traefik, Cloudflare)
    const heartbeat = setInterval(() => { res.write(":\n\n"); }, 30000);

    // Listen for new events
    const onEvent = (event: PipelineEvent) => {
        if (event.pipelineId === req.params.id) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    };

    const onPhaseChange = (data: { pipelineId: string; phase: string }) => {
        if (data.pipelineId === req.params.id) {
            res.write(`data: ${JSON.stringify({ type: "phase-change", ...data })}\n\n`);
        }
    };

    orchestrator.on("event", onEvent);
    orchestrator.on("phase-change", onPhaseChange);

    req.on("close", () => {
        clearInterval(heartbeat);
        orchestrator.off("event", onEvent);
        orchestrator.off("phase-change", onPhaseChange);
    });
});

// SSE stream for ALL pipeline events (cross-project live feed)
app.get("/pipeline/events/all", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // PERF-12: Only take last 50 events per pipeline (pre-sorted), then merge
    const pipelines = orchestrator.listPipelines();
    const allEvents = pipelines
        .flatMap(p => p.events.slice(-50))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-50);

    for (const event of allEvents) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // SSE heartbeat
    const heartbeat = setInterval(() => { res.write(":\n\n"); }, 30000);

    const onEvent = (event: PipelineEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    orchestrator.on("event", onEvent);
    _req.on("close", () => { clearInterval(heartbeat); orchestrator.off("event", onEvent); });
});

// Pause/Resume pipeline
app.post("/pipeline/:id/pause", async (req: Request, res: Response) => {
    const ok = await orchestrator.pausePipeline(req.params.id);
    res.json({ ok });
});

app.post("/pipeline/:id/resume", async (req: Request, res: Response) => {
    const ok = await orchestrator.resumePipeline(req.params.id);
    res.json({ ok });
});

// QUAL-53: Shared helper — full cleanup (GitHub + Docker + orchestrator)
async function cleanupPipelineResources(pipelineId: string): Promise<void> {
    const pipeline = orchestrator.getPipeline(pipelineId);
    if (!pipeline) return;

    // 1. Delete GitHub repo (silently ignore errors)
    if (pipeline.github) {
        try {
            const { deleteRepo } = await import('./github_api.js');
            await deleteRepo(pipeline.github.owner, pipeline.github.repo);
        } catch { /* Repo may already be deleted */ }
    }

    // 2. Delete Docker container + image (SEC-15: sanitized names)
    try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        const rawName = pipeline.name ? `veist-${slugify(pipeline.name)}-app` : `veist-${slugify(pipelineId)}-app`;
        const containerName = sanitizeName(rawName);
        let imageName = "";
        try {
            const { stdout } = await execAsync(
                `docker inspect --format="{{.Config.Image}}" ${containerName}`,
                { encoding: "utf-8", timeout: 5000 }
            );
            imageName = stdout.trim();
            if (imageName) sanitizeName(imageName);
        } catch { /* container may not exist */ }
        try { await execAsync(`docker rm -f ${containerName}`, { timeout: 15000 }); } catch { /* expected */ }
        if (imageName) {
            try { await execAsync(`docker rmi ${imageName}`, { timeout: 15000 }); } catch { /* expected */ }
        }
    } catch { /* Docker not available */ }

    // 3. Delete from orchestrator
    await orchestrator.deletePipeline(pipelineId);
}

// Delete pipeline (with full cleanup: GitHub + Docker + orchestrator)
app.delete("/pipeline/:id", async (req: Request, res: Response) => {
    try {
        const pipeline = orchestrator.getPipeline(req.params.id);
        if (!pipeline) {
            return res.status(404).json({ error: "pipeline_not_found" });
        }
        await cleanupPipelineResources(req.params.id);
        res.json({ ok: true, id: req.params.id });
    } catch (err: any) {
        console.error("DELETE /pipeline/:id error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Modify pipeline (send new instructions to a completed/failed project)
app.post("/pipeline/:id/modify", async (req: Request, res: Response) => {
    try {
        const instructions = String(req.body?.instructions ?? "").trim();
        const model = req.body?.model ? String(req.body.model).trim() : undefined;
        let files = req.body?.files as { base64: string; type: string }[] | undefined;

        if (!instructions && (!files || files.length === 0)) {
            return res.status(400).json({ error: "instructions_or_files_required" });
        }

        // SEC-07 (bis): Validate uploaded files on modify too
        if (files && Array.isArray(files)) {
            const MAX_FILES = 5;
            const MAX_FILE_SIZE = 5 * 1024 * 1024;
            const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);
            if (files.length > MAX_FILES) return res.status(400).json({ error: `Too many files. Max ${MAX_FILES}.` });
            for (const file of files) {
                if (!ALLOWED_MIMES.has(file.type)) return res.status(400).json({ error: `File type not allowed: ${file.type}` });
                const sizeBytes = Buffer.byteLength(file.base64, 'base64');
                if (sizeBytes > MAX_FILE_SIZE) return res.status(400).json({ error: `File too large. Max 5MB.` });
            }
        }

        const pipeline = await orchestrator.modifyPipeline(req.params.id, instructions, model, files);
        if (!pipeline) {
            return res.status(404).json({ error: "pipeline_not_found" });
        }
        res.json({ pipeline });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// Get repo context (tree + key files) for AI-assisted modification
app.get("/pipeline/:id/repo-context", async (req: Request, res: Response) => {
    try {
        const pipeline = orchestrator.getPipeline(req.params.id);
        if (!pipeline) return res.status(404).json({ error: "pipeline_not_found" });
        if (!pipeline.github) return res.status(400).json({ error: "no_github_repo", context: "" });

        const { getRepoContext } = await import('./github_api.js');
        const context = await getRepoContext(pipeline.github.owner, pipeline.github.repo);
        res.json({ context });
    } catch (err: any) {
        res.status(500).json({ error: err.message, context: "" });
    }
});

app.post("/pipeline/:id/kill", async (req: Request, res: Response) => {
    try {
        const success = await orchestrator.killPipeline(req.params.id);
        if (success) {
            res.json({ success: true, message: "Pipeline arrêté avec succès." });
        } else {
            res.status(404).json({ error: "pipeline_not_found" });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Smart Retry — resume a failed pipeline from where it stopped
app.post("/pipeline/:id/retry", async (req: Request, res: Response) => {
    try {
        const result = await orchestrator.retryPipeline(req.params.id);
        if (!result) return res.status(400).json({ error: "pipeline_not_found_or_not_failed" });
        res.json({ pipeline: result });
    } catch (err: any) {
        console.error("Retry pipeline error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────
// 🔮 Embeddings (Phase 2.5 — Semantic Search)
// ─────────────────────────────────────

app.get("/embeddings/:pipelineId/status", async (req: Request, res: Response) => {
    try {
        const { getEmbeddingService } = await import("./embedding_service.js");
        const status = await getEmbeddingService().getStatus(req.params.pipelineId);
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/embeddings/:pipelineId/search", async (req: Request, res: Response) => {
    try {
        const query = String(req.body?.query ?? "").trim();
        const topK = req.body?.topK ? Number(req.body.topK) : 5;
        if (!query) return res.status(400).json({ error: "missing_query" });

        const { getEmbeddingService } = await import("./embedding_service.js");
        const results = await getEmbeddingService().search(req.params.pipelineId, query, topK);
        res.json({ query, results });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/embeddings/:pipelineId/reindex", async (req: Request, res: Response) => {
    try {
        const pipeline = orchestrator.getPipeline(req.params.pipelineId);
        if (!pipeline) return res.status(404).json({ error: "pipeline_not_found" });

        const { getEmbeddingService } = await import("./embedding_service.js");
        // Non-blocking — return immediately
        getEmbeddingService().indexRepository(req.params.pipelineId, pipeline.workspace)
            .then((idx) => {
                console.log(`🔮 [Embedding] Manual reindex done: ${idx.chunkCount} chunks`);
            })
            .catch((err: any) => {
                console.error(`[Embedding] Reindex failed:`, err.message);
            });
        res.json({ ok: true, message: "Reindexation started in background" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────
// Projects & Dashboard Data
// ─────────────────────────────────────

app.get("/projects", async (_req: Request, res: Response) => {
    try {
        const projects: any[] = [];

        // 1. Get Orchestrator Pipelines
        const pipelines = orchestrator.listPipelines();
        for (const p of pipelines) {
            projects.push({
                id: p.id,
                name: p.name,
                description: p.description,
                phase: p.phase,
                progress: p.progress,
                agents: p.agents,
                github: p.github,
                createdAt: p.createdAt,
                type: 'pipeline'
            });
        }


        res.json({ projects });
    } catch (err) {
        console.error("GET /projects error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Delete project (QUAL-53: uses shared cleanup — includes Docker cleanup)
app.delete("/projects/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const pipeline = orchestrator.getPipeline(id);
        if (!pipeline) {
            return res.status(404).json({ error: "project_not_found" });
        }
        await cleanupPipelineResources(id);
        res.json({ success: true, id });
    } catch (err: any) {
        console.error("DELETE /projects/:id error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────
// skills.sh HTTP API
// ─────────────────────────────────────

app.get("/skills/trending", async (req: Request, res: Response) => {
    // SEC-48: Clamp limit to prevent abuse
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 200);
    const items = await fetchTrending(limit);
    res.json({ items });
});

app.get("/skills/search", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "");
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 200);
    const items = await searchSkills(q, limit);
    res.json({ q, items });
});

app.get("/skills/get", async (req: Request, res: Response) => {
    const owner = String(req.query.owner ?? "");
    const repo = String(req.query.repo ?? "");
    const skill = String(req.query.skill ?? "");
    // SEC-47: Validate params to prevent path injection
    const SKILL_PARAM_RE = /^[a-zA-Z0-9._-]+$/;
    if (!owner || !repo || !skill || !SKILL_PARAM_RE.test(owner) || !SKILL_PARAM_RE.test(repo) || !SKILL_PARAM_RE.test(skill)) {
        return res.status(400).json({ error: "Invalid owner/repo/skill parameter" });
    }
    const detail = await fetchSkillDetail(owner, repo, skill);
    res.json(detail);
});

// ─────────────────────────────────────
// Profiles
// ─────────────────────────────────────

app.get("/profiles", (_req: Request, res: Response) => {
    res.json({ profiles: PROFILES });
});

// NOTE: /templates route defined above (L181) with dynamic registry + search support

// ─────────────────────────────────────
// Agents
// ─────────────────────────────────────

app.get("/agents", async (_req: Request, res: Response) => {
    const agents = await agentsStore.listAgents();
    res.json({ agents });
});

app.post("/agents", async (req: Request, res: Response) => {
    const name = String(req.body?.name ?? "").trim();
    const meta = (req.body?.meta ?? undefined) as Record<string, unknown> | undefined;
    const profileId = req.body?.profileId ? String(req.body.profileId) : undefined;

    if (!name) return res.status(400).json({ error: "missing_name" });

    const agent = await agentsStore.createAgent(name, meta);

    if (profileId) {
        const profile = getProfile(profileId);
        if (!profile) return res.status(400).json({ error: "unknown_profile", profileId });

        for (const sk of profile.skills) {
            await agentsStore.assignSkill(agent.id, {
                owner: sk.owner,
                repo: sk.repo,
                skill: sk.skill,
                href: sk.href,
                title: sk.title,
                installs: sk.installs,
                installs_display: sk.installs_display,
            });
        }
    }

    res.json({ agent, profileId: profileId ?? null });
});

app.get("/agents/:id/skills", async (req: Request, res: Response) => {
    try {
        const skills = await agentsStore.listSkills(req.params.id);
        res.json({ agentId: req.params.id, skills });
    } catch (e: any) {
        if (String(e?.message) === "agent_not_found") return res.status(404).json({ error: "agent_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});

app.post("/agents/:id/skills", async (req: Request, res: Response) => {
    try {
        const owner = String(req.body?.owner ?? "");
        const repo = String(req.body?.repo ?? "");
        const skill = String(req.body?.skill ?? "");
        const href = String(req.body?.href ?? "");
        const title = req.body?.title ? String(req.body.title) : undefined;
        const installs = req.body?.installs != null ? Number(req.body.installs) : undefined;
        const installs_display = req.body?.installs_display ? String(req.body.installs_display) : undefined;

        if (!owner || !repo || !skill || !href) {
            return res.status(400).json({ error: "missing_fields", required: ["owner", "repo", "skill", "href"] });
        }

        const assigned = await agentsStore.assignSkill(req.params.id, {
            owner, repo, skill, href, title, installs, installs_display,
        });

        res.json({ agentId: req.params.id, assigned });
    } catch (e: any) {
        if (String(e?.message) === "agent_not_found") return res.status(404).json({ error: "agent_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});

app.delete("/agents/:id/skills", async (req: Request, res: Response) => {
    try {
        const href = String(req.query.href ?? "");
        if (!href) return res.status(400).json({ error: "missing_href" });

        const ok = await agentsStore.unassignSkill(req.params.id, href);
        res.json({ ok });
    } catch (e: any) {
        if (String(e?.message) === "agent_not_found") return res.status(404).json({ error: "agent_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});


// ─────────────────────────────────────
// 🐳 Container Management
// ─────────────────────────────────────

app.get("/containers", async (_req: Request, res: Response) => {
    try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        // PERF-11: Non-blocking docker ps (was execSync — blocked event loop)
        const { stdout: rawAll } = await execAsync(
            `docker ps -a --format "{{json .}}"`,
            { encoding: "utf-8", timeout: 10000 }
        );

        // Deduplicate by ID
        const seen = new Set<string>();
        const allLines: string[] = [];
        for (const line of rawAll.split("\n")) {
            if (!line) continue;
            try {
                const parsed = JSON.parse(line);
                if (!seen.has(parsed.ID)) {
                    seen.add(parsed.ID);
                    allLines.push(line);
                }
            } catch { /* skip invalid JSON */ }
        }
        const raw = allLines.join("\n");

        const containers = raw
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const c = JSON.parse(line);
                return {
                    id: c.ID,
                    name: c.Names,
                    image: c.Image,
                    status: c.Status,
                    state: c.State, // "running" | "exited" etc
                    ports: c.Ports,
                    created: c.CreatedAt,
                    // Derive URL: match pipeline by container name
                    url: (() => {
                        const pipelines = orchestrator.listPipelines();
                        const match = pipelines.find(p => p.name && `veist-${slugify(p.name)}-app` === c.Names);
                        if (match) {
                            if (match.artifacts?.deployedUrl) return match.artifacts.deployedUrl as string;
                            // Use repo name as subdomain (repo.hach.dev)
                            const repoSlug = match.github?.repo ? slugify(match.github.repo) : slugify(match.name);
                            return `https://${repoSlug}.hach.dev`;
                        }
                        // Fallback: extract slug from container name (veist-NAME-app)
                        const m = c.Names.match(/^veist-(.+?)(?:-app)?$/);
                        return m ? `https://${m[1]}.hach.dev` : null;
                    })(),
                };
            });

        res.json({ containers });
    } catch (err: any) {
        console.error("GET /containers error:", err.message);
        res.json({ containers: [] });
    }
});

// SEC-13: All container routes sanitize :name to prevent command injection
app.post("/containers/:name/stop", async (req: Request, res: Response) => {
    try {
        const name = sanitizeName(req.params.name);
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        await execAsync(`docker stop ${name}`, { timeout: 30000 });
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/containers/:name/start", async (req: Request, res: Response) => {
    try {
        const name = sanitizeName(req.params.name);
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        await execAsync(`docker start ${name}`, { timeout: 30000 });
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/containers/:name/restart", async (req: Request, res: Response) => {
    try {
        const name = sanitizeName(req.params.name);
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        await execAsync(`docker restart ${name}`, { timeout: 30000 });
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/containers/:name", async (req: Request, res: Response) => {
    try {
        const name = sanitizeName(req.params.name);
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        let imageName = "";
        try {
            const { stdout } = await execAsync(
                `docker inspect --format="{{.Config.Image}}" ${name}`,
                { encoding: "utf-8", timeout: 5000 }
            );
            imageName = stdout.trim();
            // QUAL-02: Validate image name — allow colons for image:tag format
            if (imageName && !/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(imageName)) {
                imageName = ""; // reject invalid image name
            }
        } catch {}
        await execAsync(`docker rm -f ${name}`, { timeout: 30000 });
        if (imageName) {
            try { await execAsync(`docker rmi ${imageName}`, { timeout: 30000 }); } catch {}
        }
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/containers/:name/logs", async (req: Request, res: Response) => {
    try {
        const name = sanitizeName(req.params.name);
        // SEC-14: Validate lines as positive integer
        const rawLines = Number(req.query.lines);
        const lines = (Number.isInteger(rawLines) && rawLines > 0 && rawLines <= 5000) ? rawLines : 100;
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        const { stdout: logs } = await execAsync(
            `docker logs --tail ${lines} ${name} 2>&1`,
            { encoding: "utf-8", timeout: 10000 }
        );
        res.json({ logs });
    } catch (err: any) {
        res.status(500).json({ error: err.message, logs: "" });
    }
});

// ─────────────────────────────────────
// 🔐 Secrets Vault
// ─────────────────────────────────────

import { getSecretsService } from "./secrets_service.js";
const secretsService = getSecretsService();

// Save/update secrets for a pipeline
app.put("/pipeline/:id/secrets", async (req: Request, res: Response) => {
    try {
        const secrets = req.body?.secrets;
        if (!secrets || typeof secrets !== "object") {
            return res.status(400).json({ error: "secrets must be a key-value object" });
        }
        secretsService.setSecrets(req.params.id, secrets);
        res.json({ ok: true, count: Object.keys(secrets).length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get secrets (masked values for display)
app.get("/pipeline/:id/secrets", async (req: Request, res: Response) => {
    try {
        const masked = secretsService.getMaskedSecrets(req.params.id);
        res.json({ secrets: masked });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── VPS Monitoring (Hostinger API) ───
const HOSTINGER_TOKEN = process.env.HOSTINGER_API_TOKEN;
// SEC-27: VPS_ID now configurable via env (was hardcoded — same fix as QUAL-11)
const VPS_ID = parseInt(process.env.VPS_VM_ID || "1287719", 10);

app.get("/vps/metrics", async (_req: Request, res: Response) => {
    try {
        if (!HOSTINGER_TOKEN) {
            return res.status(500).json({ error: "HOSTINGER_API_TOKEN not configured" });
        }
        const headers = { Authorization: `Bearer ${HOSTINGER_TOKEN}`, 'Content-Type': 'application/json' };

        // Fetch VPS details + metrics in parallel
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        // QUAL-48: Add timeout to Hostinger API fetches
        const vpsController = new AbortController();
        const vpsTimeout = setTimeout(() => vpsController.abort(), 10_000);
        const [detailsRes, metricsRes] = await Promise.all([
            fetch(`https://developers.hostinger.com/api/vps/v1/virtual-machines/${VPS_ID}`, { headers, signal: vpsController.signal }),
            fetch(`https://developers.hostinger.com/api/vps/v1/virtual-machines/${VPS_ID}/metrics?date_from=${fmt(yesterday)}&date_to=${fmt(tomorrow)}`, { headers, signal: vpsController.signal }),
        ]);
        clearTimeout(vpsTimeout);

        if (!detailsRes.ok || !metricsRes.ok) {
            return res.status(502).json({ error: "Hostinger API error", detailsStatus: detailsRes.status, metricsStatus: metricsRes.status });
        }

        const details: any = await detailsRes.json();
        const metrics: any = await metricsRes.json();

        // Get latest value from time-series data
        const latest = (usage: Record<string, number>) => {
            const keys = Object.keys(usage).sort((a, b) => Number(b) - Number(a));
            return keys.length > 0 ? usage[keys[0]] : 0;
        };

        // Get last N values for mini-chart
        const lastN = (usage: Record<string, number>, n = 20) => {
            const entries = Object.entries(usage)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .slice(-n);
            return entries.map(([ts, val]) => ({ t: Number(ts), v: val }));
        };

        const totalRam = details.memory * 1024 * 1024; // memory is in MB
        const totalDisk = details.disk * 1024 * 1024; // disk is in MB  
        const totalBandwidth = details.bandwidth * 1024 * 1024; // bandwidth is in MB
        const currentRam = latest(metrics.ram_usage?.usage || {});
        const currentDisk = latest(metrics.disk_space?.usage || {});
        const currentCpu = latest(metrics.cpu_usage?.usage || {});
        const uptimeSeconds = latest(metrics.uptime?.usage || {});

        // Sum all incoming + outgoing traffic
        const sumValues = (usage: Record<string, number>) => Object.values(usage).reduce((a, b) => a + b, 0);
        const totalIncoming = sumValues(metrics.incoming_traffic?.usage || {});
        const totalOutgoing = sumValues(metrics.outgoing_traffic?.usage || {});

        res.json({
            vps: {
                id: details.id,
                hostname: details.hostname,
                state: details.state,
                plan: details.plan,
                os: details.template?.name || 'Unknown',
                ip: details.ipv4?.[0]?.address || '',
                cpus: details.cpus,
                createdAt: details.created_at,
            },
            current: {
                cpu: Math.round(currentCpu * 100) / 100,
                ram: { used: currentRam, total: totalRam, percent: Math.round((currentRam / totalRam) * 10000) / 100 },
                disk: { used: currentDisk, total: totalDisk, percent: Math.round((currentDisk / totalDisk) * 10000) / 100 },
                bandwidth: { used: totalIncoming + totalOutgoing, total: totalBandwidth, percent: Math.round(((totalIncoming + totalOutgoing) / totalBandwidth) * 10000) / 100 },
                traffic: { incoming: totalIncoming, outgoing: totalOutgoing },
                uptime: uptimeSeconds,
            },
            charts: {
                cpu: lastN(metrics.cpu_usage?.usage || {}),
                ram: lastN(metrics.ram_usage?.usage || {}),
                disk: lastN(metrics.disk_space?.usage || {}),
            },
        });
    } catch (err: any) {
        console.error("[VPS Metrics] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a specific secret or all secrets
app.delete("/pipeline/:id/secrets", async (req: Request, res: Response) => {
    try {
        const key = req.query.key as string | undefined;
        if (key) {
            secretsService.deleteSecret(req.params.id, key);
        } else {
            secretsService.deleteAllSecrets(req.params.id);
        }
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────
// 💬 Chat Mode (Pre-Pipeline)
// ─────────────────────────────────────

import { ChatService } from "./chat_service.js";
const chatService = new ChatService(storePath);

// Create new chat session
app.post("/chat/sessions", async (req: Request, res: Response) => {
    try {
        const model = req.body?.model ? String(req.body.model).trim() : undefined;
        const projectId = req.body?.projectId ? String(req.body.projectId).trim() : undefined;
        const session = chatService.createSession(model, projectId);
        res.json({ session });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Send message in chat session (SEC-12: Rate limited to 30/min)
app.post("/chat/sessions/:id/message", chatLimiter, async (req: Request, res: Response) => {
    try {
        const content = String(req.body?.content ?? "").trim();
        const files = req.body?.files as { base64: string; type: string }[] | undefined;
        if (!content && (!files || files.length === 0)) return res.status(400).json({ error: "missing_content" });

        // Build pipeline context if a project is linked
        const session = chatService.getSession(req.params.id);
        let pipelineContext: { name: string; phase: string; error?: string; events: string[]; workspace?: string } | undefined;
        if (session?.projectId) {
            const pipeline = orchestrator.getPipeline(session.projectId);
            if (pipeline) {
                pipelineContext = {
                    name: pipeline.name,
                    phase: pipeline.phase,
                    error: pipeline.error,
                    events: (pipeline.events || []).slice(-15).map((e: any) => `${e.emoji} ${e.role}: ${e.action}`),
                    workspace: pipeline.workspace,
                };
            }
        }

        const result = await chatService.sendMessage(req.params.id, content || '[Attached files]', pipelineContext, files);
        res.json(result);
    } catch (err: any) {
        console.error(`[Chat] Error in session ${req.params.id}:`, err.message || err);
        res.status(err.message === "session_not_found" ? 404 : 500).json({ error: err.message });
    }
});

// Get chat session
app.get("/chat/sessions/:id", async (req: Request, res: Response) => {
    try {
        const session = chatService.getSession(req.params.id);
        if (!session) return res.status(404).json({ error: "session_not_found" });
        res.json({ session });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// List all chat sessions
app.get("/chat/sessions", async (_req: Request, res: Response) => {
    const sessions = chatService.listSessions();
    res.json({ sessions });
});

// Launch pipeline from chat session
app.post("/chat/sessions/:id/launch", async (req: Request, res: Response) => {
    try {
        const brief = chatService.generateBrief(req.params.id);
        if (!brief) return res.status(404).json({ error: "session_not_found" });

        const nameOverride = req.body?.name ? String(req.body.name).trim() : undefined;
        const templateId = req.body?.templateId ? String(req.body.templateId).trim() : undefined;
        const githubUrl = req.body?.githubUrl ? String(req.body.githubUrl).trim() : undefined;

        const pipeline = await orchestrator.launchIdea(
            brief.description,
            nameOverride || brief.name,
            brief.model,
            undefined,
            templateId,
            githubUrl
        );

        chatService.linkProject(req.params.id, pipeline.id);
        res.json({ pipeline, brief });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Delete chat session
app.delete("/chat/sessions/:id", async (req: Request, res: Response) => {
    const ok = chatService.deleteSession(req.params.id);
    res.json({ ok });
});

// Link/unlink chat session to a project
app.put("/chat/sessions/:id/link", async (req: Request, res: Response) => {
    try {
        const projectId = req.body?.projectId ? String(req.body.projectId).trim() : null;
        const ok = chatService.linkProject(req.params.id, projectId);
        if (!ok) return res.status(404).json({ error: "session_not_found" });
        res.json({ ok, projectId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────
// Events
// ─────────────────────────────────────

app.get("/events", async (req: Request, res: Response) => {
    // SEC-48: Clamp limit to prevent abuse
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);
    const events = await agentsStore.listEvents(limit);
    res.json({ events });
});

// Quick Deploy routes
app.use('/api/quick-deploy', quickDeployRouter);

// Start HTTP server (wait for orchestrator to finish loading state)
const PORT = Number(process.env.PORT) || 3000;

// Global error handler — catches Express-level errors (body-parser, etc.)
app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Express] Unhandled error:", err.type || err.message, err.status || 500);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

(async () => {
    await orchestrator.ready;
    const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 VEIST HQ listening on port ${PORT}  [BUILD: ${process.env.BUILD_TAG || "dev"}]`);
        console.log(`   Docker/Traefik Mode: ✓ Active`);
        console.log(`   GitHub: ${process.env.GITHUB_TOKEN ? "✓ configured" : "✗ not configured"}`);
        console.log(`   AI Model: ${getCurrentModel()}`);
    });

    // QUAL-26: Graceful shutdown — flush memory and close server on SIGTERM/SIGINT
    const shutdown = async (signal: string) => {
        console.log(`\n⚡ [Shutdown] Received ${signal}, gracefully shutting down...`);
        try {
            // Flush memory service (persist pending extractions)
            const { getMemoryService } = await import("./memory_service.js");
            await getMemoryService().flush();
            console.log("⚡ [Shutdown] Memory flushed ✓");
        } catch (err) {
            console.error("⚡ [Shutdown] Memory flush failed:", err);
        }
        // QUAL-33: Flush secrets service (debounced saves may be pending)
        try {
            const { getSecretsService } = await import("./secrets_service.js");
            const svc = getSecretsService();
            // Force immediate save by triggering the internal save
            (svc as any).saveTimeout && clearTimeout((svc as any).saveTimeout);
            await (svc as any).saveToDisk();
            console.log("⚡ [Shutdown] Secrets flushed ✓");
        } catch (err) {
            console.error("⚡ [Shutdown] Secrets flush failed:", err);
        }
        server.close(() => {
            console.log("⚡ [Shutdown] Server closed ✓");
            process.exit(0);
        });
        // Force exit after 10s if server doesn't close
        setTimeout(() => {
            console.error("⚡ [Shutdown] Forced exit after timeout");
            process.exit(1);
        }, 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
})();

export default app;

