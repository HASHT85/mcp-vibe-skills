# VEIST — Brief Projet (lu automatiquement par Antigravity)

## Vision

VEIST est un **orchestrateur multi-agents IA autonome** qui conçoit, développe et déploie des projets complets. L'utilisateur fournit une idée, VEIST fait tout le reste via un essaim d'agents spécialisés coordonnés par un DAG dynamique généré par LLM.

- **URL prod** : `https://veist.hach.dev` (dashboard) / `https://api.veist.hach.dev` (API)
- **Repo** : `c:\Projet\Nouveau dossier\mcp-vibe-skills`
- **VPS** : Hostinger KVM2, IP `72.61.101.24`, VM ID `1287719`

---

## Stack Technique

| Composant | Technologie |
|---|---|
| Runtime | Node.js 20 LTS (Alpine 3.21) |
| Language | TypeScript 5.5+ strict, ESM uniquement |
| Framework | Express 4.x |
| LLM | Multi-model via **OpenRouter** (Claude, Gemini, DeepSeek, GPT) |
| Dashboard | React + Vite + TailwindCSS (thème Neural Glass) |
| Deploy | Docker Compose + Traefik sur Hostinger VPS |
| Tests | **Vitest** (`npm run test`) — 27 tests sécurité |
| Linting | **ESLint + Prettier** (`npm run lint`, `npm run format`) |

---

## Architecture Source (`src/`)

```
src/
├── agent/
│   ├── types.ts          ← Types partagés (AgentAction, AgentResult, AgentOptions)
│   ├── openrouter.ts     ← Adaptateur OpenAI/OpenRouter + invokeModel()
│   └── index.ts          ← Boucle runVeistAgent (agent loop principal)
├── tools/
│   ├── system.ts         ← safePath() + bash sandbox (blocklist)
│   ├── file.ts           ← read/write/replace_in_file + mémoire partagée
│   ├── web.ts            ← webSearch (Tavily) + fetchUrl (SSRF-protégé)
│   └── executor.ts       ← Dispatcher central + définitions TOOLS[]
├── dag/
│   ├── Graph.ts          ← Moteur d'exécution DAG
│   ├── Node.ts           ← Classe de base des nœuds
│   └── nodes/            ← Agents spécialisés (PlannerNode, AgentNode, EvalNode…)
├── __tests__/
│   └── security.test.ts  ← 27 tests non-régression sécurité
├── agent_engine.ts       ← Pont de compatibilité (re-exports vers src/agent/)
├── orchestrator.ts       ← Pipeline manager (DAG orchestration) — 1544 lignes ⚠️
├── chat_service.ts       ← Sessions chat + context summarization
├── memory_service.ts     ← Long-term memory (extraction LLM, /data/memory.json)
├── embedding_service.ts  ← Semantic code search (gemini-embedding-2-preview)
├── middleware.ts         ← Chain hooks (Memory, LoopDetection, TokenTracking)
├── skills.ts             ← Skills lookup + TF-IDF cosine similarity
├── model_benchmarks.ts   ← Benchmarks modèles pour routing Planner
├── config.ts             ← Validation Zod des env vars au démarrage
├── secrets_service.ts    ← AES-256-GCM chiffrement (/data/secrets.json)
├── github_api.ts         ← Gestion repos GitHub
├── quickDeploy.ts        ← Déploiement rapide via API Hostinger
└── index.ts              ← Serveur Express + toutes les routes API
```

---

## Règles Absolues de Code

### ❌ JAMAIS
- Écrire `require()` — ESM uniquement (`import`/`export`)
- Mettre des secrets en dur dans le code ou les commits
- Utiliser `--no-verify` sur git commit
- Ouvrir un port Docker sur `0.0.0.0` (toujours `127.0.0.1:port:port`)
- Créer des fichiers `*_test.md`, `*_rapport.md` ou docs inutiles dans le code source
- Utiliser `@ts-nocheck` (interdit depuis l'audit QUAL-34)
- Dépasser **500 lignes par fichier** sans refactoring (règle architecture)

### ✅ TOUJOURS
- Imports internes avec l'extension `.js` (résolution ESM Node)
- `tsc --noEmit` avant tout commit
- `npm run test` avant tout commit  
- Typer explicitement les retours de fonctions
- Utiliser `try/catch` sur tous les appels réseau externes

---

## Workflows Disponibles

| Commande | Action |
|---|---|
| `/deploy` | Déploiement safe sur VPS Hostinger (préserve les volumes) |
| `/vision-roadmap` | Roadmap VEIST — état des phases |
| `/project-guidelines` | Règles de développement détaillées |

---

## Roadmap — État Actuel

| Phase | Status |
|---|---|
| Phase 1 — Dynamic Agent Orchestration | ✅ Terminée |
| Phase 2a — Long-Term Memory | ✅ Terminée |
| Phase 2b — Context Summarization | ✅ Terminée |
| Phase 2c — Middleware Chain | ✅ Terminée |
| Phase 2d — Skills TF-IDF Scoring | ✅ Terminée |
| Phase 2.5 — Embeddings Semantic Search | ✅ Terminée |
| Phase 2.5 — Model Benchmarks Routing | ✅ Terminée |
| Audit Qualité — ESLint/Prettier/Vitest/Refactoring/Zod | ✅ Terminée |
| **Phase 3 — Autonomie & Self-Improvement** | ❌ À faire |

### Phase 3 — Ce qui reste
- Auto-évaluation des projets déployés (l'agent teste son propre output)
- Feedback loop : résultats des tests → ajustent les prompts des agents
- Sandbox isolation : workspace Docker isolé par pipeline
- Multi-VPS : distribution des pipelines sur plusieurs machines

---

## Infrastructure VPS

| Propriété | Valeur |
|---|---|
| VM ID | `1287719` |
| IP | `72.61.101.24` |
| OS | Ubuntu 24.04 + Docker + Traefik |
| RAM | 8 GB / vCPU: 2 / Disque: 100 GB |
| Domaine principal | `hach.dev` (wildcard `*` → VPS) |

### Containers VEIST sur VPS
- `/docker/veist/` → containers `veist` + `veist-dashboard`
- `/opt/veist/workspace` → workspace des projets générés
- `/opt/veist/data` → `store.json`, `secrets.json`, `memory.json`

### ⚠️ Commandes DANGEREUSES — Jamais sans confirmation explicite
```
❌ VPS_deleteProjectV1       → DÉTRUIT les volumes (perte données)
❌ VPS_recreateVirtualMachineV1 → EFFACE TOUT le VPS
❌ DNS_resetDNSRecordsV1     → Reset tous les DNS
```

---

## Variables d'Environnement Requises

| Variable | Requis | Usage |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ Obligatoire | Accès LLM |
| `ADMIN_PASS` | ✅ Obligatoire | Dérivation clé AES secrets |
| `TAVILY_API_KEY` | Optionnel | Outil web_search |
| `GITHUB_TOKEN` | Optionnel | Création repos |
| `HOSTINGER_API_KEY` | Optionnel | Deploy Hostinger |
| `AI_MODEL` | Optionnel | Défaut: `anthropic/claude-sonnet-4` |
| `STORE_PATH` | Optionnel | Défaut: `/data/store.json` |

---

## Conventions Git

```bash
# Format des commits
feat: ajouter X
fix: corriger Y
quality: refactoring / tests / linting
security: correctif sécurité
deploy: changement infrastructure
docs: documentation uniquement

# Avant chaque commit
npm run test      # 27/27 requis
tsc --noEmit      # 0 erreur requise
```
