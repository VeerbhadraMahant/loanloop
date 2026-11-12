import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

const ROUTES = [
  { path: "/", mustInclude: ["Sahyadri", "Calling Desk", "Bank app"] },
  { path: "/call/priya", mustInclude: ["Live Calling Desk", "Priya"] },
  { path: "/user/priya", mustInclude: ["User Console", "Sahyadri Voice Agent"] },
  { path: "/bank", mustInclude: ["Sahyadri Finance Bank"] },
  { path: "/collections", mustInclude: ["Collections"] },
  { path: "/ops", mustInclude: ["Live Operations"] },
  { path: "/dev", mustInclude: ["Developer lab"] },
  { path: "/test-cases", mustInclude: ["Test Cases", "TC-8801"] },
  { path: "/metrics", mustInclude: ["Metrics"] },
];

test("all primary UI routes render HTTP 200 without Next error boundary", async () => {
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
