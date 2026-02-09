# mcp-vibe-skills

Orchestrateur MVP exposant **API HTTP** + **MCP stdio** + **events persistés**.
Conçu pour s'intégrer avec [Vibecraft](https://github.com/Nearcyan/vibecraft) et [skills.sh](https://skills.sh).

---

## Quickstart

### Local (Node.js)

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run HTTP server (default port 3000)
npm start

# Run MCP stdio server (for Claude, etc.)
npm run mcp
```

### Docker

```bash
# Build and run with docker-compose
docker compose up --build -d

# Check health
curl http://localhost:8080/health

# Stop
docker compose down
```

### Dokploy (Hostinger)

1. Connect your repo to Dokploy
2. Configure environment variables in Dokploy UI:
   - `PORT=3000`
   - `STORE_PATH=/data/store.json`
3. Configure volume: `/data` for persistence
4. Deploy!

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `STORE_PATH` | `/data/store.json` | Path to JSON store file |

---

## API Endpoints

### Health
- `GET /health` → `{ "ok": true }`

### Skills (skills.sh proxy)
- `GET /skills/trending?limit=10`
- `GET /skills/search?q=...&limit=10`
- `GET /skills/get?owner=...&repo=...&skill=...`

### Profiles & Templates
- `GET /profiles` → Liste des profils de skills
- `GET /templates` → Liste des templates de projets

### Agents
- `GET /agents` → Liste des agents
- `POST /agents` → Create agent `{ name, meta?, profileId? }`
- `GET /agents/:id/skills` → Skills assignés
- `POST /agents/:id/skills` → Assign skill `{ owner, repo, skill, href, ... }`
- `DELETE /agents/:id/skills?href=...` → Unassign skill

### Projects
- `GET /projects` → Liste des projets
- `GET /projects/:id` → Détails projet + agents liés
- `GET /projects/:id/full` → Projet + agents + skills
- `POST /projects` → Create from template `{ name, templateId, meta? }`
- `POST /projects/:id/agents` → Add agent `{ name, profileId?, role?, meta? }`

### Events
- `GET /events?limit=200` → Derniers N events

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `skills_trending` | Get skills.sh trending |
| `skills_search` | Search skills |
| `skills_get` | Get skill details |
| `profiles_list` | List profiles |
| `templates_list` | List templates |
| `agents_list` | List agents |
| `agent_list_skills` | List agent's skills |
| `agent_assign_skill` | Assign skill to agent |
| `agent_unassign_skill` | Unassign skill |
| `projects_list` | List projects |
| `project_create` | Create project from template |
| `project_get` | Get project details |
| `project_add_agent` | Add agent to project |
| `events_tail` | Get last N events |

---

## Events Specification

### Event Schema

```json
{
  "ts": "2025-01-09T10:30:00.000Z",
  "type": "agent.created",
  "payload": { ... }
}
```

### Event Types

| Type | Payload | Description |
|------|---------|-------------|
| `agent.created` | `{ id, name, created_at, meta? }` | Agent created |
| `agent.deleted` | `{ agentId }` | Agent deleted |
| `skill.assigned` | `{ agentId, skill: {...} }` | Skill assigned to agent |
| `skill.unassigned` | `{ agentId, href }` | Skill removed from agent |
| `project.created` | `{ project: {...} }` | Project created |
| `project.agent.created` | `{ projectId, agent: {...} }` | Agent created for project |
| `project.agent.linked` | `{ projectId, agentId }` | Agent linked to project |
| `profile.applied` | `{ projectId, agentId, profileId }` | Profile applied to agent |
| `profile.missing` | `{ projectId, agentId, profileId }` | Profile not found |

---

## Skill Reference Format

Standard skill reference:

```typescript
type SkillRef = {
  owner: string;     // e.g. "vercel-labs"
  repo: string;      // e.g. "agent-skills"
  skill: string;     // e.g. "web-design"
  href: string;      // Full URL or path
};
```

---

## Vibecraft Integration

Vibecraft ne fait que visualiser les events. Ce serveur produit les events structurés que Vibecraft consomme via `GET /events`.

Point de contact: `GET /events?limit=200` retourne les derniers events pour le dashboard Vibecraft.

---

## Development

```bash
# Run in dev mode (rebuild on changes)
npm run build && npm start

# Test health
curl http://localhost:8080/health

# Create an agent
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "test-agent"}'

# Check events
curl http://localhost:3000/events
```
