import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { AgentsStore, type Agent } from "./agents_store.js";
import { getProfile } from "./profiles.js";
import { getTemplate } from "./templates.js";

export type Project = {
    id: string;
    name: string;
    templateId: string;
    created_at: string;
    meta?: Record<string, unknown>;
};

export type ProjectAgentLink = {
    projectId: string;
    agentId: string;
    created_at: string;
    // optionnel: rôle si tu veux (backend/front/ops)
    role?: string;
};

function nowIso() {
    return new Date().toISOString();
}

function makeId(prefix: string) {
    return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

type StoreAny = Record<string, any>;

export class ProjectsStore {
    private filePath: string;
    private agents: AgentsStore;

    constructor(filePath = process.env.STORE_PATH || "/data/store.json") {
        this.filePath = filePath;
        this.agents = new AgentsStore(filePath);
    }

    private async ensureDir() {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
    }

    private async loadRaw(): Promise<StoreAny> {
        await this.ensureDir();
        try {
            const raw = await fs.readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(raw) as StoreAny;
            // normalisation
            if (!parsed.projects) parsed.projects = [];
            if (!parsed.project_agents) parsed.project_agents = [];
            if (!parsed.events) parsed.events = [];
            if (!parsed.agents) parsed.agents = [];
            if (!parsed.assignments) parsed.assignments = {};
            return parsed;
        } catch {
            return {
                agents: [],
                assignments: {},
                events: [],
                projects: [],
                project_agents: [],
            };
        }
    }

    private async saveRaw(data: StoreAny) {
        await this.ensureDir();
        const tmp = `${this.filePath}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
        await fs.rename(tmp, this.filePath);
    }

    private async emit(type: string, payload: any) {
        const s = await this.loadRaw();
        s.events.push({ ts: nowIso(), type, payload });
        if (s.events.length > 2000) s.events = s.events.slice(-2000);
        await this.saveRaw(s);
    }

    async listProjects(): Promise<Project[]> {
        const s = await this.loadRaw();
        return (s.projects ?? []) as Project[];
    }

    async getProject(projectId: string): Promise<Project | undefined> {
        const s = await this.loadRaw();
        const projects = (s.projects ?? []) as Project[];
        return projects.find((p) => p.id === projectId);
    }

    async listProjectAgents(projectId: string): Promise<ProjectAgentLink[]> {
        const s = await this.loadRaw();
        const links = (s.project_agents ?? []) as ProjectAgentLink[];
        return links.filter((l) => l.projectId === projectId);
    }

    async linkAgentToProject(projectId: string, agentId: string, role?: string): Promise<ProjectAgentLink> {
        const s = await this.loadRaw();

        const projects = (s.projects ?? []) as Project[];
        const proj = projects.find((p) => p.id === projectId);
        if (!proj) throw new Error("project_not_found");

        const already = (s.project_agents as ProjectAgentLink[]).find(
            (l) => l.projectId === projectId && l.agentId === agentId
        );
        if (already) return already;

        const link: ProjectAgentLink = { projectId, agentId, created_at: nowIso(), role };
        s.project_agents.push(link);
        await this.saveRaw(s);
        await this.emit("project.agent.linked", link);
        return link;
    }

    /**
     * Crée un projet + instancie tous les agents du template avec leurs profiles (skills)
     * Retourne le projet + la liste des agents créés.
     */
    async createProjectFromTemplate(params: {
        name: string;
        templateId: string;
        meta?: Record<string, unknown>;
    }): Promise<{ project: Project; agents: Agent[] }> {
        const { name, templateId, meta } = params;

        const template = getTemplate(templateId);
        if (!template) throw new Error("template_not_found");

        // 1) crée le projet
        const s = await this.loadRaw();
        const project: Project = {
            id: makeId("prj"),
            name,
            templateId,
            created_at: nowIso(),
            meta,
        };
        s.projects.push(project);
        await this.saveRaw(s);
        await this.emit("project.created", { project });

        // 2) instancie les agents
        const createdAgents: Agent[] = [];

        for (const a of template.agents) {
            const agent = await this.agents.createAgent(a.name, a.meta);
            createdAgents.push(agent);

            await this.emit("project.agent.created", { projectId: project.id, agent });

            // 3) applique le profile => assigne les skills
            const profile = getProfile(a.profileId);
            if (!profile) {
                // on note l’erreur dans les events, mais on ne casse pas tout
                await this.emit("profile.missing", { projectId: project.id, agentId: agent.id, profileId: a.profileId });
            } else {
                for (const sk of profile.skills) {
                    await this.agents.assignSkill(agent.id, {
                        owner: sk.owner,
                        repo: sk.repo,
                        skill: sk.skill,
                        href: sk.href,
                        title: sk.title,
                        installs: sk.installs,
                        installs_display: sk.installs_display,
                    });
                }
                await this.emit("profile.applied", { projectId: project.id, agentId: agent.id, profileId: a.profileId });
            }

            // 4) lie agent ↔ project
            await this.linkAgentToProject(project.id, agent.id);
        }

        return { project, agents: createdAgents };
    }

    /**
     * Ajoute un agent à un projet (utile si l’UI veut “ajouter un agent X” après coup)
     */
    async addAgentToProject(params: {
        projectId: string;
        name: string;
        profileId?: string;
        meta?: Record<string, unknown>;
        role?: string;
    }): Promise<{ agent: Agent; linked: ProjectAgentLink; profileId: string | null }> {
        const { projectId, name, profileId, meta, role } = params;

        const project = await this.getProject(projectId);
        if (!project) throw new Error("project_not_found");

        const agent = await this.agents.createAgent(name, meta);
        await this.emit("project.agent.created", { projectId, agent });

        let appliedProfile: string | null = null;
        if (profileId) {
            const profile = getProfile(profileId);
            if (!profile) {
                await this.emit("profile.missing", { projectId, agentId: agent.id, profileId });
            } else {
                for (const sk of profile.skills) {
                    await this.agents.assignSkill(agent.id, {
                        owner: sk.owner,
                        repo: sk.repo,
                        skill: sk.skill,
                        href: sk.href,
                        title: sk.title,
                        installs: sk.installs,
                        installs_display: sk.installs_display,
                    });
                }
                appliedProfile = profileId;
                await this.emit("profile.applied", { projectId, agentId: agent.id, profileId });
            }
        }

        const linked = await this.linkAgentToProject(projectId, agent.id, role);
        return { agent, linked, profileId: appliedProfile };
    }
}
