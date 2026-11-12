# Authentication plan (drafted 2026-11-12, not started)

Status: built on branch `feat/auth`. The exact interface is in `docs/AUTH-CONTRACT.md`; this file is the background.

## Problem today
- One shared password (`WEB_BASIC_AUTH`, `web/proxy.ts`) covers the whole web app. Anyone with it can type `/bank`, `/dev`, `/ops` or `/phone/priya`.
- The browser proxies (`web/app/gw/[...path]/route.ts`, `web/app/vx/[...path]/route.ts`) use one shared `DASHBOARD_TOKEN` and one shared `PHONE_TOKEN` for everyone, so the gateway does not know who is asking.
- The customer is in the link (`/phone/[customer]`, `/call/[customer]`). Changing it shows another customer's SMS inbox and approval button.

## Design: two doors, three roles

| Door | Role | Sign-in page | Reaches |
|---|---|---|---|
| Staff portal | `bank_manager` | `/staff/login` | `/bank/*`, `/ops`, `/collections` |
| Staff portal | `engineer` | `/staff/login` (same page) | `/dev`, `/metrics`, `/test-cases` |
| Staff portal | `admin` | `/staff/login` | both of the above |
| Customer app | `customer` | `/login` | own `/phone` and `/call` only |

- One staff sign-in page; the role on the account decides the landing page.
- A wrong role or a customer session on a staff link gets a 404 (the page does not reveal it exists). No navigation links cross between the two doors.
- Customer links lose the name: `/phone/[customer]` becomes `/phone`, `/call/[customer]` becomes `/call`. The server reads the customer from the session.

## Security rules
1. **Gateway is the real lock.** Every browser data request carries the user's session. The gateway checks the role on every route; customer routes also check that the session's customer matches the data asked for (403 otherwise). Page gating in `web/proxy.ts` is only the first layer.
2. **Sessions.** Random ID stored in Redis, sent in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Separate cookies for staff and customer. Staff: 30 min idle, 8 h total. Customer: 15 min idle. New session ID at login; logout deletes it on the server.
3. **Accounts.** No sign-up page. Staff accounts are created by a script. Passwords hashed with `hashlib.scrypt` (standard library, no new dependency).
4. **Login protection.** 5 failed tries per account locks it for 15 minutes (Redis counter). Same error for wrong email and wrong password. Logins, logouts and blocked attempts go to the audit log.
5. **Cross-site requests.** `SameSite=Strict` plus the existing Origin allowlist on every POST.
6. **Voice service.** Developer-lab endpoints need an engineer session. Call endpoints need a customer session; the customer comes from the session, not the request.
7. **Old shared tokens** (`DASHBOARD_TOKEN`, `PHONE_TOKEN`) stay for scripts only (eval tools), never for a browser.
8. **Basic auth** is removed once sessions work (or kept as an optional outer gate on a deployed demo).

## Attack tests (must pass before the PR)
- Customer cookie on `/bank`, `/dev`, `/ops` → 404.
- Customer A requests customer B's data through `/gw/phone/...` → 403.
- Bank manager on `/dev` → 404; engineer on `/bank` → 404.
- Expired session, tampered cookie, missing cookie → rejected.
- Six wrong passwords → lockout.
- POST without an allowed Origin → 403.

## Choices awaiting the owner's OK
1. Customer sign-in: registered mobile + 6-digit app passcode, seeded for the demo personas. (An SMS code would be circular: the mock phone is the SMS inbox.)
2. An `admin` role that can open both staff areas.
3. `/ops` and `/collections` belong to bank managers; `/metrics` and `/test-cases` to engineers.
4. On deployment, staff and customer use separate web addresses so cookies cannot cross; locally one address with separate paths.

## Build steps

| Step | Who | Work |
|---|---|---|
| 0 | Haiku | Map every page, proxy route and gateway endpoint to a role |
| 1 | Orchestrator | Exact contract: endpoints, cookie names, role table |
| 2a | Sonnet | Gateway: user table, sessions, login/logout, role checks on every route, tests |
| 2b | Sonnet (parallel) | Web: two login pages, page gating, proxies pass the session, customer out of the links, split navigation |
| 3 | Sonnet | User-creation script, seeded demo accounts, `start.ps1`, docs, eval tools kept working |
| 4 | Sonnet reviewer | Security review and the attack tests; then one PR |

Branch `feat/auth` from `main` (after PR #7 is merged, or stacked on it). About 5 agents, roughly half a day.

## Later
Fits the planned multi-bank console: bank managers get a `bank_id`, and the same gateway checks keep each bank's data separate.

## Not yet checked
The plan was drawn from the page list and the two proxy files. Step 0 reads every gateway endpoint and may add routes to the role table.
