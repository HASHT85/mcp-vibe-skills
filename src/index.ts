import express, { type Request, type Response } from "express";
import { AgentsStore } from "./agents_store.js";
import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { PROFILES, getProfile } from "./profiles.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const store = new AgentsStore();

// Health
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// ---- skills.sh HTTP API ----

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

// ---- Profiles ----

app.get("/profiles", (_req: Request, res: Response) => {
    res.json({ profiles: PROFILES });
});

// ---- Agents ----

app.get("/agents", async (_req: Request, res: Response) => {
    const agents = await store.listAgents();
    res.json({ agents });
});

app.post("/agents", async (req: Request, res: Response) => {
    const name = String(req.body?.name ?? "").trim();
    const meta = (req.body?.meta ?? undefined) as Record<string, unknown> | undefined;
    const profileId = req.body?.profileId ? String(req.body.profileId) : undefined;

    if (!name) return res.status(400).json({ error: "missing_name" });

    const agent = await store.createAgent(name, meta);

    if (profileId) {
        const profile = getProfile(profileId);
        if (!profile) return res.status(400).json({ error: "unknown_profile", profileId });

        for (const sk of profile.skills) {
            await store.assignSkill(agent.id, {
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

app.delete("/agents/:id", async (req: Request, res: Response) => {
    const ok = await store.deleteAgent(req.params.id);
    res.json({ ok });
});

// ---- Assignments ----

app.get("/agents/:id/skills", async (req: Request, res: Response) => {
    try {
        const skills = await store.listSkills(req.params.id);
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

        const assigned = await store.assignSkill(req.params.id, {
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

        const ok = await store.unassignSkill(req.params.id, href);
        res.json({ ok });
    } catch (e: any) {
        if (String(e?.message) === "agent_not_found") return res.status(404).json({ error: "agent_not_found" });
        return res.status(500).json({ error: "internal_error" });
    }
});

// ---- Events (pour Vibecraft / UI) ----

app.get("/events", async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const events = await store.listEvents(limit);
    res.json({ events });
});

// ---- Start HTTP server ----
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`HTTP server listening on ${PORT}`);
});
