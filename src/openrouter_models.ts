import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), '.openrouter_cache.json');
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
        const response = await fetch("https://openrouter.ai/api/v1/models");
        const json = await response.json();
        const models = json.data as any[];

        const parsedModels: ModelPricing[] = models.map(m => ({
            id: m.id,
            name: m.name,
            pricing: {
                prompt: parseFloat(m.pricing?.prompt || "0"),
                completion: parseFloat(m.pricing?.completion || "0"),
            },
            context_length: m.context_length
        }));

        // Filter for notable, high-value or highly-used models to avoid overwhelming the LLM context
        const notableKeywords = [
            "claude-3-5", "claude-3-7",
            "gpt-4o",
            "gemini-2.5", "gemini-flash",
            "llama-3.3", "llama-3.1",
            "deepseek-coder", "deepseek/deepseek-chat", "deepseek-r1",
            "qwen-2.5"
        ];
        
        const filtered = parsedModels
            .filter(m => notableKeywords.some(k => m.id.toLowerCase().includes(k)))
            // Ignore variations that are just self-hosted or duplicates if possible, but keeping it simple for now
            .sort((a, b) => a.pricing.prompt - b.pricing.prompt); // Sort by prompt price ascending

        // Save to cache
        fs.writeFileSync(CACHE_FILE, JSON.stringify(filtered, null, 2));

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
