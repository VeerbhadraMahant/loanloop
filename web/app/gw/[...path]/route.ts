// Same-origin proxy to the gateway: the browser never sees the token and the gateway keeps CORS closed.
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";
const TOKEN = process.env.DASHBOARD_TOKEN ?? "";

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(`${GATEWAY}/${path.map(encodeURIComponent).join("/")}`);
  if (path.join("/") === "events/stream") url.searchParams.set("token", TOKEN);
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
      signal: req.signal,
    });
    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "gateway unreachable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
