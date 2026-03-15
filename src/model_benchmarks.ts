/**
 * Model Performance Benchmarks
 * Sources: artificialanalysis.ai (Intelligence Index, Coding Index, Agentic Index)
 * Updated: 2025-03 (scores normalized 0-100)
 * 
 * These scores help the Planner pick the BEST model for each agent task,
 * balancing quality and cost.
 */

export interface ModelBenchmark {
    id: string;                // OpenRouter model ID or Anthropic model name
    provider: "anthropic" | "openrouter";
    coding: number;            // Coding capability (0-100)
    agentic: number;           // Agentic/tool-use capability (0-100)
    intelligence: number;      // General intelligence index (0-100)
    speed: "fast" | "medium" | "slow"; // Relative speed
    bestFor: string[];         // What this model excels at
}

/**
 * Curated benchmark scores for models available via OpenRouter and Anthropic.
 * Scores are normalized 0-100 based on public benchmarks.
 * This should be periodically updated with latest benchmark data.
 */
export const MODEL_BENCHMARKS: ModelBenchmark[] = [
    // ─── Tier S: Frontier Models (best quality) ───
    {
        id: "claude-sonnet-4-6",
        provider: "anthropic",
        coding: 92, agentic: 90, intelligence: 88,
        speed: "medium",
        bestFor: ["complex coding", "architecture", "fullstack dev", "debugging"]
    },
    {
        id: "anthropic/claude-sonnet-4",
        provider: "openrouter",
        coding: 92, agentic: 90, intelligence: 88,
        speed: "medium",
        bestFor: ["complex coding", "architecture", "fullstack dev"]
    },
    {
        id: "openai/gpt-4.1",
        provider: "openrouter",
        coding: 90, agentic: 88, intelligence: 87,
        speed: "medium",
        bestFor: ["coding", "reasoning", "instruction following"]
    },
    {
        id: "google/gemini-2.5-pro",
        provider: "openrouter",
        coding: 88, agentic: 85, intelligence: 90,
        speed: "medium",
        bestFor: ["long context", "analysis", "multi-modal", "coding"]
    },
    {
        id: "openai/o3",
        provider: "openrouter",
        coding: 95, agentic: 85, intelligence: 95,
        speed: "slow",
        bestFor: ["hard math", "complex reasoning", "research-level coding"]
    },

    // ─── Tier A: Strong Models (good quality, reasonable cost) ───
    {
        id: "anthropic/claude-3.5-sonnet",
        provider: "openrouter",
        coding: 85, agentic: 82, intelligence: 80,
        speed: "fast",
        bestFor: ["coding", "analysis", "writing"]
    },
    {
        id: "deepseek/deepseek-chat",
        provider: "openrouter",
        coding: 82, agentic: 70, intelligence: 75,
        speed: "fast",
        bestFor: ["coding", "math", "cost-effective development"]
    },
    {
        id: "deepseek/deepseek-r1",
        provider: "openrouter",
        coding: 85, agentic: 72, intelligence: 82,
        speed: "slow",
        bestFor: ["complex reasoning", "math", "hard coding problems"]
    },
    {
        id: "qwen/qwen-2.5-coder-32b-instruct",
        provider: "openrouter",
        coding: 80, agentic: 65, intelligence: 70,
        speed: "fast",
        bestFor: ["coding", "code completion", "refactoring"]
    },
    {
        id: "mistralai/codestral-2501",
        provider: "openrouter",
        coding: 78, agentic: 60, intelligence: 68,
        speed: "fast",
        bestFor: ["coding", "code generation", "fast iterations"]
    },
    {
        id: "openai/gpt-4o",
        provider: "openrouter",
        coding: 82, agentic: 85, intelligence: 82,
        speed: "fast",
        bestFor: ["coding", "agentic tasks", "tool use", "multi-modal"]
    },
    {
        id: "openai/gpt-4o-mini",
        provider: "openrouter",
        coding: 70, agentic: 72, intelligence: 68,
        speed: "fast",
        bestFor: ["simple coding", "fast tasks", "cost-effective"]
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
        coding: 75, agentic: 70, intelligence: 74,
        speed: "medium",
        bestFor: ["coding", "reasoning", "multilingual"]
    },

    // ─── Tier B: Fast & Cheap (simple tasks) ───
    {
        id: "claude-haiku-4-5",
        provider: "anthropic",
        coding: 65, agentic: 60, intelligence: 60,
        speed: "fast",
        bestFor: ["simple tasks", "formatting", "docs", "config", "tests"]
    },
    {
        id: "google/gemini-2.5-flash",
        provider: "openrouter",
        coding: 72, agentic: 68, intelligence: 70,
        speed: "fast",
        bestFor: ["fast coding", "simple tasks", "cost-effective", "long context"]
    },
    {
        id: "google/gemini-2.0-flash-001",
        provider: "openrouter",
        coding: 68, agentic: 65, intelligence: 65,
        speed: "fast",
        bestFor: ["simple coding", "fast tasks", "ultra cheap"]
    },
    {
        id: "mistralai/mistral-small-2503",
        provider: "openrouter",
        coding: 62, agentic: 55, intelligence: 58,
        speed: "fast",
        bestFor: ["simple tasks", "formatting", "lightweight"]
    },
    {
        id: "qwen/qwen-2.5-72b-instruct",
        provider: "openrouter",
        coding: 70, agentic: 60, intelligence: 68,
        speed: "medium",
        bestFor: ["coding", "chinese content", "general tasks"]
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
