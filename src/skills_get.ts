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
    // SEC: Strict validation to prevent path traversal and SSRF
    const SAFE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
    if (!SAFE_SLUG.test(owner)) throw new Error(`Invalid owner: "${owner.slice(0, 30)}"`);
    if (!SAFE_SLUG.test(repo)) throw new Error(`Invalid repo: "${repo.slice(0, 30)}"`);
    if (!SAFE_SLUG.test(skill)) throw new Error(`Invalid skill: "${skill.slice(0, 30)}"`);

    const href = `https://skills.sh/${owner}/${repo}/${skill}`;

    // QUAL-45: Timeout to prevent hangs if skills.sh is down
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(href, {
        headers: { "user-agent": "veist/1.0" },
        signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`skills.sh http ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = cleanText($("h1").first().text()) || titleFromSlug(skill);

    // typed explicitly to satisfy strict TS
    const description: string | undefined =
        cleanText($("h1").first().nextAll("p").first().text()) ||
        cleanText($("meta[name='description']").attr("content") || "") ||
        undefined;

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
        sections: sections.length ? sections.slice(0, 12) : undefined,
    };
}
