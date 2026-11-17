// Route guards of the real sign-in (docs/AUTH-CONTRACT.md). Run against a live stack:
//   SMOKE_URL=http://localhost:3000 SMOKE_STAFF_PASSWORD=... SMOKE_CUSTOMER_PASSCODE=... node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { BASE, CUST_PASS, STAFF_PW, customerLogin, get, redirectsTo, staffLogin } from "./_helpers.mjs";

const NEEDS_STAFF = { skip: !STAFF_PW && "SMOKE_STAFF_PASSWORD not set" };
const NEEDS_CUST = { skip: !CUST_PASS && "SMOKE_CUSTOMER_PASSCODE not set" };
const USER_PAGES = ["/user", "/user/home", "/user/inbox", "/user/talk", "/user/help"];
const ONBOARDING = ["/user/welcome", "/user/language"];

const demoTo = (res, as) => {
  if (res.status < 300 || res.status >= 400) return false;
  const u = new URL(res.headers.get("location") ?? "", BASE);
  return u.pathname === "/auth/demo" && u.searchParams.get("as") === as;
};

test("demo panel returns to the page it was bounced from, never off-site", async () => {
  const loc = async (q) => (await get(`/auth/demo?as=customer${q}`)).headers.get("location") ?? "";
  assert.equal(new URL(await loc("&next=%2Fuser%2Ftalk"), BASE).pathname, "/user/talk");
  for (const bad of ["//evil.example", "https://evil.example", "/user/talk?x=1", "/%2F%2Fevil", "/user/../dev"]) {
    const u = new URL(await loc(`&next=${encodeURIComponent(bad)}`), BASE);
    assert.equal(u.origin, new URL(BASE).origin, bad);
    assert.equal(u.pathname, "/user/home", bad);
  }
});

test("anonymous visitors: gated pages go to the matching demo panel, old login pages go home", async () => {
  for (const p of USER_PAGES) assert.ok(demoTo(await get(p), "customer"), p);
  for (const p of ["/staff", "/staff/overview", "/bank", "/ops", "/collections", "/call/outbound"]) assert.ok(demoTo(await get(p), "bank"), p);
  for (const p of ["/dev", "/dev/login", "/metrics", "/test-cases"]) assert.ok(demoTo(await get(p), "engineer"), p);
  for (const p of ["/login", "/staff/login"]) assert.ok(redirectsTo(await get(p), "/"), p);
  assert.equal((await get("/auth/demo?as=nope")).status, 400);
});

test("onboarding screens are public; the fake demo routes are gone", async () => {
  for (const p of ONBOARDING) assert.equal((await get(p)).status, 200, p);
  for (const p of ["/user/activity", "/user/priya"]) assert.ok((await get(p)).status >= 300, p); // never rendered
});

test("forged or garbage cookies are not sessions", async () => {
  const forged = ['ll_cust=forged', 'll_staff=forged', 'user_session={"role":"user"}', 'loanloop_session={"role":"staff"}'].join("; ");
  assert.ok(demoTo(await get("/user/home", forged), "customer"));
  assert.notEqual((await get("/staff/overview", forged)).status, 200);
  assert.notEqual((await get("/bank", forged)).status, 200);
});

test("customer: own /user pages open, staff pages go to the bank/engineer panel", NEEDS_CUST, async () => {
  const c = await customerLogin();
  for (const p of USER_PAGES.slice(1)) assert.equal((await get(p, c)).status, 200, p);
  assert.ok(redirectsTo(await get("/user", c), "/user/home"));
  for (const p of ONBOARDING) assert.equal((await get(p, c)).status, 200, p);
  for (const p of ["/staff", "/staff/overview", "/bank"]) assert.ok(demoTo(await get(p, c), "bank"), p);
  assert.ok(demoTo(await get("/dev", c), "engineer"));
  assert.equal((await get("/phone", c)).status, 200);
});

test("staff session cannot open /user pages", NEEDS_STAFF, async () => {
  for (const who of ["manager", "engineer", "admin"]) {
    const s = await staffLogin(who);
    for (const p of USER_PAGES.slice(1)) assert.ok(demoTo(await get(p, s), "customer"), `${who} ${p}`);
  }
});

test("/staff/overview is bank_manager and admin only (engineer is sent to the bank panel)", NEEDS_STAFF, async () => {
  for (const [who, status] of [["manager", 200], ["admin", 200], ["engineer", 307]]) {
    const res = await get("/staff/overview", await staffLogin(who));
    assert.equal(res.status, status, who);
    if (status !== 200) assert.ok(demoTo(res, "bank"), who);
  }
});
