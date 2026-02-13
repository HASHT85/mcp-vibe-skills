import express, { type Request, type Response } from "express";
import cors from "cors";

import { AgentsStore } from "./agents_store.js";
import { ProjectsStore } from "./projects_store.js";

import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { PROFILES, getProfile } from "./profiles.js";
import { TEMPLATES } from "./templates.js";
import {
    isDokployConfigured,
    listDokployProjects,
    getDokployProject,
    listDokployApplications,
    triggerDeploy,
} from "./dokploy.js";

import { BmadEngine } from './bmad.js';

const app = express();
const port = process.env.PORT || 3000;
const storePath = process.env.STORE_PATH || '/data/store.json';
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: "1mb" }));

// Initialize Stores
const agentsStore = new AgentsStore(storePath);
const projectsStore = new ProjectsStore(storePath);

// Initialize BMAD Engine
const bmadEngine = BmadEngine.getInstance();

// Health
app.get("/", (_req: Request, res: Response) => res.json({ service: "mcp-vibe-skills", status: "running" }));
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// ----------------------------
// Pipeline (BMAD)
// ----------------------------

app.post("/pipeline/create", async (req: Request, res: Response) => {
    const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
    const description = req.body?.description ? String(req.body.description) : undefined;

    if (!projectId || !description) {
        return res.status(400).json({ error: "missing_fields", required: ["projectId", "description"] });
    }

    try {
        // Create and start pipeline
        const state = bmadEngine.createPipeline(projectId, description);
        // Start async logic (don't await confirmation for long tasks in real app, but here it's fine for initial kick-off)
        bmadEngine.next(projectId).catch(err => console.error("Async Pipeline Error:", err));

        res.json(state);
    } catch (err: any) {
        console.error("Pipeline Init Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/pipeline/:projectId", (req: Request, res: Response) => {
    const { projectId } = req.params;
    const state = bmadEngine.getPipeline(projectId);
    if (!state) return res.status(404).json({ error: "pipeline_not_found" });
    res.json(state);
});

// ----------------------------
// skills.sh HTTP API
// ----------------------------

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

// ----------------------------
// Profiles + Templates
// ----------------------------

app.get("/profiles", (_req: Request, res: Response) => {
    res.json({ profiles: PROFILES });
});

app.get("/templates", (_req: Request, res: Response) => {
    res.json({ templates: TEMPLATES });
});

// ----------------------------
// Agents
// ----------------------------

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
            owner,
            repo,
            skill,
            href,
            title,
            installs,
            installs_display,
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

// ----------------------------
// Projects
// ----------------------------

app.get("/projects", async (_req: Request, res: Response) => {
    const items = await projectsStore.listProjects();
    res.json({ projects: items });
});

app.get("/projects/:id", async (req: Request, res: Response) => {
    const project = await projectsStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const links = await projectsStore.listProjectAgents(req.params.id);
    res.json({ project, agents: links });
});

app.post("/projects", async (req: Request, res: Response) => {
    try {
        const name = String(req.body?.name ?? "").trim();
        const templateId = String(req.body?.templateId ?? "").trim();
        const meta = (req.body?.meta ?? undefined) as Record<string, unknown> | undefined;

        if (!name) return res.status(400).json({ error: "missing_name" });
        if (!templateId) return res.status(400).json({ error: "missing_templateId" });

        const out = await projectsStore.createProjectFromTemplate({ name, templateId, meta });
        res.json(out);
    } catch (e: any) {
        const msg = String(e?.message || "internal_error");
        if (msg === "template_not_found") return res.status(400).json({ error: "template_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});

app.post("/projects/:id/agents", async (req: Request, res: Response) => {
    try {
        const projectId = req.params.id;
        const name = String(req.body?.name ?? "").trim();
        const profileId = req.body?.profileId ? String(req.body.profileId) : undefined;
        const meta = (req.body?.meta ?? undefined) as Record<string, unknown> | undefined;
        const role = req.body?.role ? String(req.body.role) : undefined;

        if (!name) return res.status(400).json({ error: "missing_name" });

        const out = await projectsStore.addAgentToProject({ projectId, name, profileId, meta, role });
        res.json(out);
    } catch (e: any) {
        const msg = String(e?.message || "internal_error");
        if (msg === "project_not_found") return res.status(404).json({ error: "project_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});

app.get("/projects/:id/full", async (req: Request, res: Response) => {
    const project = await projectsStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const links = await projectsStore.listProjectAgents(req.params.id);

    const agentsWithSkills = await Promise.all(
        links.map(async (l: any) => {
            const skills = await agentsStore.listSkills(l.agentId).catch(() => []);
            return {
                agentId: l.agentId,
                role: l.role ?? null,
                skills,
            };
        })
    );

    res.json({
        project,
        agents: links,
        agentsWithSkills,
    });
});


// ----------------------------
// Dokploy Integration
// ----------------------------

app.get("/dokploy/status", (_req: Request, res: Response) => {
    res.json({ configured: isDokployConfigured() });
});

app.get("/dokploy/projects", async (_req: Request, res: Response) => {
    try {
        if (!isDokployConfigured()) {
            return res.status(503).json({ error: "dokploy_not_configured" });
        }
        const projects = await listDokployProjects();
        res.json({ projects });
    } catch (e: any) {
        res.status(500).json({ error: String(e?.message || "dokploy_error") });
    }
});

app.get("/dokploy/projects/:id", async (req: Request, res: Response) => {
    try {
        if (!isDokployConfigured()) {
            return res.status(503).json({ error: "dokploy_not_configured" });
        }
        const project = await getDokployProject(req.params.id);
        if (!project) return res.status(404).json({ error: "project_not_found" });

        const applications = await listDokployApplications(req.params.id);
        res.json({ project, applications });
    } catch (e: any) {
        res.status(500).json({ error: String(e?.message || "dokploy_error") });
    }
});

app.post("/dokploy/deploy/:applicationId", async (req: Request, res: Response) => {
    try {
        if (!isDokployConfigured()) {
            return res.status(503).json({ error: "dokploy_not_configured" });
        }
        const ok = await triggerDeploy(req.params.applicationId);
        if (ok) {
            await agentsStore.listEvents(1); // Force load to emit event
            // Emit event manually
        }
        res.json({ ok, applicationId: req.params.applicationId });
    } catch (e: any) {
        res.status(500).json({ error: String(e?.message || "dokploy_error") });
    }
});

// ----------------------------
// Events
// ----------------------------

app.get("/events", async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const events = await agentsStore.listEvents(limit);
    res.json({ events });
});

// Start HTTP server
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`HTTP server listening on ${PORT}`);
});
