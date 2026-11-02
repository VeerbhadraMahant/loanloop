# Gateway load test

Locust, because the spec allows it (Locust or k6): it is Python like the rest of `tools/`, and a call is just a
scripted Python flow (start_call, verify, read-backs, approval tap, end_call) with think-time between actions.

Each simulated user loops through whole calls, so `-u 1000` is about 1,000 concurrent calls. Flow mix: 30% Tier 0
lookups, 35% full verified call (EMI info, read-back, app approval, check_payment), 15% spoken secret, 20% wrong
verification. Think time is 1-3 s per action (about 50-125 rps at 1,000 users). Expected business errors (wrong DOB,
`SECRET_DETECTED`) count as successes; HTTP errors and unexpected `ok` values count as failures.

## Run

```
docker compose up -d
cd gateway && uv run python ../tools/seed_data.py && cd ..
uv run --project gateway python tools/loadtest/fixtures.py --export     # optional: all 200 seeded customers (else 3 personas)
cd gateway && uv run uvicorn app.main:app --workers 4                    # see below; leave running
uv run --project tools python tools/loadtest/run.py                      # -u 1000 -r 50 -t 3m; args overridable
```

Output: `tools/out/loadtest.json` (`users, duration_s, rps, per_action[{action,p50,p95,p99,count,failures}], overall, measured_at, host_note`), latencies in ms.
Reads `GATEWAY_SHARED_SECRET` / `DASHBOARD_TOKEN` from env or `../.env` (dev defaults otherwise).

## Caveat: one Windows box

The load generator competes with the gateway (and Postgres/Redis) for CPU, so numbers are pessimistic. Run uvicorn
with several workers (`uvicorn app.main:app --workers 4`; no `--reload`, which forces one worker), and keep the
dev machine otherwise idle. For a cleaner reading run Locust from a second machine with `--host http://<gateway>:8000`.
