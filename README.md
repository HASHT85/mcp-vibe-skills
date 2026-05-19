<p align="center">
  <img src="assets/logo.png" alt="VEIST Logo" width="120" />
</p>

<h1 align="center">VEIST</h1>

<p align="center">
  <strong>Autonomous Multi-Agent AI Orchestrator</strong><br/>
  <em>Describe an idea → VEIST designs, codes, tests & deploys it. Fully automated.</em>
</p>

<p align="center">
  <a href="https://veist.hach.dev"><img src="https://img.shields.io/badge/Dashboard-veist.hach.dev-7c3aed?style=flat-square" alt="Dashboard" /></a>
  <a href="https://api.veist.hach.dev/health"><img src="https://img.shields.io/badge/API-api.veist.hach.dev-4f46e5?style=flat-square" alt="API" /></a>
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-5.5+-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-Private-gray?style=flat-square" alt="License" />
</p>

---

## What is VEIST?

VEIST is a **production-grade, self-hosted AI orchestrator** that turns natural language project descriptions into fully deployed applications. It coordinates a swarm of specialized AI agents through a **Dynamic DAG (Directed Acyclic Graph) pipeline** — from research and architecture design, through code generation and testing, to Docker deployment with SSL.

```
"Build a habit tracking app with Express backend and React frontend"
         ↓
  🧠 Planner → 🔍 Researcher → 🏗️ Architect → 💻 Coder → 🧪 QA → 🚀 Deploy
         ↓
  ✅ Live at https://habit-tracker.hach.dev (auto-SSL, auto-domain)
```

### Key Capabilities

- **🤖 Multi-Agent DAG Pipeline** — An LLM Planner dynamically generates the optimal agent topology for each project. Agents run in parallel when dependencies allow.
- **🔀 Multi-Model Routing** — Each agent uses the best model for its task (Claude, Gemini, DeepSeek, GPT-4) via [OpenRouter](https://openrouter.ai).
- **🚀 Zero-Touch Deployment** — Docker Compose build + Traefik reverse proxy → every project gets a `*.hach.dev` subdomain with automatic Let's Encrypt SSL.
- **🧠 Long-Term Memory** — Persistent fact extraction across conversations (DeerFlow pattern). The system learns your preferences.
- **💬 Conversational Pre-Pipeline** — Chat with the AI to refine your idea before deploying. Supports image uploads.
- **🔧 Self-Correction** — Failed pipeline steps are automatically retried with error context. Loop detection prevents stuck agents.
- **📡 MCP Server** — Expose VEIST tools via the [Model Context Protocol](https://modelcontextprotocol.io) for integration with Claude Desktop and other MCP clients.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VEIST Dashboard                          │
│              React + Vite (veist.hach.dev)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS / SSE
┌───────────────────────▼─────────────────────────────────────┐
│                     VEIST API                                │
│           Express + Helmet (api.veist.hach.dev)              │
│                                                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Chat   │  │ Pipeline │  │  Skills  │  │  Containers │  │
│  │ Service │  │  Engine  │  │  (s.sh)  │  │  Management │  │
│  └────┬────┘  └────┬─────┘  └──────────┘  └─────────────┘  │
│       │            │                                         │
│  ┌────▼────────────▼──────────────────────────────────────┐  │
│  │              Orchestrator (DAG Engine)                  │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Research │→│Architect │→│  Coder   │→│  Deploy  │  │  │
│  │  │  Node    │ │  Node    │ │  Nodes   │ │  Node    │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │          ↕ Middleware Chain (Memory, Embeddings, Loop) │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐  │
│  │  Memory    │ │ Embedding │ │ Secrets  │ │  GitHub    │  │
│  │  Service   │ │  Service  │ │  Vault   │ │  API       │  │
│  └────────────┘ └───────────┘ └──────────┘ └────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ Docker Socket
┌───────────────────────▼─────────────────────────────────────┐
│  Docker + Traefik (*.hach.dev)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │Project A │ │Project B │ │Project C │ │  . . .   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Source Structure

```
src/
├── index.ts                 # Express API — routes, auth, security (Helmet)
├── orchestrator.ts          # Pipeline engine — launch, pause, modify, retry, kill
├── chat_service.ts          # Pre-pipeline chat — DeerFlow summarization
├── memory_service.ts        # Long-term memory — fact extraction & dedup
├── embedding_service.ts     # Semantic code search — vector embeddings
├── middleware.ts             # Agent hooks — memory, loop detection, token tracking
├── agent_engine.ts          # Agent runtime — OpenRouter multi-model execution
├── secrets_service.ts       # Encrypted secrets vault (salted, derived keys)
├── github_api.ts            # GitHub repo creation, push, webhooks
├── quickDeploy.ts           # One-click deploy from existing GitHub repos
├── skills.ts / skills_get.ts  # skills.sh integration — TF-IDF scoring
├── mcp_server.ts            # MCP tool server (skills, agents, projects)
├── mcp_stdio.ts             # MCP stdio transport entry point
├── dag/
│   ├── Graph.ts             # DAG execution engine (parallel, dependencies)
│   ├── Node.ts              # Abstract node base class
│   └── nodes/
│       ├── AgentNode.ts     # Base agent with middleware integration
│       ├── DynamicAgentNode  # LLM-generated agents from Planner
│       ├── ResearchNode      # Web + Tavily research
│       ├── SkillsEnrichment  # skills.sh best practices injection
│       ├── SupervisorNode    # Quality gates & code review
│       ├── EvalNode          # Build verification & testing
│       ├── AutoFixNode       # Self-repair on failure
│       └── veistNodes.ts     # Composite pipeline node definitions
├── templates/
│   └── registry.ts          # Project templates (web-spa, api, fullstack, bot, cli)
└── utils/
    └── project_helpers.ts   # Shared utilities
```

---

## Quick Start

### Docker (Production)

```bash
# 1. Clone
git clone https://github.com/HASHT85/mcp-vibe-skills.git veist
cd veist

# 2. Configure
cp .env.example .env
# Edit .env with your API keys (OPENROUTER_API_KEY, GITHUB_TOKEN, etc.)

# 3. Launch
docker compose up -d

# 4. Verify
curl https://api.veist.hach.dev/health
# → { "status": "ok", ... }
```

### Local Development

```bash
npm install
npm run build
npm start
# → Server running on http://localhost:3000
```

### MCP Mode (Claude Desktop / MCP clients)

```bash
npm run mcp
# → VEIST tools available via stdin/stdout MCP transport
```

Add to your MCP client config:
```json
{
  "mcpServers": {
    "veist": {
      "command": "node",
      "args": ["dist/mcp_stdio.js"],
      "cwd": "/path/to/veist"
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | ✅ | — | OpenRouter API key — sole LLM provider (routes to Claude, Gemini, DeepSeek, GPT) |
| `GITHUB_TOKEN` | ✅ | — | GitHub PAT for repo creation & push |
| `GITHUB_OWNER` | ✅ | — | GitHub username for repo ownership |
| `ADMIN_USER` | ✅ | — | Dashboard HTTP Basic Auth username |
| `ADMIN_PASS` | ✅ | — | Dashboard HTTP Basic Auth password |
| `AI_MODEL` | — | `anthropic/claude-sonnet-4` | Default LLM model |
| `PORT` | — | `3000` | API server port |
| `STORE_PATH` | — | `/data/store.json` | Persistent store location |
| `WORKSPACE_ROOT` | — | `/workspace` | Agent workspace directory |
| `HOST_WORKSPACE_PATH` | — | `/opt/veist/workspace` | Host path mounted as `/workspace` |
| `TAVILY_API_KEY` | — | — | Tavily API for web search agents |
| `HOSTINGER_API_TOKEN` | — | — | Hostinger VPS API for Quick Deploy |

---

## API Reference

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/pipeline` | Launch new project `{ description, name?, model?, templateId? }` |
| `GET` | `/pipelines` | List all pipelines |
| `GET` | `/pipeline/:id` | Pipeline details + events |
| `POST` | `/pipeline/:id/modify` | Send modification instructions `{ instructions, model?, files? }` |
| `POST` | `/pipeline/:id/retry` | Smart retry from last failure point |
| `POST` | `/pipeline/:id/pause` | Pause pipeline execution |
| `POST` | `/pipeline/:id/resume` | Resume paused pipeline |
| `POST` | `/pipeline/:id/kill` | Abort running pipeline |
| `DELETE` | `/pipeline/:id` | Delete pipeline + cleanup (GitHub, Docker, store) |
| `GET` | `/pipeline/events/all` | SSE stream of all pipeline events |

### Chat (Pre-Pipeline)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat/sessions` | Create session `{ model? }` |
| `POST` | `/chat/sessions/:id/messages` | Send message `{ content, files? }` |
| `GET` | `/chat/sessions` | List all sessions |
| `GET` | `/chat/sessions/:id` | Get session details |
| `DELETE` | `/chat/sessions/:id` | Delete session |

### Skills (skills.sh)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/skills/trending` | Trending skills (last 24h) |
| `GET` | `/skills/search?q=...` | Search skills by keyword |
| `GET` | `/skills/get?owner=...&repo=...&skill=...` | Skill detail page |

### Containers (Docker Management)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/containers` | List all Docker containers |
| `POST` | `/containers/:name/stop` | Stop container |
| `POST` | `/containers/:name/start` | Start container |
| `POST` | `/containers/:name/restart` | Restart container |
| `DELETE` | `/containers/:name` | Remove container + image |
| `GET` | `/containers/:name/logs?lines=100` | Get container logs |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/models` | Available OpenRouter models |
| `GET` | `/events` | Store events log |
| `POST` | `/auth/token` | Generate ephemeral auth token |

---

## Deployment

VEIST uses an automated CI/CD pipeline:

1. **Push to `main`** → GitHub Actions builds Docker images
2. **Docker Hub** → `ihachi/veist:latest` + `ihachi/veist-dashboard:latest`
3. **VPS** → Hostinger API pulls and restarts containers

### Infrastructure

| Component | Technology |
|-----------|------------|
| **API Server** | Express + Helmet (Node.js 20) |
| **Dashboard** | React + Vite + TypeScript |
| **Reverse Proxy** | Traefik v2 (auto-SSL, auto-routing) |
| **Container Runtime** | Docker + Docker Compose |
| **Hosting** | Hostinger VPS (KVM2) |
| **CI/CD** | GitHub Actions → Docker Hub |
| **Domains** | `*.hach.dev` wildcard (Let's Encrypt) |

### Security

- **Helmet** — HSTS, X-Frame-Options, X-Content-Type-Options, and more
- **CORS** — Restricted to dashboard origin
- **Rate Limiting** — express-rate-limit on sensitive endpoints
- **Auth** — HTTP Basic + ephemeral token system (no credentials in URLs)
- **Input Validation** — Regex-validated params, clamped limits, sanitized container names
- **Secrets Vault** — Salted encryption with derived keys for project secrets
- **Non-root Docker** — Container runs as `veist` user (UID 1001)
- **Pre-commit Hook** — Husky + `check-secrets.js` prevents credential leaks

---

## Roadmap

- [x] **Phase 1** — Dynamic Agent Orchestration (DAG pipeline, multi-model, auto-deploy)
- [x] **Phase 2** — Contextual Intelligence (long-term memory, summarization, middleware chain)
- [x] **Phase 2.5** — Embedding & Semantic Search (vector code indexing)
- [ ] **Phase 3** — Autonomy & Self-Improvement (agent self-tuning, cross-project learning)

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical vision.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Runtime** | Node.js 20, TypeScript 5.5+, ESM |
| **API** | Express 4, Helmet, CORS, Rate Limit |
| **AI** | OpenRouter → Claude, Gemini, DeepSeek, GPT (via OpenAI-compatible SDK) |
| **MCP** | `@modelcontextprotocol/sdk` (tools + stdio transport) |
| **Infra** | Docker, Docker Compose, Traefik v2 |
| **Storage** | Atomic JSON files (no external DB required) |
| **CI/CD** | GitHub Actions, Docker Hub |
| **Security** | Helmet, Husky pre-commit, Zod validation |

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/HASHT85">HASHT85</a>
</p>
