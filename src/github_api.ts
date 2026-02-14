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

    // 2. Create repo
    const res = await fetch(`${GITHUB_API}/user/repos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name,
            description,
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

export async function createWebhook(owner: string, repo: string, webhookUrl: string) {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: "web",
            active: true,
            events: ["push"],
            config: {
                url: webhookUrl,
                content_type: "json",
                insecure_ssl: "0"
            }
        })
    });

    if (!res.ok) {
        // Ignore if already exists or other non-critical error for now, but helpful to log
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
