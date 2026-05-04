---
description: Infrastructure Hostinger VPS — Facts et références pour les agents
---

# 🖥 Hostinger VPS — Infrastructure

## 1. VPS Principal

| Propriété | Valeur |
|-----------|--------|
| **VM ID** | `1287719` |
| **Plan** | KVM 2 |
| **vCPU** | 2 |
| **RAM** | 8 GB |
| **Disque** | 100 GB |
| **Bande passante** | 8 TB |
| **OS** | Ubuntu 24.04 with Docker and Traefik |
| **État** | running |
| **Hostname** | `srv1287719.hstgr.cloud` |
| **Data Center ID** | 15 |
| **Créé le** | 2026-01-21 |

## 2. Adresses IP

| Version | Adresse | PTR |
|---------|---------|-----|
| **IPv4** | `72.61.101.24` (ID: 1284405) | `srv1287719.hstgr.cloud` |
| **IPv6** | `2a02:4780:28:fea::1` (ID: 1234425) | `srv1287719.hstgr.cloud` |

## 3. Nameservers
- NS1 : `153.92.2.6`
- NS2 : `1.1.1.1` (Cloudflare)

## 4. Firewall

| ID | Nom | Synced |
|----|-----|--------|
| `226138` | `vibecraft` | ✅ |

### Règles
| Rule ID | Action | Protocol | Port | Source |
|---------|--------|----------|------|--------|
| `780807` | accept | TCP | 22 (SSH) | any |
| `780808` | accept | TCP | 80 (HTTP) | any |
| `780809` | accept | TCP | 443 (HTTPS) | any |

**Tout le reste est DROP par défaut.**

## 5. SSH

### Clés publiques attachées
| ID | Nom | Type |
|----|-----|------|
| `447719` | `hach-windows` | RSA (`hachh@Hach`) |

## 6. Domaines

| Domaine | ID | Status | Expire |
|---------|----|--------|--------|
| `hach.dev` | `28239640` | active | 2027-01-21 |
| `smartinboxia.com` | `30480800` | active | 2027-04-14 |

### DNS hach.dev
| Nom | Type | Contenu | TTL |
|-----|------|---------|-----|
| `@` | A | `72.61.101.24` | 14400 |
| `*` | A | `72.61.101.24` | 3600 |
| `www` | CNAME | `hach.dev.` | 300 |
| `plane` | A | `72.61.101.24` | 300 |

### DNS smartinboxia.com
| Nom | Type | Contenu | TTL |
|-----|------|---------|-----|
| `@` | A | `72.61.101.24` | 300 |
| `www` | CNAME | `smartinboxia.com.` | 300 |

## 7. Projets déployés

| Projet | Containers | Path sur le VPS |
|--------|------------|-----------------|
| **traefik** | `traefik-traefik-1` | `/docker/traefik/` |
| **veist** | `veist` (healthy), `veist-dashboard` | `/docker/veist/` |
| **smartinboxia** | `smartinbox-web-mockup`, `smartinbox-backend`, `smartinbox-db`, `smartinbox-ia`, `smartinbox-admin` | `/home/deployer/SmartInboxIA/` |
| **spy-bot** | `discord-bot` | `/docker/spy-bot/` |
| **imap-netflix-household-automation** | 1 container (Playwright) | `/opt/imap-netflix.../` |

## 8. URLs de services

| Service | URL |
|---------|-----|
| VEIST Dashboard | `https://veist.hach.dev` |
| VEIST API | `https://api.veist.hach.dev` |
| SmartInboxIA | `https://smartinboxia.com` |

## 9. Chemins importants sur le VPS

| Chemin | Usage |
|--------|-------|
| `/opt/veist/workspace` | Workspace VEIST (projets générés) |
| `/opt/veist/data` | Data VEIST (store.json, secrets.json, memory.json) |
| `/docker/traefik/` | Config Traefik |
| `/docker/veist/` | Docker Compose VEIST |
| `/docker/spy-bot/` | Discord bot |
| `/home/deployer/SmartInboxIA/` | SmartInboxIA |

## 10. API Hostinger — Références MCP

### Commandes fréquentes
```
# Voir les containers d'un projet
mcp: VPS_getProjectContainersV1(virtualMachineId: 1287719, projectName: "veist")

# Voir les logs d'un projet
mcp: VPS_getProjectLogsV1(virtualMachineId: 1287719, projectName: "veist")

# Redéployer (code change seulement)
mcp: VPS_updateProjectV1(virtualMachineId: 1287719, projectName: "veist")

# Redéployer (compose change) — TOUJOURS lire les env vars d'abord !
mcp: VPS_getProjectContentsV1(virtualMachineId: 1287719, projectName: "veist")
mcp: VPS_createNewProjectV1(virtualMachineId: 1287719, project_name: "veist", content: "...", environment: "...")

# Vérifier le firewall
mcp: VPS_getFirewallDetailsV1(firewallId: 226138)

# Voir les DNS
mcp: DNS_getDNSRecordsV1(domain: "hach.dev")

# Restart le VPS (dernier recours)
mcp: VPS_restartVirtualMachineV1(virtualMachineId: 1287719)
```

### ⚠️ Commandes DANGEREUSES — JAMAIS sans confirmation utilisateur
```
❌ VPS_deleteProjectV1 — DÉTRUIT les volumes (perte de données)
❌ VPS_recreateVirtualMachineV1 — EFFACE TOUT le VPS
❌ VPS_deleteSnapshotV1 — Supprime le backup
❌ DNS_resetDNSRecordsV1 — Réinitialise tous les DNS
```
