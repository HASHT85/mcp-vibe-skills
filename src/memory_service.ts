/**
 * Memory Service — Long-Term Memory (DeerFlow Pattern)
 * 
 * Extracts facts from conversations, deduplicates them,
 * and injects relevant context into agent system prompts.
 * Inspired by DeerFlow's agents/memory/ system.
 * 
 * Storage: /data/memory.json (atomic writes via temp file + rename)
 */

import OpenAI from "openai";
import { promises as fs, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ─── Types ───

export interface MemoryFact {
    id: string;
    content: string;
    category: "preference" | "knowledge" | "context" | "behavior" | "goal";
    confidence: number; // 0-1
    createdAt: string;
    source: string; // session ID or "pipeline"
}

export interface MemoryContext {
    workContext: string;     // What the user is currently working on
    personalContext: string; // User preferences, style
    topOfMind: string;       // 1-3 sentence current focus
}

export interface MemoryHistory {
    recentMonths: string;    // Summary of recent activity
    earlierContext: string;  // Older context
}

export interface MemoryData {
    userContext: MemoryContext;
    history: MemoryHistory;
    facts: MemoryFact[];
    lastUpdated: string;
}

// ─── Constants ───

const MAX_FACTS = 100;
const FACT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_INJECTION_FACTS = 15;
const DEBOUNCE_MS = 30_000; // 30 seconds like DeerFlow
const MEMORY_MODEL = process.env.MEMORY_MODEL || process.env.AI_MODEL || "anthropic/claude-sonnet-4";

// ─── Extraction Prompt ───

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation and extract:

1. **User Context Updates**: Update workContext, personalContext, topOfMind if the conversation reveals new info.
2. **Facts**: Extract discrete, useful facts about the user, their preferences, projects, technical choices, or goals.

Rules:
- Each fact should be a single, clear statement
- Assign confidence 0.0-1.0 (higher = more certain)
- Categories: preference, knowledge, context, behavior, goal
- Do NOT extract trivial greetings or filler
- Do NOT duplicate existing facts (check the existing facts list)
- Keep context summaries to 1-3 sentences max

Respond with ONLY valid JSON:
{
  "contextUpdates": {
    "workContext": "updated or null",
    "personalContext": "updated or null",
    "topOfMind": "updated or null"
  },
  "newFacts": [
    { "content": "...", "category": "...", "confidence": 0.85 }
  ]
}`;

// ─── Service ───

export class MemoryService {
    private data: MemoryData;
    private filePath: string;
    private client: OpenAI;
    private pendingQueue: Map<string, { messages: string; timestamp: number }> = new Map();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private processing = false;

    constructor(storePath?: string) {
        const baseDir = path.dirname(storePath || process.env.STORE_PATH || "/data/store.json");
        this.filePath = path.join(baseDir, "memory.json");

        this.client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
        });

        this.data = this.loadSync();
    }

    // ─── Persistence (atomic writes like DeerFlow) ───

    private loadSync(): MemoryData {
        try {
            const dir = path.dirname(this.filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            if (!existsSync(this.filePath)) return this.emptyData();
            const raw = readFileSync(this.filePath, "utf-8");
            const parsed = JSON.parse(raw) as MemoryData;
            console.log(`🧠 [Memory] Loaded ${parsed.facts.length} facts from disk`);
            return parsed;
        } catch {
            console.log("🧠 [Memory] No saved memory found, starting fresh");
            return this.emptyData();
        }
    }

    private emptyData(): MemoryData {
        return {
            userContext: { workContext: "", personalContext: "", topOfMind: "" },
            history: { recentMonths: "", earlierContext: "" },
            facts: [],
            lastUpdated: new Date().toISOString(),
        };
    }

    private async saveToDisk(): Promise<void> {
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            this.data.lastUpdated = new Date().toISOString();
            const tmp = `${this.filePath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), "utf-8");
            await fs.rename(tmp, this.filePath);
            console.log(`🧠 [Memory] Saved ${this.data.facts.length} facts to disk`);
        } catch (err) {
            console.error("🧠 [Memory] Failed to save:", err);
        }
    }

    // ─── Fact Deduplication (DeerFlow pattern: whitespace-normalized comparison) ───

    private isDuplicate(newContent: string): boolean {
        const normalized = newContent.trim().toLowerCase().replace(/\s+/g, " ");
        return this.data.facts.some(
            f => f.content.trim().toLowerCase().replace(/\s+/g, " ") === normalized
        );
    }

    // ─── Queue Conversation for Memory Extraction (debounced) ───

    queueConversation(sessionId: string, messages: { role: string; content: string }[]): void {
        // Format messages for extraction
        const formatted = messages
            .filter(m => typeof m.content === "string")
            .map(m => `${m.role}: ${m.content}`)
            .join("\n");

        this.pendingQueue.set(sessionId, {
            messages: formatted,
            timestamp: Date.now(),
        });

        // Debounce: wait DEBOUNCE_MS after last queue before processing
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.processQueue(), DEBOUNCE_MS);

        console.log(`🧠 [Memory] Queued session ${sessionId} for extraction (debounce ${DEBOUNCE_MS / 1000}s)`);
    }

    // ─── Process Queue (background) ───

    private async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        try {
            const entries = Array.from(this.pendingQueue.entries());
            this.pendingQueue.clear();

            for (const [sessionId, entry] of entries) {
                try {
                    await this.extractAndStore(sessionId, entry.messages);
                } catch (err) {
                    console.error(`🧠 [Memory] Extraction failed for session ${sessionId}:`, err);
                }
            }
        } finally {
            this.processing = false;
        }
    }

    // ─── Extract Facts from Conversation ───

    private async extractAndStore(sessionId: string, conversationText: string): Promise<void> {
        console.log(`🧠 [Memory] Extracting facts from session ${sessionId}...`);

        const existingFactsSummary = this.data.facts
            .slice(-20)
            .map(f => `- ${f.content}`)
            .join("\n");

        try {
            const response = await this.client.chat.completions.create({
                model: MEMORY_MODEL,
                max_tokens: 1024,
                messages: [
                    { role: "system", content: EXTRACTION_PROMPT },
                    {
                        role: "user",
                        content: `EXISTING FACTS (do not duplicate):\n${existingFactsSummary || "(none)"}\n\nCONVERSATION TO ANALYZE:\n${conversationText.slice(-4000)}`,
                    },
                ],
            });

            const output = response.choices[0]?.message?.content || "";
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.warn("🧠 [Memory] No JSON in extraction response");
                return;
            }

            const result = JSON.parse(jsonMatch[0]);

            // Apply context updates
            if (result.contextUpdates) {
                const cu = result.contextUpdates;
                if (cu.workContext) this.data.userContext.workContext = cu.workContext;
                if (cu.personalContext) this.data.userContext.personalContext = cu.personalContext;
                if (cu.topOfMind) this.data.userContext.topOfMind = cu.topOfMind;
            }

            // Add new facts (with deduplication)
            let added = 0;
            if (Array.isArray(result.newFacts)) {
                for (const fact of result.newFacts) {
                    if (!fact.content || typeof fact.content !== "string") continue;
                    if (fact.confidence < FACT_CONFIDENCE_THRESHOLD) continue;
                    if (this.isDuplicate(fact.content)) continue;

                    this.data.facts.push({
                        id: randomUUID().slice(0, 8),
                        content: fact.content.trim(),
                        category: fact.category || "context",
                        confidence: Math.min(1, Math.max(0, fact.confidence)),
                        createdAt: new Date().toISOString(),
                        source: sessionId,
                    });
                    added++;
                }
            }

            // Cap facts at MAX_FACTS (remove oldest low-confidence first)
            if (this.data.facts.length > MAX_FACTS) {
                this.data.facts.sort((a, b) => b.confidence - a.confidence);
                this.data.facts = this.data.facts.slice(0, MAX_FACTS);
            }

            await this.saveToDisk();
            console.log(`🧠 [Memory] Extracted ${added} new facts from session ${sessionId} (total: ${this.data.facts.length})`);
        } catch (err) {
            console.error("🧠 [Memory] LLM extraction error:", err);
        }
    }

    // ─── Inject Memory into System Prompt (DeerFlow <memory> pattern) ───

    buildMemoryBlock(): string {
        const parts: string[] = [];

        // User context
        const ctx = this.data.userContext;
        if (ctx.topOfMind) parts.push(`Current focus: ${ctx.topOfMind}`);
        if (ctx.workContext) parts.push(`Work context: ${ctx.workContext}`);
        if (ctx.personalContext) parts.push(`Preferences: ${ctx.personalContext}`);

        // Top facts (sorted by confidence, most recent first within same confidence)
        const topFacts = [...this.data.facts]
            .sort((a, b) => b.confidence - a.confidence || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, MAX_INJECTION_FACTS);

        if (topFacts.length > 0) {
            parts.push("\nKnown facts about the user:");
            for (const f of topFacts) {
                parts.push(`- ${f.content}`);
            }
        }

        if (parts.length === 0) return "";

        return `\n<memory>\n${parts.join("\n")}\n</memory>`;
    }

    // ─── Public Getters ───

    getFacts(): MemoryFact[] {
        return [...this.data.facts];
    }

    getContext(): MemoryContext {
        return { ...this.data.userContext };
    }

    getStats(): { factCount: number; lastUpdated: string; categories: Record<string, number> } {
        const categories: Record<string, number> = {};
        for (const f of this.data.facts) {
            categories[f.category] = (categories[f.category] || 0) + 1;
        }
        return {
            factCount: this.data.facts.length,
            lastUpdated: this.data.lastUpdated,
            categories,
        };
    }

    // ─── Force flush (for testing / shutdown) ───

    async flush(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        await this.processQueue();
    }
}

// ─── Singleton ───

let _instance: MemoryService | null = null;

export function getMemoryService(storePath?: string): MemoryService {
    if (!_instance) {
        _instance = new MemoryService(storePath);
    }
    return _instance;
}
