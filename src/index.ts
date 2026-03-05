import express, { type Request, type Response } from "express";
import cors from "cors";

import { AgentsStore } from "./agents_store.js";
import { ProjectsStore } from "./projects_store.js";

import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { PROFILES, getProfile } from "./profiles.js";
import { TEMPLATES } from "./templates.js";
import { getOrchestrator, type PipelineEvent } from "./orchestrator.js";
import { getCurrentModel } from "./claude_code.js";

const app = express();
const port = process.env.PORT || 3000;
const storePath = process.env.STORE_PATH || '/data/store.json';
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: "1mb" }));

// Basic Auth Middleware
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
    console.warn("⚠️ WARNING: ADMIN_USER or ADMIN_PASS is not set. API is secure but might be inaccessible.");
}

const authMiddleware = (req: Request, res: Response, next: Function) => {
    // Support auth via header OR query param (needed for SSE/EventSource)
    let user = "", pass = "";
    const authHeader = req.headers.authorization;
    const authQuery = req.query.auth as string | undefined;

    if (authHeader) {
        const decoded = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString();
        [user, pass] = decoded.split(':');
    } else if (authQuery) {
        const decoded = Buffer.from(authQuery, 'base64').toString();
        [user, pass] = decoded.split(':');
    }

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="VibeCraft Admin"');
        return res.status(401).send('Authentication required');
    }
};

// Apply Auth to API routes (except health/public)
app.use('/projects', authMiddleware);
app.use('/pipeline', authMiddleware);
app.use('/agents', authMiddleware);
// Initialize Stores
const agentsStore = new AgentsStore(storePath);
const projectsStore = new ProjectsStore(storePath);

// Initialize Orchestrator
const orchestrator = getOrchestrator();

// Health
app.get("/", (_req: Request, res: Response) => res.json({ service: "mcp-vibe-skills", status: "running" }));
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// ─────────────────────────────────────
// Pipeline (New Orchestrator)
// ─────────────────────────────────────

// Launch a new idea → creates full pipeline
app.post("/pipeline/launch", async (req: Request, res: Response) => {
    try {
        const description = String(req.body?.description ?? "").trim();
        const name = req.body?.name ? String(req.body.name).trim() : undefined;
        const model = req.body?.model ? String(req.body.model).trim() : undefined;
        const files = req.body?.files as { base64: string; type: string }[] | undefined;

        if (!description) {
            return res.status(400).json({ error: "missing_description" });
        }

        const pipeline = await orchestrator.launchIdea(description, name, model, files);
        res.json({ pipeline });
    } catch (err: any) {
        console.error("Pipeline launch error:", err);
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

    // Send recent events from all pipelines
    const pipelines = orchestrator.listPipelines();
    const allEvents = pipelines
        .flatMap(p => p.events)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-50);

    for (const event of allEvents) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    const onEvent = (event: PipelineEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    orchestrator.on("event", onEvent);
    _req.on("close", () => orchestrator.off("event", onEvent));
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

// Delete pipeline
app.delete("/pipeline/:id", async (req: Request, res: Response) => {
    const ok = await orchestrator.deletePipeline(req.params.id);
    res.json({ ok });
});

// Modify pipeline (send new instructions to a completed/failed project)
app.post("/pipeline/:id/modify", async (req: Request, res: Response) => {
    try {
        const instructions = String(req.body?.instructions ?? "").trim();
        const model = req.body?.model ? String(req.body.model).trim() : undefined;
        const files = req.body?.files as { base64: string; type: string }[] | undefined;

        if (!instructions && (!files || files.length === 0)) {
            return res.status(400).json({ error: "instructions_or_files_required" });
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

// Delete project (+ GitHub repo + Dokploy)
app.delete("/projects/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const pipeline = orchestrator.getPipeline(id);

    if (pipeline) {
        // Delete GitHub repo
        if (pipeline.github) {
            try {
                const { deleteRepo } = await import('./github_api.js');
                await deleteRepo(pipeline.github.owner, pipeline.github.repo);
            } catch (err) {
                console.error("Failed to delete GitHub repo:", err);
            }
        }

        await orchestrator.deletePipeline(id);
        return res.json({ success: true, id });
    }

    res.status(404).json({ error: "project_not_found" });
});

// ─────────────────────────────────────
// skills.sh HTTP API
// ─────────────────────────────────────

app.get("/skills/trending", async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const items = await fetchTrending(limit);
    res.json({ items });
});

app.get("/skills/search", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "");
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const items = await searchSkills(q, limit);
    res.json({ q, items });
});

app.get("/skills/get", async (req: Request, res: Response) => {
    const owner = String(req.query.owner ?? "");
    const repo = String(req.query.repo ?? "");
    const skill = String(req.query.skill ?? "");
    const detail = await fetchSkillDetail(owner, repo, skill);
    res.json(detail);
});

// ─────────────────────────────────────
// Profiles + Templates
// ─────────────────────────────────────

app.get("/profiles", (_req: Request, res: Response) => {
    res.json({ profiles: PROFILES });
});

app.get("/templates", (_req: Request, res: Response) => {
    res.json({ templates: TEMPLATES });
});

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
// Events
// ─────────────────────────────────────

app.get("/events", async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const events = await agentsStore.listEvents(limit);
    res.json({ events });
});

// Start HTTP server
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VibeCraft HQ listening on port ${PORT}`);
    console.log(`   Docker/Traefik Mode: ✓ Active`);
    console.log(`   GitHub: ${process.env.GITHUB_TOKEN ? "✓ configured" : "✗ not configured"}`);
    console.log(`   AI Model: ${getCurrentModel()}`);
});

export default app;
