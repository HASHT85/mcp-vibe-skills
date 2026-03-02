# Architecture: Autonomous Multi-Agent System (Perplexity Computer Clone)

## Vision
Transform the linear, monolithic project generator into a highly autonomous, graph-based multi-agent system capable of breaking down complex user intents, parallelizing work, and self-correcting.

## Core Concepts

### 1. The Orchestrator (The "Brain")
The Orchestrator acts as the central manager, breaking down user intents into a **Directed Acyclic Graph (DAG) of tasks** and delegating them to a Worker Pool of specialized agents.
- **Minimal Human Input:** The user only provides the initial idea, answers critical clarifying questions if requested by the Planner agent, and provides API keys if necessary. Everything else (coding, testing, deployment, and ongoing operation) is fully automated.
- **Continuous Execution:** The Orchestrator supports deploying indefinitely running background tasks (e.g., trading bots, scrapers, data analyzers) alongside standard web applications.

### 2. Shared Graph Memory (State)
Agents shouldn't rely solely on reading the entire filesystem recursively. They need a shared context to coordinate effectively.
- **Project State:** A structured object (JSON) documenting the current state (e.g., chosen tech stack, db schema, agreed-upon API endpoints).
- **Communication:** When an Architect agent defines the DB schema, it writes it to the Shared Memory. The Backend agent reads it directly from the memory instead of randomly grepping codebase files.

### 3. Agent Roles & Specialization
Instead of one generalist "Developer" agent, we define narrow specialists with specific tools and system prompts:
- **Planner Agent:** Converts user intent into a DAG of sub-tasks.
- **Architect Agent:** Defines stack, scaffolding, and updates the shared Project State with strict schemas.
- **Backend Build Agent:** Writes API endpoints and database models.
- **Frontend Build Agent:** Writes UI components, mocks data if Backend isn't ready.
- **Researcher Agent:** Browses the web for the latest docs (e.g., "Find the latest Next.js 15 app router syntax").
- **QA / Critic Agent:** Runs tests and reviews code from other agents. If it finds issues, it rejects the task, sending it back to the original agent with error context.

### 4. Advanced Tooling & Infrastructure (Native Docker + Traefik)
To achieve true 100% autonomy without relying on graphical platforms like Dokploy, the system uses programmatic, API-driven infrastructure:
- **Direct Docker Execution:** Agents generate `docker-compose.yml` and `Dockerfile` configurations and execute them directly via the terminal (`docker compose up -d`). This allows for instant feedback loops during testing and debugging.
- **Automated Deployment via Traefik:** For web apps, agents add specific Traefik labels to the docker-compose files. When the container starts, Traefik automatically routes traffic and provisions SSL certificates without human intervention.
- **Persistent "Always-On" Bots:** For ideas requiring continuous monitoring (e.g., "scan Polymarket BTC up/down and place bets"), the Architecture agent provisions lightweight Node.js or Python `worker` containers that run indefinitely in the background, logging their activity or sending alerts, completely detached from Dokploy's web-centric model.
- **Reliable Web Search & RAG:** Tools capable of reading large documentation websites.
- **Terminal/Bash Integration:** Essential for agents to instantly see the output of their code, monitor bot logs, or run linters.

## Execution Flow Example

1. **User Prompt:** "Build a habit tracking SaaS with an Express backend and React frontend."
2. **Planner Agent:** Creates the following DAG:
   - *Task A:* Design Database Schema (Assign to: Architect)
   - *Task B:* Scaffold Frontend & Backend (Assign to: Architect)
   - *Task C:* Implement Backend API (Depends on A & B, Assign to: Backend)
   - *Task D:* Implement UI Components (Depends on B, Assign to: Frontend)
   - *Task E:* Integrate UI with Backend (Depends on C & D, Assign to: Fullstack)
3. **Orchestrator:** Dispatches Task A and B in parallel.
4. **Workers:** Pick up tasks, use tools (bash, write_file), complete them, and update the Shared Memory.
5. **Orchestrator:** Sees A and B are done, unlocks C and D, and dispatches them in parallel.
6. **Self-Correction:** If Task C fails, the Backend Agent uses `web_search` to fix the bug. If it fails 3 times, it alerts the Orchestrator, which delegates the problem to a Senior Debugger Agent or asks the user.
