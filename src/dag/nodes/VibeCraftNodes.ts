import { AgentNode, type AgentNodeOptions } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import type { SkillContent } from "../../skills.js";
import { tryParseJson, detectProjectType, getArchitectureGuidance, getScaffoldGuidance, getDockerfileTemplate } from "../../utils/project_helpers.js";

// --- ANALYSIS NODE ---
export class AnalysisNode extends AgentNode {
    constructor() {
        super({
            id: "analysis",
            name: "Analyse des besoins",
            role: "Analyst",
            emoji: "🔎",
            allowedTools: ["web_search", "fetch_url", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        return `Analyse la demande suivante :\n\n"${context.pipeline.description}"\n\nProduis un JSON strict contenant :\n1. Le type de projet (static, spa, api, fullstack, python-worker, node-worker)\n2. La stack technique recommandée (frontend, backend)\n3. Un résumé des fonctionnalités attendues`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un Chef de Projet Technique. Rends UNIQUEMENT un JSON valide.";
    }

    protected processResult(output: string, context: NodeContext): any {
        const analysis = tryParseJson(output);
        context.pipeline.artifacts.analysis = analysis;

        // Auto-détecte les services
        const pType = detectProjectType(analysis);
        if (pType === "fullstack") {
            context.pipeline.services.push({ name: "client", type: "spa" }, { name: "api", type: "api" });
        } else {
            context.pipeline.services.push({ name: "main", type: pType });
        }

        return analysis;
    }
}

// --- ARCHITECTURE NODE ---
export class ArchitectureNode extends AgentNode {
    constructor() {
        super({
            id: "architecture",
            name: "Conception de l'architecture",
            role: "Architect",
            emoji: "🏗️",
            dependencies: ["skills_enrichment"],
            allowedTools: ["web_search", "fetch_url", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const analysis = context.pipeline.artifacts.analysis;
        return `Crée une architecture détaillée pour ce projet :\n\nAnalyse:\n${JSON.stringify(analysis, null, 2)}\n\nProduis un JSON structuré décrivant l'arborescence des fichiers.`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        let base = "Tu es un Architecte Logiciel Senior. Rends UNIQUEMENT un objet JSON décrivant l'architecture. Utilise write_memory pour enregistrer les ports convenus et les endpoints vitaux pour les autres agents.";
        const skills = context.pipeline.artifacts.skills as SkillContent[] | undefined;
        if (skills?.length) {
            base += "\n\n📚 BEST PRACTICES (from skills.sh):\n";
            for (const s of skills) {
                base += `\n### ${s.title}\n${s.content?.slice(0, 1500) || "(pas de contenu détaillé)"}\n`;
            }
        }
        return base;
    }

    protected processResult(output: string, context: NodeContext): any {
        const arch = tryParseJson(output);
        context.pipeline.artifacts.architecture = arch;
        return arch;
    }
}

// --- SCAFFOLD NODE ---
export class ScaffoldNode extends AgentNode {
    constructor() {
        super({
            id: "scaffold",
            name: "Génération de la base",
            role: "Developer",
            emoji: "💻",
            dependencies: ["architecture"],
            allowedTools: ["bash", "write_file", "list_dir", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const architecture = context.pipeline.artifacts.architecture;
        const p = context.pipeline;
        let prompt = `Crée le scaffold initial de ce projet dans le répertoire courant.\n\nArchitecture globale: ${JSON.stringify(architecture, null, 2)}\n\nTypes de services: ${p.services.map((s: any) => s.type).join(', ')}\n\nN'oublie pas de créer le docker-compose.yml pour le développement LOCAL (avec les ports exposés sur 0.0.0.0, sans labels Traefik).`;

        if ((this as any).supervisorFeedback) {
            prompt += `\n\n⚠️ ATTENTION: Lors de ta précédente tentative, le superviseur a REJETÉ ton travail et émis la critique suivante:\n\n${(this as any).supervisorFeedback}\n\nApplique ces corrections IMMÉDIATEMENT.`;
        }
        return prompt;
    }

    protected getSystemPrompt(context: NodeContext): string {
        let base = "Tu es un Développeur Senior. Utilise bash pour initier les projets et crée un docker-compose.yml fonctionnant en local sur 0.0.0.0 avec des binds de ports.";
        const skills = context.pipeline.artifacts.skills as SkillContent[] | undefined;
        if (skills?.length) {
            base += "\n\n📚 BEST PRACTICES (from skills.sh):\n";
            for (const s of skills) {
                base += `\n### ${s.title}\n${s.content?.slice(0, 1500) || "(pas de contenu détaillé)"}\n`;
            }
        }
        return base;
    }
}

// --- DEVELOPMENT NODE ---
export class DevelopmentNode extends AgentNode {
    constructor() {
        super({
            id: "development",
            name: "Développement des Features",
            role: "Developer",
            emoji: "💻",
            dependencies: ["supervisor_for_scaffold"],
            allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir", "read_memory", "write_memory"],
            maxTurns: 80
        });
    }

    protected getPrompt(context: NodeContext): string {
        const analysis = context.pipeline.artifacts.analysis;
        const architecture = context.pipeline.artifacts.architecture;

        let prompt = `Tu dois implémenter toutes les fonctionnalités décrites dans l'analyse de ce projet.\n\nAnalyse:\n${JSON.stringify(analysis, null, 2)}\n\nArchitecture:\n${JSON.stringify(architecture, null, 2)}\n\nInstructions:\n1. Lis le code de scaffold existant\n2. Vérifie s'il manque des fichiers source (App.jsx, composants, index.html, etc.)\n3. Crée TOUS les fichiers source manquants — le scaffold n'a créé que les fichiers de config\n4. Implémente la logique fonctionnelle complète du projet\n5. IMPORTANT: Tu DOIS créer App.jsx/App.tsx et TOUS les composants React/Vue requis\n6. Assure-toi que les services communiquent bien entre eux si besoin (via docker-compose)\n7. N'écrase pas le Dockerfile ou docker-compose sauvagement sans vérifier\n8. Fais npm install si node_modules est vide`;

        if ((this as any).supervisorFeedback) {
            prompt += `\n\n⚠️ ATTENTION: Lors de ta précédente tentative, le superviseur a REJETÉ ton travail et émis la critique suivante:\n\n${(this as any).supervisorFeedback}\n\nApplique ces corrections IMMÉDIATEMENT.`;
        }
        return prompt;
    }

    protected getSystemPrompt(context: NodeContext): string {
        let base = "Tu es un Développeur Senior Fullstack. Écris du code propre. Utilise read_memory pour connaître les ports et write_memory si tu ajoutes/changes une variable d'environnement ou un endpoint important. Tu DOIS créer TOUS les fichiers source (composants, pages, styles) — ne suppose jamais qu'ils existent déjà.";
        const skills = context.pipeline.artifacts.skills as SkillContent[] | undefined;
        if (skills?.length) {
            base += "\n\n📚 BEST PRACTICES (from skills.sh):\n";
            for (const s of skills) {
                base += `\n### ${s.title}\n${s.content?.slice(0, 1500) || "(pas de contenu détaillé)"}\n`;
            }
        }
        return base;
    }
}

// --- QA NODE ---
export class QANode extends AgentNode {
    constructor() {
        super({
            id: "qa",
            name: "Vérification QA",
            role: "QA",
            emoji: "🧪",
            dependencies: ["supervisor_for_development"],
            allowedTools: ["bash", "read_file", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        return `Vérifie que le projet est complet et fonctionnel :
1. Fais \`npm install\` si node_modules est absent
2. Lance \`npm run build\` et corrige TOUTES les erreurs
3. Vérifie qu'un fichier App.jsx/App.tsx (ou équivalent) existe et est importé dans main.jsx/main.tsx
4. Vérifie qu'il n'y a pas d'imports manquants ou de dépendances absentes du package.json
5. Si tu trouves des erreurs, corrige-les directement
6. Si le build réussit, arrête-toi.`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un Testeur QA. Vérifie que le code compile et que tous les fichiers source sont présents. Corrige les erreurs de build. Utilise read_memory pour savoir sur quels ports les services tournent.";
    }
}

// --- DEPLOY NODE ---
export class DeployNode extends AgentNode {
    constructor() {
        super({
            id: "deploy",
            name: "Déploiement Hostinger (Traefik)",
            role: "DevOps",
            emoji: "🚀",
            dependencies: ["qa"],
            allowedTools: ["bash", "read_file", "write_file", "replace_in_file", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const p = context.pipeline;
        return `Tu dois configurer le déploiement de ce projet pour la production Hostinger via Traefik.
        
Instructions:
1. Ne modifie pas le \`docker-compose.yml\` existant qui est réservé au développement local.
2. Crée un nouveau fichier \`docker-compose.prod.yml\` basé sur le local, mais optimisé pour Traefik.
3. Dans ce \`docker-compose.prod.yml\`, n'expose AUCUN port via la directive "ports" vers l'extérieur pour les services web.
4. Assure-toi qu'il possède un réseau externe Traefik : \`networks: web: external: true\` et assigne ce réseau aux services à exposer.
5. Ajoute dynamiquement les labels Traefik à tous les services exposés (frontend/backend). 
   Le host doit être \`${p.id}.hach.dev\` ou similaire.
6. N'oublie pas les labels :
   - \`traefik.enable=true\`
   - \`traefik.http.routers.NOM-SERVICE.rule=Host(\`${p.id}.hach.dev\`)\`
   - \`traefik.http.routers.NOM-SERVICE.entrypoints=websecure\`
   - \`traefik.http.routers.NOM-SERVICE.tls.certresolver=letsencrypt\`
   - \`traefik.http.services.NOM-SERVICE.loadbalancer.server.port=PORT_INTERNE\`
7. Valide la syntaxe du fichier généré.`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un ingénieur DevOps expert en Docker et Traefik. Ton rôle est de préparer le docker-compose.prod.yml pour la mise en production native sur Hostinger VPS, en gardant le dev local séparé.";
    }
}
