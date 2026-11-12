import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3001";

function makeSessionCookie(role, id, name) {
  const payload = {
    id,
    name,
    role,
    expiresAt: Date.now() + 3600000,
  };
  return `loanloop_session_${role}=${encodeURIComponent(JSON.stringify(payload))}`;
}

const USER_COOKIE = makeSessionCookie("user", "priya", "Priya Deshmukh");
const STAFF_COOKIE = makeSessionCookie("staff", "STAFF-104", "Aaditya Joshi");
const DEV_COOKIE = makeSessionCookie("dev", "DEV-202", "Kavya Menon");

test("1. Landing page displays three distinct console cards linking to /user, /staff, and /dev", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Sahyadri Finance Bank"), "Missing landing title");
  assert.ok(html.includes("Borrower Console"), "Missing Borrower Console card");
  assert.ok(html.includes("Bank Staff Console"), "Missing Bank Staff Console card");
  assert.ok(html.includes("Developer Lab"), "Missing Developer Lab card");
  assert.ok(html.includes('/user/welcome') || html.includes('href="/user"'), "Missing link to borrower console");
  assert.ok(html.includes('/staff/login') || html.includes('href="/staff"'), "Missing link to staff console");
  assert.ok(html.includes('/dev/login') || html.includes('href="/dev"'), "Missing link to dev console");
});

test("2. User Console is phone-first (390x844 chassis) with 4 unified tabs", async () => {
  const res = await fetch(`${BASE}/user`, {
    headers: { Cookie: USER_COOKIE },
  });
  assert.equal(res.status, 200);
  const html = await res.text();

  // Phone framing: 390x844 on laptop/desktop
  assert.ok(html.includes("sm:w-[390px]") && html.includes("sm:h-[844px]"), "User console missing 390x844 phone frame");

  // 4 tabs in bottom navigation
  assert.ok(html.includes("Console"), "Missing Console tab");
  assert.ok(html.includes("Voice Chat") || html.includes("Calling Desk"), "Missing Voice Chat tab");
  assert.ok(html.includes("Bank App"), "Missing Bank App tab");
  assert.ok(html.includes("Account"), "Missing Account tab");

  // Console tab features
  assert.ok(html.includes("Active Loan"), "Missing Active Loan summary");
  assert.ok(html.includes("Quick Services"), "Missing Quick Services grid");
  assert.ok(html.includes("Change EMI Date"), "Missing Change EMI Date shortcut");

  // Bank App tab features
  assert.ok(html.includes("Official SMS Inbox"), "Missing Official SMS Inbox");
  assert.ok(html.includes("Loan Account Details"), "Missing Loan Details");

  // Account tab features
  assert.ok(html.includes("Zero Secrets Guarantee"), "Missing Zero Secrets explainer");
  assert.ok(html.includes("Microphone Mode"), "Missing Mic Mode setting");
  assert.ok(html.includes("Demo Borrower Profiles"), "Missing Demo Persona Switcher");
  assert.ok(html.includes("Sign Out"), "Missing Sign Out button");
});

test("3. Staff Console is laptop desk with 2 unified tabs (Collections | Ops) and integrated slide-over Calling Desk", async () => {
  const res = await fetch(`${BASE}/staff`, {
    headers: { Cookie: STAFF_COOKIE },
  });
  assert.equal(res.status, 200);
  const html = await res.text();

  // Branding and operator badge
  assert.ok(html.includes("Sahyadri Finance Bank"), "Missing SFB branding");
  assert.ok(html.includes("STAFF-104"), "Missing operator badge");
  assert.ok(html.includes("Aaditya Joshi"), "Missing staff member name");
  assert.ok(html.includes("Switch Console"), "Missing switch console link");

  // Top tabs
  assert.ok(html.includes("Collections &amp; Recoveries") || html.includes("Collections"), "Missing Collections tab");
  assert.ok(html.includes("Ops Console") || html.includes("Live Operations"), "Missing Ops Console tab");

  // Old global sidebar must NOT appear
  assert.ok(!html.includes("SidebarNav"), "Old sidebar found in staff shell");

  // Collections view features
  assert.ok(html.includes("Collections &amp; Recoveries"), "Missing Collections title");
  assert.ok(html.includes("automated dialer queue"), "Missing automated dialer queue subtitle");
  assert.ok(html.includes("promises to pay"), "Missing promises to pay mention");
  assert.ok(html.includes("refusals to pay"), "Missing refusals to pay mention");

  // Ops tab route
  const opsRes = await fetch(`${BASE}/staff?tab=ops`, {
    headers: { Cookie: STAFF_COOKIE },
  });
  assert.equal(opsRes.status, 200);
  const opsHtml = await opsRes.text();
  assert.ok(opsHtml.includes("Live Operations"), "Missing Live Operations content");
});

test("4. Developer Console is laptop workspace with 3 unified tabs (Dev Lab | Test Cases | Metrics) and scenario slide-over", async () => {
  const res = await fetch(`${BASE}/dev`, {
    headers: { Cookie: DEV_COOKIE },
  });
  assert.equal(res.status, 200);
  const html = await res.text();

  // Branding, developer badge and shortcuts
  assert.ok(html.includes("Sahyadri Voice Engine"), "Missing Voice Engine branding");
  assert.ok(html.includes("DEV-202"), "Missing developer identity badge");
  assert.ok(html.includes("Kavya Menon"), "Missing developer member name");
  assert.ok(html.includes("Open Calling Desk"), "Missing Open Calling Desk shortcut button");
  assert.ok(html.includes("Switch Console"), "Missing switch console link");

  // Top tabs
  assert.ok(html.includes("Developer Lab"), "Missing Developer Lab tab");
  assert.ok(html.includes("Test Cases"), "Missing Test Cases tab");
  assert.ok(html.includes("Metrics &amp; SLA") || html.includes("Metrics"), "Missing Metrics tab");

  // Test cases tab
  const tcRes = await fetch(`${BASE}/dev?tab=test-cases`, {
    headers: { Cookie: DEV_COOKIE },
  });
  assert.equal(tcRes.status, 200);
  const tcHtml = await tcRes.text();
  assert.ok(tcHtml.includes("TC-8801") && tcHtml.includes("Priya Deshmukh"), "Missing Priya scenario");
  assert.ok(tcHtml.includes("TC-8802") && tcHtml.includes("Ramesh Patil"), "Missing Ramesh scenario");
  assert.ok(tcHtml.includes("TC-8803") && tcHtml.includes("Sunita Kulkarni"), "Missing Sunita scenario");
  assert.ok(tcHtml.includes("TC-8805") && tcHtml.includes("Vikram Malhotra"), "Missing Vikram adversary scenario");
  assert.ok(tcHtml.includes("Start Test"), "Missing Start Test action button");

  // Metrics tab
  const mRes = await fetch(`${BASE}/dev?tab=metrics`, {
    headers: { Cookie: DEV_COOKIE },
  });
  assert.equal(mRes.status, 200);
  const mHtml = await mRes.text();
  assert.ok(mHtml.includes("Metrics &amp; SLA") || mHtml.includes("Gateway latency benchmarks"), "Missing Metrics Telemetry");
});

test("5. Multi-Console Route Guarding and Isolation", async () => {
  // Staff cannot access dev
  const sDev = await fetch(`${BASE}/dev`, {
    headers: { Cookie: STAFF_COOKIE },
    redirect: "manual",
  });
  assert.ok(sDev.status === 307 || sDev.status === 302);
  assert.ok(sDev.headers.get("location")?.includes("/dev/login"));

  // Dev cannot access staff
  const dStaff = await fetch(`${BASE}/staff`, {
    headers: { Cookie: DEV_COOKIE },
    redirect: "manual",
  });
  assert.ok(dStaff.status === 307 || dStaff.status === 302);
  assert.ok(dStaff.headers.get("location")?.includes("/staff/login"));

  // User cannot access staff or dev
  const uStaff = await fetch(`${BASE}/staff`, {
    headers: { Cookie: USER_COOKIE },
    redirect: "manual",
  });
  assert.ok(uStaff.status === 307 || uStaff.status === 302);

  const uDev = await fetch(`${BASE}/dev`, {
    headers: { Cookie: USER_COOKIE },
    redirect: "manual",
  });
  assert.ok(uDev.status === 307 || uDev.status === 302);
});
