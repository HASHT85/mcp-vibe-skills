import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { fetchTrending, searchSkills } from "./skills.js";
import { fetchSkillDetail } from "./skills_get.js";

import { AgentsStore } from "./agents_store.js";
import { ProjectsStore } from "./projects_store.js";
import { PROFILES } from "./profiles.js";
import { TEMPLATES } from "./templates.js";

export function buildMcpServer() {
    const server = new McpServer({
        name: "mcp-vibe-skills",
        version: "1.0.0",
    });

    const store = new AgentsStore();
    const projects = new ProjectsStore();

    // ------------------------
    // skills.sh
    // ------------------------

    server.registerTool(
        "skills_trending",
        {
            description: "Get skills.sh trending list (24h).",
            inputSchema: { limit: z.number().int().min(1).max(50).optional() },
        },
        async ({ limit }) => {
            const items = await fetchTrending(limit ?? 10);
            return { content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }] };
        }
    );

    server.registerTool(
        "skills_search",
        {
            description: "Search within the current trending list for a query.",
            inputSchema: { q: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
        },
        async ({ q, limit }) => {
            const items = await searchSkills(q, limit ?? 10);
            return { content: [{ type: "text", text: JSON.stringify({ q, items }, null, 2) }] };
        }
    );

    server.registerTool(
        "skills_get",
        {
            description: "Get details of a given skill page on skills.sh.",
            inputSchema: { owner: z.string().min(1), repo: z.string().min(1), skill: z.string().min(1) },
        },
        async ({ owner, repo, skill }) => {
            const detail = await fetchSkillDetail(owner, repo, skill);
            return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
        }
    );

    // ------------------------
    // profiles + templates
    // ------------------------

    server.registerTool(
        "profiles_list",
        { description: "List available skill profiles.", inputSchema: {} },
        async () => ({ content: [{ type: "text", text: JSON.stringify({ profiles: PROFILES }, null, 2) }] })
    );

    server.registerTool(
        "templates_list",
        { description: "List available project templates.", inputSchema: {} },
        async () => ({ content: [{ type: "text", text: JSON.stringify({ templates: TEMPLATES }, null, 2) }] })
    );

    // ------------------------
    // agents
    // ------------------------

    server.registerTool(
        "agents_list",
        { description: "List registered agents.", inputSchema: {} },
        async () => {
            const agents = await store.listAgents();
            return { content: [{ type: "text", text: JSON.stringify({ agents }, null, 2) }] };
        }
    );

    server.registerTool(
        "agent_list_skills",
        { description: "List assigned skills for a given agent.", inputSchema: { agentId: z.string().min(1) } },
        async ({ agentId }) => {
            try {
                const skills = await store.listSkills(agentId);
                return { content: [{ type: "text", text: JSON.stringify({ agentId, skills }, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }] };
            }
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
            try {
                const assigned = await store.assignSkill(agentId, { owner, repo, skill, href, title, installs, installs_display });
                return { content: [{ type: "text", text: JSON.stringify({ agentId, assigned }, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }] };
            }
        }
    );

    server.registerTool(
        "agent_unassign_skill",
        {
            description: "Unassign a skill from an agent using its href.",
            inputSchema: { agentId: z.string().min(1), href: z.string().min(1) },
        },
        async ({ agentId, href }) => {
            try {
                const ok = await store.unassignSkill(agentId, href);
                return { content: [{ type: "text", text: JSON.stringify({ ok }, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }] };
            }
        }
    );

    // ------------------------
    // projects
    // ------------------------

    server.registerTool(
        "projects_list",
        { description: "List projects.", inputSchema: {} },
        async () => {
            const items = await projects.listProjects();
            return { content: [{ type: "text", text: JSON.stringify({ projects: items }, null, 2) }] };
        }
    );

    server.registerTool(
        "project_create",
        {
            description: "Create a project from a template (auto-creates agents + applies profiles).",
            inputSchema: {
                name: z.string().min(1),
                templateId: z.string().min(1),
                meta: z.record(z.any()).optional(),
            },
        },
        async ({ name, templateId, meta }) => {
            try {
                const out = await projects.createProjectFromTemplate({ name, templateId, meta: meta as any });
                return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }],
                };
            }
        }
    );

    server.registerTool(
        "project_get",
        {
            description: "Get project details + linked agents.",
            inputSchema: { projectId: z.string().min(1) },
        },
        async ({ projectId }) => {
            try {
                const project = await projects.getProject(projectId);
                if (!project) return { content: [{ type: "text", text: JSON.stringify({ error: "project_not_found" }, null, 2) }] };

                const links = await projects.listProjectAgents(projectId);
                return { content: [{ type: "text", text: JSON.stringify({ project, agents: links }, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }] };
            }
        }
    );

    server.registerTool(
        "project_add_agent",
        {
            description: "Add an agent to an existing project (optionally apply a profileId).",
            inputSchema: {
                projectId: z.string().min(1),
                name: z.string().min(1),
                profileId: z.string().optional(),
                role: z.string().optional(),
                meta: z.record(z.any()).optional(),
            },
        },
        async ({ projectId, name, profileId, role, meta }) => {
            try {
                const out = await projects.addAgentToProject({
                    projectId,
                    name,
                    profileId,
                    role,
                    meta: meta as any,
                });
                return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || "error") }, null, 2) }] };
            }
        }
    );

    // ------------------------
    // events
    // ------------------------

    server.registerTool(
        "events_tail",
        {
            description: "Get the last N store events.",
            inputSchema: { limit: z.number().int().min(1).max(2000).optional() },
        },
        async ({ limit }) => {
            const events = await store.listEvents(limit ?? 200);
            return { content: [{ type: "text", text: JSON.stringify({ events }, null, 2) }] };
        }
    );

    return server;
}
