import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

function makeSessionCookie(role, identifier, name) {
  const session = {
    role,
    identifier,
    name,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  return `loanloop_session_${role}=${encodeURIComponent(JSON.stringify(session))}`;
}

const STAFF_COOKIE = makeSessionCookie("staff", "STAFF-104", "Aaditya Joshi");
const DEV_COOKIE = makeSessionCookie("dev", "DEV-202", "Kavya Menon");
const USER_COOKIE = makeSessionCookie("user", "9000014417", "Priya Deshmukh");

const ROUTES = [
  // Public Landing & Logins
  { path: "/", mustInclude: ["Sahyadri", "Borrower Console", "Bank Staff Console", "Developer Lab"] },
  { path: "/staff/login", mustInclude: ["Staff Sign In", "Staff ID", "Access Passcode"] },
  { path: "/dev/login", mustInclude: ["Developer Sign In", "Developer ID", "Developer Key"] },

  // Shared Engineering Tools
  { path: "/call/priya", mustInclude: ["Live Calling Desk", "Priya", "Zero Secrets Policy"] },
  { path: "/call/ramesh", mustInclude: ["Live Calling Desk", "Ramesh", "Zero Secrets Policy"] },
  { path: "/call/sunita", mustInclude: ["Live Calling Desk", "Sunita", "Zero Secrets Policy"] },
  { path: "/call/vikram", mustInclude: ["Live Calling Desk", "Vikram", "Zero Secrets Policy"] },
  { path: "/user/priya", mustInclude: ["User Console", "Sahyadri Voice Agent"] },
  { path: "/user/ramesh", mustInclude: ["User Console", "Ramesh"] },
  { path: "/phone/priya", mustInclude: ["Sahyadri Mobile"] },

  // Staff Workspaces (protected with staff session)
  { path: "/staff/overview", cookie: STAFF_COOKIE, mustInclude: ["Sahyadri Finance Bank", "Collections"] },
  { path: "/bank", cookie: STAFF_COOKIE, mustInclude: ["Sahyadri Finance Bank"] },
  { path: "/collections", cookie: STAFF_COOKIE, mustInclude: ["Collections"] },
  { path: "/ops", cookie: STAFF_COOKIE, mustInclude: ["Live Operations"] },

  // Developer Lab (protected with dev session)
  { path: "/dev", cookie: DEV_COOKIE, mustInclude: ["Sahyadri Voice Engine"] },
  { path: "/test-cases", cookie: DEV_COOKIE, mustInclude: ["Test Cases", "TC-8801", "TC-8802", "TC-8803"] },
  { path: "/metrics", cookie: DEV_COOKIE, mustInclude: ["Metrics"] },

  // Phone-first borrower routes (onboarding is public; interior is protected with user session)
  { path: "/user/welcome", mustInclude: ["Sahyadri", "Zero Secrets"] },
  { path: "/user/language", mustInclude: ["Language", "मराठी", "हिंदी", "English"] },
  { path: "/user/mobile", mustInclude: ["Mobile Number", "Priya"] },
  { path: "/user/otp", mustInclude: ["Verification"] },
  { path: "/user/home", cookie: USER_COOKIE, mustInclude: ["Sahyadri", "Console", "Voice Chat"] },
  { path: "/user/inbox", cookie: USER_COOKIE, mustInclude: ["Sahyadri", "Bank App"] },
  { path: "/user/talk", cookie: USER_COOKIE, mustInclude: ["Sahyadri", "Voice Chat"] },
  { path: "/user/activity", cookie: USER_COOKIE, mustInclude: ["Sahyadri", "Console"] },
  { path: "/user/help", cookie: USER_COOKIE, mustInclude: ["Sahyadri", "Account", "Zero Secrets"] },
];

test("all primary UI routes and scenarios render HTTP 200 without Next error boundary", async () => {
  for (const r of ROUTES) {
    const headers = r.cookie ? { Cookie: r.cookie } : {};
    const res = await fetch(`${BASE}${r.path}`, { headers });
    assert.equal(res.status, 200, `${r.path} returned ${res.status}`);
    const html = await res.text();
    assert.equal(html.includes("__next_error__"), false, `${r.path} rendered __next_error__`);
    for (const token of r.mustInclude) {
      assert.equal(html.includes(token), true, `${r.path} missing expected text "${token}"`);
    }
  }
});

test("bank routes preserve SSR customer data and Devanagari scripts", async () => {
  const res = await fetch(`${BASE}/call/priya`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal(html.includes("मेरा IFSC code") && html.includes("Priya Deshmukh"), true);
});

test("gateway proxy and voice dev endpoints respond with expected JSON structures", async () => {
  const [metricsRes, callsRes, collRes, devRes] = await Promise.all([
    fetch(`${BASE}/gw/dashboard/metrics`),
    fetch(`${BASE}/gw/dashboard/calls`),
    fetch(`${BASE}/gw/dashboard/collections`),
    fetch(`${BASE}/vx/dev/config`),
  ]);

  assert.equal(metricsRes.status, 200);
  const metrics = await metricsRes.json();
  assert.ok(Array.isArray(metrics.per_action), "metrics.per_action must be an array");
  assert.ok(metrics.totals && typeof metrics.totals.calls === "number", "metrics.totals.calls missing");

  assert.equal(callsRes.status, 200);
  const calls = await callsRes.json();
  assert.ok(Array.isArray(calls), "calls must be an array");

  assert.equal(collRes.status, 200);
  assert.equal(devRes.status, 200);
});
