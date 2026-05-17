/**
 * Orchestrator Utilities — Shared constants and helpers for the orchestrator.
 * 
 * NOTE: tryParseJson, detectProjectType, slugify also exist in utils/project_helpers.ts
 * (used by DAG nodes). The canonical "slugify" lives here; the others are in project_helpers.
 */

export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "/workspace";

// Read at call-time (not at module init) so env vars from .env container work
export const getGithubToken = () => process.env.GITHUB_TOKEN || "";

export function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "");
}

