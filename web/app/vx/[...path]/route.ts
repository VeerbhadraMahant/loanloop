// Same-origin proxy to the voice service: the browser reaches it only through here (behind proxy.ts Basic auth),
// because the voice service spends paid Gnani/Sarvam credits. Forwards only the session ids (as headers), never the browser's cookies.
import { originOk, sessionHeaders } from "@/lib/server";
export const maxDuration = 300; // CPU Ollama fallback replies can exceed a minute

const VOICE = process.env.VOICE_URL ?? "http://127.0.0.1:8100";
const EDGE_TOKEN = process.env.VOICE_EDGE_TOKEN ?? "";

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
  if (req.method === "POST" && !originOk(req)) return new Response("Forbidden", { status: 403 });
  const fwd: Record<string, string> = sessionHeaders(req);
  if (!Object.keys(fwd).length) return Response.json({ detail: "unauthorized" }, { status: 401 });
  let url: URL;
  try {
    url = new URL(`${VOICE}/${path.map(encodeURIComponent).join("/")}`);
  } catch {
    return Response.json({ detail: "VOICE_URL is invalid (needs scheme, e.g. https://...)" }, { status: 502 });
  }
  const inQ = new URL(req.url).searchParams;
  for (const k of QUERY_OK) {
    const v = inQ.get(k);
    if (v !== null && /^[a-z0-9]{1,8}$/i.test(v)) url.searchParams.set(k, v);
  }
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
