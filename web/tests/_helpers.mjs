import assert from "node:assert/strict";

export const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
export const STAFF_PW = process.env.SMOKE_STAFF_PASSWORD;
export const CUST_PASS = process.env.SMOKE_CUSTOMER_PASSCODE;

export const get = (path, cookie) => fetch(`${BASE}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

/** POST a login and return the "name=value" session cookie. */
export async function login(path, body) {
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

export const staffLogin = (email) => login("/auth/staff/login", { email: `${email}@loanloop.demo`, password: STAFF_PW });
export const customerLogin = () => login("/auth/customer/login", { mobile: "9000014417", passcode: CUST_PASS });

export const redirectsTo = (res, path) => res.status >= 300 && res.status < 400 && new URL(res.headers.get("location") ?? "", BASE).pathname === path;
