/**
 * Model Performance Benchmarks
 * Sources: artificialanalysis.ai (Intelligence Index v4.0, Coding Index, Agentic Index)
 * Updated: March 2026
 * 
 * Scores help the Planner pick the BEST model per agent, balancing quality and cost.
 */

export interface ModelBenchmark {
    id: string;                // OpenRouter model ID
    provider: "openrouter";
    coding: number;            // Coding capability (0-100)
    agentic: number;           // Agentic/tool-use capability (0-100)
    intelligence: number;      // AA Intelligence Index (normalized 0-100)
    speed: "fast" | "medium" | "slow"; // Relative speed
    bestFor: string[];         // What this model excels at
}

export const MODEL_BENCHMARKS: ModelBenchmark[] = [
    // ─── Tier S: Frontier (March 2026) ───
    {
        id: "google/gemini-3.1-pro-preview",
        provider: "openrouter",
        coding: 93, agentic: 88, intelligence: 97,
        speed: "medium",
        bestFor: ["complex reasoning", "long context", "multimodal", "analysis", "coding"]
    },
    {
        id: "openai/gpt-5.4",
        provider: "openrouter",
        coding: 92, agentic: 90, intelligence: 97,
        speed: "medium",
        bestFor: ["PhD-level reasoning", "multi-step logic", "complex coding", "architecture"]
    },
    {
        id: "anthropic/claude-opus-4.6",
        provider: "openrouter",
        coding: 90, agentic: 88, intelligence: 90,
        speed: "slow",
        bestFor: ["architectural coding", "complex debugging", "reliability", "long context"]
    },
    {
        id: "anthropic/claude-sonnet-4",
        provider: "openrouter",
        coding: 88, agentic: 86, intelligence: 87,
        speed: "medium",
        bestFor: ["fullstack dev", "agentic coding", "architecture", "debugging"]
    },
    {
        id: "x-ai/grok-4.20-beta",
        provider: "openrouter",
        coding: 85, agentic: 82, intelligence: 82,
        speed: "medium",
        bestFor: ["coding", "reasoning", "multi-agent workflows"]
    },
    {
        id: "openai/o3",
        provider: "openrouter",
        coding: 95, agentic: 82, intelligence: 95,
        speed: "slow",
        bestFor: ["hard math", "research-level coding", "complex reasoning"]
    },

    // ─── Tier A: Strong & Cost-Effective ───
    {
        id: "openai/gpt-4.1",
        provider: "openrouter",
        coding: 85, agentic: 85, intelligence: 83,
        speed: "medium",
        bestFor: ["coding", "instruction following", "tool use"]
    },
    {
        id: "google/gemini-2.5-pro",
        provider: "openrouter",
        coding: 82, agentic: 80, intelligence: 82,
        speed: "medium",
        bestFor: ["long context", "analysis", "multimodal", "coding"]
    },
    {
        id: "deepseek/deepseek-chat",
        provider: "openrouter",
        coding: 82, agentic: 70, intelligence: 75,
        speed: "fast",
        bestFor: ["coding", "math", "best value-per-line coding"]
    },
    {
        id: "deepseek/deepseek-r1",
        provider: "openrouter",
        coding: 83, agentic: 72, intelligence: 80,
        speed: "slow",
        bestFor: ["complex reasoning", "hard coding problems", "math"]
    },
    {
        id: "nvidia/nemotron-3-super",
        provider: "openrouter",
        coding: 78, agentic: 75, intelligence: 76,
        speed: "fast",
        bestFor: ["coding", "general tasks", "open-source", "cost-effective"]
    },
    {
        id: "qwen/qwen-2.5-coder-32b-instruct",
        provider: "openrouter",
        coding: 80, agentic: 62, intelligence: 68,
        speed: "fast",
        bestFor: ["coding", "code completion", "refactoring", "runs on laptop"]
    },
    {
        id: "zhipu/glm-4.5",
        provider: "openrouter",
        coding: 78, agentic: 72, intelligence: 74,
        speed: "medium",
        bestFor: ["coding", "reasoning", "agentic tasks"]
    },
    {
        id: "openai/gpt-4o",
        provider: "openrouter",
        coding: 78, agentic: 82, intelligence: 78,
        speed: "fast",
        bestFor: ["agentic tasks", "tool use", "multimodal", "coding"]
    },
    {
        id: "mistralai/codestral-2501",
        provider: "openrouter",
        coding: 78, agentic: 58, intelligence: 65,
        speed: "fast",
        bestFor: ["code generation", "fast iterations", "cost-effective coding"]
    },
    {
        id: "meta-llama/llama-3.3-70b-instruct",
        provider: "openrouter",
        coding: 72, agentic: 65, intelligence: 70,
        speed: "fast",
        bestFor: ["coding", "general tasks", "open-source"]
    },
    {
        id: "mistralai/mistral-large-2411",
        provider: "openrouter",
        coding: 75, agentic: 70, intelligence: 72,
        speed: "medium",
        bestFor: ["coding", "reasoning", "multilingual"]
    },

    // ─── Tier B: Fast & Cheap ───
    {
        id: "google/gemini-2.5-flash",
        provider: "openrouter",
        coding: 72, agentic: 68, intelligence: 70,
        speed: "fast",
        bestFor: ["fast coding", "simple tasks", "ultra cheap", "long context"]
    },
    {
        id: "google/gemini-3-flash",
        provider: "openrouter",
        coding: 75, agentic: 72, intelligence: 73,
        speed: "fast",
        bestFor: ["fast tasks", "coding", "cost-effective", "multimodal"]
    },
    {
        id: "anthropic/claude-haiku-4-5",
        provider: "openrouter",
        coding: 65, agentic: 58, intelligence: 60,
        speed: "fast",
        bestFor: ["simple tasks", "formatting", "docs", "config", "tests"]
    },
    {
        id: "openai/gpt-4o-mini",
        provider: "openrouter",
        coding: 68, agentic: 70, intelligence: 65,
        speed: "fast",
        bestFor: ["simple coding", "fast tasks", "cost-effective"]
    },
    {
        id: "openai/o4-mini",
        provider: "openrouter",
        coding: 75, agentic: 72, intelligence: 72,
        speed: "fast",
        bestFor: ["reasoning", "coding", "cost-optimized reasoning"]
    },
    {
        id: "mistralai/mistral-small-2503",
        provider: "openrouter",
        coding: 62, agentic: 55, intelligence: 58,
        speed: "fast",
        bestFor: ["simple tasks", "formatting", "lightweight"]
    },
    {
        id: "microsoft/phi-4",
        provider: "openrouter",
        coding: 65, agentic: 50, intelligence: 62,
        speed: "fast",
        bestFor: ["simple coding", "lightweight tasks", "ultra cheap"]
    },
];

/**
 * Get benchmark info for a model by its ID (partial match).
 */
export function getBenchmarkForModel(modelId: string): ModelBenchmark | undefined {
    return MODEL_BENCHMARKS.find(b => 
        modelId.includes(b.id) || b.id.includes(modelId)
    );
}

/**
 * Format benchmark data as a string for injection into prompts.
 * Sorted by coding score descending.
 */
export function formatBenchmarksForPrompt(): string {
    return MODEL_BENCHMARKS
        .sort((a, b) => b.coding - a.coding)
        .map(b => `- ${b.id} | provider: "${b.provider}" | Coding: ${b.coding}/100 | Agentic: ${b.agentic}/100 | Intelligence: ${b.intelligence}/100 | Speed: ${b.speed} | Best for: ${b.bestFor.join(", ")}`)
        .join("\n");
}
