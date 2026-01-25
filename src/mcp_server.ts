import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";
import { AgentsStore } from "./agents_store.js";

export function buildMcpServer() {
    const server = new McpServer({
        name: "skills-sh",
        version: "1.0.0",
    });

    const store = new AgentsStore();

    // ---------------------------------------------------------------------------
    // skills.sh tools
    // ---------------------------------------------------------------------------

    server.registerTool(
        "skills_trending",
        {
            description: "Get skills.sh trending list (24h).",
            inputSchema: {
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("Max items (default 10)"),
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
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("Max items (default 10)"),
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

    // ---------------------------------------------------------------------------
    // Agents + assignments tools
    // ---------------------------------------------------------------------------

    server.registerTool(
        "agents_list",
        {
            description: "List registered agents.",
            inputSchema: {},
        },
        async () => {
            const agents = await store.listAgents();
            return {
                content: [{ type: "text", text: JSON.stringify({ agents }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "agent_create",
        {
            description: "Create an agent.",
            inputSchema: {
                name: z.string().min(1),
                meta: z.record(z.any()).optional(),
            },
        },
        async ({ name, meta }) => {
            const agent = await store.createAgent(name, meta as Record<string, unknown> | undefined);
            return {
                content: [{ type: "text", text: JSON.stringify({ agent }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "agent_list_skills",
        {
            description: "List assigned skills for a given agent.",
            inputSchema: {
                agentId: z.string().min(1),
            },
        },
        async ({ agentId }) => {
            const skills = await store.listSkills(agentId);
            return {
                content: [{ type: "text", text: JSON.stringify({ agentId, skills }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "agent_assign_skill",
        {
            description: "Assign a skill to an agent.",
            inputSchema: {
                agentId: z.string().min(1),
                owner: z.string().min(1),
                repo: z.string().min(1),
                skill: z.string().min(1),
                href: z.string().min(1),
                title: z.string().optional(),
                installs: z.number().optional(),
                installs_display: z.string().optional(),
            },
        },
        async ({ agentId, owner, repo, skill, href, title, installs, installs_display }) => {
            const assigned = await store.assignSkill(agentId, {
                owner,
                repo,
                skill,
                href,
                title,
                installs,
                installs_display,
            });

            return {
                content: [{ type: "text", text: JSON.stringify({ agentId, assigned }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "agent_unassign_skill",
        {
            description: "Unassign a skill from an agent using its href.",
            inputSchema: {
                agentId: z.string().min(1),
                href: z.string().min(1),
            },
        },
        async ({ agentId, href }) => {
            const ok = await store.unassignSkill(agentId, href);
            return {
                content: [{ type: "text", text: JSON.stringify({ ok }, null, 2) }],
            };
        }
    );

    server.registerTool(
        "events_tail",
        {
            description: "Get the last N store events (agent.created, skill.assigned, etc.).",
            inputSchema: {
                limit: z.number().int().min(1).max(2000).optional().describe("Max events (default 200)"),
            },
        },
        async ({ limit }) => {
            const events = await store.listEvents(limit ?? 200);
            return {
                content: [{ type: "text", text: JSON.stringify({ events }, null, 2) }],
            };
        }
    );

    return server;
}
