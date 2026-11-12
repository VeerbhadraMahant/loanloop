import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

function makeSessionCookie(role, identifier, name, expiresAt = Date.now() + 3600000) {
  const session = {
    role,
    identifier,
    name,
    createdAt: Date.now(),
    expiresAt,
  };
  return `loanloop_session_${role}=${encodeURIComponent(JSON.stringify(session))}`;
}

test("1. Landing page renders with three distinct console cards and brand header", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200, `Landing page status ${res.status}`);
  const html = await res.text();
  assert.ok(html.includes("Sahyadri Finance Bank"), "Missing bank title");
  assert.ok(html.includes("Borrower Console"), "Missing Borrower card");
  assert.ok(html.includes("Bank Staff Console"), "Missing Staff card");
  assert.ok(html.includes("Developer Lab"), "Missing Dev card");
  assert.ok(html.includes("Select Console Access Point"), "Missing hero selector text");
});

test("2. Unauthenticated deep links redirect to their respective console login pages", async () => {
  // Staff protected routes
  const staffPaths = ["/staff/overview", "/collections", "/ops", "/bank"];
  for (const p of staffPaths) {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302, `${p} should redirect (got ${res.status})`);
    const loc = res.headers.get("location");
    assert.ok(loc && loc.includes("/staff/login"), `${p} must redirect to /staff/login (got ${loc})`);
    assert.ok(loc && loc.includes(`returnTo=${encodeURIComponent(p)}`), `${p} must preserve returnTo`);
  }

  // Developer protected routes
  const devPaths = ["/dev", "/test-cases", "/metrics"];
  for (const p of devPaths) {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302, `${p} should redirect (got ${res.status})`);
    const loc = res.headers.get("location");
    assert.ok(loc && loc.includes("/dev/login"), `${p} must redirect to /dev/login (got ${loc})`);
    assert.ok(loc && loc.includes(`returnTo=${encodeURIComponent(p)}`), `${p} must preserve returnTo`);
  }

  // User protected routes
  const resUser = await fetch(`${BASE}/user/home`, { redirect: "manual" });
  assert.ok(resUser.status === 307 || resUser.status === 302, `/user/home should redirect`);
  const locUser = resUser.headers.get("location");
  assert.ok(locUser && locUser.includes("/user/welcome"), `/user/home must redirect to /user/welcome (got ${locUser})`);
});

test("3. Staff session grants access to staff routes but isolates from dev routes", async () => {
  const staffCookie = makeSessionCookie("staff", "STAFF-104", "Aaditya Joshi");

  // Can access staff routes
  const staffRes = await fetch(`${BASE}/staff/overview`, {
    headers: { Cookie: staffCookie },
    redirect: "manual",
  });
  assert.equal(staffRes.status, 200, `/staff/overview should return 200 with staff cookie`);
  const staffHtml = await staffRes.text();
  assert.ok(staffHtml.includes("Sahyadri Finance Bank"), "Missing staff overview content");

  // Cannot access dev routes -> redirects to /dev/login with error=unauthorized
  const devRes = await fetch(`${BASE}/dev`, {
    headers: { Cookie: staffCookie },
    redirect: "manual",
  });
  assert.ok(devRes.status === 307 || devRes.status === 302, `/dev should redirect staff`);
  const loc = devRes.headers.get("location");
  assert.ok(loc && loc.includes("/dev/login"), `/dev redirect location: ${loc}`);
  assert.ok(loc && loc.includes("error=unauthorized"), `Must report role unauthorized: ${loc}`);
});

test("4. Developer session grants access to dev routes but isolates from staff routes", async () => {
  const devCookie = makeSessionCookie("dev", "DEV-202", "Kavya Menon");

  // Can access dev routes
  const devRes = await fetch(`${BASE}/dev`, {
    headers: { Cookie: devCookie },
    redirect: "manual",
  });
  assert.equal(devRes.status, 200, `/dev should return 200 with dev cookie`);

  // Cannot access staff routes -> redirects to /staff/login with error=unauthorized
  const staffRes = await fetch(`${BASE}/collections`, {
    headers: { Cookie: devCookie },
    redirect: "manual",
  });
  assert.ok(staffRes.status === 307 || staffRes.status === 302, `/collections should redirect dev`);
  const loc = staffRes.headers.get("location");
  assert.ok(loc && loc.includes("/staff/login"), `/collections redirect location: ${loc}`);
  assert.ok(loc && loc.includes("error=unauthorized"), `Must report role unauthorized: ${loc}`);
});

test("5. Shared engineering tools remain accessible across consoles", async () => {
  // Calling Desk and simulated handsets are accessible for staff and dev test harnesses
  const paths = ["/call/priya", "/phone/priya", "/user/priya"];
  for (const p of paths) {
    const res = await fetch(`${BASE}${p}`);
    assert.equal(res.status, 200, `${p} must return 200 as shared tool`);
  }
});

test("6. Expired session cookie redirects with error=expired", async () => {
  const expiredStaffCookie = makeSessionCookie("staff", "STAFF-104", "Aaditya Joshi", Date.now() - 5000);
  const res = await fetch(`${BASE}/staff/overview`, {
    headers: { Cookie: expiredStaffCookie },
    redirect: "manual",
  });
  assert.ok(res.status === 307 || res.status === 302);
  const loc = res.headers.get("location");
  assert.ok(loc && loc.includes("error=expired"), `Expired cookie must redirect to error=expired (got ${loc})`);
});

