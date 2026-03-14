---
description: Roadmap VEIST — Phases 2 et 3 de la vision "Personal Computer"
---

# VEIST Roadmap

## Phase 1 — Dynamic Agent Orchestration ✅ (en cours)
- DAG dynamique généré par LLM (Planner Node)
- Agents spawned selon le projet (pas de séquence fixe)
- Node Map UI + Agent Details panel
- Skills Enrichment automatique

## Phase 2 — Embedding & Contextual Intelligence
> **Modèle** : `gemini-embedding-2-preview` (Google, $0.15/M tokens ≈ <1€/mois)

### 2a. Code Context Embeddings (priorité haute)
- **Fichier** : `src/embedding_service.ts` [NEW]
- Vectoriser chaque fichier/fonction des repos projets existants
- Stocker les vecteurs dans un JSON local (`/data/embeddings/`)
- Intégrer dans `ResearchNode.ts` : recherche sémantique → fichiers les plus pertinents pour la tâche
- **Impact** : agents reçoivent un contexte ciblé au lieu de tout le repo → moins de tokens, meilleure qualité

### 2b. Skills Semantic Lookup
- Remplacer le keyword matching dans `SkillsEnrichmentNode.ts` par du similarity search
- Vectoriser les descriptions de chaque skill au démarrage
- **Impact** : skills trouvées même si l'utilisateur n'utilise pas le mot-clé exact

### 2c. Chat Long-Term Memory
- Embeddings des messages de chat → stockés par session
- Quand nouveau message → retrouve les sessions passées pertinentes
- **Impact** : le bot se "souvient" des projets précédents sans sliding window

## Phase 3 — Autonomie & Self-Improvement
- Auto-évaluation des projets déployés (le bot teste son propre output)
- Feedback loop : résultats des tests → ajustent les prompts des agents
- Multi-VPS : distribuer les pipelines sur plusieurs machines
