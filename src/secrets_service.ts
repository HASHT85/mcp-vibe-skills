/**
 * Secrets Service — Secure storage for pipeline secrets (API keys, passwords, etc.)
 * Secrets are stored on disk (encrypted), never sent to AI, and injected into project .env files.
 */

import { promises as fs, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface SecretEntry {
    key: string;
    value: string;
}

// SEC-06: Dynamic salt — persisted to disk on first run
const SALT_PATH = path.join(path.dirname(process.env.STORE_PATH || "/data/store.json"), ".salt");
function getOrCreateSalt(): string {
    try {
        if (existsSync(SALT_PATH)) {
            return readFileSync(SALT_PATH, "utf-8").trim();
        }
        const salt = crypto.randomBytes(32).toString('hex');
        const dir = path.dirname(SALT_PATH);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(SALT_PATH, salt, "utf-8");
        console.log("🔑 SecretsService: Generated new encryption salt");
        return salt;
    } catch (err) {
        console.error("🔑 SecretsService: Salt error, using fallback", err);
        return "veist-fallback-salt-change-me";
    }
}

const ALGO = "aes-256-gcm";
function deriveKey(): Buffer {
    const passphrase = process.env.ADMIN_PASS || process.env.SECRET_KEY || "veist-default-key-change-me";
    return crypto.scryptSync(passphrase, getOrCreateSalt(), 32);
}

function encrypt(plaintext: string): string {
    const key = deriveKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(ciphertext: string): string {
    try {
        const [ivHex, tagHex, data] = ciphertext.split(":");
        const key = deriveKey();
        const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        let decrypted = decipher.update(data, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (err) {
        // SEC-09: Never return ciphertext as fallback — log error and return empty
        console.error("🔐 Decryption failed (key may have changed):", (err as Error).message);
        return "";
    }
}

export class SecretsService {
    private secrets: Map<string, Record<string, string>> = new Map();
    private filePath: string;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    public ready: Promise<void>;

    constructor(storePath?: string) {
        const baseDir = path.dirname(storePath || process.env.STORE_PATH || "/data/store.json");
        this.filePath = path.join(baseDir, "secrets.json");
        // Synchronous load to prevent race conditions
        this.loadFromDiskSync();
        // Also schedule async reload for any concurrent writes
        this.ready = this.loadFromDiskAsync();
    }

    // ─── Persistence ───

    /** Synchronous load — prevents race condition where secrets aren't loaded when accessed immediately */
    private loadFromDiskSync() {
        try {
            const dir = path.dirname(this.filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            if (!existsSync(this.filePath)) return;
            
            const raw = readFileSync(this.filePath, "utf-8");
            const data = JSON.parse(raw);
            if (data.secrets && typeof data.secrets === "object") {
                for (const [pipelineId, secrets] of Object.entries(data.secrets)) {
                    if (typeof secrets === "object" && secrets !== null) {
                        // Decrypt values
                        const decrypted: Record<string, string> = {};
                        for (const [key, val] of Object.entries(secrets as Record<string, string>)) {
                            decrypted[key] = (data.encrypted) ? decrypt(val) : val;
                        }
                        this.secrets.set(pipelineId, decrypted);
                    }
                }
                console.log(`🔐 SecretsService: Loaded secrets for ${this.secrets.size} pipelines`);
            }
        } catch {
            console.log("🔐 SecretsService: No saved secrets found, starting fresh");
        }
    }

    /** Async reload — for completeness  */
    private async loadFromDiskAsync() {
        // Already loaded sync, this is a no-op safety net
        return;
    }

    private scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToDisk(), 300);
    }

    private async saveToDisk() {
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            
            // Encrypt all values before saving
            const encryptedSecrets: Record<string, Record<string, string>> = {};
            for (const [pipelineId, secrets] of this.secrets) {
                encryptedSecrets[pipelineId] = {};
                for (const [key, val] of Object.entries(secrets)) {
                    encryptedSecrets[pipelineId][key] = encrypt(val);
                }
            }
            
            const data = {
                encrypted: true,
                secrets: encryptedSecrets,
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

    /** Generate .env content from secrets — properly escapes values */
    toEnvString(pipelineId: string): string {
        const secrets = this.getSecrets(pipelineId);
        if (Object.keys(secrets).length === 0) return "";
        const lines = Object.entries(secrets).map(([k, v]) => {
            // Escape values: wrap in quotes if contains spaces, =, or newlines
            const needsQuotes = /[\s=\n\r"'#]/.test(v);
            const escaped = needsQuotes ? `"${v.replace(/"/g, '\\"')}"` : v;
            return `${k}=${escaped}`;
        });
        return lines.join("\n") + "\n";
    }
}

// ─── Singleton ───
let _instance: SecretsService | null = null;
export function getSecretsService(): SecretsService {
    if (!_instance) _instance = new SecretsService();
    return _instance;
}
