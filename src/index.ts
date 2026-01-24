import http from "node:http";
import { URL } from "node:url";
import { fetchTrending, fetchHot } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { vibecraftHealth } from "./vibecraft.js";

const PORT = Number(process.env.PORT ?? 8080);
const VIBECRAFT_BASE_URL = process.env.VIBECRAFT_BASE_URL ?? "http://127.0.0.1:4003";

function json(res: http.ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(data)
    });
    res.end(data);
}

const server = http.createServer(async (req, res) => {
    try {
        if (!req.url) return json(res, 400, { error: "no_url" });
        const u = new URL(req.url, `http://${req.headers.host}`);

        if (u.pathname === "/health") return json(res, 200, { ok: true });

        if (u.pathname === "/skills/trending") {
            const limit = Math.min(Number(u.searchParams.get("limit") ?? 20), 50);
            const items = await fetchTrending(limit);
            return json(res, 200, { items });
        }

        if (u.pathname === "/skills/get") {
            const owner = u.searchParams.get("owner") || "";
            const repo = u.searchParams.get("repo") || "";
            const skill = u.searchParams.get("skill") || "";
            if (!owner || !repo || !skill) return json(res, 400, { error: "missing_params", required: ["owner", "repo", "skill"] });

            const detail = await fetchSkillDetail(owner, repo, skill);
            return json(res, 200, detail);
        }

        if (u.pathname === "/skills/search") {
            const q = (u.searchParams.get("q") || "").toLowerCase().trim();
            const limit = Math.min(Number(u.searchParams.get("limit") ?? 20), 50);
            if (!q) return json(res, 400, { error: "missing_q" });

            const [t, h] = await Promise.all([fetchTrending(50), fetchHot(50)]);
            const merged = [...t, ...h];

            const uniq = new Map<string, typeof merged[number]>();
            for (const it of merged) uniq.set(it.href, it);

            const filtered = Array.from(uniq.values()).filter(it =>
                (it.title || "").toLowerCase().includes(q) ||
                it.owner.toLowerCase().includes(q) ||
                it.repo.toLowerCase().includes(q) ||
                it.skill.toLowerCase().includes(q)
            );

            return json(res, 200, { q, items: filtered.slice(0, limit) });
        }

        if (u.pathname === "/vibecraft/health") {
            const h = await vibecraftHealth(VIBECRAFT_BASE_URL);
            return json(res, 200, h);
        }

        return json(res, 404, { error: "not_found" });
    } catch (e: any) {
        return json(res, 500, { error: "internal_error", message: String(e?.message ?? e) });
    }
});

server.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`mcp-vibe-skills http listening on :${PORT}`);
});
