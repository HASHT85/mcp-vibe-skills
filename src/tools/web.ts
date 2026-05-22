/**
 * VEIST Tool — Web: web_search (Tavily) + fetch_url (SSRF-protected)
 */

import * as cheerio from "cheerio";

// ─── SSRF Guard ───

function assertSafeUrl(urlStr: string): void {
    const parsed = new URL(urlStr); // throws on invalid URL
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`🚫 Blocked: only http/https URLs are allowed (got ${parsed.protocol})`);
    }
    const host = parsed.hostname.toLowerCase();
    const BLOCKED_HOSTS = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.169.254", // AWS/GCP metadata
        "metadata.google.internal",
    ];
    if (
        BLOCKED_HOSTS.includes(host) ||
        host.endsWith(".internal") ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
        throw new Error(`🚫 Blocked: cannot fetch internal/private URLs (${host})`);
    }
}

// ─── Web Search ───

export async function webSearch(query: string): Promise<string> {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (!TAVILY_API_KEY) {
        return "Error: TAVILY_API_KEY is not set in environment or .env. Web search is disabled.";
    }
    try {
        const searchController = new AbortController();
        const searchTimeout = setTimeout(() => searchController.abort(), 15_000);
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: searchController.signal,
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query,
                search_depth: "basic",
                include_answer: true,
                max_results: 5,
            }),
        });
        clearTimeout(searchTimeout);
        if (!res.ok) {
            return `Error: Web search failed with API status ${res.status}`;
        }
        const data = await res.json();
        if (!data.results || data.results.length === 0) {
            return `No search results found for "${query}". Try alternative keywords.`;
        }
        const resultsStr = data.results
            .map((r: any) => `[${r.title}] URL: ${r.url}\nSnippet: ${r.content}`)
            .join("\n\n");
        let finalOutput = `Search Results for "${query}":\n\n`;
        if (data.answer) {
            finalOutput += `AI Summary Answer: ${data.answer}\n\n`;
        }
        finalOutput += resultsStr;
        return finalOutput;
    } catch (e: any) {
        return `Search failed: ${e.message}.`;
    }
}

// ─── Fetch URL ───

export async function fetchUrl(urlStr: string): Promise<string> {
    try {
        assertSafeUrl(urlStr);
    } catch (e: any) {
        return e.message;
    }
    try {
        const fetchController = new AbortController();
        const fetchTimeout = setTimeout(() => fetchController.abort(), 15_000);
        const res = await fetch(urlStr, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            signal: fetchController.signal,
        });
        clearTimeout(fetchTimeout);
        if (!res.ok) return `HTTP Error ${res.status} fetching ${urlStr}`;
        const text = await res.text();

        const $ = cheerio.load(text);
        $(
            "script, style, noscript, svg, nav, footer, header, aside, .sidebar, #sidebar, .ad, .advertisement"
        ).remove();
        let cleanText = $("body").text().replace(/\s+/g, " ").trim();
        if (!cleanText) {
            cleanText = $.text().replace(/\s+/g, " ").trim();
        }
        return cleanText.slice(0, 10000);
    } catch (e: any) {
        return `Fetch failed: ${e.message} `;
    }
}
