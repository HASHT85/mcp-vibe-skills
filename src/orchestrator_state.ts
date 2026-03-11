import * as fs from "node:fs/promises";
import type { Pipeline } from "./types.js";

// @ts-ignore
export const STORE_PATH = process.env.PIPELINES_STORE || "/data/pipelines.json";

export async function savePipelinesState(pipelines: Map<string, Pipeline>) {
    try {
        const data = Object.fromEntries(pipelines);
        await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.warn("[Orchestrator] Failed to save state:", err);
    }
}

export async function loadPipelinesState(pipelines: Map<string, Pipeline>) {
    console.log(`[Orchestrator] Loading state from: ${STORE_PATH}`);
    try {
        const raw = await fs.readFile(STORE_PATH, "utf-8");
        const data = JSON.parse(raw);
        const keys = Object.keys(data);
        console.log(`[Orchestrator] Parsed ${keys.length} entries from state file`);
        for (const [k, v] of Object.entries(data)) {
            pipelines.set(k, v as Pipeline);
        }
        console.log(`[Orchestrator] Loaded ${pipelines.size} pipelines from state`);
    } catch (err) {
        console.error(`[Orchestrator] ERROR loading state from ${STORE_PATH}:`, err);
    }
}
