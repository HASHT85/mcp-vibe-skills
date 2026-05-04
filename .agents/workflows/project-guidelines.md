---
description: Règles de développement pour l'Orchestrateur Multi-Agents VEIST
---

# Antigravity Guidelines — Projet VEIST

## 1. Vision du Projet

VEIST est un orchestrateur multi-agents IA autonome qui conçoit, développe et déploie des projets complets via un essaim d'agents spécialisés. L'utilisateur fournit une idée, VEIST fait tout le reste.

- **Approche** : Graphe de tâches (DAG) dynamique généré par LLM
- **Déploiement** : Docker Compose + Traefik sur Hostinger VPS
- **Multi-model** : Claude, Gemini, DeepSeek, GPT via OpenRouter
- **Mémoire** : Long-term memory + context summarization

## 2. Règles de Code

Voir les rules détaillées :
- **[development.md](../rules/development.md)** — TypeScript, ESM, architecture
- **[security.md](../rules/security.md)** — Secrets, firewall, SSH, Docker socket
- **[docker.md](../rules/docker.md)** — Docker Compose, Traefik, déploiement
- **[github.md](../rules/github.md)** — CI/CD, Git conventions
- **[hostinger.md](../rules/hostinger.md)** — Infrastructure VPS, DNS, facts

## 3. Principes fondamentaux

### Autonomie maximale
- L'utilisateur ne donne que l'idée initiale
- Les agents s'auto-coordonnent via le DAG et la mémoire partagée
- Self-correction : 3 retries avant escalade vers l'utilisateur

### Sandboxing
- Ne JAMAIS exécuter de commandes destructrices localement
- Les agents génèrent un `docker-compose.yml` et tournent dedans
- Le projet DOIT être testable localement via des ports dynamiques Docker
- L'utilisateur ne doit JAMAIS être forcé de push pour tester

### Modularité
- Chaque agent est un module autonome dans `src/dag/nodes/`
- Les outils (Tools) sont restreints à la spécialité de chaque agent
- Vérifier la mémoire partagée avant de coder from scratch

## 4. Direction Artistique (Dashboard)

- **Framework** : React + Vite + TailwindCSS
- **Thème** : "Neural Glass" — Dark mode obligatoire
- **Couleurs** : Fond `#0A0A0B`, Surfaces `#141415`, Accents Cyan/Violet
- **Animations** : Framer Motion (pulsations agents, typing effects)
- **Logs** : Typographie monospace

## 5. Workflows

- **`/deploy`** — Déploiement sur Hostinger VPS
- **`/vision-roadmap`** — Roadmap phases 2 et 3
- **`/project-guidelines`** — Ce fichier (meta-rules)

## 6. Comportement Antigravity

Quand l'utilisateur demande :
- **"Ajoute un agent"** → Concevoir comme un module autonome, restreindre ses outils
- **"Déploie"** → Suivre le workflow `/deploy`
- **"Fix un bug"** → Vérifier les logs (`getProjectLogsV1`), puis le code
- **"Crée un projet"** → Utiliser le pipeline VEIST (Planner → Architect → Build → Deploy)
- **"Modifie l'infra"** → Vérifier security.md, utiliser les MCP Hostinger
