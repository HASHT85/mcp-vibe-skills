---
description: Règles de développement pour l'Orchestrateur Multi-Agents (Perplexity Computer)
---
# Antigravity Guidelines pour le Projet "VibeCraft / Perplexity Computer"

## 1. Vision du Projet
Ce projet vise à construire un système 100% autonome capable de générer des apps web, des bots de trading (ex: Polymarket monitoring) et des modèles IA sans aucune intervention humaine après le prompt initial.
- **Approche:** Graphe de tâches (DAG) et non pipeline linéaire.
- **Déploiement:** Docker Engine direct et Traefik (Pas de Dokploy).

## 2. Règles de Code (Backend - orchestrator.ts)
- **Node.js & TypeScript:** Toujours utiliser le standard ESM (`import`/`export`).
- **Asynchronie:** Toujours paralléliser (Promise.all) les agents indépendants sur le graphe.
- **Sandboxing & Local Testing:** Ne jamais exécuter de commandes destructrices localement sans un conteneur d'isolation. Les agents doivent générer un `docker-compose.yml` et tourner dedans. Le projet **DOIT être testable localement (localhost)** via des ports dynamiques exportés par Docker. L'utilisateur ne doit jamais être forcé de push sur Git pour tester le projet.
- **Modularité:** Ne pas créer un fichier `orchestrator.ts` de 3000 lignes. Séparer l'exécution du DAG, le pool d'agents, et la mémoire partagée.

## 3. Direction Artistique (Frontend - dashboard)
- **Framework:** React + Vite + TailwindCSS.
- **Thème:** "Neural Glass" (Dark mode obligatoire).
- **Couleurs:** Fond `#0A0A0B`, Surfaces `#141415`, Accents Cyan/Violet.
- **UI/UX:** Animations fluides (Framer Motion) pour illustrer les agents au travail (pulsations de bordures, typing effects). Les logs de l'UI doivent utiliser une typographie monospace.

## 4. Workflows d'Antigravity Actifs
- Si l'utilisateur demande "Ajoute un agent", je dois le concevoir comme un module autonome (ex: "Worker Agent") et lui restreindre ses outils (Tools) à sa spécialité.
- Toujours vérifier le RAG/Mémoire partagée avant de dire à un agent d'écrire du code from scratch.
