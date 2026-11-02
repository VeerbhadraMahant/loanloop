// Next 16 "proxy" (ex-middleware): HTTP Basic auth over the whole app when WEB_BASIC_AUTH=user:pass is set.
// Fails closed: with it unset, requests are refused unless WEB_AUTH_DISABLED=1 (localhost demo only).
// The phone page can approve tier-2, so never expose the web app without WEB_BASIC_AUTH.
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export function proxy(req: NextRequest) {
  const want = process.env.WEB_BASIC_AUTH;
  if (!want) {
    if (process.env.WEB_AUTH_DISABLED === "1") return NextResponse.next();
    return new Response("WEB_BASIC_AUTH not set (set WEB_AUTH_DISABLED=1 for a localhost demo)", { status: 503 });
  }
  const h = req.headers.get("authorization") ?? "";
  let got = "";
  if (h.startsWith("Basic ")) {
    try {
      got = atob(h.slice(6));
    } catch {}
  }
  if (safeEqual(got, want)) return NextResponse.next();
  return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LoanLoop"' } });
}
