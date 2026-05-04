---
description: Règles Docker & Traefik pour le déploiement de projets VEIST
---

# 🐳 Docker & Traefik — Règles

## 1. Images Docker

### Build multi-stage obligatoire
```dockerfile
# ✅ Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ✅ Stage 2: Runtime (minimal)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
```

### Règles images
- **Base** : Alpine (`node:20-alpine`, `python:3.12-alpine`, etc.)
- **Multi-stage** : séparer build et runtime
- `--omit=dev` pour les dépendances Node.js de production
- JAMAIS de secrets dans les Dockerfile ou les layers
- `EXPOSE` uniquement les ports nécessaires
- `VOLUME` pour les données persistantes (`/data`, `/workspace`)

### Images VEIST
| Image | Registry | Usage |
|-------|----------|-------|
| `ihachi/veist:latest` | Docker Hub | Orchestrateur API |
| `ihachi/veist-dashboard:latest` | Docker Hub | Dashboard React |

## 2. Docker Compose

### Template de base pour les projets VEIST
```yaml
services:
  app:
    image: {image}
    container_name: {project-name}
    restart: unless-stopped
    environment:
      - KEY=value
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{name}.rule=Host(`{name}.hach.dev`)"
      - "traefik.http.routers.{name}.entrypoints=websecure"
      - "traefik.http.routers.{name}.tls.certresolver=letsencrypt"
      - "traefik.http.services.{name}.loadbalancer.server.port={port}"

networks:
  web:
    external: true
```

### Règles compose
- **Network `web`** : externe, partagé avec Traefik — OBLIGATOIRE pour tout service web
- **Labels Traefik** : obligatoires pour tout service accessible via navigateur
- **Healthchecks** : obligatoires sur les services principaux
- **`restart: unless-stopped`** par défaut
- **Volumes nommés** pour la persistance des données

### Ports & binding
```yaml
# ✅ CORRECT — Bind sur localhost uniquement
ports:
  - "127.0.0.1:8000:8000"

# ✅ CORRECT — Pas de port exposé, Traefik gère le routing
# (juste les labels Traefik, pas de section ports)

# ❌ INTERDIT — Expose le port au monde entier
ports:
  - "8000:8000"        # Équivalent à 0.0.0.0:8000
  - "0.0.0.0:8000:8000"
```

## 3. Projets déployés sur le VPS

### Projets actifs actuellement
| Projet | Path | Containers | Status |
|--------|------|------------|--------|
| `traefik` | `/docker/traefik/` | `traefik-traefik-1` | running |
| `veist` | `/docker/veist/` | `veist`, `veist-dashboard` | running (healthy) |
| `smartinboxia` | `/home/deployer/SmartInboxIA/` | 5 containers (web, backend, db, ia, admin) | running |
| `spy-bot` | `/docker/spy-bot/` | `discord-bot` | running |
| `imap-netflix-household-automation` | `/opt/imap-netflix.../` | 1 container (Playwright) | running |

### Déploiement via API Hostinger

#### Code change (image déjà sur Docker Hub)
```
mcp: VPS_updateProjectV1(
  virtualMachineId: 1287719,
  projectName: "veist"
)
```

#### Changement de docker-compose.yml
```
# 1. Lire les env vars actuelles
mcp: VPS_getProjectContentsV1(virtualMachineId: 1287719, projectName: "veist")

# 2. Redéployer avec les env vars préservées
mcp: VPS_createNewProjectV1(
  virtualMachineId: 1287719,
  project_name: "veist",
  content: "https://github.com/HASHT85/veist",
  environment: "<env vars from step 1>"
)
```

## 4. Traefik

### Configuration
- **Container** : `traefik:latest` dans `/docker/traefik/`
- **Ports** : 80 (HTTP) + 443 (HTTPS) sur `0.0.0.0` (seul service autorisé)
- **Cert resolver** : Let's Encrypt
- **Network** : `web` (externe)

### Règles Traefik
- Tout nouveau service web DOIT avoir les 4 labels Traefik (router, entrypoints, tls, service)
- Le nom du router doit être unique (utiliser le nom du projet)
- `Host()` doit pointer vers un sous-domaine de `hach.dev` ou `smartinboxia.com`
- HTTP → HTTPS redirect géré globalement par Traefik
- Ne JAMAIS modifier la config Traefik directement — ajouter des labels aux containers

## 5. Règles critiques

> ⚠️ **JAMAIS `deleteProjectV1`** — détruit les volumes Docker et TOUTES les données !

> ⚠️ **JAMAIS `updateProjectV1` quand le docker-compose.yml a changé** — utiliser `createNewProjectV1`

> ⚠️ **TOUJOURS lire les env vars avec `getProjectContentsV1` AVANT `createNewProjectV1`** — sinon les secrets sont perdus

> ⚠️ **JAMAIS exposer de port sur 0.0.0.0** sauf Traefik (ports 80/443)
