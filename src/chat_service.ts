// @ts-nocheck
/**
 * Chat Service — Pre-Pipeline Conversational Mode
 * Manages chat sessions where users discuss project ideas with Claude
 * before launching the pipeline with an enriched brief.
 * Sessions are persisted to disk so they survive container restarts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { promises as fs, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// ─── Types ───

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

export interface ChatSession {
    id: string;
    model: string;
    messages: ChatMessage[];
    projectId?: string; // linked pipeline ID
    createdAt: string;
    updatedAt: string;
}

export interface EnrichedBrief {
    name: string;
    description: string;
    model: string;
}

// ─── Service ───

const DEFAULT_MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Tu es l'assistant IA intégré de VEIST — un orchestrateur capable de créer N'IMPORTE QUEL type de projet. Tu aides les utilisateurs à DÉFINIR et AFFINER leur projet avant de le faire construire par les agents du pipeline.

🏗️ CONTEXTE VEIST — DÉPLOIEMENT AUTOMATIQUE :
- VEIST déploie AUTOMATIQUEMENT tous les projets sur un VPS Hostinger via Docker + Traefik
- Chaque projet reçoit un sous-domaine automatique (ex: abc123.hach.dev)
- NE PROPOSE JAMAIS Vercel, Netlify, Heroku, ou "déploiement local"
- NE DEMANDE JAMAIS où l'utilisateur veut héberger — c'est TOUJOURS sur le VPS VEIST
- Le déploiement est 100% automatisé par les agents du pipeline — l'utilisateur n'a rien à faire

⚠️ RÈGLE FONDAMENTALE — NE JAMAIS GÉNÉRER DE CODE :
- Tu ne génères JAMAIS de code source, JAMAIS de fichiers, JAMAIS de snippets de code
- Tu ne montres JAMAIS d'exemples de code (pas de blocs \`\`\`jsx, \`\`\`html, \`\`\`css, etc.)
- Tu ne proposes JAMAIS de "fichiers générés" ou de structure de code
- Ton rôle est de PLANIFIER, CONSEILLER et AFFINER — PAS de coder
- Le code est généré par les AGENTS du pipeline quand l'utilisateur clique DEPLOY
- Si l'utilisateur te demande de coder → explique que les agents s'en chargent après le DEPLOY

TYPES DE PROJETS SUPPORTÉS :
🌐 Web App (SPA) — React, Vue, Svelte, Angular
⚡ API Backend — Express, FastAPI, Flask, NestJS
🏗️ Application Fullstack — Frontend + Backend + DB
🤖 Bot Discord/Telegram — Bot de chat avec ou sans dashboard
🔧 Outil CLI — Scraper, automation, outil en ligne de commande
🐍 Application Python — FastAPI, Flask, Django, Data Science
🎮 Jeu Web — Canvas, WebGL, Phaser, Three.js

QUAND L'UTILISATEUR VEUT CRÉER UN PROJET :
1. COMPRENDS l'idée (pose 1-2 questions si c'est flou)
2. SUGGÈRE le type de projet le plus adapté parmi la liste ci-dessus
3. PROPOSE 2-3 stacks techniques possibles avec des pros/cons brefs
4. Laisse l'utilisateur CHOISIR ou recommande le meilleur
5. Aide à affiner les features (design, APIs, fonctionnalités)
6. **SECRETS VAULT** : Si des clés API / tokens / credentials sont nécessaires, liste-les et dis de les ajouter dans le 🔐 SECRETS_VAULT AVANT le lancement
7. Quand c'est prêt → dis clairement "Clique sur le bouton **DEPLOY** en haut à droite pour lancer la création !"
8. NE GÉNÈRE AUCUN CODE — les agents du pipeline le feront automatiquement

QUAND L'UTILISATEUR VEUT MODIFIER/CORRIGER UN PROJET :
- Analyse les problèmes, bugs, erreurs, logs
- Propose des solutions techniques concrètes (en texte, PAS en code)
- Si de nouvelles variables d'env sont nécessaires → rappelle le 🔐 SECRETS_VAULT
- Quand les instructions sont prêtes → "Clique sur **EXECUTE_MODIFY** pour appliquer"

INTERDIT :
- Ne génère JAMAIS de code, de snippets, ou de fichiers
- Ne dis JAMAIS "ce n'est pas mon rôle"
- Ne redirige JAMAIS vers un autre outil
- Ne refuse JAMAIS une demande

FORMATAGE — RÈGLES ABSOLUES :
- INTERDIT d'utiliser le caractère pipe "|" pour séparer des éléments
- INTERDIT les tableaux markdown sous quelque forme que ce soit
- INTERDIT les grilles, colonnes, ou formatage tabulaire
- INTERDIT les blocs de code (\`\`\`) — ne montre JAMAIS de code
- Utilise UNIQUEMENT des listes à puces (tirets -) avec emojis
- Utilise des titres ## et ### pour structurer
- Garde les réponses courtes et lisibles

EXEMPLE DE FORMAT CORRECT pour comparer des stacks :

## 🎯 Mes recommandations

### ⚡ Option 1 — Discord.py + SQLite
- 🐍 Python + discord.py 2.x + SQLite
- ✅ Simple, rapide à mettre en place
- ✅ Gratuit, pas de service externe
- ❌ Pas de dashboard web

### 🚀 Option 2 — Discord.py + PostgreSQL + Flask
- 🐍 Python + discord.py 2.x + PostgreSQL + Flask
- ✅ DB robuste, mini dashboard web
- ❌ Plus complexe à setup

**Ma recommandation :** Option 1 pour démarrer rapidement.

Réponds en français, sois concis et technique.`;

export class ChatService {
    private sessions: Map<string, ChatSession> = new Map();
    private client: Anthropic;
    private filePath: string;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(storePath?: string) {
        this.client = new Anthropic();
        // Store chat sessions next to the main store
        const baseDir = path.dirname(storePath || process.env.STORE_PATH || "/data/store.json");
        this.filePath = path.join(baseDir, "chat_sessions.json");
        this.loadFromDiskSync();
    }

    // ─── Persistence ───

    /** Synchronous load — prevents race condition on immediate access */
    private loadFromDiskSync() {
        try {
            const dir = path.dirname(this.filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            if (!existsSync(this.filePath)) return;
            const raw = readFileSync(this.filePath, "utf-8");
            const data = JSON.parse(raw);
            if (Array.isArray(data.sessions)) {
                for (const s of data.sessions) {
                    this.sessions.set(s.id, s);
                }
                console.log(`💬 ChatService: Loaded ${this.sessions.size} sessions from disk`);
            }
        } catch {
            console.log("💬 ChatService: No saved sessions found, starting fresh");
        }
    }

    private scheduleSave() {
        // Debounce saves — wait 500ms after last change before writing
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToDisk(), 500);
    }

    private async saveToDisk() {
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            const data = {
                sessions: Array.from(this.sessions.values()),
                savedAt: new Date().toISOString(),
            };
            const tmp = `${this.filePath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
            await fs.rename(tmp, this.filePath);
        } catch (err) {
            console.error("💬 ChatService: Failed to save sessions:", err);
        }
    }

    // ─── Session Management ───

    createSession(model?: string, projectId?: string): ChatSession {
        const session: ChatSession = {
            id: randomUUID().slice(0, 8),
            model: model || DEFAULT_MODEL,
            messages: [],
            projectId: projectId || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.sessions.set(session.id, session);
        this.scheduleSave();
        return session;
    }

    linkProject(sessionId: string, projectId: string | null): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) return false;
        session.projectId = projectId || undefined;
        session.updatedAt = new Date().toISOString();
        this.scheduleSave();
        return true;
    }

    getSession(id: string): ChatSession | undefined {
        return this.sessions.get(id);
    }

    listSessions(): ChatSession[] {
        return Array.from(this.sessions.values())
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map(s => ({
                ...s,
                messages: s.messages.slice(-2), // Only return last 2 messages for list view
            }));
    }

    deleteSession(id: string): boolean {
        const result = this.sessions.delete(id);
        if (result) this.scheduleSave();
        return result;
    }

    async sendMessage(sessionId: string, content: string, pipelineContext?: { name: string; phase: string; error?: string; events: string[]; workspace?: string }, files?: { base64: string; type: string }[]): Promise<{ reply: string; session: ChatSession }> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error("session_not_found");

        // Store a display-friendly version for session history
        const fileLabel = files && files.length > 0 ? `\n[📎 ${files.length} FILE(S) ATTACHED]` : '';
        session.messages.push({
            role: "user",
            content: content + fileLabel,
            timestamp: new Date().toISOString(),
        });

        // Build dynamic system prompt with project context
        let systemPrompt = SYSTEM_PROMPT;
        if (pipelineContext) {
            systemPrompt += `\n\nPROJET LIÉ À CETTE CONVERSATION :
- Nom : ${pipelineContext.name}
- Status : ${pipelineContext.phase}
${pipelineContext.error ? `- ❌ Erreur : ${pipelineContext.error}` : ''}

ÉVÉNEMENTS RÉCENTS DU PIPELINE :
${pipelineContext.events.slice(-10).join('\n')}

INSTRUCTIONS QUAND L'UTILISATEUR VEUT CORRIGER/MODIFIER CE PROJET :
- Tu as le contexte complet du projet ci-dessus
- Comprends le problème décrit par l'utilisateur
- Formule des instructions CLAIRES et PRÉCISES pour corriger le problème
- Dis à l'utilisateur de cliquer sur **EXECUTE_MODIFY** pour appliquer les corrections
- N'aie PAS besoin de demander les erreurs — tu les as déjà ci-dessus
- Sois PROACTIF : propose directement la solution
- TOUT tourne sur le VPS Hostinger — ne dis JAMAIS "teste en local" ou "compile localement"
- Quand EXECUTE_MODIFY est cliqué, un agent a accès au workspace et peut exécuter des commandes (npm, build, etc.) directement`;
        }

        // Build messages for Claude API — with multi-block content for files
        const apiMessages = session.messages.map((m, idx) => {
            // Only the LAST user message gets file attachments
            if (idx === session.messages.length - 1 && m.role === 'user' && files && files.length > 0) {
                const contentBlocks: any[] = [];
                
                // Add file blocks (images and PDFs)
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        contentBlocks.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: file.type,
                                data: file.base64,
                            }
                        });
                    } else if (file.type === 'application/pdf') {
                        contentBlocks.push({
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: file.base64,
                            }
                        });
                    }
                }
                
                // Add text content
                contentBlocks.push({
                    type: 'text',
                    text: content,
                });
                
                return {
                    role: m.role as "user" | "assistant",
                    content: contentBlocks,
                };
            }
            
            return {
                role: m.role as "user" | "assistant",
                content: m.content,
            };
        });

        try {
            const response = await this.client.messages.create({
                model: session.model,
                max_tokens: 2048,
                system: systemPrompt,
                messages: apiMessages,
            });

            const reply = response.content
                .filter(b => b.type === "text")
                .map(b => (b as any).text)
                .join("\n");

            // Add assistant message
            session.messages.push({
                role: "assistant",
                content: reply,
                timestamp: new Date().toISOString(),
            });

            session.updatedAt = new Date().toISOString();
            this.scheduleSave();
            return { reply, session };
        } catch (err: any) {
            // Remove failed user message
            session.messages.pop();
            throw err;
        }
    }

    generateBrief(sessionId: string): EnrichedBrief | null {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return null;

        // Build a rich description from the conversation
        const userMessages = session.messages
            .filter(m => m.role === "user")
            .map(m => m.content);

        const assistantSuggestions = session.messages
            .filter(m => m.role === "assistant")
            .map(m => m.content);

        // Use the first user message as the base idea, enriched with the conversation
        const baseIdea = userMessages[0];
        const enrichedDetails = assistantSuggestions.length > 0
            ? `\n\nCoNTEXTE ENRICHI par la discussion pré-pipeline:\n${assistantSuggestions.slice(-2).join("\n\n")}`
            : "";

        // Derive a project name: first 4 words of first message
        const name = String(userMessages[0] || "")
            .split(/\s+/)
            .slice(0, 4)
            .join("-")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "");

        return {
            name: name || "chat-project",
            description: baseIdea + enrichedDetails,
            model: session.model,
        };
    }
}
