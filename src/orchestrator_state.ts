import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Pipeline } from "./types.js";

export const STORE_PATH = process.env.PIPELINES_STORE || "/data/pipelines.json";

// QUAL-17: Promise-chain ensures saves are queued, not silently dropped
let saveQueue: Promise<void> = Promise.resolve();

async function doSave(pipelines: Map<string, Pipeline>) {
    try {
        const dir = path.dirname(STORE_PATH);
        await fs.mkdir(dir, { recursive: true });
        const data = Object.fromEntries(pipelines);
        const json = JSON.stringify(data, null, 2);
        // Atomic write: write to tmp then rename (prevents corruption)
        const tmp = `${STORE_PATH}.tmp`;
        await fs.writeFile(tmp, json, "utf-8");
        try {
            await fs.rename(tmp, STORE_PATH);
        } catch {
            // Fallback: direct write if rename fails
            await fs.writeFile(STORE_PATH, json, "utf-8");
            try { await fs.unlink(tmp); } catch {}
        }
    } catch (err) {
        console.warn("[Orchestrator] Failed to save state:", err);
    }
}

export async function savePipelinesState(pipelines: Map<string, Pipeline>) {
    saveQueue = saveQueue.then(() => doSave(pipelines)).catch(() => {});
    return saveQueue;
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
