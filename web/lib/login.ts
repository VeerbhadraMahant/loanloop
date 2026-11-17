import { NextResponse } from "next/server";
import { COOKIE, GATEWAY, cookieOf, landingOf, originOk, validate, type Door } from "@/lib/server";

const FIELDS = { staff: ["email", "password"], customer: ["mobile", "passcode"] } as const;
const bad = (status: number, detail: string) => NextResponse.json({ detail }, { status });
const secure = () => process.env.NODE_ENV === "production";

export const setSession = (res: NextResponse, door: Door, sid: string) =>
  res.cookies.set(COOKIE[door], sid, { httpOnly: true, sameSite: "strict", path: "/", secure: secure() });

/** GET /auth/demo?as=customer|engineer|bank|admin (hackathon open panels): get a gateway session for the demo identity, set the cookie, go to the panel. */
const DEMO_ROLE: Record<string, string> = { customer: "customer", engineer: "engineer", bank: "bank_manager", admin: "admin" };
export async function demoHandler(req: Request) {
  const role = DEMO_ROLE[new URL(req.url).searchParams.get("as") ?? ""];
  if (!role) return new NextResponse("Unknown panel", { status: 400 });
  let r: Response;
  try {
    r = await fetch(`${GATEWAY}/auth/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }), cache: "no-store" });
  } catch { return new NextResponse("Gateway unreachable", { status: 502 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j.session_id !== "string") return new NextResponse("Open panels are off", { status: r.status === 404 ? 404 : 502 });
  const door: Door = j.kind === "customer" ? "customer" : "staff";
  // Return to the page the proxy bounced from. Same-origin plain paths only (no "//", scheme or query): never an open redirect.
  const next = new URL(req.url).searchParams.get("next") ?? "";
  const to = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(next) ? next : landingOf(j.role);
  const res = NextResponse.redirect(new URL(to, req.url));
  setSession(res, door, j.session_id);
  return res;
}

/** Shared body of POST /auth/{staff,customer}/login: relay to the gateway, keep the session id in an HttpOnly cookie. */
export async function loginHandler(req: Request, door: Door) {
  if (!originOk(req)) return bad(403, "Forbidden");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad(400, "bad json"); }
  const [a, b] = FIELDS[door];
  if (typeof body?.[a] !== "string" || typeof body[b] !== "string") return bad(400, "bad request");
  let r: Response;
  try {
    r = await fetch(`${GATEWAY}/auth/${door}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [a]: body[a], [b]: body[b] }),
      cache: "no-store",
    });
  } catch { return bad(502, "gateway unreachable"); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 429) return bad(r.status, j.detail ?? "unauthorized");
  if (!r.ok || typeof j.session_id !== "string") return bad(502, "gateway error");
  const res = NextResponse.json({ ok: true, landing: door === "customer" ? landingOf("customer") : j.landing });
  setSession(res, door, j.session_id);
  return res;
}

export async function logoutHandler(req: Request) {
  if (!originOk(req)) return bad(403, "Forbidden");
  let door: unknown;
  try { door = (await req.json()).door; } catch { return bad(400, "bad json"); }
  if (door !== "staff" && door !== "customer") return bad(400, "bad door");
  const sid = cookieOf(req, COOKIE[door]);
  if (sid) {
    // The cookie is cleared even if the gateway is down; the server-side idle timeout still ends the session.
    try { await fetch(`${GATEWAY}/auth/logout`, { method: "POST", headers: { "X-LL-Session": sid }, cache: "no-store" }); } catch {}
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE[door], "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0, secure: secure() });
  return res;
}

export async function meHandler(req: Request) {
  const door = new URL(req.url).searchParams.get("door");
  if (door !== "staff" && door !== "customer") return bad(400, "bad door");
  try {
    const s = await validate(cookieOf(req, COOKIE[door]));
    if (!s || s.kind !== door) return bad(401, "unauthorized");
    return NextResponse.json({ kind: s.kind, role: s.role, name: s.name, ...(s.customer_key ? { customer_key: s.customer_key } : {}) });
  } catch { return bad(502, "gateway unreachable"); }
}
