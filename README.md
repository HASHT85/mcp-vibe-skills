<div align="center">

<img src="dashboard/public/logo.png" alt="VEIST Logo" width="80" />

# VEIST

**Autonomous Multi-Agent AI Orchestrator**

*Describe an idea. VEIST plans, codes, and deploys it — autonomously.*

[![CI](https://github.com/HASHT85/mcp-vibe-skills/actions/workflows/docker-build.yml/badge.svg)](https://github.com/HASHT85/mcp-vibe-skills/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-27%20passing-22c55e?logo=vitest&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/u/ihachi)
[![License](https://img.shields.io/badge/license-MIT-8b5cf6)](LICENSE)

**[Live Demo →](https://veist.hach.dev)** · **[API](https://api.veist.hach.dev/health)**

---

</div>

## What is VEIST?

VEIST is a **self-orchestrating AI system** that coordinates a swarm of specialized agents to go from idea to deployed project. Give it a GitHub URL or a plain-text description, and VEIST will:

1. 🧠 **Plan** — a Planner agent decomposes the task into a dynamic DAG of sub-agents
2. ⚡ **Build** — Developer agents write, test, and iterate on the code
3. 🎯 **Evaluate** — an Eval agent checks the output (HTTP 200, logs, structure, artifacts)
4. 🚀 **Deploy** — Docker + Traefik auto-deploy to your VPS, with GitHub repo creation

All orchestrated through a real-time **React dashboard** with SSE streaming and a built-in chat interface.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VEIST Dashboard                          │
│            React + Vite + TailwindCSS  (veist.hach.dev)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + Basic Auth
┌──────────────────────────▼──────────────────────────────────────┐
│                     VEIST API (Express)                         │
│                  api.veist.hach.dev  :8080                      │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Middleware │  │  DAG Engine  │  │   Chat + Memory         │ │
│  │  Chain     │  │  Orchestrator│  │   Services              │ │
│  │            │  │              │  │                         │ │
│  │ • Memory   │  │ PlannerNode  │  │ • Long-term memory      │ │
│  │ • LoopDet. │  │ AgentNode    │  │ • Context summarization │ │
│  │ • Tokens   │  │ EvalNode     │  │ • Semantic search       │ │
│  └────────────┘  └──────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Tools    │  │    Skills    │  │   Model Router          │ │
│  │            │  │  TF-IDF      │  │                         │ │
│  │ • bash     │  │  Scoring     │  │ Claude · Gemini · GPT   │ │
│  │ • file I/O │  │              │  │ DeepSeek · OpenRouter   │ │
│  │ • webSearch│  │              │  │                         │ │
│  │ • fetchUrl │  │              │  │ Embeddings: Gemini-2    │ │
│  └────────────┘  └──────────────┘  └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                           │
              ┌────────────▼─────────────┐
              │      Hostinger VPS       │
              │   Docker + Traefik       │
              │   /opt/veist/workspace   │
              └──────────────────────────┘
```

---

## Features

### 🤖 Dynamic Multi-Agent Orchestration
- LLM-generated DAG — the graph of agents is planned dynamically per task
- Specialized nodes: `PlannerNode`, `AgentNode`, `EvalNode`, `DeployNode`
- Parallel + sequential execution with dependency resolution

### 🧠 Long-Term Memory & Context
- **Memory extraction** — LLM identifies important facts from conversations and stores them in `/data/memory.json`
- **Context summarization** — compresses long histories to stay within token limits
- **Semantic search** — `gemini-embedding-2-preview` vectors for code-aware retrieval

### 🔁 Middleware Chain
| Middleware | Role |
|---|---|
| `MemoryMiddleware` | Injects relevant memories before each agent call |
| `LoopDetectionMiddleware` | Detects and breaks infinite agent loops |
| `TokenTrackingMiddleware` | Tracks spend per pipeline, enforces budgets |

### 📚 Skills System
- TF-IDF cosine similarity matching against a skill library
- Agents self-select the most relevant skill for each sub-task
- Skills are composable and reusable across pipelines

### 🎯 Auto-Evaluation
- After each build cycle, `EvalNode` checks:
  - HTTP 200 on deployed URL (40 pts)
  - Container logs clean (30 pts)
  - Build artifacts present (20 pts)
  - File structure valid (10 pts)
- Score < 70 → agents automatically fix and retry (up to 3 cycles)

### 🔐 Security
- 27 Vitest security tests (path traversal, SSRF, bash injection, etc.)
- `safePath()` sandbox — agents cannot escape the workspace
- SSRF protection on `fetchUrl` (private IP blocklist)
- Bash blocklist (rm -rf, curl pipe bash, etc.)
- AES-256-GCM encrypted secrets store
- Timing-safe Basic Auth

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 LTS (Alpine 3.21) |
| **Language** | TypeScript 5.5+ strict, ESM only |
| **API** | Express 4.x + Helmet + Rate limiting |
| **LLMs** | Multi-model via OpenRouter (Claude, Gemini, GPT-4o, DeepSeek) |
| **Embeddings** | `gemini-embedding-2-preview` (Google AI) |
| **Dashboard** | React 18 + Vite + TailwindCSS |
| **Real-time** | SSE (Server-Sent Events) streaming |
| **Deploy** | Docker Compose + Traefik + Let's Encrypt |
| **Tests** | Vitest — 27 security non-regression tests |
| **Linting** | ESLint + Prettier |
| **CI/CD** | GitHub Actions → Docker Hub → Hostinger VPS |

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- An [OpenRouter](https://openrouter.ai) API key

### 1. Clone & install

```bash
git clone https://github.com/HASHT85/mcp-vibe-skills.git
cd mcp-vibe-skills
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

```env
# Required
OPENROUTER_API_KEY=sk-or-v1-...
ADMIN_USER=admin
ADMIN_PASS=your-strong-password

# Optional
TAVILY_API_KEY=tvly-...        # Web search
GITHUB_TOKEN=ghp_...           # GitHub repo creation
HOSTINGER_API_TOKEN=...        # Auto-deploy to VPS
AI_MODEL=anthropic/claude-sonnet-4
```

### 3. Run locally

```bash
# Backend (port 8080)
npm run build && npm start

# Dashboard (port 5173)
cd dashboard && npm install && npm run dev
```

### 4. Or with Docker

```bash
docker compose up -d
```

Open [http://localhost:5173](http://localhost:5173) — log in with your `ADMIN_USER` / `ADMIN_PASS`.

---

## Project Structure

```
src/
├── agent/
│   ├── types.ts          # Shared types (AgentAction, AgentResult)
│   ├── openrouter.ts     # OpenAI/OpenRouter adapter + invokeModel()
│   └── index.ts          # Main agent loop (runVeistAgent)
├── tools/
│   ├── system.ts         # safePath() + bash sandbox
│   ├── file.ts           # read/write/replace + shared memory
│   ├── web.ts            # webSearch (Tavily) + fetchUrl (SSRF-protected)
│   └── executor.ts       # Central dispatcher + TOOLS[] definitions
├── dag/
│   ├── Graph.ts          # DAG execution engine
│   ├── Node.ts           # Base node class
│   └── nodes/            # PlannerNode, AgentNode, EvalNode…
├── __tests__/
│   └── security.test.ts  # 27 security non-regression tests
├── orchestrator.ts       # Pipeline manager (DAG orchestration)
├── chat_service.ts       # Chat sessions + context summarization
├── memory_service.ts     # Long-term memory (LLM extraction)
├── embedding_service.ts  # Semantic code search (Gemini embeddings)
├── middleware.ts         # Middleware chain (Memory, LoopDet, Tokens)
├── skills.ts             # Skills lookup + TF-IDF cosine similarity
├── secrets_service.ts    # AES-256-GCM encrypted secrets
└── index.ts              # Express server + all API routes

dashboard/
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx       # Projects + chats sidebar
│   │   ├── ChatView.tsx      # Main chat interface
│   │   ├── DetailPanel.tsx   # Pipeline detail + agent timeline
│   │   └── EvalReportPanel.tsx  # Evaluation score report
│   ├── api/client.ts         # Typed API client + SSE
│   └── App.tsx               # Root component + auth
└── nginx.conf                # Production nginx config
```

---

## API Reference

All routes require `Authorization: Basic base64(user:pass)` except `/health`.

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check — `{"ok": true}` |
| `POST` | `/pipeline/launch` | Launch a new pipeline |
| `GET` | `/pipeline/list` | List all pipelines |
| `GET` | `/pipeline/:id` | Get pipeline details |
| `GET` | `/pipeline/:id/events` | SSE stream of pipeline events |
| `GET` | `/pipeline/:id/eval-report` | Get evaluation report |
| `POST` | `/chat/sessions` | Create a chat session |
| `GET` | `/chat/sessions` | List all sessions |
| `POST` | `/chat/sessions/:id/message` | Send a message |
| `GET` | `/chat/sessions/:id/stream` | SSE stream of chat |
| `POST` | `/secrets/set` | Store an encrypted secret |

---

## Roadmap

| Phase | Status |
|---|---|
| Phase 1 — Dynamic Agent Orchestration | ✅ Done |
| Phase 2a — Long-Term Memory | ✅ Done |
| Phase 2b — Context Summarization | ✅ Done |
| Phase 2c — Middleware Chain | ✅ Done |
| Phase 2d — Skills TF-IDF Scoring | ✅ Done |
| Phase 2.5 — Semantic Embeddings | ✅ Done |
| Phase 2.5 — Model Benchmarks Routing | ✅ Done |
| Audit — ESLint / Prettier / Vitest / Zod | ✅ Done |
| **Phase 3 — Autonomy & Self-Improvement** | 🔄 In progress |

**Phase 3 goals:**
- Auto-evaluation of deployed projects (agent tests its own output)
- Feedback loop: test results → adjust agent prompts
- Docker sandbox isolation per pipeline
- Multi-VPS pipeline distribution

---

## Development

```bash
# Type check
npx tsc --noEmit

# Run tests (27/27 required)
npm run test

# Lint
npm run lint

# Format
npm run format
```

### Git conventions

```bash
feat: add new feature
fix: bug fix
quality: refactoring / tests / linting
security: security patch
deploy: infrastructure change
docs: documentation only
```

> ⚠️ All commits are blocked if `npm run test` or `tsc --noEmit` fail (husky pre-commit hook).

---

## Infrastructure

| Property | Value |
|---|---|
| VPS | Hostinger KVM2 |
| OS | Ubuntu 24.04 + Docker + Traefik |
| RAM | 8 GB · 2 vCPU · 100 GB SSD |
| Dashboard | `veist.hach.dev` |
| API | `api.veist.hach.dev` |
| Workspace | `/opt/veist/workspace` |
| Data | `/opt/veist/data` (persisted Docker volume) |

---

## License

MIT © [HASHT85](https://github.com/HASHT85)

---

<div align="center">

Built with ☕ and too many agent loops.

**[veist.hach.dev](https://veist.hach.dev)**

</div>
