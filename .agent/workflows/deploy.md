---
description: Deploy VEIST to Hostinger VPS (safe — preserves volumes/data)
---

# Deploy VEIST to Hostinger VPS

// turbo-all

## Steps

### 1. Push latest code to GitHub
```bash
git -c core.hooksPath=/dev/null add -A
```
```bash
git -c core.hooksPath=/dev/null commit -m "your commit message"
```
```bash
git push origin main
```

### 2. Read current environment variables
Use `getProjectContentsV1` to capture current env vars BEFORE redeploying:
```
mcp_hostinger-mcp_VPS_getProjectContentsV1(
  virtualMachineId: 1287719,
  projectName: "mcp-veist-skills"
)
```
Extract the `environment` field from the response. It contains all env vars as a newline-separated string.

### 3. Deploy with environment preserved
Use `createNewProjectV1` with the captured `environment` string:
```
mcp_hostinger-mcp_VPS_createNewProjectV1(
  virtualMachineId: 1287719,
  project_name: "mcp-veist-skills",
  content: "https://github.com/HASHT85/mcp-veist-skills",
  environment: "<paste the environment string from step 2>"
)
```

This will:
- ✅ Clone latest code from GitHub
- ✅ Rebuild Docker images from source
- ✅ Recreate containers
- ✅ PRESERVE environment variables

### 4. Monitor deployment
```
mcp_hostinger-mcp_VPS_getActionDetailsV1(
  virtualMachineId: 1287719,
  actionId: <returned_action_id>
)
```
Wait until `state` = `success`.

### 5. Verify containers
```
mcp_hostinger-mcp_VPS_getProjectContainersV1(
  virtualMachineId: 1287719,
  projectName: "mcp-veist-skills"
)
```
Both `mcp-veist-skills` and `mcp-veist-dashboard` should be `running` + `healthy`.

> [!IMPORTANT]
> ALWAYS read env vars with `getProjectContentsV1` BEFORE calling `createNewProjectV1`.
> Pass the `environment` field to preserve API keys and credentials.
