/**
 * Secrets Service — Secure storage for pipeline secrets (API keys, passwords, etc.)
 * Secrets are stored on disk, never sent to AI, and injected into project .env files.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface SecretEntry {
    key: string;
    value: string;
}

export class SecretsService {
    private secrets: Map<string, Record<string, string>> = new Map();
    private filePath: string;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(storePath?: string) {
        const baseDir = path.dirname(storePath || process.env.STORE_PATH || "/data/store.json");
        this.filePath = path.join(baseDir, "secrets.json");
        this.loadFromDisk();
    }

    // ─── Persistence ───

    private async loadFromDisk() {
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            const raw = await fs.readFile(this.filePath, "utf-8");
            const data = JSON.parse(raw);
            if (data.secrets && typeof data.secrets === "object") {
                for (const [pipelineId, secrets] of Object.entries(data.secrets)) {
                    this.secrets.set(pipelineId, secrets as Record<string, string>);
                }
                console.log(`🔐 SecretsService: Loaded secrets for ${this.secrets.size} pipelines`);
            }
        } catch {
            console.log("🔐 SecretsService: No saved secrets found, starting fresh");
        }
    }

    private scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToDisk(), 300);
    }

    private async saveToDisk() {
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            const data = {
                secrets: Object.fromEntries(this.secrets),
                savedAt: new Date().toISOString(),
            };
            const tmp = `${this.filePath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
            await fs.rename(tmp, this.filePath);
        } catch (err) {
            console.error("🔐 SecretsService: Failed to save:", err);
        }
    }

    // ─── CRUD ───

    setSecrets(pipelineId: string, secrets: Record<string, string>): void {
        // Merge with existing secrets (don't overwrite all if only updating some)
        const existing = this.secrets.get(pipelineId) || {};
        this.secrets.set(pipelineId, { ...existing, ...secrets });
        this.scheduleSave();
    }

    getSecrets(pipelineId: string): Record<string, string> {
        return this.secrets.get(pipelineId) || {};
    }

    /** Returns secrets with masked values for frontend display */
    getMaskedSecrets(pipelineId: string): Record<string, string> {
        const secrets = this.getSecrets(pipelineId);
        const masked: Record<string, string> = {};
        for (const [key, value] of Object.entries(secrets)) {
            if (value.length <= 6) {
                masked[key] = "••••••";
            } else {
                masked[key] = value.slice(0, 4) + "••••••" + value.slice(-2);
            }
        }
        return masked;
    }

    deleteSecret(pipelineId: string, key: string): boolean {
        const secrets = this.secrets.get(pipelineId);
        if (!secrets || !(key in secrets)) return false;
        delete secrets[key];
        if (Object.keys(secrets).length === 0) {
            this.secrets.delete(pipelineId);
        }
        this.scheduleSave();
        return true;
    }

    deleteAllSecrets(pipelineId: string): void {
        this.secrets.delete(pipelineId);
        this.scheduleSave();
    }

    /** Generate .env content from secrets */
    toEnvString(pipelineId: string): string {
        const secrets = this.getSecrets(pipelineId);
        if (Object.keys(secrets).length === 0) return "";
        const lines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);
        return lines.join("\n") + "\n";
    }
}
