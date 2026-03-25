# VEIST — Multi-Agent AI Orchestrator

> Orchestrateur multi-agents autonome qui conçoit, développe et déploie des projets complets via un essaim d'agents IA spécialisés.

[![Deploy](https://img.shields.io/badge/deploy-Hostinger%20VPS-blue)](https://veist.hach.dev)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-green)](../../actions)

---

## 🚀 Features

### Core
- **Dynamic DAG Pipeline** — LLM-generated topology : un Planner crée l'essaim d'agents optimal pour chaque projet
- **Multi-Model Routing** — Chaque agent utilise le modèle le plus adapté (Claude, Gemini, DeepSeek, GPT) via OpenRouter
- **Auto-Deploy** — Docker build + Traefik reverse proxy → chaque projet reçoit un sous-domaine `*.hach.dev`
- **Skills Enrichment** — Injection automatique de best practices depuis [skills.sh](https://skills.sh)
- **Chat Conversationnel** — Mode discussion pré-pipeline pour affiner le brief avec l'utilisateur
- **GitHub Integration** — Création automatique de repos + push à chaque étape

### Intelligence (DeerFlow Patterns)
- **🧠 Long-Term Memory** — Extraction de faits, déduplication, injection `<memory>` dans les prompts agents
- **📋 Context Summarization** — Compression automatique des conversations longues (seuil 80k tokens)
- **⚙️ Middleware Chain** — Hooks pre/post sur chaque appel agent (memory, loop detection, token tracking)
- **🎯 Skills TF-IDF Scoring** — Pertinence par cosine similarity au lieu du keyword matching

### Dashboard
- **Node Map** — Visualisation du DAG en temps réel avec statut de chaque agent
- **Chat UI** — Interface conversationnelle avec support fichiers/images
- **Agent Details** — Tokens consommés, coût estimé, logs par agent
- **Containers View** — Monitoring des containers Docker déployés

---

## Quickstart

### Docker (recommandé)

```bash
# Pull et run
docker compose up -d

# Health check
curl http://localhost:8080/health
```

### Local (dev)

```bash
npm install
npm run build
npm start
```

### Variables d'environnement

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Clé API OpenRouter (requis) |
| `GITHUB_TOKEN` | — | Token GitHub pour création de repos |
| `AI_MODEL` | `anthropic/claude-sonnet-4` | Modèle par défaut |
| `PORT` | `3000` | Port du serveur HTTP |
| `STORE_PATH` | `/data/store.json` | Chemin du store JSON |

---

## Architecture

```
src/
├── orchestrator.ts          # Pipeline manager (launch, pause, modify, retry)
├── chat_service.ts          # Chat sessions + memory injection + summarization
├── memory_service.ts        # Long-term memory (facts extraction & storage)
├── middleware.ts             # Middleware chain (memory, loop detection, tokens)
├── skills.ts                # Skills lookup + TF-IDF scoring
├── claude_code.ts           # Agent execution (OpenRouter)
├── dag/
│   ├── Graph.ts             # DAG execution engine
│   ├── Node.ts              # Base node class
│   └── nodes/
│       ├── AgentNode.ts     # Base agent with middleware integration
│       ├── DynamicAgentNode  # Planner-generated agents
│       ├── ResearchNode      # Web research
│       ├── AnalysisNode      # Project analysis
│       ├── SkillsEnrichment  # skills.sh lookup + scoring
│       ├── ArchitectureNode  # Architecture design
│       ├── ScaffoldNode      # Project scaffolding
│       ├── SupervisorNode    # Quality gates
│       ├── QANode            # Testing
│       └── DeployNode        # Docker deploy
└── templates/               # Project templates (web-spa, api, fullstack, bot...)

dashboard/                   # React dashboard (Vite + TypeScript)
```

---

## API Endpoints

### Pipeline
- `POST /pipelines` — Launch new project `{ description, name?, model?, templateId?, githubUrl? }`
- `GET /pipelines` — List all pipelines
- `GET /pipelines/:id` — Pipeline details + events
- `POST /pipelines/:id/modify` — Modify existing project `{ instructions, model? }`
- `POST /pipelines/:id/retry` — Smart retry from failure point
- `POST /pipelines/:id/pause` / `POST /pipelines/:id/resume`
- `DELETE /pipelines/:id` — Delete + cleanup Docker containers

### Chat
- `POST /chat/sessions` — Create session `{ model? }`
- `POST /chat/sessions/:id/messages` — Send message `{ content, files? }`
- `GET /chat/sessions` — List sessions
- `DELETE /chat/sessions/:id`

### Skills
- `GET /skills/trending` / `GET /skills/hot`
- `GET /skills/search?q=...`
- `GET /skills/get?owner=...&repo=...&skill=...`

### System
- `GET /health` — Health check
- `GET /containers` — Docker containers status
- `GET /models` — Available OpenRouter models

---

## Deployment

VEIST utilise un pipeline CI/CD automatisé :

1. **Git push** → GitHub Actions build les images Docker
2. **Docker Hub** → `ihachi/veist:latest` + `ihachi/veist-dashboard:latest`
3. **VPS** → `updateProjectV1` pull les nouvelles images

Voir [deploy.md](.agents/workflows/deploy.md) pour les détails.

---

## Roadmap

- [x] **Phase 1** — Dynamic Agent Orchestration
- [x] **Phase 2** — Contextual Intelligence (DeerFlow Patterns)
- [ ] **Phase 2.5** — Embedding & Semantic Search
- [ ] **Phase 3** — Autonomie & Self-Improvement

Voir [vision-roadmap.md](.agents/workflows/vision-roadmap.md) pour le détail.
