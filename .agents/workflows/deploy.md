---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger VPS

// turbo-all

## Quick Deploy (code changes only — image already on Docker Hub)

> Utiliser quand : seul le code TypeScript/React a changé, PAS le `docker-compose.yml`

### 1. Push to GitHub
```bash
git -c core.hooksPath=/dev/null add -A
```
```bash
git -c core.hooksPath=/dev/null commit -m "deploy: <description>"
```
```bash
git push origin main
```

### 2. Wait for CI
Attendre ~3 min que GitHub Actions build et push les images sur Docker Hub.
Vérifier : https://github.com/HASHT85/mcp-vibe-skills/actions

### 3. Pull latest images on VPS
```
mcp: VPS_updateProjectV1(
  virtualMachineId: 1287719,
  projectName: "veist"
)
```

### 4. Verify
```
mcp: VPS_getProjectContainersV1(
  virtualMachineId: 1287719,
  projectName: "veist"
)
```
- `veist` → `running` + `healthy`
- `veist-dashboard` → `running`

---

## Full Deploy (docker-compose.yml changed)

> Utiliser quand : le `docker-compose.yml`, les volumes, ou les labels Traefik ont changé

### 1. Push to GitHub
```bash
git -c core.hooksPath=/dev/null add -A && git -c core.hooksPath=/dev/null commit -m "deploy: <description>" && git push origin main
```

### 2. Read current environment (CRITICAL)
```
mcp: VPS_getProjectContentsV1(
  virtualMachineId: 1287719,
  projectName: "veist"
)
```
**Extraire le champ `environment`** — il contient toutes les variables d'env sous forme de string multiligne.

### 3. Deploy with environment preserved
```
mcp: VPS_createNewProjectV1(
  virtualMachineId: 1287719,
  project_name: "veist",
  content: "https://github.com/HASHT85/mcp-vibe-skills",
  environment: "<paste the environment string from step 2>"
)
```

### 4. Monitor deployment
```
mcp: VPS_getActionsV1(
  virtualMachineId: 1287719
)
```
Attendre que l'action passe en `success`.

### 5. Verify containers
```
mcp: VPS_getProjectContainersV1(
  virtualMachineId: 1287719,
  projectName: "veist"
)
```

---

## Environment Variables

Variables requises dans le `environment` de VEIST :
- `OPENROUTER_API_KEY` — Clé API OpenRouter (multi-model)
- `GITHUB_TOKEN` — Token GitHub pour création de repos
- `GITHUB_OWNER` — Username GitHub (`HASHT85`)
- `ADMIN_USER` — Login dashboard
- `ADMIN_PASS` — Password dashboard (aussi clé dérivation SecretsService)
- `TAVILY_API_KEY` — Clé API Tavily (web search)
- `HOSTINGER_API_TOKEN` — Token API Hostinger
- `HOST_WORKSPACE_PATH=/opt/veist/workspace`
- `PORT=8080`
- `STORE_PATH=/data/store.json`
- `PIPELINES_STORE=/data/pipelines.json`
- `WORKSPACE_ROOT=/workspace`

---

## Key Facts

| Fact | Value |
|------|-------|
| VM ID | `1287719` |
| Project name | `veist` |
| Dashboard | `https://veist.hach.dev` |
| API | `https://api.veist.hach.dev` |
| Docker images | `ihachi/veist:latest` + `ihachi/veist-dashboard:latest` |
| GitHub repo | `https://github.com/HASHT85/mcp-vibe-skills` |
| Data volume | `/opt/veist/data` (store.json, secrets.json, memory.json) |
| Workspace | `/opt/veist/workspace` |

---

## ⚠️ Rules

> [!CAUTION]
> **NEVER use `deleteProjectV1`** — it destroys Docker volumes and ALL data!

> [!WARNING]
> **NEVER use `updateProjectV1` when docker-compose.yml changed** — use `createNewProjectV1`

> [!IMPORTANT]
> **ALWAYS read env vars with `getProjectContentsV1` BEFORE `createNewProjectV1`** — pass the `environment` field to preserve API keys and credentials.

> [!NOTE]
> For normal code changes, just use `updateProjectV1` — it pulls latest images and restarts.
