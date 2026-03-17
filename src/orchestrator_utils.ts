import type { ProjectType } from "./types.js";

// @ts-ignore
export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "/workspace";

// Read at call-time (not at module init) so env vars from .env container work
// @ts-ignore
export const getGithubOwner = () => process.env.GITHUB_OWNER || "";
// @ts-ignore
export const getGithubToken = () => process.env.GITHUB_TOKEN || "";

export function tryParseJson(text: string): any {
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch { /* ignore */ }
    return { raw: text };
}

export function detectProjectType(analysis: any): ProjectType {
    const declared = String(analysis?.type || "").toLowerCase();
    if (["static", "spa", "fullstack", "api", "python-worker", "node-worker"].includes(declared)) return declared as ProjectType;
    return "api"; // default
}

export function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "");
}
