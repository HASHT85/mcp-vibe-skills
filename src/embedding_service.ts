// QUAL-34: @ts-nocheck removed — type safety restored
/**
 * Embedding Service — Semantic Code Search (Phase 2.5)
 * 
 * Vectorizes repository files using google/gemini-embedding-2-preview via OpenRouter,
 * stores embeddings locally, and provides semantic search for agent context injection.
 * 
 * Storage: /data/embeddings/{projectId}.json
 */

import OpenAI from "openai";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ─── Types ───

export interface EmbeddingChunk {
    filePath: string;         // relative path in repo
    startLine: number;
    endLine: number;
    content: string;
    contentHash: string;      // sha256 of content for cache invalidation
    vector: number[];         // embedding vector
}

export interface EmbeddingIndex {
    projectId: string;
    indexedAt: string;
    fileCount: number;
    chunkCount: number;
    chunks: EmbeddingChunk[];
}

export interface SearchResult {
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    score: number;            // cosine similarity
}

// ─── Constants ───

const EMBEDDING_MODEL = "google/gemini-embedding-2-preview";
const EMBEDDING_DIM = 768; // gemini-embedding-2 output dimension

const INDEXABLE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h",
    ".css", ".scss", ".less",
    ".html", ".vue", ".svelte",
    ".json", ".yml", ".yaml", ".toml",
    ".md", ".txt",
    ".sql", ".sh", ".bash",
    ".dockerfile",
]);

const EXCLUDED_DIRS = new Set([
    "node_modules", ".git", "dist", "build", ".next", "__pycache__",
    ".venv", "venv", "vendor", "target", ".turbo", ".cache",
    "coverage", ".nyc_output", ".parcel-cache",
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB
const CHUNK_MAX_LINES = 300;
const CHUNK_OVERLAP = 50;
const BATCH_SIZE = 20;
const MAX_FILES = 500; // safety cap

// ─── Service ───

export class EmbeddingService {
    private client: OpenAI;
    private baseDir: string;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
        });

        const storeDir = path.dirname(process.env.STORE_PATH || "/data/store.json");
        this.baseDir = path.join(storeDir, "embeddings");
    }

    // ─── Embedding API Call ───

    private async embed(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        try {
            const response = await this.client.embeddings.create({
                model: EMBEDDING_MODEL,
                input: texts,
            });

            return response.data
                .sort((a, b) => a.index - b.index)
                .map(d => d.embedding);
        } catch (err: any) {
            console.error(`🔮 [Embedding] API error:`, err.message);
            throw err;
        }
    }

    // ─── File Discovery ───

    private async discoverFiles(workspace: string): Promise<string[]> {
        const files: string[] = [];

        const walk = async (dir: string, depth = 0): Promise<void> => {
            if (depth > 10 || files.length >= MAX_FILES) return;

            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (files.length >= MAX_FILES) break;

                if (entry.isDirectory()) {
                    if (EXCLUDED_DIRS.has(entry.name)) continue;
                    if (entry.name.startsWith(".")) continue;
                    await walk(path.join(dir, entry.name), depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    // Special case: Dockerfile has no extension
                    const isDockerfile = entry.name === "Dockerfile" || entry.name.startsWith("Dockerfile.");
                    
                    if (!INDEXABLE_EXTENSIONS.has(ext) && !isDockerfile) continue;

                    const fullPath = path.join(dir, entry.name);
                    try {
                        const stat = await fs.stat(fullPath);
                        if (stat.size > MAX_FILE_SIZE) continue;
                        if (stat.size === 0) continue;
                        files.push(fullPath);
                    } catch {
                        continue;
                    }
                }
            }
        };

        await walk(workspace);
        return files;
    }

    // ─── Chunking ───

    private chunkFile(filePath: string, content: string): { startLine: number; endLine: number; text: string }[] {
        const lines = content.split("\n");

        if (lines.length <= CHUNK_MAX_LINES) {
            return [{ startLine: 1, endLine: lines.length, text: content }];
        }

        const chunks: { startLine: number; endLine: number; text: string }[] = [];
        let start = 0;

        while (start < lines.length) {
            const end = Math.min(start + CHUNK_MAX_LINES, lines.length);
            const chunkLines = lines.slice(start, end);
            chunks.push({
                startLine: start + 1,
                endLine: end,
                text: chunkLines.join("\n"),
            });
            start = end - CHUNK_OVERLAP;
            if (start >= lines.length - CHUNK_OVERLAP) break;
        }

        // Make sure last chunk is included if we didn't reach the end
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk && lastChunk.endLine < lines.length) {
            chunks.push({
                startLine: Math.max(1, lines.length - CHUNK_MAX_LINES + 1),
                endLine: lines.length,
                text: lines.slice(Math.max(0, lines.length - CHUNK_MAX_LINES)).join("\n"),
            });
        }

        return chunks;
    }

    private contentHash(text: string): string {
        return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
    }

    // ─── Index Repository ───

    async indexRepository(projectId: string, workspace: string): Promise<EmbeddingIndex> {
        console.log(`🔮 [Embedding] Starting indexation for project ${projectId}...`);
        const startTime = Date.now();

        // Load existing index for incremental updates
        const existing = await this.loadIndex(projectId);
        const existingHashMap = new Map<string, EmbeddingChunk>();
        if (existing) {
            for (const chunk of existing.chunks) {
                const key = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
                existingHashMap.set(key, chunk);
            }
        }

        // Discover files
        const filePaths = await this.discoverFiles(workspace);
        console.log(`🔮 [Embedding] Found ${filePaths.length} indexable files`);

        // Build chunks
        const allChunks: { filePath: string; startLine: number; endLine: number; text: string; hash: string }[] = [];
        const fileCount = filePaths.length;

        for (const fullPath of filePaths) {
            try {
                const content = await fs.readFile(fullPath, "utf-8");
                const relPath = path.relative(workspace, fullPath).replace(/\\/g, "/");
                const chunks = this.chunkFile(relPath, content);

                for (const chunk of chunks) {
                    // Prefix with file path for better context
                    const textWithPath = `File: ${relPath}\n${chunk.text}`;
                    allChunks.push({
                        filePath: relPath,
                        startLine: chunk.startLine,
                        endLine: chunk.endLine,
                        text: textWithPath,
                        hash: this.contentHash(chunk.text),
                    });
                }
            } catch {
                // Skip unreadable files
            }
        }

        console.log(`🔮 [Embedding] ${allChunks.length} chunks to process`);

        // Separate new vs cached chunks
        const newChunks: typeof allChunks = [];
        const cachedChunks: EmbeddingChunk[] = [];

        for (const chunk of allChunks) {
            const key = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
            const cached = existingHashMap.get(key);
            if (cached && cached.contentHash === chunk.hash) {
                cachedChunks.push(cached);
            } else {
                newChunks.push(chunk);
            }
        }

        console.log(`🔮 [Embedding] ${cachedChunks.length} cached, ${newChunks.length} new chunks to embed`);

        // Embed new chunks in batches
        const embeddedChunks: EmbeddingChunk[] = [...cachedChunks];

        for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
            const batch = newChunks.slice(i, i + BATCH_SIZE);
            const texts = batch.map(c => c.text);

            try {
                const vectors = await this.embed(texts);

                for (let j = 0; j < batch.length; j++) {
                    embeddedChunks.push({
                        filePath: batch[j].filePath,
                        startLine: batch[j].startLine,
                        endLine: batch[j].endLine,
                        content: batch[j].text,
                        contentHash: batch[j].hash,
                        vector: vectors[j],
                    });
                }

                console.log(`🔮 [Embedding] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(newChunks.length / BATCH_SIZE)} done`);
            } catch (err: any) {
                console.error(`🔮 [Embedding] Batch failed, skipping:`, err.message);
            }

            // Small delay between batches to avoid rate limits
            if (i + BATCH_SIZE < newChunks.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Build and save index
        const index: EmbeddingIndex = {
            projectId,
            indexedAt: new Date().toISOString(),
            fileCount,
            chunkCount: embeddedChunks.length,
            chunks: embeddedChunks,
        };

        await this.saveIndex(projectId, index);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`🔮 [Embedding] Indexation complete: ${fileCount} files, ${embeddedChunks.length} chunks in ${elapsed}s`);

        return index;
    }

    // ─── Semantic Search ───

    async search(projectId: string, query: string, topK = 5): Promise<SearchResult[]> {
        const index = await this.loadIndex(projectId);
        if (!index || index.chunks.length === 0) return [];

        // Embed the query
        const [queryVector] = await this.embed([query]);
        if (!queryVector) return [];

        // Compute cosine similarity against all chunks
        const scored: (SearchResult & { _idx: number })[] = [];

        for (let i = 0; i < index.chunks.length; i++) {
            const chunk = index.chunks[i];
            const score = cosineSimilarity(queryVector, chunk.vector);
            scored.push({
                filePath: chunk.filePath,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                content: chunk.content,
                score,
                _idx: i,
            });
        }

        // Sort by score descending, deduplicate by file (keep best per file)
        scored.sort((a, b) => b.score - a.score);

        const seen = new Set<string>();
        const results: SearchResult[] = [];

        for (const item of scored) {
            if (results.length >= topK) break;
            // Allow multiple chunks from same file if they're different ranges
            const key = `${item.filePath}:${item.startLine}`;
            if (seen.has(key)) continue;
            seen.add(key);

            results.push({
                filePath: item.filePath,
                startLine: item.startLine,
                endLine: item.endLine,
                content: item.content,
                score: item.score,
            });
        }

        return results;
    }

    // ─── Build Context Block for Agent Injection ───

    async buildContextBlock(projectId: string, query: string, topK = 5): Promise<string> {
        const results = await this.search(projectId, query, topK);
        if (results.length === 0) return "";

        const parts = results.map(r => {
            const header = `── ${r.filePath} (L${r.startLine}-${r.endLine}) [relevance: ${(r.score * 100).toFixed(0)}%]`;
            return `${header}\n${r.content}`;
        });

        return `\n<code_context>\nRelevant code files found via semantic search:\n\n${parts.join("\n\n")}\n</code_context>`;
    }

    // ─── Status ───

    async getStatus(projectId: string): Promise<{
        indexed: boolean;
        fileCount: number;
        chunkCount: number;
        lastIndexed: string | null;
    }> {
        const index = await this.loadIndex(projectId);
        if (!index) {
            return { indexed: false, fileCount: 0, chunkCount: 0, lastIndexed: null };
        }
        return {
            indexed: true,
            fileCount: index.fileCount,
            chunkCount: index.chunkCount,
            lastIndexed: index.indexedAt,
        };
    }

    // ─── Persistence ───

    private indexPath(projectId: string): string {
        // SEC-23: Prevent path traversal — projectId must be safe for filesystem
        if (!projectId || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(projectId)) {
            throw new Error(`Invalid projectId: "${projectId.slice(0, 30)}"`);
        }
        return path.join(this.baseDir, `${projectId}.json`);
    }

    private async loadIndex(projectId: string): Promise<EmbeddingIndex | null> {
        try {
            const raw = await fs.readFile(this.indexPath(projectId), "utf-8");
            return JSON.parse(raw) as EmbeddingIndex;
        } catch {
            return null;
        }
    }

    private async saveIndex(projectId: string, index: EmbeddingIndex): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });
        const tmp = `${this.indexPath(projectId)}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(index), "utf-8");
        await fs.rename(tmp, this.indexPath(projectId));
    }
}

// ─── Math Utils ───

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ─── Singleton ───

let _instance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
    if (!_instance) {
        _instance = new EmbeddingService();
    }
    return _instance;
}
