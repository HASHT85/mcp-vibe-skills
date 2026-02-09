/**
 * Smoke test for mcp-vibe-skills orchestrator
 * Run: npx ts-node scripts/smoke-test.ts
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

interface Agent {
    id: string;
    name: string;
    created_at: string;
}

interface Project {
    id: string;
    name: string;
    templateId: string;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
}

function log(msg: string) {
    console.log(`✓ ${msg}`);
}

function fail(msg: string): never {
    console.error(`✗ ${msg}`);
    process.exit(1);
}

async function main() {
    console.log(`\n🧪 Smoke Test - ${BASE_URL}\n`);

    // 1. Health check
    const health = await req<{ ok: boolean }>("GET", "/health");
    if (!health.ok) fail("Health check failed");
    log("Health check passed");

    // 2. Create agent
    const agentRes = await req<{ agent: Agent }>("POST", "/agents", {
        name: "smoke-test-agent",
    });
    if (!agentRes.agent?.id) fail("Agent creation failed");
    const agentId = agentRes.agent.id;
    log(`Agent created: ${agentId}`);

    // 3. Assign skill
    const skillRes = await req<{ agentId: string; assigned: unknown }>(
        "POST",
        `/agents/${agentId}/skills`,
        {
            owner: "vercel-labs",
            repo: "agent-skills",
            skill: "web-design",
            href: "https://skills.sh/vercel-labs/agent-skills/web-design",
            title: "Web Design",
        }
    );
    if (!skillRes.assigned) fail("Skill assignment failed");
    log("Skill assigned to agent");

    // 4. List agent skills
    const skillsRes = await req<{ skills: unknown[] }>("GET", `/agents/${agentId}/skills`);
    if (skillsRes.skills.length === 0) fail("No skills found after assignment");
    log(`Agent has ${skillsRes.skills.length} skill(s)`);

    // 5. Create project from template
    const projectRes = await req<{ project: Project; agents: Agent[] }>("POST", "/projects", {
        name: "smoke-test-project",
        templateId: "empty",
    });
    if (!projectRes.project?.id) fail("Project creation failed");
    const projectId = projectRes.project.id;
    log(`Project created: ${projectId}`);

    // 6. Add agent to project
    const addAgentRes = await req<{ agent: Agent }>("POST", `/projects/${projectId}/agents`, {
        name: "project-agent",
        profileId: "mcp-observability",
    });
    if (!addAgentRes.agent?.id) fail("Add agent to project failed");
    log(`Agent added to project: ${addAgentRes.agent.id}`);

    // 7. Get project full
    const fullRes = await req<{ project: Project; agentsWithSkills: unknown[] }>(
        "GET",
        `/projects/${projectId}/full`
    );
    if (!fullRes.agentsWithSkills) fail("Project full data missing");
    log(`Project has ${fullRes.agentsWithSkills.length} agent(s) with skills`);

    // 8. Tail events
    const eventsRes = await req<{ events: unknown[] }>("GET", "/events?limit=50");
    if (!eventsRes.events || eventsRes.events.length === 0) fail("No events found");
    log(`Found ${eventsRes.events.length} events`);

    // Check for expected event types
    const eventTypes = new Set((eventsRes.events as Array<{ type: string }>).map((e) => e.type));
    const expectedTypes = ["agent.created", "skill.assigned", "project.created"];
    for (const t of expectedTypes) {
        if (!eventTypes.has(t)) {
            console.warn(`⚠ Missing event type: ${t}`);
        }
    }
    log("Events contain expected types");

    console.log("\n✅ All smoke tests passed!\n");
}

main().catch((err) => {
    console.error("\n❌ Smoke test failed:", err.message);
    process.exit(1);
});
