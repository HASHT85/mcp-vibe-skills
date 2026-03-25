---
description: Roadmap VEIST — Phases 2 et 3 de la vision "Personal Computer"
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

## Phase 2 — Contextual Intelligence ✅ (DeerFlow Patterns)
> **Inspiré de** : ByteDance DeerFlow 2.0 (cherry-pick patterns, pas de dépendance Python)

### 2a. Long-Term Memory ✅
- **Fichier** : `src/memory_service.ts` [NEW]
- Extraction de faits via LLM après chaque conversation (debounce 30s)
- Déduplication (normalisation whitespace), stockage atomique (`/data/memory.json`)
- Injection de `<memory>` block dans les system prompts (top 15 faits)
- **Impact** : les agents et le chat se "souviennent" des préférences utilisateur

### 2b. Context Summarization ✅
- **Fichier** : `src/chat_service.ts` (modifié)
- Compression automatique des anciens messages quand tokens > 80k (80% du context window)
- Garde les 6 derniers messages + 1 résumé généré par LLM
- **Impact** : conversations longues sans overflow du context window

### 2c. Middleware Chain ✅
- **Fichier** : `src/middleware.ts` [NEW]
- Hooks pre/post autour de chaque appel agent dans le DAG (`AgentNode.ts`)
- 3 middlewares built-in : MemoryMiddleware, LoopDetectionMiddleware, TokenTrackingMiddleware
- **Impact** : memory injectée dans tous les agents pipeline, détection de boucles

### 2d. Skills Relevance Scoring ✅
- **Fichier** : `src/skills.ts` (modifié)
- TF-IDF vectorisation + cosine similarity (remplace le keyword matching brut)
- Seuil de pertinence (0.15) — les skills non-pertinents ne sont plus injectés
- **Impact** : moins de bruit dans les prompts agents, skills plus ciblés

## Phase 2.5 — Embedding & Semantic Search (à venir)
> **Modèle** : `gemini-embedding-2-preview` (Google, $0.15/M tokens)

### Code Context Embeddings
- Vectoriser les fichiers/fonctions des repos projets
- Stocker dans `/data/embeddings/`
- Recherche sémantique → fichiers pertinents injectés dans les prompts agents

### Full Semantic Skills Lookup
- Upgrade du TF-IDF vers embeddings pré-calculés pour les descriptions de skills
- Recherche par similarité sémantique au lieu de cosine TF-IDF

## Phase 3 — Autonomie & Self-Improvement
- Auto-évaluation des projets déployés (le bot teste son propre output)
- Feedback loop : résultats des tests → ajustent les prompts des agents
- Sandbox isolation : workspace isolé par pipeline (Docker-in-Docker)
- Multi-VPS : distribuer les pipelines sur plusieurs machines
