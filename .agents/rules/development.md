---
description: Conventions de développement TypeScript/Node.js pour le projet VEIST
---

# 🛠 Développement — Conventions

## 1. Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Runtime** | Node.js 20.x LTS (Alpine 3.21) |
| **Language** | TypeScript 5.5+ (strict mode) |
| **Module system** | ESM (`import`/`export`) — PAS de CommonJS |
| **Framework** | Express 4.x |
| **LLM** | Multi-model via OpenRouter (Claude, Gemini, DeepSeek, GPT) |
| **Dashboard** | React + Vite + TailwindCSS |
| **Package manager** | npm (lockfile committed) |

## 2. TypeScript

### Obligatoire
```typescript
// ✅ ESM imports
import { Router } from "express";
import path from "node:path";

// ❌ CommonJS INTERDIT
const express = require("express");
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
- Les types partagés sont dans `src/types.ts`

## 3. Architecture & modularité

### Structure du projet
```
src/
├── index.ts              # Serveur Express + routes
├── orchestrator.ts       # Pipeline manager (DAG orchestration)
├── chat_service.ts       # Chat sessions + memory
├── memory_service.ts     # Long-term memory
├── middleware.ts          # Middleware chain (memory, loop detection)
├── skills.ts             # Skills lookup + TF-IDF scoring
├── claude_code.ts        # Agent execution (OpenRouter API)
├── secrets_service.ts    # Encrypted secrets (AES-256-GCM)
├── quickDeploy.ts        # Quick deploy via Hostinger API
├── github_api.ts         # GitHub repo management
├── profiles.ts           # User profiles
├── dag/
│   ├── Graph.ts          # DAG execution engine
│   ├── Node.ts           # Base node class
│   └── nodes/            # Specialized agent nodes
└── templates/
    └── registry.ts       # Project templates (7 types)
```

### Règles d'architecture
- **Max ~500 lignes par fichier** — refactorer si ça dépasse
- **Singleton pattern** pour les services : `SecretsService`, `MemoryService`
- **Separation of concerns** : routes dans `index.ts`, logique dans les services
- **Pas de state global** mutable en dehors des services dédiés
- Chaque agent node est un module autonome dans `src/dag/nodes/`

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

// ❌ Promise non-gérée
someAsyncFunction(); // manque await
```

### Error handling
```typescript
// ✅ Try/catch sur les appels externes
try {
  const response = await openRouterCall(prompt);
} catch (err) {
  console.error("🤖 Agent failed:", err.message);
  // Retry logic ou fallback
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
- **Interfaces** : `PascalCase` avec préfixe si nécessaire (ex: `SecretEntry`)

### Logging
- Utiliser des emojis pour la lisibilité dans les logs :
  - 🤖 Agent actions
  - 🔐 Security/secrets
  - 📦 Docker/deploy
  - 🧠 Memory/AI
  - ⚡ Performance
  - ❌ Errors
  - ✅ Success

### Imports
- Ordre : Node.js built-ins → packages externes → modules internes
- Toujours utiliser l'extension `.js` dans les imports internes (ESM resolution)
```typescript
import path from "node:path";           // Built-in
import express from "express";          // External
import { SecretsService } from "./secrets_service.js";  // Internal
```

## 6. Dashboard (React)

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

## 7. Pre-commit & qualité

### Hooks actifs (Husky)
1. `scripts/check-secrets.js` — Scanne les secrets dans le code
2. `npm run build` — Compilation TypeScript doit passer

### Règles
- Ne JAMAIS utiliser `--no-verify` sauf en urgence absolue
- `package-lock.json` DOIT être commité
- Les dépendances `devDependencies` ne doivent pas être en production (`--omit=dev`)
