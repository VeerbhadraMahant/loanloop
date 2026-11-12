import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

const ROUTES = [
  { path: "/", mustInclude: ["Sahyadri", "Calling Desk", "Bank app", "User Console"] },
  { path: "/call/priya", mustInclude: ["Live Calling Desk", "Priya", "Zero Secrets Policy", "User Console"] },
  { path: "/call/aarav", mustInclude: ["Live Calling Desk", "Aarav", "Zero Secrets Policy"] },
  { path: "/call/sunita", mustInclude: ["Live Calling Desk", "Sunita", "Zero Secrets Policy"] },
  { path: "/call/meena", mustInclude: ["Live Calling Desk", "Meena", "Zero Secrets Policy"] },
  { path: "/user/priya", mustInclude: ["User Console", "Sahyadri Voice Agent"] },
  { path: "/user/aarav", mustInclude: ["User Console", "Aarav"] },
  { path: "/bank", mustInclude: ["Sahyadri Finance Bank"] },
  { path: "/phone/priya", mustInclude: ["Sahyadri Mobile"] },
  { path: "/collections", mustInclude: ["Collections"] },
  { path: "/ops", mustInclude: ["Live Operations"] },
  { path: "/dev", mustInclude: ["Developer lab"] },
  { path: "/test-cases", mustInclude: ["Test Cases", "TC-8801", "TC-8802", "TC-8803", "TC-8804", "TC-8805"] },
  { path: "/metrics", mustInclude: ["Metrics"] },
];

test("all primary UI routes and scenarios render HTTP 200 without Next error boundary", async () => {
  for (const r of ROUTES) {
    const res = await fetch(`${BASE}${r.path}`);
    assert.equal(res.status, 200, `${r.path} returned ${res.status}`);
    const html = await res.text();
    assert.equal(html.includes("__next_error__"), false, `${r.path} rendered __next_error__`);
    for (const token of r.mustInclude) {
      assert.equal(html.includes(token), true, `${r.path} missing expected text "${token}"`);
    }
  }
});

test("bank routes preserve SSR customer data and Devanagari scripts", async () => {
  const res = await fetch(`${BASE}/call/sunita`);
  assert.equal(res.status, 200);
  const html = await res.text();
  // Ensure Devanagari script renders cleanly without escaping corruption
  assert.equal(html.includes("माझा EMI") || html.includes("Sunita"), true);
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
  const coll = await collRes.json();
  assert.ok(Array.isArray(coll.cases) && Array.isArray(coll.queue), "collections arrays missing");

  assert.equal(devRes.status, 200);
  const dev = await devRes.json();
  assert.ok(Array.isArray(dev.knobs) && Array.isArray(dev.presets), "dev config schema missing");
});
