/**
 * VEIST Tool — System: safePath + bash sandbox
 */

import { spawn } from "node:child_process";
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";

// ─── Security: Path Traversal Guard (SEC-01 + QUAL-42) ───

export function safePath(cwd: string, userPath: string): string {
    const resolved = path.resolve(cwd, userPath);
    // Ensure the resolved path stays within the workspace
    if (!resolved.startsWith(cwd)) {
        throw new Error(`🚫 Path traversal blocked: "${userPath}" resolves outside workspace.`);
    }
    // QUAL-42: Resolve symlinks to prevent symlink-based traversal
    try {
        const real = realpathSync(resolved);
        if (!real.startsWith(cwd)) {
            throw new Error(
                `🚫 Symlink traversal blocked: "${userPath}" resolves outside workspace via symlink.`
            );
        }
        return real;
    } catch (e: any) {
        // File doesn't exist yet (write_file) — allow if path itself is safe
        if (e.code === "ENOENT") return resolved;
        throw e;
    }
}

// ─── Bash Sandbox ───

const BLOCKED_PATTERNS = [
    // Filesystem destruction
    {
        pattern: /rm\s+(-rf?|--recursive)\s+(\/(?!\w)|\/(etc|usr|var|bin|sbin|lib|boot|sys|proc|root|home|tmp|data|opt))/,
        label: "rm -rf system paths",
    },
    { pattern: /mkfs\./, label: "mkfs (format disk)" },
    { pattern: /dd\s+if=\/dev/, label: "dd raw device write" },
    { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, label: "fork bomb" },
    { pattern: /chmod\s+777\s+\/(?!\w)/, label: "chmod 777 /" },
    { pattern: />+\s*\/dev\/sd/, label: "write to raw device" },
    // Remote code execution
    { pattern: /curl\s+.*\|\s*(?:sudo\s+)?(?:ba)?sh/, label: "curl pipe to shell" },
    { pattern: /wget\s+.*\|\s*(?:sudo\s+)?(?:ba)?sh/, label: "wget pipe to shell" },
    { pattern: /base64\s+.*\|\s*(?:ba)?sh/, label: "base64 pipe to shell" },
    // Container escape (SEC-02)
    { pattern: /\bdocker\s+run\b/, label: "docker run (container escape)" },
    { pattern: /\bdocker\s+exec\b.*\bveist\b/, label: "docker exec on veist" },
    // Data exfiltration
    { pattern: /\benv\b.*\bcurl\b/, label: "env exfiltration via curl" },
    { pattern: /\benv\b.*\bwget\b/, label: "env exfiltration via wget" },
    { pattern: /\/proc\/self\/environ/, label: "process env read" },
    // Secrets access
    { pattern: /cat\s+\/data\/secrets/, label: "secrets file read" },
    { pattern: /cat\s+\/data\/store/, label: "store file read" },
    // Interpreter escapes
    {
        pattern: /python[3]?\s+-c\s+.*(?:shutil|subprocess|os\.system)/,
        label: "python destructive command",
    },
    {
        pattern: /node\s+-e\s+.*(?:child_process|fs\.rm|fs\.unlink)/,
        label: "node destructive command",
    },
];

// SEC-16: Only propagate safe env vars to agent sandbox — never leak secrets
const SAFE_ENV_KEYS = new Set([
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TERM",
    "SHELL",
    "USER",
    "LOGNAME",
    "NODE_PATH",
    "NODE_ENV",
    "NPM_CONFIG_PREFIX",
    "NPM_CONFIG_CACHE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "HOSTNAME",
    "SHLVL",
    "PWD",
]);

export function runBash(command: string, cwd: string): Promise<string> {
    for (const { pattern, label } of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
            return Promise.resolve(
                `🚫 BLOCKED: Command not allowed in sandbox mode (${label}). Use safer alternatives.`
            );
        }
    }

    const safeEnv: Record<string, string> = { HOME: "/root" };
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && (SAFE_ENV_KEYS.has(k) || k.startsWith("npm_"))) {
            safeEnv[k] = v;
        }
    }

    return new Promise((resolve) => {
        const proc = spawn("bash", ["-c", command], {
            cwd,
            env: safeEnv,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        // PERF-07: Cap output buffers at 256KB to prevent OOM on large outputs
        const MAX_OUTPUT = 256 * 1024;
        proc.stdout.on("data", (d) => {
            if (stdout.length < MAX_OUTPUT) stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
            if (stderr.length < MAX_OUTPUT) stderr += d.toString();
        });

        // Timeout for bash commands: 180s
        const timeout = setTimeout(() => {
            proc.kill("SIGTERM");
            resolve(`Command timed out after 180s.\nStdout: ${stdout} \nStderr: ${stderr} `);
        }, 180000);

        proc.on("close", (code) => {
            clearTimeout(timeout);
            const output = stdout + (stderr ? `\nStderr: ${stderr} ` : "");
            resolve(code === 0 ? output : `Exit code ${code} \n${output} `);
        });
        proc.on("error", (err) => {
            clearTimeout(timeout);
            resolve(`Spawn error: ${err.message} `);
        });
    });
}

// ─── List directory ───

export async function listDir(dirPath: string): Promise<string> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n");
}
