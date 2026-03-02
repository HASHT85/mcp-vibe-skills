#!/bin/bash
# deploy.sh - Script de déploiement VibeCraft sur Hostinger VPS
# Usage: bash deploy.sh

set -e

VPS_IP="72.61.101.24"
VPS_USER="root"
APP_DIR="/opt/vibecraft"
REPO_URL="https://github.com/HASHT85/mcp-vibe-skills.git"

echo "🚀 Déploiement VibeCraft sur $VPS_IP..."

# 1. Créer les dossiers sur le VPS
ssh $VPS_USER@$VPS_IP "mkdir -p $APP_DIR"

# 2. Copier le projet (ou cloner si besoin)
# Option A : rsync (si pas de repo GitHub public)
rsync -avz --exclude node_modules --exclude dist --exclude .git \
    "$(dirname "$0")/" "$VPS_USER@$VPS_IP:$APP_DIR/"

# 3. Copier le .env (tu dois avoir un .env local configuré)
scp "$(dirname "$0")/.env" "$VPS_USER@$VPS_IP:$APP_DIR/.env"

# 4. Build et lancement sur le VPS
ssh $VPS_USER@$VPS_IP "
    cd $APP_DIR
    # S'assurer que le network Traefik existe
    docker network create web 2>/dev/null || true
    # Build et lancer en prod
    docker compose -f docker-compose.prod.yml --env-file .env up -d --build
    echo '✅ VibeCraft lancé !'
    docker compose -f docker-compose.prod.yml ps
"

echo "🎉 Déploiement terminé ! VibeCraft tourne sur https://vibecraft.hach.dev"
