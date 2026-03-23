---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger

## Standard Deploy (after `git push`)

1. **Commit and push** all changes to GitHub:
// turbo
```
git add -A; git commit -m "deploy: <description>"; git push
```
> GitHub Actions automatically builds Docker images and pushes them to GHCR (`ghcr.io/hasht85/veist-orchestrator:latest` + `ghcr.io/hasht85/veist-dashboard:latest`).

2. **Wait ~2-3 min** for GitHub Actions to finish building. You can check status at `https://github.com/HASHT85/mcp-vibe-skills/actions`.

3. **Update via Hostinger MCP** — use `updateProjectV1` with:
   - `virtualMachineId`: `1287719`
   - `projectName`: `veist`
   
   > This pulls the latest GHCR images and recreates containers. **Volumes are preserved.**

4. **Verify** containers are running with `getProjectContainersV1`:
   - `veist-dashboard` should be `running` (new image)
   - `veist` should be `running` + `healthy` (new image)

## First-Time Setup (only once)

If the project doesn't exist yet on the VPS, use `createNewProjectV1` with:
- `content`: `https://github.com/HASHT85/mcp-vibe-skills`
- `project_name`: `veist`
- `virtualMachineId`: `1287719`
- `environment`: Read from the local `.env` file at `c:\Projet\mcp-vibe-skills\mcp-vibe-skills\.env`

## Environment Variables

Always pass ALL variables when using `createNewProjectV1`:
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
- **Compose file**: `docker-compose.yml` (production file)
- **Volumes to preserve**: `orchestrator-data` (pipelines.json, store.json, chat_sessions.json)
- **Host workspace**: `/opt/veistcraft/workspace` (host-mounted, survives project recreation)
- **Images**: `ghcr.io/hasht85/veist-orchestrator:latest` + `ghcr.io/hasht85/veist-dashboard:latest`

## Safety Notes

> ⚠️ **NEVER use `deleteProjectV1`** — it destroys Docker volumes and loses ALL data permanently!

> ✅ `updateProjectV1` is now **SAFE** — it pulls new images and recreates containers without touching volumes.

## Docker Build Gotchas (Fixed)
- **PostCSS config MUST be CJS** (`postcss.config.cjs` with `module.exports`), NOT ESM
- **`.dockerignore`** must exist in both root and `dashboard/` to exclude `node_modules`
- **`@tailwindcss/postcss` v4 must NOT be in package.json** — conflicts with Tailwind v3
- **Dockerfile uses `npx vite build`** not `npm run build` (skips `tsc -b` which fails in Docker)
