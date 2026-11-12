# Auth contract (build spec for `feat/auth`)

Design background: `docs/AUTH-PLAN.md`. This file is the exact interface. Gateway, voice, web and the attack tests are built
in parallel from it, so do not change a name, path, header or status code here without telling the orchestrator.

## 1. Roles and doors

| Door | Role | Sign-in page | Cookie |
|---|---|---|---|
| staff | `bank_manager`, `engineer`, `admin` | `/staff/login` | `ll_staff` |
| customer | `customer` | `/login` | `ll_cust` |

Landing page after login: `bank_manager` and `admin` -> `/bank`; `engineer` -> `/dev`; `customer` -> `/phone`.

## 2. Sessions (gateway owns them, Redis)

- Session id: `secrets.token_urlsafe(32)`. Redis key `ll:auth:sess:<sid>`, JSON:
  `{kind: "staff"|"customer", role, name, user_id (staff) | customer_id (customer), customer_key (customer), created: epoch}`.
- Idle timeout (sliding): staff 1800 s, customer 900 s. Only `GET /auth/session` refreshes it (page loads, `/auth/me`, voice requests). Dashboard, phone and event routes validate without refreshing, so background polling does not keep a session alive.
- Staff sessions re-check the `staff_users` row on every validation: a disabled or deleted user loses the session at once, and the current role in the database is the one used.
- Absolute lifetime from `created`: 8 h for both. Past it the session is deleted and invalid.
- Logout deletes the key. Every login creates a new id.
- `customer_key`: the persona slug if the customer has one in `sms.PERSONAS` (same resolution `/phone/{key}` uses), else `c<id>`.

## 3. Gateway auth endpoints (new router, prefix `/auth`, no shared-secret dependency)

| Method + path | Request | Success | Failure |
|---|---|---|---|
| `POST /auth/staff/login` | JSON `{email, password}` | 200 `{session_id, kind: "staff", role, name, landing}` | 401 `{"detail": "invalid credentials"}`; 429 `{"detail": "too many attempts"}` |
| `POST /auth/customer/login` | JSON `{mobile, passcode}` | 200 `{session_id, kind: "customer", role: "customer", name, customer_key, landing: "/phone"}` | same 401 / 429 |
| `GET /auth/session` | header `X-LL-Session: <sid>` | 200 `{kind, role, name, customer_id?, customer_key?}` (no session id, no secrets) and refreshes the idle TTL | 401 `{"detail": "unauthorized"}` |
| `POST /auth/logout` | header `X-LL-Session: <sid>` | 204 always (even for an unknown id) | - |

Rules:
- Email compared lower-cased and trimmed. Mobile normalised to its last 10 digits. Passcode is exactly 6 digits.
- Wrong identifier and wrong secret give the identical 401 body, and an unknown identifier still runs one scrypt so timing does not differ.
- Lockout: Redis counter `ll:auth:fail:<kind>:<identifier>`, 15 min expiry set on first failure. At 5 failures every further attempt
  (even with the right secret) gets 429 until the key expires. A successful login deletes the counter. Unknown identifiers count the same way.
- Hash format: `scrypt$<n>$<r>$<p>$<salt_b64>$<hash_b64>` using `hashlib.scrypt` (n=2**14, r=8, p=1, 16-byte salt, 32-byte key), compared with `hmac.compare_digest`. No new dependency.
- Audit: every login success, login failure, lockout block and logout is recorded (action names `auth.login`, `auth.login_failed`,
  `auth.locked`, `auth.logout`; outcome ok/denied). Never store the password, passcode or session id. Use the existing `audit_log`
  via `write_audit` if its columns allow it, otherwise a small `auth_events` table.

Tables (created by the existing `create_all` path):
- `staff_users`: id, email (unique), name, role, password_hash, disabled (bool, default false), created_at.
- `customer_logins`: customer_id (PK, FK customers.id), passcode_hash, created_at.

Settings (gateway `Settings`, env names upper-case): `demo_staff_password` and `demo_customer_passcode`. They have NO default: the repo ships no credentials. The seed creates the
demo logins only for a value the owner has set; an empty value means no login of that kind exists.

Seed (`gateway/app/db/seed.py`): staff `manager@loanloop.demo` (bank_manager), `engineer@loanloop.demo` (engineer),
`admin@loanloop.demo` (admin), all with `demo_staff_password`; a `customer_logins` row with `demo_customer_passcode` for the
four fixed customers (Priya id 1, Ramesh id 2, Sunita id 3, Vikram the outbound customer). Idempotent.

## 4. How a browser request is identified

The browser never talks to the gateway or voice service directly. The Next proxies (`/gw`, `/vx`, `/voice-out`) read the cookies
and forward them as headers; they attach NO `DASHBOARD_TOKEN` / `PHONE_TOKEN` any more:

- cookie `ll_staff` -> header `X-LL-Staff-Session: <sid>`
- cookie `ll_cust` -> header `X-LL-Customer-Session: <sid>`

Both are forwarded when both cookies exist. (`/vx` keeps sending `X-Voice-Edge-Token`.)

Service identity for scripts (eval tools, simulators), never used by a browser:
- gateway: existing `Authorization: Bearer <DASHBOARD_TOKEN>` on dashboard/events routes, `Bearer <PHONE_TOKEN>` on phone routes. Unchanged behaviour.
- voice: `Authorization: Bearer <DASHBOARD_TOKEN>` (voice already has `dashboard_token`) = full access.
- `/actions/*` keeps `X-Gateway-Secret` only. Unchanged.

## 5. Gateway route rules

A route passes if the service bearer is valid OR the named session header carries a valid session with an allowed role.
No credentials -> 401. Valid session but wrong role or wrong customer -> 403.

| Routes | Allowed |
|---|---|
| `GET /dashboard/calls`, `/dashboard/calls/{id}/timeline`, `/dashboard/handovers`, `/dashboard/requests`, `/dashboard/security`, `/dashboard/collections`, `POST /dashboard/jobs/run`, `GET /events/stream` | staff session with role `bank_manager` or `admin`; or Bearer DASHBOARD_TOKEN |
| `GET /dashboard/metrics` | staff session with role `engineer` or `admin`; or Bearer DASHBOARD_TOKEN |
| `/phone/{key}` and everything under it | customer session where `key` is `me` or resolves to the session's own customer (anything else 403); or Bearer PHONE_TOKEN (any key). A staff session alone -> 403 |
| `/actions/*` | `X-Gateway-Secret` (unchanged) |
| `/health` | open |

`key = "me"` resolves to the session's customer. Customer sessions never get `/events/stream` or `/dashboard/*`.

## 6. Voice service rules (`voice/app.py`)

Identity per request: Bearer DASHBOARD_TOKEN = `service`; else validate `X-LL-Staff-Session` and/or `X-LL-Customer-Session` by
calling the gateway `GET /auth/session` (header `X-LL-Session`). Gateway unreachable -> 502. The existing host check and edge token stay.

| Route | Allowed |
|---|---|
| `GET /health` | open (unchanged) |
| `POST /calls`, `POST /start`, inbound, no dev overrides | customer session; staff `engineer` or `admin`; service |
| same, with dev overrides (`llm` non-default, `model`, `settings`) | existing `VOICE_DEV` gate AND (staff `engineer`/`admin` or service) |
| same, `direction: "outbound"` | staff `bank_manager`/`admin`; service. (Replaces the current bearer-only check; the bearer still works as service.) |
| `POST /calls/{call_id}/turn`, `GET /calls/{call_id}/audio/{token}` | only the identity that started the call (same session id), or service. Anyone else 403 |
| `/dev/*` | staff `engineer`/`admin`; service |

No credentials -> 401; valid session, not allowed -> 403. Store only a hash of the owning session id on the call record.

## 7. Web (Next.js)

Cookies: `ll_staff`, `ll_cust`; `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when `NODE_ENV === "production"`, no Max-Age
(the server enforces timeouts). Value = session id.

Web route handlers (all POST handlers enforce the existing Origin allowlist; 403 otherwise):

| Method + path | Body | Behaviour |
|---|---|---|
| `POST /auth/staff/login` | JSON `{email, password}` | calls gateway; on 200 sets `ll_staff`, returns `{ok: true, landing}`; passes 401 / 429 through with the gateway's `detail` |
| `POST /auth/customer/login` | JSON `{mobile, passcode}` | same with `ll_cust` |
| `POST /auth/logout` | JSON `{door: "staff"|"customer"}` | calls gateway logout, clears that cookie, returns `{ok: true, login: "/staff/login"|"/login"}` |
| `GET /auth/me?door=staff|customer` | - | 200 `{kind, role, name, customer_key?}` from the gateway, or 401 |

Pages and who may open them (`web/proxy.ts` validates the cookie against the gateway `GET /auth/session` on every page request):

| Paths | Needs |
|---|---|
| `/staff/login`, `/login`, `/auth/*`, Next static assets | public |
| `/bank`, `/bank/*`, `/ops`, `/collections`, `/call/outbound/*` | staff `bank_manager` or `admin` |
| `/dev`, `/metrics`, `/test-cases` | staff `engineer` or `admin` |
| `/phone`, `/call` (exactly; the old `/phone/[customer]` and `/call/[customer]` routes are deleted) | customer |
| `/` | redirect: valid staff session -> its landing; else valid customer session -> `/phone`; else `/login` |
| `/gw/*`, `/vx/*`, `/voice-out` | not page-gated; the handlers forward session headers and the backends decide. No relevant cookie -> 401 |

Outcomes on a gated page:
- allowed role -> render.
- staff page, valid staff session of the wrong role -> 404.
- staff page, no valid staff session, but an `ll_cust` cookie is present -> 404.
- staff page, no cookies -> redirect to `/staff/login`.
- customer page, no valid customer session -> redirect to `/login` (never to the staff door).
- A signed-in user opening their own door's login page is redirected to their landing.

Other web rules:
- No link, button or redirect leads from a customer page to a staff page or the other way, and neither login page mentions the other.
- Navigation shows only what the signed-in role can open, plus a sign-out control.
- Customer pages read the customer from `GET /auth/me?door=customer` and call the gateway as `/gw/phone/me/...`. They must not
  call `/gw/events/stream` or `/gw/dashboard/*` (the phone screen keeps its existing 3 s polling).
- `NEXT_PUBLIC_VOICE_URL` support is removed: the browser always uses `/vx`.
- `WEB_BASIC_AUTH`: if set, it stays as an outer gate in front of everything; if unset, nothing extra (sessions are the lock).
  `WEB_AUTH_DISABLED` no longer does anything.

## 8. Not in this change
- Binding an in-call `verify_caller` to the signed-in customer (the call still verifies by date of birth, like a real phone line).
- Password reset, sign-up, staff management UI, per-IP rate limits, multi-bank `bank_id`.
