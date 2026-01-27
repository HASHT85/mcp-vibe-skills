export type ProjectTemplate = {
    id: string;
    name: string;
    description?: string;
    agents: Array<{
        // nom logique (ex: "backend-agent", "ops-agent")
        name: string;
        // référence vers src/profiles.ts
        profileId: string;
        // meta optionnel (modèle, endpoint, etc.)
        meta?: Record<string, unknown>;
    }>;
};

/**
 * Templates = ce qui drive la création auto des agents + profils
 * (c’est ta “cuisine interne” quand tu crées un projet depuis l’UI)
 */
export const TEMPLATES: ProjectTemplate[] = [
    {
        id: "mcp-orchestrator",
        name: "MCP Orchestrator",
        description: "Projet orchestrateur: agent principal + observabilité",
        agents: [
            { name: "ops-agent", profileId: "mcp-observability" },
            { name: "skills-researcher", profileId: "skills-researcher" },
        ],
    },
    {
        id: "empty",
        name: "Empty Project",
        description: "Crée juste le projet, aucun agent par défaut",
        agents: [],
    },
];

export function getTemplate(templateId: string): ProjectTemplate | undefined {
    return TEMPLATES.find((t) => t.id === templateId);
}
