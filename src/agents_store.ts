import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Agent = {
    id: string;
    name: string;
    created_at: string;
    meta?: Record<string, unknown>;
};

export type AssignedSkill = {
    owner: string;
    repo: string;
    skill: string;
    href: string;
    title?: string;
    installs?: number;
    installs_display?: string;
    assigned_at: string;
};

type StoreShape = {
    agents: Agent[];
    assignments: Record<string, AssignedSkill[]>;
    events: Array<{ ts: string; type: string; payload: any }>;
};

function nowIso() {
    return new Date().toISOString();
}

function makeId(prefix: string) {
    return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export class AgentsStore {
    private filePath: string;

    constructor(filePath = process.env.STORE_PATH || "/data/store.json") {
        this.filePath = filePath;
    }

    private async ensureDir() {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
    }

    private async load(): Promise<StoreShape> {
        await this.ensureDir();
        try {
            const raw = await fs.readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(raw) as any;
            return {
                agents: parsed.agents ?? [],
                assignments: parsed.assignments ?? {},
                events: parsed.events ?? [],
            };
        } catch {
            return { agents: [], assignments: {}, events: [] };
        }
    }

    private async save(partial: StoreShape) {
        await this.ensureDir();

        // IMPORTANT: preserve other keys (projects, project_agents, etc.)
        let existing: any = {};
        try {
            const raw = await fs.readFile(this.filePath, "utf-8");
            existing = JSON.parse(raw);
        } catch {
            existing = {};
        }

        const merged = {
            ...existing,
            agents: partial.agents ?? existing.agents ?? [],
            assignments: partial.assignments ?? existing.assignments ?? {},
            events: partial.events ?? existing.events ?? [],
        };

        const tmp = `${this.filePath}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf-8");
        await fs.rename(tmp, this.filePath);
    }

    private async emit(type: string, payload: any) {
        const s = await this.load();
        s.events.push({ ts: nowIso(), type, payload });
        // garde 2000 derniers events
        if (s.events.length > 2000) s.events = s.events.slice(-2000);
        await this.save(s);
    }

    private agentExists(s: StoreShape, agentId: string) {
        return s.agents.some((a) => a.id === agentId);
    }

    async listAgents(): Promise<Agent[]> {
        const s = await this.load();
        return s.agents;
    }

    async createAgent(name: string, meta?: Record<string, unknown>): Promise<Agent> {
        const s = await this.load();
        const agent: Agent = { id: makeId("agt"), name, created_at: nowIso(), meta };
        s.agents.push(agent);
        s.assignments[agent.id] = s.assignments[agent.id] ?? [];
        await this.save(s);
        await this.emit("agent.created", agent);
        return agent;
    }

    async getAgent(agentId: string): Promise<Agent | undefined> {
        const s = await this.load();
        return s.agents.find((a) => a.id === agentId);
    }

    async deleteAgent(agentId: string): Promise<boolean> {
        const s = await this.load();
        const before = s.agents.length;
        s.agents = s.agents.filter((a) => a.id !== agentId);
        delete s.assignments[agentId];
        await this.save(s);
        if (s.agents.length !== before) {
            await this.emit("agent.deleted", { agentId });
            return true;
        }
        return false;
    }

    async listSkills(agentId: string): Promise<AssignedSkill[]> {
        const s = await this.load();
        if (!this.agentExists(s, agentId)) throw new Error("agent_not_found");
        return s.assignments[agentId] ?? [];
    }

    async assignSkill(agentId: string, skill: Omit<AssignedSkill, "assigned_at">): Promise<AssignedSkill> {
        const s = await this.load();
        if (!this.agentExists(s, agentId)) throw new Error("agent_not_found");

        if (!s.assignments[agentId]) s.assignments[agentId] = [];

        // dédup par href
        const existing = s.assignments[agentId].find((x) => x.href === skill.href);
        if (existing) return existing;

        const assigned: AssignedSkill = { ...skill, assigned_at: nowIso() };
        s.assignments[agentId].push(assigned);
        await this.save(s);
        await this.emit("skill.assigned", { agentId, skill: assigned });
        return assigned;
    }

    async unassignSkill(agentId: string, href: string): Promise<boolean> {
        const s = await this.load();
        if (!this.agentExists(s, agentId)) throw new Error("agent_not_found");

        const list = s.assignments[agentId] ?? [];
        const before = list.length;
        s.assignments[agentId] = list.filter((x) => x.href !== href);
        await this.save(s);

        if (before !== s.assignments[agentId].length) {
            await this.emit("skill.unassigned", { agentId, href });
            return true;
        }
        return false;
    }

    async listEvents(limit = 200): Promise<Array<{ ts: string; type: string; payload: any }>> {
        const s = await this.load();
        return s.events.slice(-Math.min(Math.max(limit, 1), 2000));
    }
}
