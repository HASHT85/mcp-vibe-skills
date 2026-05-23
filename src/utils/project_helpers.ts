import type { ProjectType } from "../types.js";

export function detectProjectType(analysis: any): ProjectType {
    const declared = String(analysis?.type || "").toLowerCase();
    if (["static", "spa", "fullstack", "api", "python-worker", "node-worker"].includes(declared)) {
        return declared as ProjectType;
    }

    const desc = String(analysis?.summary || "").toLowerCase();
    const frontend = String(analysis?.stack?.frontend || "").toLowerCase();
    const backend = String(analysis?.stack?.backend || "").toLowerCase();

    const hasBackend = backend && !["none", "aucun", "n/a", "-", ""].includes(backend);
    const hasFrontend = frontend && !["none", "aucun", "n/a", "-", ""].includes(frontend);
    const isSPA = /react|vue|svelte|angular|vite|next|nuxt|remix/.test(frontend);

    const isPythonBot =
        backend.includes("python") ||
        /python|flask|fastapi|django|pandas|scraper|scraping|bot\s|cron|daemon|trading|data\.sci|machine\.learn|ia\s|ml\s/.test(
            desc
        );
    const isNodeBot =
        (backend.includes("node") || backend.includes("express")) && /bot\s|scraper|cron|daemon|worker/.test(desc);

    if (isPythonBot) return "python-worker";
    if (isNodeBot) return "node-worker";

    if (!hasBackend) return isSPA ? "spa" : "static";
    if (!hasFrontend) return "api";
    return "fullstack";
}

export function getDockerfileTemplate(type: ProjectType, stack?: any): string {
    switch (type) {
        case "static":
            return `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]`;
        case "spa":
            return `# Stage 1: Build\nFROM node:20-slim AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n# Stage 2: Serve\nFROM nginx:alpine\nCOPY --from=builder /app/dist /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]`;
        case "api":
            return `FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]`;
        case "python-worker":
            return `FROM python:3.11-slim\nWORKDIR /app\nRUN apt-get update && apt-get install -y supervisor && rm -rf /var/lib/apt/lists/*\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8080\nCMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]`;
        case "node-worker":
            return `FROM node:20-slim\nWORKDIR /app\nRUN npm install -g concurrently\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["npx", "concurrently", "node bot.js", "node server.js"]`;
        case "fullstack":
        default:
            return `FROM node:20-slim AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nFROM node:20-slim\nWORKDIR /app\nCOPY --from=builder /app/package*.json ./\nRUN npm ci --only=production\nCOPY --from=builder /app/dist ./dist\nEXPOSE 3000\nCMD ["node", "dist/index.js"]`;
    }
}

export function getScaffoldGuidance(type: ProjectType): string {
    // Basic guidance
    switch (type) {
        case "spa":
            return `INSTRUCTIONS SCAFFOLD (SPA):\n1. Initialise un projet Vite (react-ts)\n2. OBLIGATOIRE: configure Vite pour écouter sur 0.0.0.0 (ajouter --host dans les scripts package.json)\n3. Expose le port 80 pour Nginx (ou le port 3000/5173 en dev)\n4. Génère un docker-compose.yml de base sans labels définis.`;
        case "python-worker":
            return `INSTRUCTIONS SCAFFOLD (Python Worker):\n1. Crée requirements.txt\n2. Configure supervisord pour lancer bot et dashboard\n3. Assure-toi que les ports réseau sont exposés sur 0.0.0.0\n4. Génère un docker-compose.yml de base.`;
        default:
            return `Assure-toi que ton application écoute sur 0.0.0.0 sinon elle sera inaccessible depuis l'hôte.\nGénère toujours un fichier docker-compose.yml avec un réseau "web" défini en externe.`;
    }
}

export function getArchitectureGuidance(type: ProjectType): string {
    switch (type) {
        case "static":
            return `CONTRAINTES ARCHITECTURE (site statique): Pas de backend, fichiers plats.`;
        case "spa":
            return `CONTRAINTES ARCHITECTURE (SPA): Application Vite (React/Vue/Svelte).`;
        case "api":
            return `CONTRAINTES ARCHITECTURE (API backend): Node.js ou Python, avec route GET /health.`;
        case "fullstack":
            return `CONTRAINTES ARCHITECTURE (fullstack): Backend qui sert le frontend ou deux DOCKER séparés.`;
        case "python-worker":
            return `CONTRAINTES ARCHITECTURE: Bot Python + Dashboard Web Flask. Écrire les données sur disque ou SQLite. Exposer sur 0.0.0.0:8080.`;
        case "node-worker":
            return `CONTRAINTES ARCHITECTURE: Bot Node + Dashboard Web Express. Exposer sur 0.0.0.0:3000.`;
        default:
            return "";
    }
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24)
        .replace(/-+$/g, "");
}

export function tryParseJson(text: string): any {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {
        /* ignore */
    }
    return { raw: text };
}
