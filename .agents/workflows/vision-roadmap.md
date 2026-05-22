---
description: Roadmap VEIST — État des phases et vision "Personal Computer"
---

# VEIST Roadmap

## Phase 1 — Dynamic Agent Orchestration ✅
- DAG dynamique généré par LLM (Planner Node)
- Agents spawned selon le projet (pas de séquence fixe)
- Node Map UI + Agent Details panel
- Skills Enrichment automatique (skills.sh)
- Multi-model routing via OpenRouter (choix du meilleur modèle par agent)
- CI/CD automatisé (GitHub Actions → Docker Hub → VPS)
- Chat conversationnel pré-pipeline avec contexte projet

## Phase 2 — Contextual Intelligence ✅
> **Inspiré de** : ByteDance DeerFlow 2.0 (cherry-pick patterns, pas de dépendance Python)

### 2a. Long-Term Memory ✅
- **Fichier** : `src/memory_service.ts`
- Extraction de faits via LLM après chaque conversation (debounce 30s)
- Déduplication, stockage atomique (`/data/memory.json`)
- Injection de `<memory>` block dans les system prompts (top 15 faits)

### 2b. Context Summarization ✅
- **Fichier** : `src/chat_service.ts`
- Compression automatique quand tokens > 80k (80% du context window)
- Garde les 6 derniers messages + 1 résumé LLM

### 2c. Middleware Chain ✅
- **Fichier** : `src/middleware.ts`
- Hooks pre/post autour de chaque appel agent dans le DAG
- 3 middlewares : MemoryMiddleware, LoopDetectionMiddleware, TokenTrackingMiddleware

### 2d. Skills Relevance Scoring ✅
- **Fichier** : `src/skills.ts`
- TF-IDF vectorisation + cosine similarity (remplace le keyword matching brut)
- Seuil de pertinence 0.15 — les skills non-pertinents ne sont plus injectés

## Phase 2.5 — Embedding & Semantic Intelligence ✅
> Terminée — toutes les fonctionnalités sont en production

### Code Context Embeddings ✅
- **Fichier** : `src/embedding_service.ts`
- Vectorisation des fichiers repo via `google/gemini-embedding-2-preview`
- Stockage dans `/data/embeddings/{projectId}.json`
- Recherche sémantique → fichiers pertinents injectés dans les prompts agents
- Intégré dans `orchestrator.ts` + `middleware.ts`

### Model Benchmarks Routing ✅
- **Fichier** : `src/model_benchmarks.ts`
- Scores coding/agentic/intelligence pour 22 modèles (artificialanalysis.ai)
- Le Planner choisit le meilleur modèle par agent selon la tâche
- Intégré dans `orchestrator.ts` (PlannerNode)

## Audit Qualité — Mai 2026 ✅
> Session d'assainissement complète

- **ESLint + Prettier** configurés (`eslint.config.js`, `.prettierrc`)
- **Vitest** — 27 tests de non-régression sécurité (`src/__tests__/security.test.ts`)
- **Bug sécurité corrigé** — `rm -r /etc` n'était pas bloqué par le sandbox bash
- **Refactoring** — `agent_engine.ts` (944 lignes) → 7 modules focalisés dans `src/agent/` et `src/tools/`
- **Zod config** — Validation env vars au démarrage (`src/config.ts`)
- **Pre-commit hook** — tsc + vitest + eslint bloquent les commits cassés
- **GEMINI.md** — Context auto-chargé par Antigravity à chaque session
- **GitHub Actions CI** — Pipeline lint + test + build sur chaque push

## Phase 3 — Autonomie & Self-Improvement ❌ À faire

### 3a. Auto-évaluation des projets déployés
- Après chaque déploiement, un agent "Evaluator" teste le projet généré
- Runs : tests unitaires, vérification des routes HTTP, lint
- Rapport de qualité stocké dans le store

### 3b. Feedback Loop
- Les résultats des tests → ajustent les prompts des agents automatiquement
- Les erreurs récurrentes → mémorisées et évitées dans les prochains pipelines
- Intégration avec `memory_service.ts` pour la persistence

### 3c. Sandbox Isolation (Docker-in-Docker)
- Un workspace Docker **isolé par pipeline** (pas de partage entre projets)
- Chaque pipeline tourne dans son propre container éphémère
- Nettoyage automatique après déploiement

### 3d. Multi-VPS Distribution
- Distribuer les pipelines sur plusieurs machines selon la charge
- Routing intelligent : pipelines lourds → VPS puissant, légers → VPS cheap
- Health checks + failover automatique

---

## Prochaine étape recommandée
**Phase 3a — Auto-évaluation** : implémenter l'`EvaluatorNode` qui teste le projet après déploiement et envoie un rapport dans le dashboard.
