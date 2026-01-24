import * as cheerio from "cheerio";

export type SkillItem = {
    rank?: number;
    title: string;
    href: string;
    owner: string;
    repo: string;
    skill: string;
    installs?: number; // ex: 7100
    installs_display?: string; // ex: "7.1K"
};

function parseSkillUrl(href: string) {
    // ex: /vercel-labs/agent-skills/web-design-guidelines
    const m = href.match(/^\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m) return null;
    const [, owner, repo, skill] = m;
    return { owner, repo, skill };
}

function parseCompactNumber(s: string): number | undefined {
    // "7.1K" -> 7100, "1.3K" -> 1300, "950" -> 950
    const m = s.match(/(\d+(?:\.\d+)?)\s*([KMB])?/i);
    if (!m) return;
    const n = Number(m[1]);
    if (Number.isNaN(n)) return;
    const u = (m[2] || "").toUpperCase();
    const mult = u === "K" ? 1_000 : u === "M" ? 1_000_000 : u === "B" ? 1_000_000_000 : 1;
    return Math.round(n * mult);
}

function titleFromSlug(slug: string) {
    return slug.replace(/[-_]+/g, " ").trim();
}

async function fetchListPage(url: string, limit = 20): Promise<SkillItem[]> {
    const res = await fetch(url, {
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
        if (!parsed) return; // keep only skill links

        const href = `https://skills.sh${hrefRaw}`;

        // Raw text can be concatenated: "1titleowner/repo7.1K"
        const raw = $(a).text().replace(/\s+/g, " ").trim();

        // Rank often at beginning
        const rankMatch = raw.match(/^(\d{1,3})/);
        const rank = rankMatch ? Number(rankMatch[1]) : undefined;

        // Installs often near end "7.1K"
        const installsMatch =
            raw.match(/(\d+(?:\.\d+)?\s*[KMB])\s*$/i) ||
            raw.match(/(\d+(?:\.\d+)?\s*[KMB])\b/i);

        const installs_display = installsMatch ? installsMatch[1].replace(/\s+/g, "") : undefined;
        const installs = installs_display ? parseCompactNumber(installs_display) : undefined;

        // Title: prefer slug (stable)
        const title = titleFromSlug(parsed.skill);

        items.push({
            rank,
            title,
            href,
            owner: parsed.owner,
            repo: parsed.repo,
            skill: parsed.skill,
            installs,
            installs_display
        });
    });

    // Dedup by href + limit
    const uniq = new Map<string, SkillItem>();
    for (const it of items) uniq.set(it.href, it);

    return Array.from(uniq.values()).slice(0, limit);
}

export async function fetchTrending(limit = 20): Promise<SkillItem[]> {
    return fetchListPage("https://skills.sh/trending", limit);
}

export async function fetchHot(limit = 20): Promise<SkillItem[]> {
    return fetchListPage("https://skills.sh/hot", limit);
}

export async function searchSkills(q: string, limit = 20): Promise<SkillItem[]> {
    const term = q.toLowerCase().trim();
    if (!term) return [];

    const [t, h] = await Promise.all([fetchTrending(50), fetchHot(50)]);
    const merged = [...t, ...h];

    const uniq = new Map<string, SkillItem>();
    for (const it of merged) uniq.set(it.href, it);

    const filtered = Array.from(uniq.values()).filter((it) =>
        it.title.toLowerCase().includes(term) ||
        it.owner.toLowerCase().includes(term) ||
        it.repo.toLowerCase().includes(term) ||
        it.skill.toLowerCase().includes(term)
    );

    return filtered.slice(0, limit);
}
