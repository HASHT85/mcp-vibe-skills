import express, { type Request, type Response } from "express";

import { mountRemoteMcp } from "./mcp_remote.js";
import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// API HTTP actuelle

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


// MCP remote
mountRemoteMcp(app);

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => {
    console.error(`Listening on ${port}`);
});
