import { AgentNode, type AgentNodeOptions } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import type { SkillContent } from "../../skills.js";
import { tryParseJson, detectProjectType, getArchitectureGuidance, getScaffoldGuidance, getDockerfileTemplate } from "../../utils/project_helpers.js";
import { getTemplateById, type ProjectTemplate } from "../../templates/registry.js";

/** Helper: get pipeline's template or undefined */
function getTemplate(ctx: NodeContext): ProjectTemplate | undefined {
    const tid = ctx.pipeline.templateId;
    return tid ? getTemplateById(tid) : undefined;
}

// --- ANALYSIS NODE ---
export class AnalysisNode extends AgentNode {
    constructor() {
        super({
            id: "analysis",
            name: "Analyse des besoins",
            role: "Analyst",
            emoji: "🔎",
            dependencies: ["research"],
            maxTurns: 8,
            allowedTools: ["web_search", "fetch_url", "read_memory", "write_memory", "bash", "list_dir", "read_file"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const research = context.pipeline.artifacts.research;
        const hasResearch = research && typeof research === "object" && !research.raw;
        const template = getTemplate(context);

        let researchSection = "";
        if (hasResearch) {
            researchSection = `\n\n📚 RÉSULTATS DE LA VEILLE TECHNOLOGIQUE :\n${JSON.stringify(research, null, 2)}\n\nUtilise ces découvertes pour proposer une stack MODERNE et INNOVANTE.`;
        } else {
            researchSection = `\n\nCommence par lire la mémoire partagée avec read_memory(key: "research_findings") pour récupérer les résultats de la veille technologique.`;
        }

        // Use template-specific analysis prompt if available
        const templateHint = template
            ? `\n\n🎯 TYPE DE PROJET DÉTECTÉ: ${template.emoji} ${template.name}\nStack par défaut recommandée: ${JSON.stringify(template.defaultStack)}\n\nINSTRUCTIONS SPÉCIFIQUES:\n${template.prompts.analysis}`
            : `\n\nProduis un JSON strict contenant :\n1. "type": Le type de projet\n2. "stack": { "frontend": "...", "backend": "..." }\n3. "summary": Résumé des fonctionnalités`;

        const sourceGithubUrl = context.pipeline.sourceGithubUrl;
        const gitSection = sourceGithubUrl
            ? `\n\n📦 REPOSITORY EXISTANT CLONÉ (${sourceGithubUrl}):\nCe projet part d'un code existant qui a été cloné dans le répertoire courant. UTILISE ABSOLUMENT list_dir et read_file AVANT DE RÉPONDRE pour analyser le code existant (notamment le package.json ou équivalent, et le src/). Ton architecture proposée devra respecter ou faire évoluer intelligemment la base de code actuelle.`
            : "";

        return `Analyse la demande suivante :\n\n"${context.pipeline.description}"${researchSection}${gitSection}${templateHint}\n\n⚠️ NE TE LIMITE PAS à ce que l'utilisateur a demandé. Propose des features innovantes dans "innovativeFeatures".`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un Chef de Projet Technique visionnaire. Tu t'appuies sur les résultats de la veille technologique pour proposer la stack la plus moderne et pertinente. Rends UNIQUEMENT un JSON valide. Ose proposer des technologies récentes si elles apportent un vrai avantage.";
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
            maxTurns: 10,
            allowedTools: ["web_search", "fetch_url", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const analysis = context.pipeline.artifacts.analysis;
        const template = getTemplate(context);

        const templateHint = template
            ? `\n\n🎯 CONTRAINTES TEMPLATE (${template.name}):\n${template.prompts.architecture}`
            : "";

        return `Crée une architecture détaillée pour ce projet :\n\nAnalyse:\n${JSON.stringify(analysis, null, 2)}${templateHint}\n\nProduis un JSON structuré décrivant l'arborescence des fichiers.`;
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
            maxTurns: 30,
            allowedTools: ["bash", "write_file", "list_dir", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const architecture = context.pipeline.artifacts.architecture;
        const p = context.pipeline;
        const template = getTemplate(context);

        const templateHint = template
            ? `\n\n🎯 INSTRUCTIONS SCAFFOLD (${template.name}):\n${template.prompts.scaffold}`
            : `\nN'oublie pas de créer le docker-compose.yml pour le développement LOCAL.`;

        let prompt = `Crée le scaffold initial de ce projet dans le répertoire courant.\n\nArchitecture globale: ${JSON.stringify(architecture, null, 2)}\n\nTypes de services: ${p.services.map((s: any) => s.type).join(', ')}${templateHint}`;

        if ((this as any).supervisorFeedback) {
            prompt += `\n\n⚠️ ATTENTION: Le superviseur a REJETÉ ton travail:\n${(this as any).supervisorFeedback}\n\nApplique ces corrections IMMÉDIATEMENT.`;
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
            maxTurns: 60,
            allowedTools: ["read_file", "write_file", "replace_in_file", "bash", "list_dir", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const analysis = context.pipeline.artifacts.analysis;
        const architecture = context.pipeline.artifacts.architecture;

        let prompt = `Tu dois implémenter toutes les fonctionnalités de ce projet.

Analyse:
${JSON.stringify(analysis, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

=== WORKFLOW STRICT (suis cet ordre) ===

ÉTAPE 0: Lis la mémoire partagée pour savoir où tu en es:
  → read_memory(key: "dev_progress")
  → Si elle contient une liste de fichiers déjà créés, NE LES RECRÉE PAS.

ÉTAPE 1 - TYPES: Crée src/types/ (interfaces, types API)
  → Après: write_memory(key: "dev_progress", value: "DONE: types")

ÉTAPE 2 - UTILS + CONSTANTS: Crée src/utils/ et src/constants/
  → Après: write_memory(key: "dev_progress", value: "DONE: types, utils, constants")

ÉTAPE 3 - SERVICES/API: Crée src/services/ ou src/api/ (clients API, cache)
  → Après: write_memory(key: "dev_progress", value: "DONE: types, utils, constants, services")

ÉTAPE 4 - HOOKS: Crée src/hooks/ (useWeather, useForecast, etc.)
  → Après: write_memory(key: "dev_progress", value: "DONE: types, utils, constants, services, hooks")

ÉTAPE 5 - APP + STYLES + ENTRY POINTS (PRIORITAIRE):
  Crée IMMÉDIATEMENT src/App.tsx, src/main.tsx, src/index.css, index.html, .env.example
  Ces fichiers DOIVENT exister avant les composants!
  → Après: write_memory(key: "dev_progress", value: "DONE: types, utils, constants, services, hooks, app+entry")

ÉTAPE 6 - COMPOSANTS UI: Crée src/components/ (TOUS les composants React)
  → Après: write_memory(key: "dev_progress", value: "DONE: all source files")

ÉTAPE 7 - BUILD: npm install && npm run build → corrige les erreurs
  → Après: write_memory(key: "dev_progress", value: "DONE: all source files, build OK")

⚠️ RÈGLES CRITIQUES:
- JAMAIS réécrire un fichier déjà créé sauf pour corriger un bug de build
- Après chaque groupe de fichiers, utilise write_memory pour sauvegarder ta progression
- Si le sliding window te fait perdre le contexte, lis dev_progress pour savoir où reprendre
- Concentre-toi sur ÉCRIRE du code, pas sur lire/lister les fichiers en boucle

🚀 OPTIMISATION DES TURNS:
Pour économiser des turns, REGROUPE plusieurs petits fichiers dans UN SEUL appel bash avec des heredocs:
\`\`\`bash
mkdir -p src/types src/utils
cat > src/types/weather.ts << 'TSEOF'
export interface Weather { ... }
TSEOF
cat > src/types/api.ts << 'TSEOF'
export interface ApiResponse { ... }
TSEOF
\`\`\`
Cela te permet de créer 3-5 fichiers en UN SEUL turn au lieu de 3-5 turns séparés.`;

        if ((this as any).supervisorFeedback) {
            prompt += `\n\n⚠️ ATTENTION: Lors de ta précédente tentative, le superviseur a REJETÉ ton travail et émis la critique suivante:\n\n${(this as any).supervisorFeedback}\n\nApplique ces corrections IMMÉDIATEMENT.`;
        }
        return prompt;
    }

    protected getSystemPrompt(context: NodeContext): string {
        let base = `Tu es un Développeur Senior Fullstack. Tu DOIS suivre le workflow par étapes et utiliser write_memory pour tracker ta progression.

RÈGLES:
1. Commence TOUJOURS par read_memory("dev_progress") pour savoir ce qui est déjà fait
2. Ne réécris JAMAIS un fichier que tu as déjà créé (sauf bug de build)
3. Après chaque batch de fichiers, fais write_memory("dev_progress", "DONE: ...")
4. Crée TOUS les fichiers en une seule passe, ne reviens pas en arrière
5. Utilise read_memory pour les ports et write_memory pour les endpoints
6. REGROUPE les petits fichiers (<50 lignes) dans un seul appel bash avec des heredocs pour économiser des turns`;
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
    constructor(dynamicDependencies: string[] = ["supervisor_for_development"]) {
        super({
            id: "qa",
            name: "Vérification QA",
            role: "QA",
            emoji: "🧪",
            dependencies: dynamicDependencies,
            maxTurns: 30,
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
            maxTurns: 15,
            allowedTools: ["bash", "read_file", "write_file", "replace_in_file", "read_memory", "write_memory"]
        });
    }

    protected getPrompt(context: NodeContext): string {
        const p = context.pipeline;
        const template = getTemplate(context);

        // If template says no Traefik, use simplified deploy
        if (template && !template.needsTraefik) {
            return `Tu dois configurer le déploiement de ce projet.

🎯 TYPE: ${template.emoji} ${template.name}
${template.prompts.deploy}

IMPORTANT: Ce type de projet n'a PAS besoin de Traefik.
Crée un docker-compose.prod.yml simple avec:
- restart: unless-stopped
- env_file: .env
- Volumes pour la persistance si nécessaire
- PAS de labels Traefik
- PAS de réseau web externe`;
        }

        return `Tu dois configurer le déploiement de ce projet pour la production Hostinger via Traefik.
${template ? `\n🎯 TYPE: ${template.emoji} ${template.name}\n${template.prompts.deploy}\n` : ''}
        
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
7. Valide la syntaxe du fichier généré.

MULTI-CONTAINER / BASE DE DONNÉES:
- Si le docker-compose.yml local contient des services comme postgres, redis, mongodb, etc., GARDE-LES dans docker-compose.prod.yml.
- Les services de base de données ne doivent PAS avoir de labels Traefik (ils ne sont pas exposés au web).
- Les DB doivent communiquer avec l'app via un réseau interne (réseau "internal", driver bridge).
- L'app doit être sur les deux réseaux: "web" (Traefik) et "internal" (communication avec DB).
- Ajoute des healthchecks pour les services de base de données.
- Utilise \`env_file: .env\` pour injecter les variables d'environnement depuis le Secrets Vault.
- Utilise des volumes nommés pour la persistance des données.

IMPORTANT - PRODUCTION DOCKERFILE:
Si le projet est une SPA (React/Vue/Vite), tu DOIS créer un Dockerfile multi-stage:
- Stage 1 "builder": FROM node:20-alpine, npm install, npm run build  
- Stage 2: FROM nginx:alpine, copie dist/ vers /usr/share/nginx/html
- Le port interne nginx doit être 80
- N'utilise JAMAIS "npm run dev" ou "npm run preview" en production

Exemple docker-compose.prod.yml multi-container:
\`\`\`yaml
version: "3.8"
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    networks:
      - web
      - internal
    depends_on:
      db:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(\`${p.id}.hach.dev\`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=3000"
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
volumes:
  pgdata:
networks:
  web:
    external: true
  internal:
    driver: bridge
\`\`\``;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un ingénieur DevOps expert en Docker, Traefik et architecture multi-container. Ton rôle est de préparer le docker-compose.prod.yml pour la mise en production sur Hostinger VPS, supportant les projets avec bases de données (PostgreSQL, Redis, MongoDB) et services multiples.";
    }
}
