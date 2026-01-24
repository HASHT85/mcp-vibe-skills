import * as cheerio from "cheerio";

export type SkillItem = { title: string; href?: string };

export async function fetchTrending(limit = 20): Promise<SkillItem[]> {
    const res = await fetch("https://skills.sh/trending", {
        headers: { "user-agent": "mcp-vibe-skills/1.0" }
    });
    if (!res.ok) throw new Error(`skills.sh http ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Heuristique : extraire des liens internes (à affiner si besoin)
    const items: SkillItem[] = [];
    $("a[href]").each((_, a) => {
        const href = String($(a).attr("href"));
        const title = $(a).text().trim();
        if (!title) return;
        if (href.startsWith("/") && href.length > 1) {
            items.push({ title, href: `https://skills.sh${href}` });
        }
    });

    // dédup
    const uniq = new Map<string, SkillItem>();
    for (const it of items) uniq.set(it.href ?? it.title, it);

    return Array.from(uniq.values()).slice(0, limit);
}
