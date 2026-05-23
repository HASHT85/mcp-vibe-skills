/**
 * Project Template Registry — Phase 1
 * Defines supported project types with specific prompts, deploy strategies, and detection patterns.
 * Each template drives the entire pipeline: from analysis to deploy.
 */

// ─── Template Types ───

export type DeployStrategy = "docker-traefik" | "docker-compose" | "docker-only" | "github-release" | "none";

export interface ProjectTemplate {
    id: string;
    name: string;
    emoji: string;
    description: string;
    /** Keywords used by auto-detection from user description */
    keywords: string[];
    /** Default stack suggestion */
    defaultStack: {
        frontend?: string;
        backend?: string;
        database?: string;
        extras?: string[];
    };
    /** How to deploy this project type */
    deployStrategy: DeployStrategy;
    /** Whether the project needs Traefik web exposure */
    needsTraefik: boolean;
    /** Default internal port */
    defaultPort: number;
    /** Template-specific prompts for each agent phase */
    prompts: {
        analysis: string;
        architecture: string;
        scaffold: string;
        development: string;
        deploy: string;
    };
    /** Dockerfile template for single-container fallback */
    dockerfileTemplate: string;
    /** Example docker-compose.prod.yml sections */
    composeHints: string;
}

// ─── Template Definitions ───

const WEB_SPA: ProjectTemplate = {
    id: "web-spa",
    name: "Application Web (SPA)",
    emoji: "🌐",
    description: "Site web interactif — React, Vue, Svelte, Angular",
    keywords: [
        "site",
        "website",
        "web app",
        "dashboard",
        "portfolio",
        "landing",
        "spa",
        "react",
        "vue",
        "svelte",
        "angular",
        "vite",
        "frontend",
        "interface",
        "ui",
        "page",
    ],
    defaultStack: { frontend: "React + Vite + TypeScript", extras: ["Tailwind CSS"] },
    deployStrategy: "docker-traefik",
    needsTraefik: true,
    defaultPort: 80,
    prompts: {
        analysis: `Analyse cette demande de site/application web.
Produis un JSON strict contenant :
1. "type": "spa"
2. "stack": { "frontend": "framework + bundler + language" }
3. "summary": Résumé des pages et fonctionnalités attendues
4. "features": Liste des fonctionnalités clés
5. "pages": Liste des pages/vues du site
6. "designStyle": Style de design recommandé (moderne, minimaliste, corporate, gaming, etc.)`,

        architecture: `Conçois l'architecture d'une application web SPA.
CONTRAINTES:
- Application single-page avec routing côté client
- Bundler Vite recommandé
- Structure: src/components/, src/pages/, src/hooks/, src/utils/
- Responsive design mobile-first
- Le port de dev doit être sur 0.0.0.0`,

        scaffold: `Crée le scaffold d'une application web SPA:
1. Initialise avec le CLI du framework (npx create-vite, etc.)
2. OBLIGATOIRE: configure le dev server pour écouter sur 0.0.0.0
3. Installe les dépendances de base
4. Crée le docker-compose.yml de développement local`,

        development: `Implémente toutes les fonctionnalités de l'application web.
WORKFLOW:
1. Crée les types/interfaces TypeScript
2. Crée les composants UI réutilisables
3. Crée les pages avec le routing
4. Ajoute les styles (CSS/Tailwind)
5. Teste le build: npm run build`,

        deploy: `Configure le déploiement production d'une SPA:
- Dockerfile multi-stage: node build → nginx serve
- Le port interne DOIT être 80 (nginx)
- N'utilise JAMAIS "npm run dev" en production
- docker-compose.prod.yml avec labels Traefik`,
    },
    dockerfileTemplate: `# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
    composeHints: `# SPA: nginx sur port 80, labels Traefik standard`,
};

const API_ONLY: ProjectTemplate = {
    id: "api-only",
    name: "API Backend",
    emoji: "⚡",
    description: "API REST/GraphQL — Express, FastAPI, Flask, NestJS",
    keywords: [
        "api",
        "backend",
        "rest",
        "graphql",
        "server",
        "microservice",
        "fastapi",
        "express",
        "nestjs",
        "flask",
        "django",
        "endpoint",
        "service",
    ],
    defaultStack: { backend: "Node.js + Express + TypeScript" },
    deployStrategy: "docker-traefik",
    needsTraefik: true,
    defaultPort: 3000,
    prompts: {
        analysis: `Analyse cette demande d'API backend.
Produis un JSON strict contenant :
1. "type": "api"
2. "stack": { "backend": "framework + language", "database": "si nécessaire" }
3. "summary": Résumé des endpoints et fonctionnalités
4. "endpoints": Liste des routes API principales (GET /users, POST /auth, etc.)
5. "auth": Type d'authentification requis (JWT, API key, OAuth, none)
6. "database": Schéma simplifié de la base de données si nécessaire`,

        architecture: `Conçois l'architecture d'une API backend.
CONTRAINTES:
- Structure: routes/, controllers/, services/, models/, middleware/
- Route GET /health obligatoire
- Validation des entrées (Zod, Joi, ou Pydantic)
- Gestion d'erreurs centralisée
- Le serveur DOIT écouter sur 0.0.0.0`,

        scaffold: `Crée le scaffold d'une API backend:
1. Initialise le projet (npm init / pip init)
2. Installe le framework + dépendances
3. Crée la structure de dossiers
4. Configure le linter
5. Crée le docker-compose.yml avec la DB si nécessaire`,

        development: `Implémente l'API complète:
1. Crée les modèles de données
2. Crée les routes/controllers
3. Implémente la logique métier dans les services
4. Ajoute la validation et la gestion d'erreurs
5. Crée la route GET /health
6. Teste que le serveur démarre`,

        deploy: `Configure le déploiement d'une API:
- Dockerfile: node:20-slim, npm ci --only=production
- Le port interne correspond au port de l'API (3000 par défaut)
- Si une DB est utilisée, inclus-la dans docker-compose.prod.yml
- Utilise env_file: .env pour les variables`,
    },
    dockerfileTemplate: `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]`,
    composeHints: `# API: expose sur le port configuré, DB dans réseau interne`,
};

const FULLSTACK: ProjectTemplate = {
    id: "fullstack",
    name: "Application Fullstack",
    emoji: "🏗️",
    description: "Frontend + Backend + Base de données — Application complète",
    keywords: [
        "fullstack",
        "full-stack",
        "full stack",
        "application",
        "app",
        "plateforme",
        "platform",
        "saas",
        "marketplace",
        "e-commerce",
        "ecommerce",
        "social",
        "forum",
        "blog",
        "cms",
    ],
    defaultStack: { frontend: "React + Vite", backend: "Node.js + Express", database: "PostgreSQL" },
    deployStrategy: "docker-compose",
    needsTraefik: true,
    defaultPort: 3000,
    prompts: {
        analysis: `Analyse cette demande d'application fullstack.
Produis un JSON strict contenant :
1. "type": "fullstack"
2. "stack": { "frontend": "...", "backend": "...", "database": "..." }
3. "summary": Résumé des fonctionnalités
4. "services": Liste des services nécessaires (frontend, backend, db, cache, etc.)
5. "endpoints": Routes API principales
6. "pages": Pages frontend principales
7. "auth": Mécanisme d'authentification
8. "database": Schéma simplifié des tables/collections`,

        architecture: `Conçois l'architecture d'une application fullstack multi-container.
CONTRAINTES:
- Frontend et Backend dans des dossiers séparés: client/ et server/
- Communication Frontend ↔ Backend via API REST ou GraphQL
- Base de données persistée via volume Docker
- Réseau interne pour communication DB ↔ Backend
- Le frontend est build en static et servi par nginx
- Le backend écoute sur 0.0.0.0`,

        scaffold: `Crée le scaffold fullstack:
1. Crée client/ (frontend) et server/ (backend)
2. Initialise chaque sous-projet séparément
3. Crée le docker-compose.yml multi-container:
   - Service frontend (Vite dev ou nginx)
   - Service backend (Express/FastAPI)
   - Service database (PostgreSQL/MongoDB)
4. Configure les variables d'environnement (.env.example)`,

        development: `Implémente l'application fullstack complète:
BACKEND D'ABORD:
1. Modèles de données + migration DB
2. Routes API + controllers
3. Authentification si nécessaire
4. Tests: le serveur démarre

FRONTEND ENSUITE:
5. Types TypeScript partagés avec l'API
6. Services API (client HTTP)
7. Pages et composants UI
8. Navigation/routing
9. Build: npm run build dans client/`,

        deploy: `Configure le déploiement fullstack multi-container:
- docker-compose.prod.yml avec 3+ services:
  1. Frontend: multi-stage build → nginx (port 80)
  2. Backend: node:20-slim (port 3000)
  3. Database: image officielle avec volume nommé + healthcheck
- Frontend exposé via Traefik
- Backend exposé via Traefik (sous-domaine api.xxx ou /api path)
- DB sur réseau interne uniquement
- env_file: .env pour les secrets`,
    },
    dockerfileTemplate: `FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]`,
    composeHints: `# Fullstack: frontend (nginx:80), backend (node:3000), db (postgres:5432)`,
};

const DISCORD_BOT: ProjectTemplate = {
    id: "discord-bot",
    name: "Bot Discord/Telegram",
    emoji: "🤖",
    description: "Bot de chat — Discord.js, Telegraf, python-telegram-bot",
    keywords: [
        "bot",
        "discord",
        "telegram",
        "slack",
        "chatbot",
        "bot discord",
        "bot telegram",
        "bot slack",
        "whatsapp",
    ],
    defaultStack: { backend: "Node.js + Discord.js", extras: ["SQLite"] },
    deployStrategy: "docker-only",
    needsTraefik: false,
    defaultPort: 0, // No web port needed
    prompts: {
        analysis: `Analyse cette demande de bot de messagerie.
Produis un JSON strict contenant :
1. "type": "bot"
2. "stack": { "backend": "framework bot + language", "database": "si nécessaire" }
3. "platform": "discord" | "telegram" | "slack" | "whatsapp"
4. "summary": Résumé des fonctionnalités du bot
5. "commands": Liste des commandes disponibles (/help, /start, etc.)
6. "features": Fonctionnalités spéciales (embed, boutons, reactions, etc.)
7. "apiKeys": Liste des API keys nécessaires (BOT_TOKEN, etc.)`,

        architecture: `Conçois l'architecture d'un bot de messagerie.
CONTRAINTES:
- Structure: commands/, events/, utils/, services/
- Système de commandes modulaire (chaque commande dans un fichier séparé)
- Gestion centralisée des événements
- Logger pour les erreurs
- Pas besoin de Traefik (pas d'interface web par défaut)
- Si un dashboard web est souhaité, ajouter un serveur Express minimal`,

        scaffold: `Crée le scaffold du bot:
1. Initialise le projet Node.js/Python
2. Installe le SDK de la plateforme (discord.js, python-telegram-bot, etc.)
3. Crée la structure de dossiers
4. Configure les variables d'env (BOT_TOKEN dans .env.example)
5. Crée un docker-compose.yml simple (un seul service, pas de Traefik)`,

        development: `Implémente le bot complet:
1. Setup du client/bot avec le token
2. Système de chargement des commandes
3. Implémente chaque commande
4. Gestion des événements (message, interaction, etc.)
5. Gestion d'erreurs et reconnexion
6. Si dashboard: serveur Express minimal sur un port séparé`,

        deploy: `Configure le déploiement du bot:
- Dockerfile simple: node:20-slim ou python:3.11-slim
- PAS de labels Traefik (le bot n'a pas besoin d'être exposé au web)
- docker-compose.prod.yml avec restart: unless-stopped
- Volumes pour la persistance des données (SQLite, etc.)
- env_file: .env pour le BOT_TOKEN et autres secrets`,
    },
    dockerfileTemplate: `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "index.js"]`,
    composeHints: `# Bot: pas de Traefik, restart: unless-stopped, env_file: .env`,
};

const CLI_TOOL: ProjectTemplate = {
    id: "cli-tool",
    name: "Outil CLI",
    emoji: "🔧",
    description: "Outil en ligne de commande — Node.js, Python, Go, Rust",
    keywords: [
        "cli",
        "command line",
        "terminal",
        "outil",
        "tool",
        "script",
        "automation",
        "scraper",
        "crawler",
        "cron",
    ],
    defaultStack: { backend: "Node.js + Commander.js + TypeScript" },
    deployStrategy: "docker-only",
    needsTraefik: false,
    defaultPort: 0,
    prompts: {
        analysis: `Analyse cette demande d'outil CLI.
Produis un JSON strict contenant :
1. "type": "cli"
2. "stack": { "backend": "language + framework CLI" }
3. "summary": Résumé de ce que fait l'outil
4. "commands": Liste des sous-commandes (ex: "scrape", "convert", "sync")
5. "inputOutput": Types d'entrées/sorties (fichiers, stdin, API, etc.)
6. "dependencies": Services externes nécessaires`,

        architecture: `Conçois l'architecture d'un outil CLI.
CONTRAINTES:
- Structure: src/commands/, src/utils/, src/lib/
- Point d'entrée unique (bin/cli ou __main__.py)
- Parsing des arguments (Commander.js, argparse, cobra)
- Output formaté (couleurs, tableaux, progress bars)
- Gestion d'erreurs avec codes de sortie appropriés`,

        scaffold: `Crée le scaffold de l'outil CLI:
1. Initialise le projet
2. Configure le point d'entrée CLI (bin dans package.json ou setup.py)
3. Installe le parser d'arguments
4. Crée la commande --help de base
5. Crée un Dockerfile pour l'exécution containerisée`,

        development: `Implémente l'outil CLI complet:
1. Parser d'arguments principal
2. Chaque sous-commande dans son fichier
3. Logique métier dans src/lib/
4. Output formaté et lisible
5. Gestion d'erreurs + exit codes
6. README avec exemples d'utilisation`,

        deploy: `Pour un CLI, le "deploy" est la containerisation:
- Dockerfile: installe l'outil et ses dépendances
- docker-compose.prod.yml avec restart: unless-stopped si c'est un cron/daemon
- Pas de Traefik
- Si c'est un scraper/cron, configure un entrypoint avec une boucle ou crontab`,
    },
    dockerfileTemplate: `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENTRYPOINT ["node", "bin/cli.js"]`,
    composeHints: `# CLI: restart: unless-stopped si daemon, sinon pas de compose nécessaire`,
};

const PYTHON_APP: ProjectTemplate = {
    id: "python-app",
    name: "Application Python",
    emoji: "🐍",
    description: "Backend Python — FastAPI, Flask, Django, Data Science",
    keywords: [
        "python",
        "fastapi",
        "flask",
        "django",
        "data",
        "machine learning",
        "ml",
        "ia",
        "ai",
        "scraping",
        "pandas",
        "numpy",
        "data science",
        "analyse",
    ],
    defaultStack: { backend: "Python + FastAPI", database: "PostgreSQL" },
    deployStrategy: "docker-traefik",
    needsTraefik: true,
    defaultPort: 8000,
    prompts: {
        analysis: `Analyse cette demande d'application Python.
Produis un JSON strict contenant :
1. "type": "python-app"
2. "stack": { "backend": "framework Python", "database": "si nécessaire" }
3. "summary": Résumé des fonctionnalités
4. "endpoints": Routes API si applicable
5. "libraries": Bibliothèques Python recommandées
6. "dataFlow": Comment les données circulent dans l'application`,

        architecture: `Conçois l'architecture d'une application Python.
CONTRAINTES:
- Structure: app/, app/routers/, app/models/, app/services/
- requirements.txt ou pyproject.toml
- Async si FastAPI, sinon WSGI
- Le serveur DOIT écouter sur 0.0.0.0
- Configuration via variables d'environnement`,

        scaffold: `Crée le scaffold Python:
1. Crée la structure de dossiers
2. Crée requirements.txt avec les dépendances
3. Crée le fichier principal (main.py ou app.py)
4. Configure le serveur (uvicorn, gunicorn, etc.)
5. Crée un docker-compose.yml avec le service Python + DB si nécessaire`,

        development: `Implémente l'application Python complète:
1. Modèles de données (Pydantic, SQLAlchemy, etc.)
2. Routes / endpoints
3. Logique métier (services)
4. Connexion à la base de données si nécessaire
5. Gestion d'erreurs
6. Test: le serveur démarre avec uvicorn/gunicorn`,

        deploy: `Configure le déploiement Python:
- Dockerfile: python:3.11-slim, pip install -r requirements.txt
- Port interne: 8000 (uvicorn) ou 5000 (Flask)
- CMD: uvicorn app.main:app --host 0.0.0.0 --port 8000
- docker-compose.prod.yml avec Traefik labels
- DB si nécessaire avec healthcheck`,
    },
    dockerfileTemplate: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`,
    composeHints: `# Python: uvicorn sur 8000, DB en réseau interne`,
};

const GAME: ProjectTemplate = {
    id: "game",
    name: "Jeu Web",
    emoji: "🎮",
    description: "Jeu web — Canvas, WebGL, Phaser, Three.js, Pixi.js",
    keywords: [
        "jeu",
        "game",
        "gaming",
        "canvas",
        "webgl",
        "phaser",
        "three.js",
        "pixi",
        "2d",
        "3d",
        "arcade",
        "puzzle",
        "platformer",
    ],
    defaultStack: { frontend: "Vite + TypeScript + Phaser 3" },
    deployStrategy: "docker-traefik",
    needsTraefik: true,
    defaultPort: 80,
    prompts: {
        analysis: `Analyse cette demande de jeu web.
Produis un JSON strict contenant :
1. "type": "game"
2. "stack": { "frontend": "engine/framework de jeu" }
3. "summary": Résumé du gameplay
4. "mechanics": Mécaniques de jeu principales
5. "assets": Types d'assets nécessaires (sprites, sons, etc.)
6. "scenes": Liste des scènes/niveaux du jeu`,

        architecture: `Conçois l'architecture d'un jeu web.
CONTRAINTES:
- Structure: src/scenes/, src/entities/, src/utils/, assets/
- Game loop claire (update/render)
- Gestionnaire d'assets (preload)
- Système de scènes (menu, gameplay, gameover)
- Canvas responsive`,

        scaffold: `Crée le scaffold du jeu:
1. Initialise un projet Vite
2. Installe l'engine de jeu (Phaser, Three.js, etc.)
3. Configure le canvas
4. Crée la scène de base avec le game loop
5. docker-compose.yml pour le dev`,

        development: `Implémente le jeu complet:
1. Assets et sprites (utilise des formes géométriques si pas d'images)
2. Scène principale avec le gameplay
3. Système de score/progression
4. Menu principal et écran game over
5. Contrôles (clavier/souris/touch)
6. Build: npm run build`,

        deploy: `Même déploiement qu'une SPA:
- Dockerfile multi-stage: node build → nginx serve
- Port 80 (nginx)
- Labels Traefik standard`,
    },
    dockerfileTemplate: WEB_SPA.dockerfileTemplate,
    composeHints: `# Game: même deploy qu'une SPA (nginx sur port 80)`,
};

// ─── Template Registry ───

export const TEMPLATE_REGISTRY: ProjectTemplate[] = [
    WEB_SPA,
    API_ONLY,
    FULLSTACK,
    DISCORD_BOT,
    CLI_TOOL,
    PYTHON_APP,
    GAME,
];

/**
 * Auto-detect the best template from a project description.
 * Returns the template with the most keyword matches.
 */
export function detectTemplate(description: string): ProjectTemplate {
    const desc = description.toLowerCase();
    let bestMatch: ProjectTemplate = WEB_SPA; // Default fallback
    let bestScore = 0;

    for (const template of TEMPLATE_REGISTRY) {
        let score = 0;
        for (const keyword of template.keywords) {
            if (desc.includes(keyword)) {
                // Exact word boundary match scores higher
                const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                score += regex.test(desc) ? 3 : 1;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = template;
        }
    }

    return bestMatch;
}

/**
 * Get a template by ID.
 */
export function getTemplateById(id: string): ProjectTemplate | undefined {
    return TEMPLATE_REGISTRY.find((t) => t.id === id);
}

/**
 * Get the top 3 template suggestions for a description (for decision tree).
 */
export function suggestTemplates(description: string): ProjectTemplate[] {
    const desc = description.toLowerCase();
    const scored = TEMPLATE_REGISTRY.map((template) => {
        let score = 0;
        for (const keyword of template.keywords) {
            if (desc.includes(keyword)) {
                const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                score += regex.test(desc) ? 3 : 1;
            }
        }
        return { template, score };
    }).sort((a, b) => b.score - a.score);

    // Return top 3 (or at least the default)
    return scored.slice(0, 3).map((s) => s.template);
}
