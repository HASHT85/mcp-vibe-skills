/**
 * VEIST Runtime Configuration — Zod-validated environment
 *
 * Validates all required environment variables at startup.
 * The server will fail fast with a clear error message instead of
 * crashing silently mid-execution when a key is missing.
 */

import { z } from "zod";

const envSchema = z.object({
    // Required — agent engine won't work without this
    OPENROUTER_API_KEY: z
        .string()
        .min(10, "OPENROUTER_API_KEY must be a valid API key")
        .describe("OpenRouter API key for LLM access"),

    // Optional with defaults
    AI_MODEL: z.string().default("anthropic/claude-sonnet-4").describe("Default model for VEIST agents"),

    PORT: z.string().regex(/^\d+$/, "PORT must be a numeric string").default("3000").describe("HTTP server port"),

    MAX_TOKENS_PER_AGENT: z
        .string()
        .regex(/^\d+$/, "MAX_TOKENS_PER_AGENT must be numeric")
        .default("0")
        .describe("Token budget per agent run (0 = unlimited)"),

    // Optional keys — features degrade gracefully if missing
    TAVILY_API_KEY: z.string().optional().describe("Tavily API key — required for web_search tool"),

    GITHUB_TOKEN: z.string().optional().describe("GitHub PAT — required for repo creation feature"),

    HOSTINGER_API_KEY: z.string().optional().describe("Hostinger API key — required for deployment features"),

    STORE_PATH: z.string().default("/data/store.json").describe("Path to the persistent data store"),

    NODE_ENV: z.enum(["development", "production", "test"]).default("production").describe("Node environment"),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Validates and returns the parsed configuration.
 * Throws a descriptive error on startup if required variables are missing.
 */
export function loadConfig(): AppConfig {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
        throw new Error(
            `[Config] ❌ Invalid environment configuration:\n${errors}\n\n` +
                `Please check your .env file against .env.example`
        );
    }

    const config = result.data;

    // Warn about missing optional keys that degrade functionality
    if (!config.TAVILY_API_KEY) {
        console.warn("[Config] ⚠️  TAVILY_API_KEY not set — web_search tool is disabled");
    }
    if (!config.GITHUB_TOKEN) {
        console.warn("[Config] ⚠️  GITHUB_TOKEN not set — repo creation is disabled");
    }

    console.log(`[Config] ✅ Environment validated (model: ${config.AI_MODEL}, port: ${config.PORT})`);
    return config;
}

// Singleton — loaded once at startup
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
    if (!_config) {
        _config = loadConfig();
    }
    return _config;
}
