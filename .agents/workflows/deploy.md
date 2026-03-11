---
description: Deploy VibeCraft to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VibeCraft to Hostinger

> ⚠️ **NEVER use `deleteProjectV1` then `createNewProjectV1`** — this destroys Docker volumes and loses all pipeline/chat data!

## Steps

1. **Commit and push** all changes to GitHub:
// turbo
```
git add -A; git commit -m "deploy: <description>"; git push
```

2. **Get VPS info** — the VM ID is `1287719`

3. **Deploy via Hostinger MCP** — use `createNewProjectV1` with:
   - `content`: `https://github.com/HASHT85/mcp-vibe-skills`
   - `project_name`: `mcp-vibe-skills`
   - `virtualMachineId`: `1287719`
   - `environment`: Read from the local `.env` file at `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env`
   
   > This replaces the existing project **without deleting volumes** because `createNewProjectV1` with the same name does `docker compose up` which reuses existing named volumes.

4. **Wait ~30s** then check action status with `getActionDetailsV1`

5. **Verify** containers are running with `getProjectContainersV1`:
   - `mcp-vibe-dashboard` should be `running`
   - `mcp-vibe-skills` should be `running` + `healthy`

## If the deploy doesn't pick up code changes (cached images)

The `createNewProjectV1` might reuse cached Docker images. If you see old code still running:

1. Do NOT delete the project!
2. Instead, use `createNewProjectV1` again with the same parameters — it will do `docker compose up -d --build` which rebuilds from source while preserving volumes.
3. If that still doesn't work, the Docker layer cache on the VPS is stale. You'd need SSH access to run `docker compose build --no-cache`.

## Environment Variables

Always read from `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env` and pass ALL variables:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`  
- `GOOGLE_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `ADMIN_USER`
- `ADMIN_PASS`
- `HOST_WORKSPACE_PATH=/opt/vibecraft/workspace`

## Key Facts
- **VM ID**: `1287719`
- **Project name**: `mcp-vibe-skills`
- **Dashboard URL**: `https://vibecraft.hach.dev`
- **API URL**: `https://api.vibecraft.hach.dev`
- **Compose file**: `docker-compose.yml` (this IS the production file)
- **Volumes to preserve**: `orchestrator-data` (contains pipelines.json, store.json, chat_sessions.json)
- **Host workspace**: `/opt/vibecraft/workspace` (host-mounted, survives project recreation)
