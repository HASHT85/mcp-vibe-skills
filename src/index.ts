import http from "node:http";
import { URL } from "node:url";
import { fetchTrending } from "./skills.js";
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
