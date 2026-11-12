// Starts an OUTBOUND call on the voice service. Outbound is a staff action, so only the staff session is forwarded.
// Only direction=outbound + integer case_id.
import { COOKIE, cookieOf, originOk } from "@/lib/server";
const VOICE = process.env.VOICE_URL ?? "http://127.0.0.1:8100";
const EDGE_TOKEN = process.env.VOICE_EDGE_TOKEN ?? "";
export async function POST(req: Request) {
  if (!originOk(req)) return Response.json({ detail: "Origin not allowed: open the app at http://localhost:3000 or add this origin to WEB_ALLOWED_ORIGINS." }, { status: 403 });
  const staff = cookieOf(req, COOKIE.staff);
  if (!staff) return Response.json({ detail: "unauthorized" }, { status: 401 });
  let body: { case_id?: unknown; tts?: unknown };
  try { body = await req.json(); } catch { return Response.json({ detail: "bad json" }, { status: 400 }); }
  const id = body.case_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return Response.json({ detail: "case_id must be a positive integer" }, { status: 422 });
  try {
    const up = await fetch(`${VOICE}/calls?stream=1&tts=${body.tts === true}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LL-Staff-Session": staff, ...(EDGE_TOKEN ? { "X-Voice-Edge-Token": EDGE_TOKEN } : {}) },
      body: JSON.stringify({ direction: "outbound", case_id: id }),
      cache: "no-store",
    });
    return new Response(up.body, { status: up.status, headers: { "content-type": up.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: `Voice service not reachable at ${VOICE}. Check it is running.` }, { status: 502 });
  }
}
