/**
 * Shared types for mcp-vibe-skills orchestrator
 */

/**
 * Standard reference to a skill on skills.sh
 */
export type SkillRef = {
    owner: string;
    repo: string;
    skill: string;
    href: string;
};

/**
 * Extended skill reference with optional metadata
 */
export type SkillRefExtended = SkillRef & {
    title?: string;
    installs?: number;
    installs_display?: string;
};

/**
 * Event types emitted by the orchestrator
 */
export type EventType =
    | "agent.created"
    | "agent.deleted"
    | "skill.assigned"
    | "skill.unassigned"
    | "project.created"
    | "project.agent.created"
    | "project.agent.linked"
    | "profile.applied"
    | "profile.missing";

/**
 * Base event structure
 */
export type OrchestratorEvent = {
    ts: string;
    type: EventType;
    payload: unknown;
};
