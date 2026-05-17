// import fetch from 'node-fetch'; // Using global fetch

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = "https://api.github.com";

if (!GITHUB_TOKEN) {
    console.error("Missing GITHUB_TOKEN in environment variables");
}

const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "Accept": "application/vnd.github.v3+json"
};

export async function getUser() {
    const res = await fetch(`${GITHUB_API}/user`, { headers });
    if (!res.ok) throw new Error(`Failed to get user: ${res.statusText}`);
    return res.json();
}

export async function createRepo(name: string, description: string) {
    // 1. Get authenticated user
    const user: any = await getUser();
    const owner = user.login;

    // 2. Sanitize description: strip control chars, truncate to 350
    const safeDesc = String(description || "")
        .replace(/[\x00-\x1F\x7F]/g, " ")   // strip control characters
        .replace(/\s+/g, " ")                 // collapse whitespace
        .trim()
        .slice(0, 350);

    // 3. Create repo
    const res = await fetch(`${GITHUB_API}/user/repos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name,
            description: safeDesc,
            private: true, // Default to private
            auto_init: true // Create README to allow immediate pushes
        })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed to create repo: ${JSON.stringify(err)}`);
    }

    const repo = await res.json();
    return { owner, name: repo.name, url: repo.html_url, clone_url: repo.clone_url };
}

export async function deleteRepo(owner: string, repo: string) {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        method: 'DELETE',
        headers
    });
    if (!res.ok && res.status !== 404) {
        const err = await res.json();
        throw new Error(`Failed to delete repo: ${JSON.stringify(err)}`);
    }
    return true;
}

// SEC-08: Generate deterministic webhook secret from ADMIN_PASS
const WEBHOOK_SECRET = process.env.ADMIN_PASS
    ? require('node:crypto').createHmac('sha256', process.env.ADMIN_PASS).update('veist-webhook').digest('hex').slice(0, 32)
    : undefined;

export function getWebhookSecret(): string | undefined {
    return WEBHOOK_SECRET;
}

export async function createWebhook(owner: string, repo: string, webhookUrl: string) {
    const config: Record<string, string> = {
        url: webhookUrl,
        content_type: "json",
        insecure_ssl: "0",
    };
    // SEC-08: Attach webhook secret if available
    if (WEBHOOK_SECRET) {
        config.secret = WEBHOOK_SECRET;
    }

    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: "web",
            active: true,
            events: ["push"],
            config,
        })
    });

    if (!res.ok) {
        console.error(`Failed to create webhook: ${res.statusText}`);
        return null;
    }
    return res.json();
}

export async function pushFiles(owner: string, repo: string, files: { path: string; content: string }[], message: string) {
    const baseUrl = `${GITHUB_API}/repos/${owner}/${repo}`;

    // 1. Get latest commit SHA of main branch
    const refRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
    if (!refRes.ok) throw new Error("Failed to get main branch ref");
    const refData: any = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 2. Get tree SHA of latest commit
    const commitRes = await fetch(`${baseUrl}/git/commits/${latestCommitSha}`, { headers });
    const commitData: any = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create a new tree with new files
    // Sanitize paths: remove leading slashes and ./
    const treePayload = {
        base_tree: baseTreeSha,
        tree: files.map(f => ({
            path: f.path.replace(/^\/+/, '').replace(/^\.\//, ''), // Remove leading / or ./
            mode: "100644", // bulb mode
            type: "blob",
            content: f.content
        }))
    };

    console.log(`[GitHub] Creating tree with ${files.length} files. First file: ${files[0]?.path}`);

    const treeRes = await fetch(`${baseUrl}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify(treePayload)
    });
    if (!treeRes.ok) {
        const err = await treeRes.json();
        console.error(`[GitHub] Tree creation failed:`, JSON.stringify(err, null, 2));
        throw new Error(`Failed to create tree: ${JSON.stringify(err)}`);
    }
    const treeData: any = await treeRes.json();
    const newTreeSha = treeData.sha;

    // 4. Create commit
    const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            message,
            tree: newTreeSha,
            parents: [latestCommitSha]
        })
    });
    if (!newCommitRes.ok) throw new Error("Failed to create commit");
    const newCommitData: any = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 5. Update reference (push)
    const updateRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
            sha: newCommitSha
        })
    });
    if (!updateRes.ok) throw new Error("Failed to update ref");

    return true;
}

// Fetch repo structure + key files for AI context
const KEY_FILES = [
    "package.json", "index.html", "vite.config.ts", "vite.config.js",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "nginx.conf", "README.md", "src/App.tsx", "src/App.jsx",
    "src/App.vue", "src/main.tsx", "src/main.jsx", "src/main.ts",
    "src/index.ts", "src/index.js",
];

export async function getRepoContext(owner: string, repo: string): Promise<string> {
    const baseUrl = `${GITHUB_API}/repos/${owner}/${repo}`;
    const parts: string[] = [];

    // 1. Fetch file tree
    try {
        const treeRes = await fetch(`${baseUrl}/git/trees/main?recursive=1`, { headers });
        if (treeRes.ok) {
            const treeData: any = await treeRes.json();
            const filePaths = (treeData.tree || [])
                .filter((f: any) => f.type === "blob")
                .map((f: any) => f.path);
            parts.push(`## Structure du repo (${filePaths.length} fichiers)`);
            parts.push("```");
            parts.push(filePaths.join("\n"));
            parts.push("```");
        }
    } catch {}

    // 2. Fetch key files content
    for (const filePath of KEY_FILES) {
        try {
            const res = await fetch(`${baseUrl}/contents/${filePath}`, { headers });
            if (res.ok) {
                const data: any = await res.json();
                if (data.content && data.encoding === "base64") {
                    const content = Buffer.from(data.content, "base64").toString("utf-8");
                    // Truncate large files
                    const truncated = content.length > 3000 
                        ? content.slice(0, 3000) + "\n[... TRUNCATED ...]" 
                        : content;
                    parts.push(`## ${filePath}`);
                    parts.push("```");
                    parts.push(truncated);
                    parts.push("```");
                }
            }
        } catch {}
    }

    return parts.join("\n");
}
