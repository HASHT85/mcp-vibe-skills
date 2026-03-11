---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger

## Steps

1. **Bump the cache buster** in `docker-compose.yml` — update the `CACHE_BUSTER` arg value for both `orchestrator` and `dashboard` builds to the current timestamp (format: `YYYYMMDD-HHMM`). This forces Docker to rebuild images instead of reusing cached ones.

2. **Commit and push** all changes to GitHub:
// turbo
```
git add -A; git commit -m "deploy: <description>"; git push
```

3. **Deploy via Hostinger MCP** — use `createNewProjectV1` with:
   - `content`: `https://github.com/HASHT85/mcp-vibe-skills`
   - `project_name`: `mcp-vibe-skills`
   - `virtualMachineId`: `1287719`
   - `environment`: Read from the local `.env` file at `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env`
   
   > This replaces the existing project config but **preserves volumes** because it runs `docker compose up -d --build` under the hood.

4. **Wait ~60s** then check action status with `getActionDetailsV1`

5. **Verify** containers are running with `getProjectContainersV1`:
   - `mcp-vibe-dashboard` should be `running` (new container ID)
   - `mcp-vibe-skills` should be `running` + `healthy` (new container ID)

6. **If containers are empty `[]`** — the build failed. Check `getProjectLogsV1` for the `[build]` service entries to see the error.

## If the deploy doesn't pick up code changes (cached images)

If `createNewProjectV1` reuses old cached Docker images (same container IDs, old uptime):

1. Make sure you bumped `CACHE_BUSTER` in `docker-compose.yml` (step 1)
2. If still not working, use `deleteProjectV1` THEN `createNewProjectV1`. This destroys old images and forces a complete rebuild.
   > ⚠️ `deleteProjectV1` removes containers, networks, **volumes**, and images. The `orchestrator-data` volume (pipelines, store, chat_sessions) will be LOST. Only do this as a last resort.
3. To preserve data before deleting: SSH into VPS and `docker volume inspect orchestrator-data` to back up.

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
- **Dashboard URL**: `https://veist.hach.dev`
- **API URL**: `https://api.veist.hach.dev`
- **Compose file**: `docker-compose.yml` (production file)
- **Volumes to preserve**: `orchestrator-data` (pipelines.json, store.json, chat_sessions.json)
- **Host workspace**: `/opt/vibecraft/workspace` (host-mounted, survives project recreation)

## Docker Build Gotchas (Fixed)
- **PostCSS config MUST be CJS** (`postcss.config.cjs` with `module.exports`), NOT ESM — breaks in Docker Alpine with `"type": "module"`
- **`.dockerignore`** must exist in both root and `dashboard/` to exclude `node_modules`
- **`@tailwindcss/postcss` v4 must NOT be in package.json** — conflicts with Tailwind v3
- **Dockerfile uses `npx vite build`** not `npm run build` (skips `tsc -b` which fails in Docker)
