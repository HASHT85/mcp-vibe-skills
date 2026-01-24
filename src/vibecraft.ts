export async function vibecraftHealth(baseUrl: string) {
    const url = `${baseUrl.replace(/\/$/, "")}/health`;
    const t0 = Date.now();
    const res = await fetch(url);
    const latency_ms = Date.now() - t0;
    return { ok: res.ok, status: res.status, latency_ms };
}
