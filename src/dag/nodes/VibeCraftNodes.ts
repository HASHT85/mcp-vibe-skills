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
            maxTurns: 5,
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
            maxTurns: 10,
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
            maxTurns: 30,
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
    constructor() {
        super({
            id: "qa",
            name: "Vérification QA",
            role: "QA",
            emoji: "🧪",
            dependencies: ["supervisor_for_development"],
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
7. Valide la syntaxe du fichier généré.

IMPORTANT - PRODUCTION DOCKERFILE:
Si le projet est une SPA (React/Vue/Vite), tu DOIS créer un Dockerfile multi-stage:
- Stage 1 "builder": FROM node:20-alpine, npm install, npm run build  
- Stage 2: FROM nginx:alpine, copie dist/ vers /usr/share/nginx/html
- Le port interne nginx doit être 80
- Crée aussi un nginx.conf avec: try_files $uri $uri/ /index.html; pour le routing SPA
- N'utilise JAMAIS "npm run dev" ou "npm run preview" en production
- Le Dockerfile DOIT se trouver au même niveau que package.json du projet

Exemple de Dockerfile production pour SPA:
\`\`\`dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
\`\`\`

Exemple de nginx.conf minimal:
\`\`\`nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
\`\`\``;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un ingénieur DevOps expert en Docker et Traefik. Ton rôle est de préparer le docker-compose.prod.yml pour la mise en production native sur Hostinger VPS, en gardant le dev local séparé.";
    }
}
