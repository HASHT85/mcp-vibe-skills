---
description: Règles GitHub & CI/CD pour le projet VEIST
---

# 🐙 GitHub & CI/CD — Règles

## 1. Repositories

### Repo principal
- **URL** : `https://github.com/HASHT85/mcp-vibe-skills`
- **Branche principale** : `main`
- **Owner** : `HASHT85` (variable `GITHUB_OWNER`)

### Repos créés par VEIST
- Créés automatiquement via `github_api.ts`
- Token : `GITHUB_TOKEN` (variable d'env)
- Push automatique après scaffold + chaque étape du pipeline

## 2. CI/CD Pipeline

### Workflow : `.github/workflows/docker-build.yml`

```
Push sur main → GitHub Actions → Build images → Docker Hub → VPS
```

#### Étapes
1. **Checkout** du code
2. **Login Docker Hub** (`DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` en secrets GitHub)
3. **Build & push orchestrator** : `ihachi/veist:latest` + `ihachi/veist:{sha}`
4. **Build & push dashboard** : `ihachi/veist-dashboard:latest` + `ihachi/veist-dashboard:{sha}`
5. **Cache** : GitHub Actions cache (`type=gha`)

### Secrets GitHub requis
| Secret | Usage |
|--------|-------|
| `DOCKERHUB_USERNAME` | Login Docker Hub |
| `DOCKERHUB_TOKEN` | Token Docker Hub |

### Après le CI
Le déploiement sur le VPS n'est PAS automatique. Il faut manuellement :
```
mcp: VPS_updateProjectV1(virtualMachineId: 1287719, projectName: "veist")
```
Ou utiliser le workflow `/deploy`.

## 3. Git Conventions

### Pre-commit (Husky)
Le hook `.husky/pre-commit` exécute `npm run pre-commit` qui lance `scripts/check-secrets.js`.

**Ce hook ne doit JAMAIS être désactivé.**

Pour bypass en urgence absolue uniquement :
```bash
git commit --no-verify -m "emergency: ..."
```

### Commit messages
```
feat: add new agent type for web scraping
fix: resolve memory leak in chat service
deploy: update docker-compose for smartinboxia
refactor: split orchestrator into modules
docs: update deployment workflow
chore: bump dependencies
```

### Fichiers versionnés
- ✅ `package-lock.json` — TOUJOURS commité
- ✅ `.agents/rules/*` — Rules versionnées
- ✅ `.agents/workflows/project-guidelines.md` — Versionnée
- ✅ `.agents/workflows/vision-roadmap.md` — Versionnée

### Fichiers JAMAIS versionnés
- ❌ `.env`, `.env.local` — Secrets
- ❌ `node_modules/` — Dépendances
- ❌ `dist/` — Build output
- ❌ `.agents/workflows/deploy.md` — Contient des infos sensibles (VM ID, paths)

## 4. Branching

### Modèle simple (trunk-based)
- Développement direct sur `main`
- Les features complexes PEUVENT utiliser des branches `feat/xxx`
- Merge via PR ou push direct selon la complexité

## 5. GitHub API (usage par VEIST)

### Module : `src/github_api.ts`
- Création de repos pour les projets générés
- Push du code scaffoldé
- Mise à jour après chaque agent

### Règles
- Toujours vérifier que `GITHUB_TOKEN` est défini avant d'appeler l'API
- Les repos créés sont publics par défaut (configurable)
- Ne pas créer de repos avec des noms contenant des secrets
