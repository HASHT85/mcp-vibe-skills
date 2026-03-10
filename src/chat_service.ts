// @ts-nocheck
/**
 * Chat Service — Pre-Pipeline Conversational Mode
 * Manages chat sessions where users discuss project ideas with Claude
 * before launching the pipeline with an enriched brief.
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

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

const SYSTEM_PROMPT = `Tu es l'assistant IA de VibeCraft, un outil qui génère et modifie automatiquement des applications web complètes.

Tu as DEUX rôles selon le contexte :

## MODE CRÉATION (nouveau projet)
- Discuter avec l'utilisateur pour affiner son idée de projet
- Poser des questions pertinentes (fonctionnalités, design, stack, API externes)
- Suggérer des améliorations et bonnes pratiques
- Identifier les besoins techniques (clés API, données, etc.)
- Aider à formuler un brief clair et complet
- Quand l'utilisateur est satisfait, l'inviter à cliquer sur "INITIATE_DEPLOYMENT"

## MODE MODIFICATION (projet existant)
- Analyser les problèmes décrits par l'utilisateur (bugs, erreurs, crashes)
- Aider à formuler des instructions de modification précises
- Suggérer des corrections et améliorations
- Comprendre les logs d'erreur et proposer des solutions
- Quand les instructions sont claires, inviter l'utilisateur à cliquer sur "EXECUTE_MODIFY"

Règles générales :
- Sois concis, enthousiaste et technique
- Réponds en français
- Accepte TOUS les types de demandes (création, modification, debug, amélioration)
- Ne refuse JAMAIS d'aider, que ce soit pour un nouveau projet ou un existant`;

export class ChatService {
    private sessions: Map<string, ChatSession> = new Map();
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic();
    }

    createSession(model?: string): ChatSession {
        const session: ChatSession = {
            id: randomUUID().slice(0, 8),
            model: model || DEFAULT_MODEL,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.sessions.set(session.id, session);
        return session;
    }

    getSession(id: string): ChatSession | undefined {
        return this.sessions.get(id);
    }

    listSessions(): ChatSession[] {
        return Array.from(this.sessions.values()).map(s => ({
            ...s,
            messages: s.messages.slice(-2), // Only return last 2 messages for list view
        }));
    }

    deleteSession(id: string): boolean {
        return this.sessions.delete(id);
    }

    async sendMessage(sessionId: string, content: string): Promise<{ reply: string; session: ChatSession }> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error("session_not_found");

        // Add user message
        session.messages.push({
            role: "user",
            content,
            timestamp: new Date().toISOString(),
        });

        // Build messages for Claude API
        const apiMessages = session.messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        try {
            const response = await this.client.messages.create({
                model: session.model,
                max_tokens: 2048,
                system: SYSTEM_PROMPT,
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
