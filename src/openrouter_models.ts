import fs from 'fs';
import path from 'path';

// SEC-26: Use persistent /data/ volume instead of cwd (read-only in Docker)
const CACHE_FILE = path.join(path.dirname(process.env.STORE_PATH || '/data/store.json'), '.openrouter_cache.json');
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours

export interface ModelPricing {
    id: string;
    name: string;
    pricing: {
        prompt: number;
        completion: number;
    };
    context_length: number;
}

export async function fetchOpenRouterModels(): Promise<ModelPricing[]> {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const stats = fs.statSync(CACHE_FILE);
            if (Date.now() - stats.mtimeMs < CACHE_TTL) {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
                return data;
            }
        }
    } catch (e) {
        console.warn("[OpenRouter] Cache read error, fetching fresh...", e);
    }

    try {
        // QUAL-39: Add timeout to prevent hanging if OpenRouter is down
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const response = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
        clearTimeout(timeout);
        const json = await response.json() as Record<string, unknown>;
        // QUAL-15: Validate response shape before processing
        const models = Array.isArray(json.data) ? json.data as any[] : [];

        const parsedModels: ModelPricing[] = models.map(m => ({
            id: m.id,
            name: m.name,
            pricing: {
                prompt: parseFloat(m.pricing?.prompt || "0"),
                completion: parseFloat(m.pricing?.completion || "0"),
            },
            context_length: m.context_length
        }));

        // Filter for notable, high-value or cost-effective models
        const notableKeywords = [
            // Anthropic
            "claude-3-5", "claude-3-7", "claude-3.5", "claude-sonnet", "claude-haiku", "claude-opus",
            // OpenAI
            "gpt-4o", "gpt-4.1", "gpt-5", "o3", "o4-mini",
            // Google
            "gemini-2.5", "gemini-2.0", "gemini-3", "gemini-flash", "gemini-pro",
            // Meta Llama
            "llama-3.3", "llama-3.1", "llama-4",
            // DeepSeek
            "deepseek-coder", "deepseek/deepseek-chat", "deepseek-r1", "deepseek-v3",
            // Qwen (Alibaba)
            "qwen-2.5", "qwen-3", "qwen/qwen-2.5-coder",
            // Mistral
            "mistral-large", "mistral-small", "mistral-medium", "codestral", "mistral/ministral",
            // xAI
            "grok-4", "grok-3",
            // NVIDIA
            "nemotron",
            // Zhipu
            "glm-4", "glm-4.5",
            // Cohere
            "command-r", "command-a",
            // Microsoft
            "phi-3", "phi-4",
            // Others
            "nous-hermes", "yi-", "wizardlm",
        ];
        
        const filtered = parsedModels
            .filter(m => {
                const id = m.id.toLowerCase();
                // Include notable models + any free models
                return notableKeywords.some(k => id.includes(k)) || 
                       (m.pricing.prompt === 0 && m.pricing.completion === 0);
            })
            .filter(m => m.context_length >= 8000) // Minimum useful context
            .sort((a, b) => a.pricing.prompt - b.pricing.prompt); // Sort by price ascending

        // QUAL-40: Atomic cache write (tmp + rename) to prevent corruption on crash
        const tmpFile = `${CACHE_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(filtered, null, 2));
        fs.renameSync(tmpFile, CACHE_FILE);

        return filtered;
    } catch (e) {
        console.error("[OpenRouter] Failed to fetch live models, returning fallback list:", e);
        return [
             { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", pricing: { prompt: 0.003, completion: 0.015 }, context_length: 200000 },
             { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", pricing: { prompt: 0.000075, completion: 0.0003 }, context_length: 1000000 },
             { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", pricing: { prompt: 0.0004, completion: 0.0004 }, context_length: 128000 },
             { id: "deepseek/deepseek-chat", name: "DeepSeek V3", pricing: { prompt: 0.00014, completion: 0.00028 }, context_length: 64000 }
        ];
    }
}
