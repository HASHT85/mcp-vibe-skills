---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger VPS

## Pre-requisites
- Code committed and pushed to `main` branch on GitHub (HASHT85/mcp-vibe-skills)
- VPS ID: `1287719`
- Project name: `mcp-vibe-skills`

## Steps

### 1. Push latest code to GitHub
```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "your commit message" && git push origin main
```

### 2. Deploy (UPDATE — preserves env vars and volumes)
Use the Hostinger MCP tool `updateProjectV1` — NOT `createNewProjectV1`:

```
mcp_hostinger-mcp_VPS_updateProjectV1(
  virtualMachineId: 1287719,
  projectName: "mcp-vibe-skills"
)
```

> [!CAUTION]
> **NEVER use `createNewProjectV1` for updates!** It replaces the entire project including environment variables (API keys, admin credentials). Use `updateProjectV1` which pulls latest images and recreates containers while preserving data.

> [!NOTE]
> Only use `createNewProjectV1` for the very first deployment of a brand new project that has never been deployed before.

### 3. Monitor deployment
```
mcp_hostinger-mcp_VPS_getActionDetailsV1(
  virtualMachineId: 1287719,
  actionId: <returned_action_id>
)
```
Wait until `state` = `success`.

### 4. Verify containers
```
mcp_hostinger-mcp_VPS_getProjectContainersV1(
  virtualMachineId: 1287719,
  projectName: "mcp-vibe-skills"
)
```
Both `mcp-vibe-skills` (orchestrator) and `mcp-vibe-dashboard` should be `running` + `healthy`.

### 5. Check logs if issues
```
mcp_hostinger-mcp_VPS_getProjectLogsV1(
  virtualMachineId: 1287719,
  projectName: "mcp-vibe-skills"
)
```

## Environment Variables (on Hostinger panel)
These must be set ONCE via the Hostinger VPS Environment panel, NOT in code:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GITHUB_TOKEN` — GitHub personal access token
- `GITHUB_OWNER` — `HASHT85`
- `ADMIN_USER` — Dashboard login username
- `ADMIN_PASS` — Dashboard login password
- `HOST_WORKSPACE_PATH` — `/opt/vibecraft/workspace`
