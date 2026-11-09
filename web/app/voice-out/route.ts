// Starts an OUTBOUND call on the voice service. The voice service wants the dashboard token for these,
// so the browser posts here and the token is added server-side. Only direction=outbound + integer case_id.
const VOICE = process.env.VOICE_URL ?? process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8100";
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN ?? "";
const ORIGIN_ALLOW = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.WEB_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || !ORIGIN_ALLOW.has(origin)) return new Response("Forbidden", { status: 403 });
  let body: { case_id?: unknown; tts?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const id = body.case_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return Response.json({ error: "case_id must be a positive integer" }, { status: 422 });
  try {
    const up = await fetch(`${VOICE}/calls?stream=1&tts=${body.tts === true}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DASHBOARD_TOKEN}` },
      body: JSON.stringify({ direction: "outbound", case_id: id }),
      cache: "no-store",
    });
    return new Response(up.body, { status: up.status, headers: { "content-type": up.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: "voice service unreachable" }, { status: 502 });
  }
}
