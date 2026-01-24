import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchTrending } from "./skills.js";
import { searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";

export function buildMcpServer() {
    const server = new McpServer({
        name: "skills-sh",
        version: "1.0.0",
    });

    server.registerTool(
        "skills_trending",
        {
            description: "Get skills.sh trending list (24h).",
            inputSchema: {
                limit: z.number().int().min(1).max(50).optional().describe("Max items (default 10)"),
            },
        },
        async ({ limit }) => {
            const items = await fetchTrending(limit ?? 10);
            return {
                content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "skills_search",
        {
            description: "Search within the current trending list for a query.",
            inputSchema: {
                q: z.string().min(1).describe("Search query"),
                limit: z.number().int().min(1).max(50).optional().describe("Max items (default 10)"),
            },
        },
        async ({ q, limit }) => {
            const items = await searchSkills(q, limit ?? 10);
            return {
                content: [{ type: "text", text: JSON.stringify({ q, items }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "skills_get",
        {
            description: "Get details of a given skill page on skills.sh.",
            inputSchema: {
                owner: z.string().min(1),
                repo: z.string().min(1),
                skill: z.string().min(1),
            },
        },
        async ({ owner, repo, skill }) => {
            const detail = await fetchSkillDetail(owner, repo, skill);
            return {
                content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
            };
        }
    );

    return server;
}
