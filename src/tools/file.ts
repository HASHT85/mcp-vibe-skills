/**
 * VEIST Tool — File I/O: read, write, replace_in_file, memory
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { safePath } from "./system.js";

// ─── Read File ───

export async function readFile(cwd: string, userPath: string): Promise<string> {
    const filePath = safePath(cwd, userPath);
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const MAX_LINES = 500;
    if (lines.length > MAX_LINES) {
        const chunk = lines.slice(0, MAX_LINES).join("\n");
        return `${chunk}\n\n[⚠️ FILE TRUNCATED: ${lines.length} total lines, showing first ${MAX_LINES}. Use bash with sed to read specific line ranges: sed -n '501,1000p' ${userPath}]`;
    }
    return content;
}

// ─── Write File ───

export async function writeFile(cwd: string, userPath: string, content: string): Promise<string> {
    const filePath = safePath(cwd, userPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return `File written: ${userPath}`;
}

// ─── Replace In File (strict — no fuzzy matching) ───

export async function replaceInFile(
    cwd: string,
    userPath: string,
    targetStr: string,
    replacementStr: string
): Promise<string> {
    const filePath = safePath(cwd, userPath);
    let content = await fs.readFile(filePath, "utf-8");
    if (content.includes(targetStr)) {
        content = content.replace(targetStr, replacementStr);
        await fs.writeFile(filePath, content, "utf-8");
        return `Successfully replaced content in ${userPath}`;
    }
    // SEC-HARDENED: No fuzzy matching — agent must provide exact target string
    return `Error: Target string not found in file. Ensure EXACT match including all whitespace and newlines. No fuzzy fallback is available.`;
}

// ─── Shared Memory ───

export async function readMemory(cwd: string, key: string): Promise<string> {
    try {
        const memPath = path.resolve(cwd, ".veist_memory.json");
        let memStr = "{}";
        try {
            memStr = await fs.readFile(memPath, "utf-8");
        } catch {
            // no memory file yet
        }
        const mem = JSON.parse(memStr);
        if (mem[key] !== undefined) {
            return String(mem[key]);
        }
        return `Memory key "${key}" is empty/undefined.`;
    } catch (err: any) {
        return `Memory read error: ${err.message}`;
    }
}

export async function writeMemory(cwd: string, key: string, value: string): Promise<string> {
    try {
        const memPath = path.resolve(cwd, ".veist_memory.json");
        let memStr = "{}";
        try {
            memStr = await fs.readFile(memPath, "utf-8");
        } catch {
            // no memory file yet
        }
        const mem = JSON.parse(memStr);
        mem[key] = value;
        // QUAL-43: Atomic write to prevent corruption on crash
        const memTmp = `${memPath}.tmp`;
        await fs.writeFile(memTmp, JSON.stringify(mem, null, 2), "utf-8");
        await fs.rename(memTmp, memPath);
        return `Saved "${key}" to shared memory.`;
    } catch (err: any) {
        return `Memory write error: ${err.message}`;
    }
}
