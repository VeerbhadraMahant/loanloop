// Route guards of the real sign-in (docs/AUTH-CONTRACT.md). Run against a live stack:
//   SMOKE_URL=http://localhost:3000 SMOKE_STAFF_PASSWORD=... SMOKE_CUSTOMER_PASSCODE=... node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CUST_PASS, STAFF_PW, customerLogin, get, redirectsTo, staffLogin } from "./_helpers.mjs";

const NEEDS_STAFF = { skip: !STAFF_PW && "SMOKE_STAFF_PASSWORD not set" };
const NEEDS_CUST = { skip: !CUST_PASS && "SMOKE_CUSTOMER_PASSCODE not set" };
const USER_PAGES = ["/user", "/user/home", "/user/inbox", "/user/talk", "/user/help"];
const ONBOARDING = ["/user/welcome", "/user/language", "/user/mobile", "/user/otp"];

test("anonymous visitors: /user pages go to /login, staff pages to /staff/login", async () => {
  for (const p of USER_PAGES) assert.ok(redirectsTo(await get(p), "/login"), p);
  for (const p of ["/staff/overview", "/bank", "/dev", "/dev/login"]) assert.ok(redirectsTo(await get(p), "/staff/login"), p);
});

test("onboarding screens are public; the fake demo routes are gone", async () => {
  for (const p of ONBOARDING) assert.equal((await get(p)).status, 200, p);
  for (const p of ["/user/activity", "/user/priya"]) assert.ok((await get(p)).status >= 300, p); // never rendered
});

test("forged or garbage cookies are not sessions", async () => {
  const forged = ['ll_cust=forged', 'll_staff=forged', 'user_session={"role":"user"}', 'loanloop_session={"role":"staff"}'].join("; ");
  assert.ok(redirectsTo(await get("/user/home", forged), "/login"));
  assert.notEqual((await get("/staff/overview", forged)).status, 200);
  assert.notEqual((await get("/bank", forged)).status, 200);
});

test("customer: own /user pages open, onboarding bounces home, staff pages are 404", NEEDS_CUST, async () => {
  const c = await customerLogin();
  for (const p of USER_PAGES.slice(1)) assert.equal((await get(p, c)).status, 200, p);
  assert.ok(redirectsTo(await get("/user", c), "/user/home"));
  for (const p of [...ONBOARDING, "/login"]) assert.ok(redirectsTo(await get(p, c), "/user/home"), p);
  for (const p of ["/staff/overview", "/bank", "/dev"]) assert.equal((await get(p, c)).status, 404, p);
  assert.equal((await get("/phone", c)).status, 200);
});

test("staff session cannot open /user pages", NEEDS_STAFF, async () => {
  for (const who of ["manager", "engineer", "admin"]) {
    const s = await staffLogin(who);
    for (const p of USER_PAGES.slice(1)) assert.ok(redirectsTo(await get(p, s), "/login"), `${who} ${p}`);
  }
});

test("/staff/overview is bank_manager and admin only", NEEDS_STAFF, async () => {
  for (const [who, status] of [["manager", 200], ["admin", 200], ["engineer", 404]]) {
    assert.equal((await get("/staff/overview", await staffLogin(who))).status, status, who);
  }
});
