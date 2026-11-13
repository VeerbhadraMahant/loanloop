# Auth

The sign-in is real and server-side: see `docs/AUTH-CONTRACT.md` for the exact interface (cookies, endpoints, route table) and `docs/AUTH-PLAN.md` for the design.
There is no client-side or demo auth: no persona switcher, no fixed OTP, no role cookie set from the browser.

## The borrower app (`/user/*`)

- Customer door: mobile number + 6-digit passcode, `POST /auth/customer/login`, which sets the HttpOnly `ll_cust` cookie.
  `/login` is the plain form; the app's own flow is `/user/welcome` -> `/user/language` -> `/user/mobile` -> `/user/otp`
  (the last screen is the passcode box and posts to the same endpoint). These four screens are public; a signed-in customer opening one is sent to `/user/home`.
- `/user`, `/user/home`, `/user/inbox`, `/user/talk`, `/user/help` need a valid customer session, else redirect to `/login`. A staff session does not open them. Any other `/user/*` path is a 404.
- Identity is `GET /auth/me?door=customer`; SMS and approvals are `/gw/phone/me/...`; the Talk screen calls the voice service through `/vx` (same as `/call`). `/phone` and `/call` stay available to customers.
- Sign out is the shared `SignOut` control (`door="customer"`), which ends the session on the gateway.
- Only the language and mic-mode preferences live in `localStorage`. The gateway exposes the customer's name and masked mobile only, so no loan, tier or branch details are shown.

## Staff

`/staff/login` (email + password, `ll_staff` cookie). `/staff/overview`, `/bank`, `/ops`, `/collections`, `/call/outbound/*` need `bank_manager` or `admin`; `/dev`, `/metrics`, `/test-cases` need `engineer` or `admin`.

## Checks

`web/tests/*.test.mjs` (set `SMOKE_URL`, `SMOKE_STAFF_PASSWORD`, `SMOKE_CUSTOMER_PASSCODE`; login tests skip when unset) and `tools/auth_attack_test.py`.
