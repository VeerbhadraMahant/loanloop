// The three consoles as shells (staff desk, dev lab, borrower phone), on the real sign-in.
// Cookies only ever come from the real login endpoints; forged ones must not open anything.
import test from "node:test";
import assert from "node:assert/strict";
import { CUST_PASS, STAFF_PW, customerLogin, get, redirectsTo, staffLogin } from "./_helpers.mjs";

const NEEDS_STAFF = { skip: !STAFF_PW && "SMOKE_STAFF_PASSWORD not set" };
const NEEDS_CUST = { skip: !CUST_PASS && "SMOKE_CUSTOMER_PASSCODE not set" };
const html = async (path, cookie) => {
  const res = await get(path, cookie);
  assert.equal(res.status, 200, path);
  return res.text();
};

test("forged role cookies do not open any shell", async () => {
  const payload = encodeURIComponent(JSON.stringify({ id: "STAFF-104", name: "x", role: "staff", expiresAt: Date.now() + 3600000 }));
  const forged = [`loanloop_session_staff=${payload}`, `loanloop_session_dev=${payload}`, "ll_staff=forged", "ll_cust=forged"].join("; ");
  for (const p of ["/staff", "/dev"]) assert.notEqual((await get(p, forged)).status, 200, p);
  assert.ok(redirectsTo(await get("/user", forged), "/login"));
});

test("staff desk: bank_manager and admin get Collections | Ops with a case-based calling desk", NEEDS_STAFF, async () => {
  for (const who of ["manager", "admin"]) {
    const cookie = await staffLogin(who);
    const page = await html("/staff", cookie);
    assert.ok(page.includes("Collections") && page.includes("Sign out"), who);
    assert.ok(!page.includes("Switch Console"), "no link towards another console");
    assert.ok((await html("/staff?tab=ops", cookie)).includes("Live Operations"), who);
    assert.equal((await get("/staff/overview", cookie)).status, 200, who);
  }
  assert.equal((await get("/staff", await staffLogin("engineer"))).status, 404);
});

test("dev lab: engineer and admin get Dev Lab | Test Cases | Metrics, bank_manager does not", NEEDS_STAFF, async () => {
  for (const who of ["engineer", "admin"]) {
    const cookie = await staffLogin(who);
    const page = await html("/dev", cookie);
    for (const t of ["Developer Lab", "Test Cases", "Metrics", "Open Calling Desk", "Sign out"]) assert.ok(page.includes(t), `${who} ${t}`);
    const cases = await html("/dev?tab=test-cases", cookie);
    for (const id of ["TC-8801", "TC-8802", "TC-8803", "TC-8804", "TC-8805"]) assert.ok(cases.includes(id), id);
    assert.ok(!cases.includes("Start Test"), "no per-test-case launch buttons");
    assert.ok((await html("/dev?tab=metrics", cookie)).includes("Metrics"));
  }
  assert.equal((await get("/dev", await staffLogin("manager"))).status, 404);
});

test("borrower phone: four tabs, no invented loan data, own session only", NEEDS_CUST, async () => {
  const cookie = await customerLogin();
  const page = await html("/user/home", cookie);
  assert.ok(page.includes("sm:w-[390px]"), "phone frame");
  for (const t of ["Console", "Voice Chat", "Inbox", "Account", "Zero Secrets"]) assert.ok(page.includes(t), t);
  assert.equal(/₹\s?\d|Switch Demo|Demo Borrower|Switch console/.test(page), false, "no fake balances, personas or console links");
  for (const p of ["/user/talk", "/user/inbox", "/user/help"]) assert.equal((await get(p, cookie)).status, 200, p);
});
