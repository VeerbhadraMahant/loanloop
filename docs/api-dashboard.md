# Dashboard and phone API (gateway side)

Consumed by `web/`. The browser never calls the gateway directly: it calls its own origin at `/gw/<path>`, and the Next.js route handler `web/app/gw/[...path]/route.ts` forwards GET/POST to the server-only env `GATEWAY_URL` (default `http://localhost:8000`), streaming SSE unbuffered. The proxy adds `Authorization: Bearer <token>` (server-only envs) to every request, including SSE (no `?token=`): `PHONE_TOKEN` for `phone/*` paths, `DASHBOARD_TOKEN` (read-only) for the rest. It forwards `Last-Event-ID`.

**Exposing the web app.** The phone page can approve tier-2, so the demo phone and ops views must sit behind HTTP Basic auth or stay on localhost. `web/proxy.ts` (Next 16 proxy, ex-middleware) enforces Basic auth on every route when `WEB_BASIC_AUTH=user:pass` is set; unset fails closed (503) unless `WEB_AUTH_DISABLED=1`, which is for a localhost demo only. Gateway CORS stays closed (CLAUDE.md 6.6). The routes below are the gateway's own paths.

All dashboard data is already redacted/masked: no full identifiers, no secrets. The `/phone/*` routes serve the customer's own device and may show full details.

## SSE: `GET /events/stream` (Authorization header only)

Each message is `data: <json>\n\n`:

```
{ id, ts (ISO),
  type: "call_start"|"call_end"|"action"|"security"|"sms"|"approval"|"handover",
  call_id,
  action?, tier?, outcome?: "ok"|"error"|"blocked", latency_ms?, error_code?, language?,
  customer_ref?   // masked, e.g. "Priya D. (…4417)"
  customer_key?   // e.g. "priya"
  detail? }       // short masked string
```

The phone UI refreshes on events whose `customer_key` matches and `type` is `sms` or `approval`. The ops UI refetches on any event.

## Dashboard (bearer `DASHBOARD_TOKEN`)

| Route | Response |
|---|---|
| `GET /dashboard/calls` | `[{call_id, customer_ref, language, tier, current_action, started_at, ended_at, outcome, blocked_count}]` |
| `GET /dashboard/calls/{call_id}/timeline` | `[event]` (SSE shape) |
| `GET /dashboard/handovers` | `[{id, call_id, customer_ref, reason, summary, requests_done: string[], requests_pending: string[], created_at}]` |
| `GET /dashboard/security` | `[event]`: blocked requests, SECRET_DETECTED, TIER_TOO_LOW, NOT_VERIFIED, RATE_LIMITED, denied/expired approvals |
| `GET /dashboard/metrics` | see below |

`/dashboard/metrics`:

```
{ per_action: [{action, count, p50, p95, p99, errors}],   // ms
  totals: {calls, task_completion_rate, handover_rate, secrets_detected, blocked},  // rates are 0..1
  loadtest: {...} | null,                                   // free-form key/value
  stt_benchmark: {rows: [{entity, with_keyterms, without_keyterms, n}]} | null,
  e2e_latency: {p50, p95, n} | null }
```

Nulls render as "not measured yet". The metrics page marks an action PASS when `p95 < 50` ms.

## Phone (customer device, bearer `PHONE_TOKEN`)

`customer_key` examples: `priya`, `ramesh`, `sunita`.

| Route | Response |
|---|---|
| `GET /phone/{customer_key}` | `{name, mobile_masked}` |
| `GET /phone/{customer_key}/sms` | `[{id, body, created_at}]` |
| `GET /phone/{customer_key}/approvals` | `[{id, purpose, status, created_at, expires_at}]` (`status`: `pending`, `approved`, `denied`, `expired`) |
| `POST /phone/{customer_key}/approvals/{id}/approve` | `{ok}` |
| `POST /phone/{customer_key}/approvals/{id}/deny` | `{ok}` |
