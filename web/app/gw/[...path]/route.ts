// Same-origin proxy to the gateway: the browser never sees the token and the gateway keeps CORS closed.
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN ?? "";
const PHONE_TOKEN = process.env.PHONE_TOKEN ?? "";

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((s) => s === "" || s.includes(".."))) return new Response("Not found", { status: 404 });
  const joined = path.join("/");
  const allowed =
    req.method === "GET"
      ? joined === "events/stream" || /^(dashboard|phone)(\/|$)/.test(joined)
      : req.method === "POST" && /^phone\/[^/]+\/approvals\/[^/]+\/(approve|deny)$/.test(joined);
  if (!allowed) return new Response("Not found", { status: 404 });
  if (req.method === "POST" && req.headers.get("origin") !== new URL(req.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(`${GATEWAY}/${path.map(encodeURIComponent).join("/")}`);
  const fwd: Record<string, string> = { Authorization: `Bearer ${joined.startsWith("phone/") ? PHONE_TOKEN : DASHBOARD_TOKEN}` };
  const lastId = req.headers.get("last-event-id");
  if (lastId) fwd["Last-Event-ID"] = lastId;
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: fwd,
      cache: "no-store",
      signal: req.signal,
    });
    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
    // Next holds response headers until the first body chunk, so an idle SSE stream looks disconnected.
    // Prime it with an SSE comment (ignored by EventSource) so headers flush at once.
    let body: BodyInit | null = upstream.body;
    if (joined === "events/stream" && upstream.body) {
      const src = upstream.body.getReader();
      body = new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(": connected\n\n")); },
        async pull(c) {
          try {
            const r = await src.read();
            if (r.done) c.close(); else c.enqueue(r.value);
          } catch { c.close(); } // upstream dropped or client left
        },
        cancel(reason) { return src.cancel(reason); },
      });
    }
    return new Response(body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "gateway unreachable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
