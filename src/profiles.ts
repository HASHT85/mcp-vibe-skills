export type SkillProfile = {
    id: string;
    name: string;
    description?: string;
    skills: Array<{
        owner: string;
        repo: string;
        skill: string;
        href: string;
        title?: string;
        installs?: number;
        installs_display?: string;
    }>;
};

export const PROFILES: SkillProfile[] = [
    {
        id: "mcp-observability",
        name: "MCP + Observability",
        description: "Base orchestrateur + events (Vibecraft cockpit).",
        skills: [
            {
                owner: "Nearcyan",
                repo: "vibecraft",
                skill: "vibecraft",
                href: "https://skills.sh/Nearcyan/vibecraft/vibecraft",
                title: "Vibecraft integration",
            },
        ],
    },
    {
        id: "skills-researcher",
        name: "Skills Researcher",
        description: "Agent chargé de chercher et sélectionner des skills via skills.sh.",
        skills: [
            {
                owner: "skills",
                repo: "sh",
                skill: "trending",
                href: "https://skills.sh/trending",
                title: "skills.sh trending",
            },
        ],
    },
];

export function getProfile(profileId: string): SkillProfile | undefined {
    return PROFILES.find((p) => p.id === profileId);
}
