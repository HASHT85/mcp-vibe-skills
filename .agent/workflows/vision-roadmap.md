---
description: Roadmap VEIST — Phases 2 et 3 de la vision "Personal Computer"
---

# VEIST Vision Roadmap

> Phase 1 ✅ DONE — Project Templates System (7 types, auto-detect, template-driven agents)

---

## Phase 2 — Personal Computer Features

L'objectif est de transformer VEIST d'un simple créateur de projets en un **ordinateur personnel** à la Perplexity : l'utilisateur peut tout faire depuis le dashboard sans jamais ouvrir un terminal.

### 2.1 — Live Logs dans le Dashboard
**Fichiers à modifier :**
- `src/index.ts` — Nouvelle route SSE `GET /pipeline/:id/logs` qui stream `docker compose logs -f` du container du projet
- `dashboard/src/components/ProjectDetail.tsx` — Onglet "Logs" qui affiche les logs en temps réel via EventSource
- Utiliser `child_process.spawn('docker', ['compose', 'logs', '-f', ...])` côté backend

**Comportement attendu :**
- L'utilisateur ouvre un projet → onglet "Logs" → voit les logs en direct
- Les logs doivent être colorés (parse ANSI) et scrollable
- Bouton "Clear" pour vider l'affichage

### 2.2 — File Browser API
**Fichiers à créer/modifier :**
- `src/file_browser.ts` — Nouveau module avec routes :
  - `GET /pipeline/:id/files?path=` → liste les fichiers du workspace
  - `GET /pipeline/:id/files/read?path=` → lit le contenu d'un fichier
  - `PUT /pipeline/:id/files/write` → écrit dans un fichier
- `dashboard/src/components/FileBrowser.tsx` — Nouveau composant avec arbre de fichiers + éditeur Monaco

**SÉCURITÉ CRITIQUE :**
- Toujours valider que le `path` reste DANS le workspace du projet (pas de path traversal `../`)
- Utiliser `path.resolve()` et vérifier que le chemin résolu commence par le workspace root

### 2.3 — Preview iframe
**Fichiers à modifier :**
- `dashboard/src/components/ProjectDetail.tsx` — Onglet "Preview" avec iframe pointant vers `https://{projectId}.hach.dev`
- Ajouter un bouton "Refresh" et un indicateur de statut (loading/online/offline)
- Le projet doit être en état COMPLETED et avoir un domaine Traefik pour que le preview marche

### 2.4 — Terminal WebSocket (le plus complexe)
**Fichiers à créer/modifier :**
- `src/terminal_ws.ts` — WebSocket server qui :
  1. Accepte une connexion WS authentifiée
  2. Spawn un shell (`docker exec -it containerName /bin/sh`)
  3. Pipe stdin/stdout entre le WS et le shell
- `dashboard/src/components/Terminal.tsx` — Composant xterm.js qui se connecte au WS
- Installer `xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` côté dashboard
- Installer `ws` côté backend

**SÉCURITÉ CRITIQUE :**
- Authentification obligatoire sur la connexion WS
- Rate limiting
- Timeout d'inactivité (kill le shell après 30min sans input)

---

## Phase 3 — Intelligence

L'objectif est de rendre VEIST **proactif** : il apprend des projets passés, détecte les problèmes avant l'utilisateur, et s'adapte à ses préférences.

### 3.1 — User Preferences Memory
**Fichiers à créer/modifier :**
- `src/user_preferences.ts` — Service qui stocke :
  - Frameworks favoris (ex: "préfère toujours Tailwind")
  - Conventions de code (ex: "veut des semicolons en TypeScript")
  - Patterns d'architecture préférés
- Sauvegarder dans `STORE_PATH/preferences.json`
- Injecter les préférences dans les prompts agents (AnalysisNode, ArchitectureNode)
- L'IA du chat doit pouvoir noter les préférences quand l'utilisateur les mentionne

### 3.2 — Auto-Debug Crash Loops
**Fichiers à créer/modifier :**
- `src/health_monitor.ts` — Service background qui :
  1. Poll `docker inspect` sur les containers des projets toutes les 60s
  2. Détecte les restart loops (restartCount > 3)
  3. Récupère les logs d'erreur (`docker logs --tail 50`)
  4. Envoie un événement SSE au dashboard avec le diagnostic
  5. Propose un fix automatique via le flow `executeModification`
- Dashboard : notification toast quand un container crash avec bouton "Auto-Fix"

### 3.3 — Proactive Monitoring
**Fichiers à créer/modifier :**
- `src/monitoring.ts` — Cron qui check :
  - Uptime des projets déployés
  - Disk usage des volumes Docker
  - Certificate SSL status
  - Memory/CPU des containers
- Dashboard : badge de santé (vert/jaune/rouge) sur chaque projet dans la liste
- Alertes push si un projet est down depuis > 5 minutes

### 3.4 — Pattern Learning
**Fichiers à créer/modifier :**
- `src/pattern_store.ts` — Après chaque pipeline COMPLETED :
  1. Sauvegarder le template utilisé, la stack choisie, les erreurs rencontrées
  2. Scorer les combinaisons qui ont marché vs échoué
  3. Injecter les "leçons apprises" dans les prompts agents futurs
- Exemple : "Les 3 derniers projets React+Vite+Tailwind ont tous réussi du premier coup → recommander cette stack"

---

## Ordre d'implémentation recommandé

```
Phase 2.1 (Live Logs)     → le plus simple, impact immédiat
Phase 2.3 (Preview)        → très simple, gros impact UX
Phase 2.2 (File Browser)   → medium, très utile
Phase 2.4 (Terminal WS)    → le plus complexe, power users
Phase 3.1 (Preferences)    → simple mais impactant
Phase 3.2 (Auto-Debug)     → medium, gros impact reliabilité
Phase 3.3 (Monitoring)     → medium, pro-level
Phase 3.4 (Pattern Learn)  → avancé, long-terme
```

## Context important pour le développement

- **Stack backend** : Node.js + Express, TypeScript, fichiers dans `src/`
- **Stack frontend** : React + Vite + Tailwind (custom theme "brutalist/industriel"), fichiers dans `dashboard/src/`
- **Deploy** : Docker Compose sur Hostinger VPS (72.61.101.24), Traefik reverse proxy
- **Domaines** : `veist.hach.dev` (dashboard), `api.veist.hach.dev` (API)
- **Workflow deploy** : voir `/deploy` workflow
- **Secrets** : AES-256-GCM dans `SecretsService` singleton
- **Template system** : `src/templates/registry.ts` — 7 types de projets
