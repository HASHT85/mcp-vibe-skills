---
description: Conventions de développement TypeScript/Node.js pour le projet VEIST
---

# 🛠 Développement — Conventions

## 1. Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Runtime** | Node.js 20.x LTS (Alpine 3.21) |
| **Language** | TypeScript 5.5+ (strict mode) |
| **Module system** | ESM (`import`/`export`) — **JAMAIS CommonJS** |
| **Framework** | Express 4.x |
| **LLM** | Multi-model via OpenRouter (Claude, Gemini, DeepSeek, GPT) |
| **Dashboard** | React + Vite + TailwindCSS |
| **Package manager** | npm (lockfile commité) |
| **Tests** | Vitest (`npm run test`) |
| **Linting** | ESLint + Prettier (`npm run lint`, `npm run format`) |
| **Config** | Zod — validation env vars au démarrage (`src/config.ts`) |

## 2. TypeScript

### Obligatoire
```typescript
// ✅ ESM imports avec extension .js (résolution Node ESM)
import { Router } from "express";
import path from "node:path";
import { runVeistAgent } from "./agent/index.js";

// ❌ CommonJS INTERDIT
const express = require("express");

// ❌ @ts-nocheck INTERDIT (depuis audit QUAL-34)
// @ts-nocheck
```

### tsconfig.json strict
- `strict: true`
- `noImplicitAny: true`
- Target : ES2022+
- Module : NodeNext

### Types
- Toujours typer les paramètres de fonction et les retours
- Utiliser `interface` pour les structures de données
- Éviter `any` — utiliser `unknown` si le type est inconnu
- Types partagés agent : `src/agent/types.ts`
- Types globaux : `src/types.ts`

## 3. Architecture & modularité

### Structure du projet (à jour — Mai 2026)
```
src/
├── agent/
│   ├── types.ts          ← Types partagés (AgentAction, AgentResult, AgentOptions)
│   ├── openrouter.ts     ← Adaptateur OpenAI/OpenRouter
│   └── index.ts          ← Boucle principale runVeistAgent
├── tools/
│   ├── system.ts         ← safePath() + bash sandbox
│   ├── file.ts           ← read/write/replace_in_file + mémoire partagée
│   ├── web.ts            ← webSearch (Tavily) + fetchUrl (SSRF protégé)
│   └── executor.ts       ← Dispatcher central + définitions TOOLS[]
├── dag/
│   ├── Graph.ts          ← Moteur d'exécution DAG
│   ├── Node.ts           ← Classe de base
│   └── nodes/            ← Agents spécialisés (PlannerNode, AgentNode, EvalNode…)
├── __tests__/
│   └── security.test.ts  ← 27 tests non-régression sécurité
├── agent_engine.ts       ← Pont de compat (re-exports vers src/agent/)
├── orchestrator.ts       ← Pipeline manager DAG ⚠️ (1544 lignes — candidat refactoring)
├── chat_service.ts       ← Sessions chat + context summarization
├── memory_service.ts     ← Long-term memory
├── embedding_service.ts  ← Semantic code search (gemini-embedding-2-preview)
├── middleware.ts         ← Hooks pre/post agents (Memory, LoopDetection, Tokens)
├── skills.ts             ← TF-IDF cosine similarity skills lookup
├── model_benchmarks.ts   ← Benchmarks modèles pour routing Planner
├── config.ts             ← Validation Zod des env vars ← LIRE AU DÉMARRAGE
├── secrets_service.ts    ← AES-256-GCM secrets
├── github_api.ts         ← API GitHub
├── quickDeploy.ts        ← Déploiement rapide Hostinger
└── index.ts              ← Serveur Express + routes
```

### Règles d'architecture
- **Max ~500 lignes par fichier** — refactorer si dépassé (`orchestrator.ts` est le prochain candidat)
- **Singleton pattern** pour les services : `SecretsService`, `MemoryService`
- **Separation of concerns** : routes dans `index.ts`, logique dans les services
- **Pas de state global** mutable en dehors des services dédiés
- Chaque agent node est un module autonome dans `src/dag/nodes/`
- Nouveaux outils → créer dans `src/tools/` et enregistrer dans `executor.ts`

## 4. Asynchronie

### Règles
```typescript
// ✅ Paralléliser les tâches indépendantes
const [schema, scaffold] = await Promise.all([
  architectAgent.designSchema(),
  architectAgent.scaffoldProject()
]);

// ✅ Async/await (pas de callbacks)
const result = await fetch(url);

// ❌ Callbacks interdits
fetch(url, (err, res) => { ... });

// ❌ Promise non-gérée — ESLint @typescript-eslint/no-floating-promises bloquera
someAsyncFunction();
```

### Error handling
```typescript
// ✅ Try/catch sur les appels externes
try {
  const response = await openRouterCall(prompt);
} catch (err) {
  console.error("🤖 Agent failed:", err.message);
}

// ✅ Retry avec backoff exponentiel pour les APIs
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("unreachable");
}
```

## 5. Conventions de code

### Nommage
- **Fichiers** : `snake_case.ts` (ex: `memory_service.ts`)
- **Classes** : `PascalCase` (ex: `SecretsService`)
- **Fonctions/variables** : `camelCase` (ex: `getSecrets`)
- **Constantes** : `UPPER_SNAKE_CASE` (ex: `HOSTINGER_API`)
- **Interfaces** : `PascalCase` (ex: `SecretEntry`)

### Logging
Utiliser des emojis pour la lisibilité dans les logs :
- 🤖 Agent actions
- 🔐 Security/secrets
- 📦 Docker/deploy
- 🧠 Memory/AI
- ⚡ Performance
- ❌ Errors
- ✅ Success
- 🚫 Blocage sécurité

### Imports — ordre obligatoire
```typescript
import path from "node:path";                              // 1. Node.js built-ins
import express from "express";                             // 2. Packages externes
import { runVeistAgent } from "./agent/index.js";          // 3. Modules internes (.js)
```

## 6. Scripts npm disponibles

```bash
npm run build         # Compilation TypeScript
npm run start         # Démarrer le serveur
npm run lint          # Vérifier le style (ESLint)
npm run lint:fix      # Corriger automatiquement
npm run format        # Appliquer Prettier sur src/
npm run format:check  # Vérifier formatage (CI)
npm run test          # Run tests (27 tests sécurité)
npm run test:watch    # Mode développement
npm run test:coverage # Rapport couverture HTML
npm run mcp           # Démarrer en mode MCP stdio
```

## 7. Dashboard (React)

### Stack
- React 18+ avec TypeScript
- Vite comme bundler
- TailwindCSS avec thème custom

### Thème "Neural Glass"
- **Dark mode obligatoire**
- Fond : `#0A0A0B`
- Surfaces : `#141415`
- Accents : Cyan (`#06B6D4`) / Violet (`#8B5CF6`)
- Typo logs : monospace (JetBrains Mono ou similaire)

### Règles UI
- Animations fluides (Framer Motion)
- Feedback visuel pour les agents au travail (pulsations, typing effects)
- Toujours indiquer l'état des containers (running/stopped/error)
- Les coûts et tokens doivent être visibles dans l'agent details panel

## 8. Pre-commit & qualité

### Hooks actifs (Husky)
1. `scripts/check-secrets.js` — Scanne les secrets dans le code

### Checklist avant commit
```bash
npm run test          # 27/27 requis ✅
npx tsc --noEmit      # 0 erreur requise ✅
npm run lint          # 0 warning si possible
```

### Règles
- Ne JAMAIS utiliser `--no-verify` sauf urgence absolue
- `package-lock.json` DOIT être commité
- Les dépendances `devDependencies` ne doivent pas être en production (`--omit=dev`)
