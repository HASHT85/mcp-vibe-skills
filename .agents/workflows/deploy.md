---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger

## Quick Deploy (normal code changes)

// turbo-all

1. **Commit and push** to GitHub:
```
git add -A; git commit -m "deploy: <description>"; git push
```

2. **Wait ~3 min** for GitHub Actions to build and push images to GHCR.
   Check status at: https://github.com/HASHT85/mcp-vibe-skills/actions

3. **Pull latest images** via Hostinger MCP — use `updateProjectV1` with:
   - `virtualMachineId`: `1287719`
   - `projectName`: `veist`

4. **Verify** containers are running with `getProjectContainersV1`:
   - `veist-dashboard` should be `running` (new container ID)
   - `veist` should be `running` + `healthy` (new container ID)

## First-Time Setup / Compose File Changes

If `docker-compose.yml` itself changed (not just code), use `createNewProjectV1`:

1. `git push` and wait for GitHub Actions to finish
2. Deploy via `createNewProjectV1` with:
   - `content`: `https://github.com/HASHT85/mcp-vibe-skills`
   - `project_name`: `veist`
   - `virtualMachineId`: `1287719`
   - `environment`: Read from the local `.env` file at `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env`
   
   > This replaces the existing project config but **preserves volumes**.

3. **Wait ~60s** then check with `getProjectContainersV1`

## Environment Variables

Always read from `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env` and pass ALL variables:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`  
- `GOOGLE_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `ADMIN_USER`
- `ADMIN_PASS`
- `OPENROUTER_API_KEY`
- `TAVILY_API_KEY`
- `HOST_WORKSPACE_PATH=/opt/veistcraft/workspace`

## Key Facts
- **VM ID**: `1287719`
- **Project name**: `veist`
- **Dashboard URL**: `https://veist.hach.dev`
- **API URL**: `https://api.veist.hach.dev`
- **Images**: `ihachi/veist:latest` + `ihachi/veist-dashboard:latest` (Docker Hub)
- **Volumes to preserve**: `orchestrator-data` (pipelines.json, store.json, chat_sessions.json)
- **Host workspace**: `/opt/veistcraft/workspace`

## Important Rules

> ⚠️ **NEVER use `deleteProjectV1`** — it destroys Docker volumes and loses ALL data!

> ⚠️ **NEVER use `updateProjectV1` when docker-compose.yml changed** — use `createNewProjectV1` instead.

> For normal code changes, just use `updateProjectV1` — it pulls latest images and restarts.
