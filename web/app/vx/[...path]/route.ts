// Same-origin proxy to the voice service: the browser reaches it only through here (behind proxy.ts Basic auth),
// because the voice service spends paid Gnani/Sarvam credits. Never forwards the browser's Authorization/cookies.
export const maxDuration = 60;

const VOICE = process.env.VOICE_URL ?? "http://127.0.0.1:8100";
const EDGE_TOKEN = process.env.VOICE_EDGE_TOKEN ?? "";

// Same Origin allowlist as the gw route (fixed, never derived from Host).
const ORIGIN_ALLOW = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.WEB_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);

// Exactly what the browser uses: call page, dev lab, live-call audio.
const GET_OK = /^(health|dev\/config|dev\/bench\/[^/]+|calls\/[^/]+\/audio\/[^/]+)$/;
const POST_OK = /^(calls|calls\/[^/]+\/turn|dev\/warmup|dev\/bench)$/;
const QUERY_OK = ["stream", "tts"]; // the only query params the voice endpoints take from the browser

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((s) => s === "" || s.includes(".."))) return new Response("Not found", { status: 404 });
  const joined = path.join("/");
  const allowed = req.method === "GET" ? GET_OK.test(joined) : req.method === "POST" && POST_OK.test(joined);
  if (!allowed) return new Response("Not found", { status: 404 });
  if (req.method === "POST") {
    const origin = req.headers.get("origin");
    if (!origin || !ORIGIN_ALLOW.has(origin)) return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(`${VOICE}/${path.map(encodeURIComponent).join("/")}`);
  const inQ = new URL(req.url).searchParams;
  for (const k of QUERY_OK) {
    const v = inQ.get(k);
    if (v !== null && /^[a-z0-9]{1,8}$/i.test(v)) url.searchParams.set(k, v);
  }
  const fwd: Record<string, string> = {};
  if (EDGE_TOKEN) fwd["X-Voice-Edge-Token"] = EDGE_TOKEN;
  const ct = req.headers.get("content-type");
  if (ct) fwd["Content-Type"] = ct;
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: fwd,
      body: req.method === "POST" ? await req.arrayBuffer() : undefined,
      cache: "no-store",
      signal: req.signal,
    });
    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no"); // PCM audio streams: do not buffer
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ detail: "voice service unreachable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
