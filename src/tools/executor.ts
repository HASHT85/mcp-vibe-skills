/**
 * VEIST Tool Executor — Central dispatcher for all agent tools.
 * Routes tool calls to the appropriate module (file, system, web).
 */

import { safePath, runBash, listDir } from "./system.js";
import { readFile, writeFile, replaceInFile, readMemory, writeMemory } from "./file.js";
import { webSearch, fetchUrl } from "./web.js";

export async function executeTool(
    name: string,
    input: Record<string, any>,
    cwd: string
): Promise<string> {
    try {
        switch (name) {
            case "read_file":
                return await readFile(cwd, input.path);

            case "write_file":
                return await writeFile(cwd, input.path, input.content);

            case "list_dir":
                return await listDir(safePath(cwd, input.path || "."));

            case "bash":
                return await runBash(input.command, cwd);

            case "replace_in_file":
                return await replaceInFile(cwd, input.path, input.targetStr, input.replacementStr);

            case "web_search":
                return await webSearch(input.query);

            case "fetch_url":
                return await fetchUrl(input.url);

            case "read_memory":
                return await readMemory(cwd, input.key);

            case "write_memory":
                return await writeMemory(cwd, input.key, input.value);

            default:
                return `Unknown tool: ${name} `;
        }
    } catch (err: any) {
        return `Error: ${err.message} `;
    }
}

// ─── Tool Definitions (OpenAI function-calling format) ───

export const TOOLS: any[] = [
    {
        name: "read_file",
        description: "Read the contents of a file at the given path.",
        input_schema: {
            type: "object" as const,
            properties: { path: { type: "string", description: "Path to the file to read" } },
            required: ["path"],
        },
    },
    {
        name: "write_file",
        description: "Write content to a file. Creates parent directories if needed.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path to write to" },
                content: { type: "string", description: "Content to write" },
            },
            required: ["path", "content"],
        },
    },
    {
        name: "list_dir",
        description: "List files and directories in the given path.",
        input_schema: {
            type: "object" as const,
            properties: { path: { type: "string", description: "Directory path to list" } },
            required: ["path"],
        },
    },
    {
        name: "bash",
        description:
            "Run a bash command and return its output. Use for npm install, building, testing, etc.",
        input_schema: {
            type: "object" as const,
            properties: {
                command: { type: "string", description: "The bash command to run" },
            },
            required: ["command"],
        },
    },
    {
        name: "replace_in_file",
        description:
            "Replace a specific exact string block in a file with another string block. Use this instead of write_file when editing existing large files.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path to the file to modify" },
                targetStr: {
                    type: "string",
                    description:
                        "The EXACT current string in the file to replace (including indentation/newlines)",
                },
                replacementStr: {
                    type: "string",
                    description: "The new string to put in its place",
                },
            },
            required: ["path", "targetStr", "replacementStr"],
        },
    },
    {
        name: "web_search",
        description:
            "Search the web to find up-to-date documentation or fixes for errors.",
        input_schema: {
            type: "object" as const,
            properties: {
                query: {
                    type: "string",
                    description: "Search query (e.g. 'Next.js 14 app router middleware example')",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "fetch_url",
        description:
            "Fetch the text content of a generic URL. Useful for reading documentation pages or GitHub issues you found via web_search. Fails on heavy JS single-page-apps.",
        input_schema: {
            type: "object" as const,
            properties: {
                url: { type: "string", description: "The exact URL to scrape" },
            },
            required: ["url"],
        },
    },
    {
        name: "read_memory",
        description: "Read a value from the shared project memory space.",
        input_schema: {
            type: "object" as const,
            properties: {
                key: { type: "string", description: "The memory key to read" },
            },
            required: ["key"],
        },
    },
    {
        name: "write_memory",
        description:
            "Write a value to the shared project memory space so that other agents can see it.",
        input_schema: {
            type: "object" as const,
            properties: {
                key: { type: "string", description: "The memory key to write" },
                value: { type: "string", description: "The string value to save" },
            },
            required: ["key", "value"],
        },
    },
];
