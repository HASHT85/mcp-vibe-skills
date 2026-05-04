---
description: Règles de sécurité pour l'infrastructure VEIST et les projets déployés
---

# 🔒 Sécurité — Règles impératives

## 1. Gestion des Secrets

### Règle absolue
**JAMAIS de clé API, token, mot de passe ou credential en clair dans le code source, les logs, ou les messages de commit.**

### Patterns à bloquer (pre-commit hook actif)
Le fichier `scripts/check-secrets.js` scanne automatiquement chaque commit pour :
- `sk-ant-api03-*` — Clés Anthropic
- `sk-proj-*` — Clés OpenAI
- `ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*` — Tokens GitHub
- `AIza*` — Clés Google API
- `AKIA*`, `ASIA*` — Clés AWS
- Patterns internes spécifiques au projet

### Stockage des secrets
- **En dev local** : fichier `.env` (DOIT être dans `.gitignore`)
- **En production** : passés via le champ `environment` de l'API Hostinger (`createNewProjectV1`)
- **Pour les pipelines VEIST** : `SecretsService` (AES-256-GCM, fichier `/data/secrets.json` chiffré)
- **Clé de dérivation** : basée sur `ADMIN_PASS` via `crypto.scryptSync`

### Anti-patterns interdits
```
❌ const API_KEY = "sk-ant-api03-xxxxx"
❌ git commit -m "fix: update token ghp_xxxxx"
❌ console.log("Token:", process.env.SECRET_KEY)
❌ docker-compose.yml avec des secrets en dur
✅ process.env.OPENROUTER_API_KEY
✅ secretsService.getSecrets(pipelineId)
✅ .env + .gitignore
```

## 2. Firewall VPS (Hostinger)

### Configuration actuelle
| Rule ID | Protocol | Port | Source | Action |
|---------|----------|------|--------|--------|
| 780807 | TCP | 22 | any | accept |
| 780808 | TCP | 80 | any | accept |
| 780809 | TCP | 443 | any | accept |

**Firewall** : `vibecraft` (ID `226138`) — synced ✅

### Règles
- **Seuls les ports 22, 80 et 443 sont ouverts.** Tout le reste est DROP par défaut.
- Ne JAMAIS ouvrir de ports supplémentaires sans justification documentée.
- Les containers Docker ne doivent JAMAIS exposer de ports sur `0.0.0.0` — utiliser `127.0.0.1:port:port` ou Traefik.
- Seul Traefik écoute sur 80/443 en public. Les apps sont derrière le reverse proxy.
- Pour ajouter une règle firewall : `mcp_hostinger-mcp_VPS_createFirewallRuleV1` + `syncFirewallV1`

### Vérification
```
# Vérifier le firewall via MCP
mcp: VPS_getFirewallDetailsV1(firewallId: 226138)

# Les ports exposés des containers DOIVENT être sur 127.0.0.1
✅ "127.0.0.1:8000:8000"  (smartinbox-backend)
✅ "127.0.0.1:5432:5432"  (smartinbox-db)
❌ "0.0.0.0:8080:8080"    (INTERDIT — accessible au monde entier)
```

## 3. Accès SSH

### Configuration actuelle
- **Clé SSH attachée** : `hach-windows` (RSA 4096-bit, `hachh@Hach`)
- Clé ID : `447719`

### Règles
- Authentification par clé SSH uniquement (pas de password auth si possible)
- Ne JAMAIS partager ou committer des clés privées SSH
- Pour ajouter une clé : `mcp_hostinger-mcp_VPS_createPublicKeyV1` + `attachPublicKeyV1`
- Pour les scripts automatisés : utiliser l'API Hostinger MCP, PAS SSH direct

## 4. Docker Socket

### Risque
Le container VEIST monte `/var/run/docker.sock` — cela donne un accès **root-level** à l'hôte.

### Règles
- Le Docker socket est monté UNIQUEMENT pour que VEIST puisse déployer des projets
- Ne JAMAIS exposer le Docker socket via HTTP/API publique
- Les agents IA ne doivent exécuter que des commandes Docker prédéfinies :
  - `docker compose up -d`
  - `docker compose down`
  - `docker compose logs`
  - `docker inspect`
  - `docker ps`
- Commandes INTERDITES : `docker run --privileged`, `docker exec` sur des containers hôtes

## 5. Traefik & HTTPS

### Configuration
- Traefik écoute sur ports 80 et 443 (le seul service public)
- Certificats SSL via Let's Encrypt (`certresolver=letsencrypt`)
- Network Docker `web` (externe, partagé entre tous les projets)

### Règles
- **Tout service web DOIT avoir les labels Traefik avec TLS** :
  ```yaml
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.{name}.rule=Host(`{subdomain}.hach.dev`)"
    - "traefik.http.routers.{name}.entrypoints=websecure"
    - "traefik.http.routers.{name}.tls.certresolver=letsencrypt"
  ```
- Pas de service exposé sans HTTPS
- HTTP → HTTPS redirect est géré par Traefik globalement

## 6. Sécurité des projets déployés par VEIST

### Validation obligatoire avant déploiement
1. Pas de secrets hardcodés dans le `docker-compose.yml` généré
2. Les ports des containers sont bind sur `127.0.0.1` (pas `0.0.0.0`) sauf Traefik
3. Les images Docker utilisent des versions taguées (pas `:latest` en production)
4. Le network `web` est externe et partagé

### Base de données
- PostgreSQL/MySQL DOIVENT être sur `127.0.0.1` uniquement
- Mots de passe DB générés aléatoirement, stockés dans SecretsService
- Pas de port DB exposé publiquement

## 7. Domaines & DNS

### Domaines actifs
| Domaine | Type | Expire | Usage |
|---------|------|--------|-------|
| `hach.dev` | domain | 2027-01-21 | Wildcard → VPS (VEIST, sous-domaines projets) |
| `smartinboxia.com` | domain | 2027-04-14 | SmartInboxIA |

### DNS hach.dev
- `@` → `72.61.101.24` (A)
- `*` → `72.61.101.24` (A, wildcard — tous les sous-domaines)
- `www` → `hach.dev.` (CNAME)
- `plane` → `72.61.101.24` (A)

### DNS smartinboxia.com
- `@` → `72.61.101.24` (A)
- `www` → `smartinboxia.com.` (CNAME)

### Règles DNS
- Modifier les DNS via MCP : `mcp_hostinger-mcp_DNS_updateDNSRecordsV1`
- Toujours vérifier avec `getDNSRecordsV1` après modification
- TTL minimum recommandé : 300s pour les records fréquemment modifiés
