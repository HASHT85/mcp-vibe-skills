import { DagNode, type NodeContext } from "../Node.js";
import { findSkillsForContext, type SkillContent, SKILL_RELEVANCE_THRESHOLD } from "../../skills.js";

/**
 * SkillsEnrichmentNode — Lightweight DAG node (no Claude call)
 * Runs after AnalysisNode, extracts keywords from the detected stack,
 * queries skills.sh for relevant best-practice skills, and stores
 * them in pipeline.artifacts.skills for downstream agents.
 */
export class SkillsEnrichmentNode extends DagNode {
    constructor() {
        super("skills_enrichment", "Enrichissement via skills.sh", ["analysis"]);
    }

    async execute(context: NodeContext): Promise<any> {
        context.updateAgentStatus("Analyst", "active", "Recherche de skills pertinents...");
        context.addEvent("Orchestrator", "📚", "Recherche de skills sur skills.sh...", "info");

        const analysis = context.pipeline.artifacts.analysis as any;
        if (!analysis) {
            context.addEvent("Orchestrator", "⚠️", "Pas d'analyse disponible, skills enrichment ignoré", "warning");
            context.pipeline.artifacts.skills = [];
            return [];
        }

        // Extract keywords from analysis
        const keywords: string[] = [];

        // From stack
        const rawFrontend = analysis?.stack?.frontend;
        const rawBackend = analysis?.stack?.backend;
        const frontend =
            typeof rawFrontend === "string"
                ? rawFrontend
                : Array.isArray(rawFrontend)
                  ? rawFrontend.join(" ")
                  : String(rawFrontend || "");
        const backend =
            typeof rawBackend === "string"
                ? rawBackend
                : Array.isArray(rawBackend)
                  ? rawBackend.join(" ")
                  : String(rawBackend || "");
        if (frontend) keywords.push(...frontend.split(/[\s,/]+/).filter((s: string) => s.length > 1));
        if (backend) keywords.push(...backend.split(/[\s,/]+/).filter((s: string) => s.length > 1));

        // From project type
        const type = analysis?.type || "";
        if (type) keywords.push(type);

        // From description keywords
        const summary = analysis?.summary || analysis?.description || "";
        const descWords = summary
            .toLowerCase()
            .match(
                /\b(react|vue|svelte|angular|next|nuxt|vite|express|fastapi|flask|django|node|python|typescript|tailwind|docker|api|dashboard|weather|chart|animation)\b/g
            );
        if (descWords) keywords.push(...descWords);

        // ─── From Research Findings (ResearchNode) ───
        const research = context.pipeline.artifacts.research as any;
        if (research && typeof research === "object" && !research.raw) {
            // Extract framework/lib names discovered during web research
            if (Array.isArray(research.modernFrameworks)) {
                for (const fw of research.modernFrameworks) {
                    const name = (fw.name || "").toLowerCase().trim();
                    if (name) keywords.push(...name.split(/[\s,/]+/).filter((s: string) => s.length > 1));
                }
            }

            // Extract trending tech keywords
            if (Array.isArray(research.trendingTech)) {
                for (const tech of research.trendingTech) {
                    const t = String(tech).toLowerCase().trim();
                    if (t.length > 1) keywords.push(...t.split(/[\s,/]+/).filter((s: string) => s.length > 1));
                }
            }

            // Extract stack info from similar projects
            if (Array.isArray(research.similarProjects)) {
                for (const proj of research.similarProjects) {
                    const stack = (proj.stack || "").toLowerCase().trim();
                    if (stack) keywords.push(...stack.split(/[\s,/+]+/).filter((s: string) => s.length > 1));
                }
            }

            context.addEvent("Orchestrator", "📚", `Keywords enrichis via la veille web`, "info");
        }

        // Deduplicate
        const uniqueKeywords = [
            ...new Set(keywords.map((k: string) => k.toLowerCase()).filter((k: string) => k.length > 1)),
        ];

        if (uniqueKeywords.length === 0) {
            context.addEvent("Orchestrator", "⚠️", "Aucun keyword détecté pour la recherche skills.sh", "warning");
            context.pipeline.artifacts.skills = [];
            return [];
        }

        context.addEvent("Orchestrator", "📚", `Keywords détectés: ${uniqueKeywords.slice(0, 8).join(", ")}`, "info");

        try {
            const skills: SkillContent[] = await findSkillsForContext(uniqueKeywords, 5);
            context.pipeline.artifacts.skills = skills;
            context.addEvent(
                "Orchestrator",
                "📚",
                `${skills.length} skills trouvés et injectés dans les prompts agents`,
                "success"
            );
            return skills;
        } catch (err: any) {
            context.addEvent(
                "Orchestrator",
                "⚠️",
                `Erreur skills.sh: ${err.message} — on continue sans skills`,
                "warning"
            );
            context.pipeline.artifacts.skills = [];
            return [];
        }
    }
}
