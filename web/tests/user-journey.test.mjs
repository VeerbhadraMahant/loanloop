// The borrower app (/user/*) on the real customer session: sign in, identity, own data, sign out.
import test from "node:test";
import assert from "node:assert/strict";
import { BASE, CUST_PASS, get, login, redirectsTo } from "./_helpers.mjs";

const skip = !CUST_PASS && "SMOKE_CUSTOMER_PASSCODE not set";

test("a wrong passcode does not sign in", { skip }, async () => {
  const res = await fetch(`${BASE}/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ mobile: "9000014417", passcode: CUST_PASS === "000000" ? "111111" : "000000" }),
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.getSetCookie().some((c) => /^ll_cust=[^;]/.test(c)), false);
});

test("sign in lands on /user/home, identity and data come from the session", { skip }, async () => {
  const body = JSON.stringify({ mobile: "9000014417", passcode: CUST_PASS });
  const res = await fetch(`${BASE}/auth/customer/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body });
  assert.equal((await res.json()).landing, "/user/home");
  const cookie = await login("/auth/customer/login", JSON.parse(body));
  const me = await (await get("/auth/me?door=customer", cookie)).json();
  assert.equal(me.kind, "customer");
  assert.ok(me.name && me.customer_key);
  for (const p of ["/gw/phone/me", "/gw/phone/me/sms", "/gw/phone/me/approvals"]) assert.equal((await get(p, cookie)).status, 200, p);
  assert.equal((await get("/gw/dashboard/calls", cookie)).status, 403); // a customer never reaches staff data
  assert.equal((await get("/gw/events/stream", cookie)).status, 403);
});

test("the borrower pages carry no demo personas, fake OTP or role cookies", { skip }, async () => {
  const cookie = await login("/auth/customer/login", { mobile: "9000014417", passcode: CUST_PASS });
  for (const p of ["/user/home", "/user/help", "/user/inbox"]) {
    const res = await get(p, cookie);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.equal(/123456|Switch Demo|loanloop\.user_session/.test(html), false, p);
    assert.equal(res.headers.getSetCookie().length, 0, `${p} set a cookie`);
  }
});

test("sign out ends the session", { skip }, async () => {
  const cookie = await login("/auth/customer/login", { mobile: "9000014417", passcode: CUST_PASS });
  const out = await fetch(`${BASE}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, cookie }, body: JSON.stringify({ door: "customer" }) });
  assert.equal((await out.json()).login, "/login");
  assert.ok(redirectsTo(await get("/user/home", cookie), "/login")); // the old session id is dead server-side
});
