"""End-to-end attack test for the per-user login (docs/AUTH-CONTRACT.md) against a live local stack.

    cd gateway && uv run python ../tools/auth_attack_test.py [--web URL] [--gateway URL] [--voice URL] [--only GROUP[,GROUP]]
                                                             [--mobile-a 10digits --mobile-b 10digits]

Groups: login, pages, data, direct, voice, logout, lockout. Exit 1 if any check fails; the last line is "N passed, M failed".
Secrets: DEMO_STAFF_PASSWORD / DEMO_CUSTOMER_PASSCODE from env or gateway/.env (required; no defaults).
Customer mobiles: --mobile-a/--mobile-b, else read from the DB (customers id 1 and 2) with the gateway's own session helper.
Passwords, passcodes, mobiles and session ids are never printed.
"""
import argparse
import re
import asyncio
import os
import secrets
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "http://localhost:3000"
EVIL = "https://evil.example"
GROUPS = ["login", "pages", "paths", "data", "direct", "voice", "logout", "lockout"]
STAFF = {"bank_manager": "manager@loanloop.demo", "engineer": "engineer@loanloop.demo", "admin": "admin@loanloop.demo"}
REDIRECTS = (301, 302, 303, 307, 308)
BANK_PAGES = ["/bank", "/ops", "/collections"]
DEV_PAGES = ["/dev", "/metrics", "/test-cases"]

results: list[tuple[str, bool]] = []
current_group = ""
per_group: dict[str, int] = {}


def env(name: str, default: str) -> str:
    if os.environ.get(name):
        return os.environ[name]
    f = ROOT / "gateway" / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.upper().startswith(name + "="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return default


def check(name: str, cond: bool, detail: str = "") -> bool:
    results.append((name, bool(cond)))
    per_group[current_group] = per_group.get(current_group, 0) + 1
    print(f"{'PASS' if cond else 'FAIL'}  [{current_group}] {name}" + (f"  ({detail})" if detail and not cond else ""))
    return bool(cond)


class Stack:
    def __init__(self, web: str, gw: str, voice: str):
        self.web, self.gw, self.voice = web.rstrip("/"), gw.rstrip("/"), voice.rstrip("/")
        self.c = httpx.Client(timeout=15, follow_redirects=False)

    def call(self, method: str, url: str, cookies: dict | None = None, origin: str | None = ORIGIN, headers: dict | None = None, **kw) -> httpx.Response:
        h = dict(headers or {})
        if origin and method != "GET":
            h["Origin"] = origin
        if cookies:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items() if v)
        with self.c.stream(method, url, headers=h, **kw) as r:
            if "event-stream" not in r.headers.get("content-type", ""):  # never wait on an open SSE stream
                r.read()
            self.c.cookies.clear()  # the jar must never leak a session into the next request
            return r

    def w(self, method: str, path: str, cookies=None, **kw):
        return self.call(method, self.web + path, cookies, **kw)

    def login(self, door: str, body: dict, **kw) -> httpx.Response:
        return self.w("POST", f"/auth/{door}/login", json=body, **kw)


def cookie_of(r: httpx.Response, name: str) -> tuple[str | None, str]:
    """(value, the raw Set-Cookie line) for cookie `name`."""
    for line in r.headers.get_list("set-cookie"):
        if line.startswith(name + "="):
            return line.split(";", 1)[0].split("=", 1)[1], line
    return None, ""


def redirects_to(r: httpx.Response, path: str) -> bool:
    loc = r.headers.get("location", "")
    return r.status_code in REDIRECTS and loc.split("?")[0].rstrip("/").endswith(path)


def tamper(v: str) -> str:
    return v[:-1] + ("A" if v[-1] != "A" else "B")


async def lookup_mobiles() -> tuple[str, str]:
    sys.path.insert(0, str(ROOT / "gateway"))
    from sqlalchemy import select  # noqa: E402

    from app.db.models import Customer  # noqa: E402
    from app.db.session import SessionLocal  # noqa: E402

    async with SessionLocal() as s:
        rows = {c.id: c.registered_mobile for c in (await s.execute(select(Customer).where(Customer.id.in_([1, 2])))).scalars()}
    return rows[1], rows[2]


def mask(m: str) -> str:
    return "******" + m[-4:]


# ---------------------------------------------------------------- groups

def g_login(st: Stack, ctx: dict):
    for role, email in STAFF.items():
        r = st.login("staff", {"email": email, "password": ctx["staff_pw"]})
        v, raw = cookie_of(r, "ll_staff")
        low = raw.lower()
        check(f"staff {role} login: 200 + ll_staff HttpOnly SameSite=Strict", r.status_code == 200 and v and "httponly" in low and "samesite=strict" in low, str(r.status_code))
        check(f"staff {role} login: body has no session id", not v or (v not in r.text and "session_id" not in r.text))
    for k in ("a", "b"):
        r = st.login("customer", {"mobile": ctx["mobile_" + k], "passcode": ctx["passcode"]})
        v, raw = cookie_of(r, "ll_cust")
        low = raw.lower()
        check(f"customer {k.upper()} login: 200 + ll_cust HttpOnly SameSite=Strict", r.status_code == 200 and v and "httponly" in low and "samesite=strict" in low, str(r.status_code))
        check(f"customer {k.upper()} login: body has no session id", not v or (v not in r.text and "session_id" not in r.text))
    bad = st.login("staff", {"email": STAFF["bank_manager"], "password": "wrong-" + secrets.token_hex(4)})
    unk = st.login("staff", {"email": f"nobody-{secrets.token_hex(4)}@loanloop.demo", "password": "wrong-" + secrets.token_hex(4)})
    check("wrong password -> 401", bad.status_code == 401, str(bad.status_code))
    check("unknown email -> 401 with identical body", unk.status_code == 401 and unk.text == bad.text, str(unk.status_code))
    body = {"email": STAFF["bank_manager"], "password": ctx["staff_pw"]}
    r = st.login("staff", body, origin=None)
    check("login POST without Origin -> 403", r.status_code == 403, str(r.status_code))
    r = st.login("staff", body, origin=EVIL)
    check("login POST with Origin evil.example -> 403", r.status_code == 403, str(r.status_code))


def g_pages(st: Stack, ctx: dict):
    S, C = ctx["staff"], ctx["cust"]
    for p in ["/bank", "/ops", "/collections", "/dev", "/metrics", "/test-cases"]:
        r = st.w("GET", p)
        check(f"no cookies {p} -> redirect /staff/login", redirects_to(r, "/staff/login"), f"{r.status_code} {r.headers.get('location')}")
    for p in ["/phone", "/call"]:
        r = st.w("GET", p)
        check(f"no cookies {p} -> redirect /login", redirects_to(r, "/login"), f"{r.status_code} {r.headers.get('location')}")
    r = st.w("GET", "/")
    body = r.text
    check("no cookies / -> 200 landing with both door links", r.status_code == 200 and 'href="/login"' in body and 'href="/staff/login"' in body, str(r.status_code))
    check("landing shows no customer data", "Priya" not in body and "Ramesh" not in body and not re.search(r"\d{10}", body), "")
    for door in ("/login", "/staff/login"):
        b = st.w("GET", door).text
        check(f"{door} links to / and not to the other door", 'href="/"' in b and ('href="/staff/login"' not in b if door == "/login" else 'href="/login"' not in b), "")
    r = st.w("GET", "/", {"ll_staff": S["admin"]})
    check("admin session / -> redirect to its landing", r.status_code in REDIRECTS and not redirects_to(r, "/login"), f"{r.status_code} {r.headers.get('location')}")
    r = st.w("GET", "/", {"ll_cust": C["a"]})
    check("customer session / -> redirect /phone", redirects_to(r, "/phone"), f"{r.status_code} {r.headers.get('location')}")
    cc = {"ll_cust": C["a"]}
    for p in ["/bank", "/bank/conversations", "/ops", "/collections", "/dev", "/metrics", "/test-cases", "/call/outbound/1"]:
        r = st.w("GET", p, cc)
        check(f"customer {p} -> 404", r.status_code == 404, str(r.status_code))
    for role, ok, no in (("bank_manager", BANK_PAGES, DEV_PAGES), ("engineer", DEV_PAGES, BANK_PAGES), ("admin", BANK_PAGES + DEV_PAGES, [])):
        sc = {"ll_staff": S[role]}
        for p in ok:
            r = st.w("GET", p, sc)
            check(f"{role} {p} -> 200", r.status_code == 200, str(r.status_code))
        for p in no:
            r = st.w("GET", p, sc)
            check(f"{role} {p} -> 404", r.status_code == 404, str(r.status_code))
    for p in ["/phone", "/call"]:
        r = st.w("GET", p, {"ll_staff": S["admin"]})
        check(f"staff cookie only {p} -> redirect /login", redirects_to(r, "/login"), f"{r.status_code} {r.headers.get('location')}")
    for p in ["/phone/priya", "/call/priya"]:
        r = st.w("GET", p, cc)
        check(f"old link {p} for customer -> 404", r.status_code == 404, str(r.status_code))
    for label, sv, cv in (("tampered", tamper(S["bank_manager"]), tamper(C["a"])), ("random", secrets.token_urlsafe(32), secrets.token_urlsafe(32))):
        r = st.w("GET", "/bank", {"ll_staff": sv})
        check(f"{label} staff cookie /bank -> signed out (redirect /staff/login)", redirects_to(r, "/staff/login"), str(r.status_code))
        r = st.w("GET", "/phone", {"ll_cust": cv})
        check(f"{label} customer cookie /phone -> signed out (redirect /login)", redirects_to(r, "/login"), str(r.status_code))


def g_paths(st: Stack, ctx: dict):
    """Path / header tricks against the page gate. Never 200 for a caller without the right session; every probe is printed."""
    rsc, pre = {"RSC": "1"}, {"RSC": "1", "Next-Router-Prefetch": "1"}
    # (path, extra headers, door that must be the sign-in redirect if it redirects)
    probes = [("/phone/", None, "/login"), ("/call/", None, "/login"), ("/bank/", None, "/staff/login"), ("//bank", None, "/staff/login"),
              ("/bank//conversations", None, "/staff/login"), ("/%62ank", None, "/staff/login"), ("/bank%2F", None, "/staff/login"),
              ("/Bank", None, "/staff/login"), ("/BANK", None, "/staff/login"), ("/bank.rsc", None, "/staff/login"),
              ("/bank?_rsc=abc", None, "/staff/login"), ("/bank", rsc, "/staff/login"), ("/bank", pre, "/staff/login"),
              ("/dev", rsc, "/staff/login"), ("/phone", rsc, "/login"), ("/__next.bank.txt", None, "/staff/login"),
              ("/_next/data/x/bank.json", None, "/staff/login")]
    for label, cookies in (("no cookies", None), ("customer-only cookie", {"ll_cust": ctx["cust"]["a"]})):
        for path, hdr, door in probes:
            if cookies and door == "/login":
                continue  # a customer opening a customer page is allowed to get it
            r = st.call("GET", st.web + path, cookies, headers=hdr)
            hops = [f"{r.status_code}"]
            for _ in range(2):  # Next canonicalises odd paths with a 308 first: judge where that lands
                nxt = r.headers.get("location", "")
                if r.status_code in REDIRECTS and nxt.startswith("/") and not nxt.split("?")[0].rstrip("/").endswith("login"):
                    r = st.call("GET", st.web + nxt, cookies, headers=hdr)
                    hops.append(f"{nxt} -> {r.status_code}")
            loc = r.headers.get("location", "") or r.headers.get("x-nextjs-redirect", "")
            want = door if not cookies else "/staff/login"
            ok = r.status_code in (401, 403, 404, 503) or (r.status_code in REDIRECTS and loc.split("?")[0].rstrip("/").replace(".json", "").endswith(want))
            print(f"  probe [{label}] GET {path}{' ' + str(hdr) if hdr else ''} -> {' / '.join(hops)}{' ' + loc if loc else ''}")
            check(f"{label} GET {path}{' ' + ','.join(hdr) if hdr else ''} -> not a page", ok, f"{r.status_code} {loc}")


def g_data(st: Stack, ctx: dict):
    S, C = ctx["staff"], ctx["cust"]
    ca, bm, en = {"ll_cust": C["a"]}, {"ll_staff": S["bank_manager"]}, {"ll_staff": S["engineer"]}
    r = st.w("GET", "/gw/phone/me", ca)
    check("customer A /gw/phone/me -> 200", r.status_code == 200, str(r.status_code))
    for k in ("ramesh", "c2"):
        r = st.w("GET", f"/gw/phone/{k}", ca)
        check(f"customer A /gw/phone/{k} (B's key) -> 403", r.status_code == 403, str(r.status_code))
    for p in ["/gw/dashboard/calls", "/gw/dashboard/metrics", "/gw/events/stream"]:
        r = st.w("GET", p, ca)
        check(f"customer A {p} -> 401/403", r.status_code in (401, 403), str(r.status_code))
    r = st.w("POST", "/gw/phone/ramesh/approvals/1/approve", ca)
    check("customer A approve on B's key -> 403", r.status_code == 403, str(r.status_code))
    r = st.w("GET", "/gw/dashboard/calls", bm)
    check("bank_manager /gw/dashboard/calls -> 200", r.status_code == 200, str(r.status_code))
    r = st.w("GET", "/gw/dashboard/metrics", bm)
    check("bank_manager /gw/dashboard/metrics -> 403", r.status_code == 403, str(r.status_code))
    r = st.w("GET", "/gw/phone/priya", bm)
    check("bank_manager /gw/phone/priya -> 401/403", r.status_code in (401, 403), str(r.status_code))
    r = st.w("GET", "/gw/dashboard/metrics", en)
    check("engineer /gw/dashboard/metrics -> 200", r.status_code == 200, str(r.status_code))
    r = st.w("GET", "/gw/dashboard/calls", en)
    check("engineer /gw/dashboard/calls -> 403", r.status_code == 403, str(r.status_code))
    r = st.w("POST", "/gw/dashboard/jobs/run", en)
    check("engineer POST /gw/dashboard/jobs/run -> 403", r.status_code == 403, str(r.status_code))
    for p in ["/gw/dashboard/calls", "/gw/phone/me", "/vx/dev/config"]:
        r = st.w("GET", p)
        check(f"no cookies {p} -> 401", r.status_code == 401, str(r.status_code))
    r = st.w("POST", "/gw/phone/me/approvals/1/approve", ca, origin=EVIL)
    check("POST via /gw with bad Origin (customer) -> 403", r.status_code == 403, str(r.status_code))
    r = st.w("POST", "/gw/dashboard/jobs/run", bm, origin=EVIL)
    check("POST via /gw with bad Origin (staff) -> 403", r.status_code == 403, str(r.status_code))


def g_direct(st: Stack, ctx: dict):
    for p in ["/dashboard/calls", "/phone/c1"]:
        r = st.call("GET", st.gw + p)
        check(f"gateway direct {p} no credentials -> 401", r.status_code == 401, str(r.status_code))
    r = st.call("GET", st.gw + "/dashboard/calls", headers={"X-LL-Staff-Session": ctx["cust"]["a"]})
    check("customer sid as X-LL-Staff-Session on /dashboard/calls -> 401/403", r.status_code in (401, 403), str(r.status_code))
    # header smuggling: browser-supplied credentials must never be forwarded by the web proxy
    r = st.call("POST", st.gw + "/auth/staff/login", origin=None, json={"email": STAFF["bank_manager"], "password": ctx["staff_pw"]})
    sid = r.json().get("session_id", "") if r.status_code == 200 else ""
    tok = env("DASHBOARD_TOKEN", "dev-dashboard-token-change-me")
    if check("smuggling setup: direct gateway staff login", bool(sid), str(r.status_code)):
        r = st.w("GET", "/gw/dashboard/calls", headers={"X-LL-Staff-Session": sid, "X-LL-Session": sid, "Authorization": f"Bearer {tok}"})
        check("no cookies + smuggled staff sid + dashboard bearer via /gw -> 401", r.status_code == 401, str(r.status_code))
        r = st.w("GET", "/gw/dashboard/calls", {"ll_cust": ctx["cust"]["a"]}, headers={"X-LL-Staff-Session": sid, "Authorization": f"Bearer {tok}"})
        check("customer cookie + smuggled staff sid + bearer via /gw -> 401/403", r.status_code in (401, 403), str(r.status_code))
        st.call("POST", st.gw + "/auth/logout", origin=None, headers={"X-LL-Session": sid})
    r = st.call("GET", st.gw + "/dashboard/calls", headers={"X-LL-Staff-Session": ctx["cust"]["a"], "X-LL-Customer-Session": ctx["cust"]["a"]})
    check("customer sid in BOTH session headers direct at gateway /dashboard/calls -> 401/403", r.status_code in (401, 403), str(r.status_code))
    r = st.call("GET", st.gw + "/auth/session", headers={"X-LL-Session": secrets.token_urlsafe(32)})
    check("gateway /auth/session random id -> 401", r.status_code == 401, str(r.status_code))


def g_voice(st: Stack, ctx: dict):
    r = st.w("GET", "/vx/dev/config", {"ll_cust": ctx["cust"]["a"]})
    check("customer /vx/dev/config -> 403/404", r.status_code in (403, 404), str(r.status_code))
    r = st.w("GET", "/vx/dev/config", {"ll_staff": ctx["staff"]["bank_manager"]})
    check("bank_manager /vx/dev/config -> 403/404", r.status_code in (403, 404), str(r.status_code))
    r = st.w("POST", "/vx/calls", json={})
    check("no cookies POST /vx/calls -> 401", r.status_code == 401, str(r.status_code))
    r = st.call("POST", st.voice + "/calls", origin=None, json={})
    check("voice direct POST /calls no credentials -> 401", r.status_code == 401, str(r.status_code))
    # ownership through the web: customer A's call is not reachable by customer B or by a bank manager
    r = st.w("POST", "/vx/calls?tts=false", {"ll_cust": ctx["cust"]["a"]}, json={"customer": "priya", "tts": False})
    try:
        cid = r.json().get("call_id") if r.status_code == 200 else None
    except ValueError:
        cid = None
    if check("customer A starts a call via /vx/calls", bool(cid), str(r.status_code)):
        u = f"/vx/calls/{cid}/turn?tts=false"
        r = st.w("POST", u, {"ll_cust": ctx["cust"]["b"]}, json={"text": "hello"})
        check("customer B on customer A's call turn -> 403", r.status_code == 403, str(r.status_code))
        r = st.w("POST", u, {"ll_staff": ctx["staff"]["bank_manager"]}, json={"text": "hello"})
        check("bank_manager on customer A's call turn -> 403", r.status_code == 403, str(r.status_code))


def g_logout(st: Stack, ctx: dict):
    r = st.login("customer", {"mobile": ctx["mobile_a"], "passcode": ctx["passcode"]})
    v, _ = cookie_of(r, "ll_cust")
    if not check("logout setup: fresh customer login", bool(v), str(r.status_code)):
        return
    ck = {"ll_cust": v}
    check("before logout: /phone -> 200", st.w("GET", "/phone", ck).status_code == 200)
    r = st.w("POST", "/auth/logout", ck, json={"door": "customer"})
    check("POST /auth/logout -> 200", r.status_code == 200, str(r.status_code))
    r = st.w("GET", "/phone", ck)
    check("after logout old cookie /phone -> redirect /login", redirects_to(r, "/login"), str(r.status_code))
    r = st.w("GET", "/auth/me?door=customer", ck)
    check("after logout old cookie /auth/me -> 401", r.status_code == 401, str(r.status_code))
    r = st.call("GET", st.gw + "/auth/session", headers={"X-LL-Session": v})
    check("after logout gateway /auth/session -> 401 (server deleted it)", r.status_code == 401, str(r.status_code))


def g_lockout(st: Stack, ctx: dict):
    email = f"lock-{secrets.token_hex(6)}@loanloop.demo"  # nonexistent: never locks a real demo account
    codes = [st.login("staff", {"email": email, "password": "wrong-" + secrets.token_hex(4)}).status_code for _ in range(5)]
    check("5 wrong logins for a nonexistent email -> all 401", codes == [401] * 5, str(codes))
    r = st.login("staff", {"email": email, "password": "wrong-" + secrets.token_hex(4)})
    check("6th attempt -> 429", r.status_code == 429, str(r.status_code))


RUN = {"login": g_login, "pages": g_pages, "paths": g_paths, "data": g_data, "direct": g_direct, "voice": g_voice, "logout": g_logout, "lockout": g_lockout}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--web", default="http://localhost:3000")
    ap.add_argument("--gateway", default="http://127.0.0.1:8000")
    ap.add_argument("--voice", default="http://127.0.0.1:8100")
    ap.add_argument("--only", default="", help="comma list of groups: " + ",".join(GROUPS))
    ap.add_argument("--mobile-a", default="", help="registered mobile of customer 1 (Priya); default: read from the DB")
    ap.add_argument("--mobile-b", default="", help="registered mobile of customer 2 (Ramesh); default: read from the DB")
    a = ap.parse_args()
    only = [g for g in a.only.split(",") if g] or GROUPS
    if bad := [g for g in only if g not in GROUPS]:
        ap.error(f"unknown group(s) {bad}; choose from {GROUPS}")

    st = Stack(a.web, a.gateway, a.voice)
    down = []
    for name, url in (("web", st.web + "/staff/login"), ("gateway", st.gw + "/health"), ("voice", st.voice + "/health")):
        try:
            st.c.get(url)
        except httpx.HTTPError as e:
            down.append(f"{name} ({url}): {type(e).__name__}")
    if down:
        print("Cannot run: service(s) unreachable: " + "; ".join(down) + "\nStart the stack first (this script does not start services).")
        return 2

    ctx = {"staff_pw": env("DEMO_STAFF_PASSWORD", ""), "passcode": env("DEMO_CUSTOMER_PASSCODE", ""),
           "mobile_a": a.mobile_a, "mobile_b": a.mobile_b, "staff": {}, "cust": {}}
    if not (ctx["staff_pw"] and ctx["passcode"]):
        print("Cannot run: DEMO_STAFF_PASSWORD and DEMO_CUSTOMER_PASSCODE are not set (environment or gateway/.env).")
        return 2
    if not (a.mobile_a and a.mobile_b):
        try:
            ctx["mobile_a"], ctx["mobile_b"] = asyncio.run(lookup_mobiles())
        except Exception as e:  # noqa: BLE001
            print(f"Cannot find customer mobiles in the DB ({type(e).__name__}); pass --mobile-a and --mobile-b.")
            return 2
    print(f"customers: A={mask(ctx['mobile_a'])} B={mask(ctx['mobile_b'])}")

    # shared sessions for the groups that need them (silent; the login group re-checks login itself)
    for role, email in STAFF.items():
        ctx["staff"][role] = cookie_of(st.login("staff", {"email": email, "password": ctx["staff_pw"]}), "ll_staff")[0]
    for k in ("a", "b"):
        ctx["cust"][k] = cookie_of(st.login("customer", {"mobile": ctx["mobile_" + k], "passcode": ctx["passcode"]}), "ll_cust")[0]
    needs = [g for g in only if g in ("pages", "paths", "data", "direct", "voice")]
    if needs and not (all(ctx["staff"].values()) and all(ctx["cust"].values())):
        print("Setup logins failed (check demo credentials / seed); groups that need sessions cannot run.")
        if "login" not in only:
            return 2
        only = ["login"]

    global current_group
    for g in only:
        current_group = g
        print(f"\n== {g}")
        RUN[g](st, ctx)
    fails = sum(1 for _, ok in results if not ok)
    print("\n" + ", ".join(f"{g}: {n}" for g, n in per_group.items()))
    print(f"{len(results) - fails} passed, {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
