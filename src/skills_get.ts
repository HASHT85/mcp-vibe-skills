import * as cheerio from "cheerio";

export type SkillDetail = {
    href: string;
    owner: string;
    repo: string;
    skill: string;
    title?: string;
    description?: string;
    sections?: Array<{ heading: string; content: string }>;
};

function cleanText(s: string) {
    return s.replace(/\s+/g, " ").trim();
}

function titleFromSlug(slug: string) {
    return slug.replace(/[-_]+/g, " ").trim();
}

export async function fetchSkillDetail(owner: string, repo: string, skill: string): Promise<SkillDetail> {
    const href = `https://skills.sh/${owner}/${repo}/${skill}`;

    const res = await fetch(href, { headers: { "user-agent": "mcp-vibe-skills/1.0" } });
    if (!res.ok) throw new Error(`skills.sh http ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = cleanText($("h1").first().text()) || titleFromSlug(skill);

    // Try to pick first paragraph after H1; fallback to meta description
    let description =
        cleanText($("h1").first().nextAll("p").first().text()) ||
        cleanText($("meta[name='description']").attr("content") || "");

    if (!description) description = undefined;

    // Best-effort extraction of sections
    const sections: Array<{ heading: string; content: string }> = [];
    $("h2, h3").each((_, h) => {
        const heading = cleanText($(h).text());
        if (!heading) return;

        const parts: string[] = [];
        let el = $(h).next();

        while (el.length && !el.is("h2") && !el.is("h3")) {
            const t = cleanText(el.text());
            if (t) parts.push(t);
            el = el.next();
        }

        const content = parts.join("\n").slice(0, 4000);
        if (content) sections.push({ heading, content });
    });

    return {
        href,
        owner,
        repo,
        skill,
        title,
        description,
        sections: sections.length ? sections.slice(0, 12) : undefined
    };
}
