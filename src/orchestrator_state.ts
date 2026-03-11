import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Pipeline } from "./types.js";

// @ts-ignore
export const STORE_PATH = process.env.PIPELINES_STORE || "/data/pipelines.json";

export async function savePipelinesState(pipelines: Map<string, Pipeline>) {
    try {
        const dir = path.dirname(STORE_PATH);
        await fs.mkdir(dir, { recursive: true });
        const data = Object.fromEntries(pipelines);
        const json = JSON.stringify(data, null, 2);
        // Atomic write: write to tmp then rename (prevents corruption)
        const tmp = `${STORE_PATH}.tmp`;
        await fs.writeFile(tmp, json, "utf-8");
        await fs.rename(tmp, STORE_PATH);
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
