import { AgentNode } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import { tryParseJson } from "../../utils/project_helpers.js";

/**
 * ResearchNode — Web exploration phase
 * Runs BEFORE AnalysisNode to discover modern frameworks, libraries,
 * similar open-source projects, and relevant APIs.
 * Stores findings in pipeline.artifacts.research for downstream nodes.
 */
export class ResearchNode extends AgentNode {
    constructor(model?: string, provider?: string) {
        super({
            id: "research",
            name: "Recherche & Exploration Web",
            role: "Analyst",
            emoji: "🌐",
            model: provider === "openrouter" && model ? `openrouter/${model}` : model,
            maxTurns: 15,
            allowedTools: ["web_search", "fetch_url", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const desc = context.pipeline.description;
        const currentYear = new Date().getFullYear();

        return `Tu es un expert en veille technologique. L'utilisateur veut créer ce projet :

"${desc}"

🎯 TON OBJECTIF : Explorer le web pour découvrir les MEILLEURES approches modernes (${currentYear}) pour ce type de projet. Ne te contente PAS de tes connaissances internes — fais de VRAIES recherches web.

📋 PROCESSUS OBLIGATOIRE :

ÉTAPE 1 — RECHERCHE DE FRAMEWORKS MODERNES (2-3 recherches web_search) :
- Cherche les frameworks/bibliothèques les plus récents et populaires pour ce type de projet
- Ex: "best ${currentYear} framework for [domaine du projet]"
- Ex: "modern stack for [type d'app] ${currentYear}"
- Si tu trouves un résultat pertinent, utilise fetch_url pour lire la page et comprendre les avantages

ÉTAPE 2 — PROJETS SIMILAIRES (1-2 recherches web_search) :
- Cherche des projets open-source similaires sur GitHub pour s'en inspirer
- Ex: "github [type de projet] open source ${currentYear}"
- Note les technologies qu'ils utilisent, leur architecture, leurs features clés

ÉTAPE 3 — APIs ET SERVICES (1 recherche web_search) :
- Cherche des APIs publiques ou des services gratuits qui pourraient enrichir le projet
- Ex: "free API for [domaine]" ou "[domaine] public API ${currentYear}"

ÉTAPE 4 — SYNTHÈSE :
Après tes recherches, utilise write_memory pour sauvegarder tes découvertes :
→ write_memory(key: "research_findings", value: "JSON de tes découvertes")

Le JSON doit contenir :
{
  "modernFrameworks": [{"name": "...", "why": "...", "url": "..."}],
  "similarProjects": [{"name": "...", "stack": "...", "url": "...", "inspiration": "..."}],
  "availableApis": [{"name": "...", "description": "...", "url": "...", "free": true/false}],
  "recommendations": "Résumé de tes recommandations techniques basées sur tes découvertes",
  "trendingTech": ["tech1", "tech2", "..."]
}

⚠️ RÈGLES :
- Fais au MINIMUM 3 recherches web_search distinctes
- Ne te contente JAMAIS de deviner — vérifie sur le web
- Si une page web est pertinente, lis-la avec fetch_url pour avoir les détails
- Sois curieux et explore des pistes inattendues — le but est de DÉCOUVRIR, pas de confirmer des a priori
- Tes recherches doivent être en ANGLAIS pour avoir plus de résultats
- Concentre-toi sur des technologies stables et maintenues, pas des projets expérimentaux abandonnés`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return `Tu es un Veilleur Technologique Senior spécialisé dans la découverte de nouvelles technologies et frameworks.

COMPORTEMENT ATTENDU :
- Tu fais systématiquement des recherches web AVANT de donner ton avis
- Tu explores au moins 3-5 sources web différentes
- Tu privilégies les sources récentes (${new Date().getFullYear()})
- Tu notes les URLs de tes sources pour justifier tes recommandations
- Tu es ouvert à des solutions auxquelles l'utilisateur n'aurait pas pensé

À la fin, tu stockes tes découvertes dans la mémoire partagée via write_memory pour que l'Analyste puisse les utiliser.`;
    }

    protected processResult(output: string, context: NodeContext): any {
        // Try to extract structured research from the output
        const research = tryParseJson(output);
        context.pipeline.artifacts.research = research;
        return research;
    }
}
