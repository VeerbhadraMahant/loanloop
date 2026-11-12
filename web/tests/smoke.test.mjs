import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const STAFF_PW = process.env.SMOKE_STAFF_PASSWORD;
const CUST_PASS = process.env.SMOKE_CUSTOMER_PASSCODE;

const get = (path, cookie) =>
  fetch(`${BASE}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

/** POST a login and return the "name=value" session cookie. */
async function login(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, `${path} returned ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.split("=")[1]);
  assert.ok(cookie, `${path} set no session cookie`);
  return cookie;
}

test("login pages are public", async () => {
  for (const p of ["/login", "/staff/login"]) assert.equal((await get(p)).status, 200, p);
});

test("signed-out visitors are redirected to the right door", async () => {
  for (const p of ["/bank", "/ops", "/dev"]) {
    const res = await get(p);
    assert.ok(res.status >= 300 && res.status < 400, `${p} returned ${res.status}`);
    assert.match(res.headers.get("location") ?? "", /\/staff\/login/, p);
  }
  for (const p of ["/phone", "/call"]) {
    const res = await get(p);
    assert.ok(res.status >= 300 && res.status < 400, `${p} returned ${res.status}`);
    assert.match(res.headers.get("location") ?? "", /\/login/, p);
  }
});

test("per-customer URLs no longer exist", async () => {
  for (const p of ["/phone/priya", "/call/priya", "/user/priya"]) assert.equal((await get(p)).status, 404, p);
});

const STAFF_PAGES = [
  { path: "/bank", mustInclude: ["Sahyadri Finance Bank"] },
  { path: "/collections", mustInclude: ["Collections"] },
  { path: "/ops", mustInclude: ["Live Operations"] },
  { path: "/dev", mustInclude: ["Developer lab"] },
  { path: "/test-cases", mustInclude: ["Test Cases", "TC-8801", "TC-8802", "TC-8803", "TC-9904", "TC-8805"] },
  { path: "/metrics", mustInclude: ["Metrics"] },
];
const CUSTOMER_PAGES = [
  { path: "/phone", mustInclude: ["Sahyadri Mobile"] },
  { path: "/call", mustInclude: ["Sahyadri Voice Agent"] },
];

async function checkPages(cookie, pages) {
  for (const r of pages) {
    const res = await get(r.path, cookie);
    assert.equal(res.status, 200, `${r.path} returned ${res.status}`);
    const html = await res.text();
    assert.equal(html.includes("__next_error__"), false, `${r.path} rendered __next_error__`);
    for (const token of r.mustInclude) assert.ok(html.includes(token), `${r.path} missing expected text "${token}"`);
  }
}

test("staff pages render when signed in", { skip: !STAFF_PW && "SMOKE_STAFF_PASSWORD not set" }, async () => {
  const cookie = await login("/auth/staff/login", { email: "admin@loanloop.demo", password: STAFF_PW });
  await checkPages(cookie, STAFF_PAGES);
  const [metricsRes, callsRes, collRes] = await Promise.all(
    ["/gw/dashboard/metrics", "/gw/dashboard/calls", "/gw/dashboard/collections"].map((p) => get(p, cookie)),
  );
  assert.equal(metricsRes.status, 200);
  const metrics = await metricsRes.json();
  assert.ok(Array.isArray(metrics.per_action), "metrics.per_action must be an array");
  assert.ok(metrics.totals && typeof metrics.totals.calls === "number", "metrics.totals.calls missing");
  assert.equal(callsRes.status, 200);
  assert.ok(Array.isArray(await callsRes.json()), "calls must be an array");
  assert.equal(collRes.status, 200);
  const coll = await collRes.json();
  assert.ok(Array.isArray(coll.cases) && Array.isArray(coll.queue), "collections arrays missing");
});

test("customer pages render when signed in", { skip: !CUST_PASS && "SMOKE_CUSTOMER_PASSCODE not set" }, async () => {
  const cookie = await login("/auth/customer/login", { mobile: "9000014417", passcode: CUST_PASS });
  await checkPages(cookie, CUSTOMER_PAGES);
});
