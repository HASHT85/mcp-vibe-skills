import * as cheerio from "cheerio";

export type SkillItem = {
    title: string;
    href: string;
    owner?: string;
    repo?: string;
    skill?: string;
};

function parseSkillUrl(href: string) {
    // ex: /vercel-labs/agent-skills/vercel-react-best-practices
    const m = href.match(/^\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m) return null;
    const [, owner, repo, skill] = m;
    return { owner, repo, skill };
}

export async function fetchTrending(limit = 20): Promise<SkillItem[]> {
    const res = await fetch("https://skills.sh/trending", {
        headers: { "user-agent": "mcp-vibe-skills/1.0" }
    });
    if (!res.ok) throw new Error(`skills.sh http ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const items: SkillItem[] = [];

    $("a[href]").each((_, a) => {
        const hrefRaw = String($(a).attr("href") || "");
        if (!hrefRaw.startsWith("/")) return;

        const parsed = parseSkillUrl(hrefRaw);
        if (!parsed) return; // garde uniquement les URLs "skill"

        const href = `https://skills.sh${hrefRaw}`;

        // Texte brut du lien, on nettoie
        const text = $(a).text().replace(/\s+/g, " ").trim();
        const title =
            text && text.length < 120
                ? text
                : parsed.skill.replace(/[-_]/g, " ");

        items.push({ title, href, ...parsed });
    });

    // dédup + limit
    const uniq = new Map<string, SkillItem>();
    for (const it of items) uniq.set(it.href, it);

    return Array.from(uniq.values()).slice(0, limit);
}
