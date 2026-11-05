# NOTES

## Decisions
- Stack per CLAUDE.md. Host ports: Postgres 55432, Redis 56379. `gateway/.env` is local (gitignored); `.env.example` at root.
- Runner `app/routes/actions/_runner.py` owns auth, JSON parse, secret scan (before validation), validation, session+tier, audit, event. Pydantic errors never echo input values.
- Secret scan keys: any string value in the raw body (including unknown extra fields). `scan_exempt` skips named fields (report_secret_spoken.secret_type is an enum that is literally "password").
- Missing session -> NOT_VERIFIED for every action except start_call. Tier 0 vs tier-1 action -> NOT_VERIFIED/need_tier_1; tier 1 vs tier-2 action -> TIER_TOO_LOW/need_tier_2.
- Handler exceptions return ok=false, generic_error speak, next=handover, error_code None (contract has no internal-error code); only the exception type is logged.
- `ActionIn.language` is sent on every call and written to session.language by the runner.
- account_last4 / loan_last4 are plaintext columns so masking and verification never decrypt.

## Decision: own voice agent (2026-11-06)
- Why: no Gnani Agent Builder access, so the planned Agent Builder + Custom Actions + tunnel setup cannot be used.
- What it replaces: Agent Builder (telephony, Pampa LLM, Timbre TTS wiring, tunnel). Now `voice/` (FastAPI, 127.0.0.1:8100): browser WAV -> Gnani Prisma STT (api.vachana.ai /stt/v3) -> local Ollama `qwen3:8b` (think off, tools = the 23 actions in agent/actions.json, prompt = agent/system_prompt.md) -> gateway :8000 -> Gnani Timbre TTS (timbre-v3.0, WAV). Caller page: `web/app/call/[customer]`. No tunnel needed. `agent/apply_agent.py` and docs/agent-builder-setup.md are reference only.
- Rule change (owner decision): "no non-Gnani AI at runtime" is relaxed for the LLM only. STT, TTS and voice cloning are still Gnani.
- Security: spoken secrets are caught before the LLM and reported via report_secret_spoken (type only); the gateway still enforces tiers, masking and audit.
- Measured: model picked the right action in 4/4 test utterances (Hinglish IFSC, verification with mobile+DOB, spoken password -> report_secret_spoken with type only, Marathi EMI question). About 1 s per tool call on an RTX 4060 after a ~60 s first load; model ~5 GB, stored on D: (OLLAMA_MODELS=D:\Work\Hackathons\gnani\ollama-models).
- Gnani credits are limited: tests fake Gnani; typed tests use tts=false.

## Needs user approval
- `cryptography` (Fernet for tokenisation of account/loan numbers) is not in the Section 7 allow-list. Added to gateway/pyproject.toml.
- `pydantic-settings` and `asyncpg` (explicitly needed for config / Postgres) also beyond the literal list.

## Measured numbers
Machine: i7-13650HX (20 threads), Windows 11, one box: Locust, gateway (`uvicorn --workers 4`), Postgres and Redis (Docker) all share it. Use `127.0.0.1`, not `localhost` (Windows tries IPv6 first: +200 ms per new connection).
- Tests (final): 170 gateway tests pass; 11 tools tests pass.
- Simulator (`tools/simulate_call.py --scenario all`, fresh seed): both demo calls pass; transcript in `tools/out/simulate_transcript.txt`. The seed is stateful (EMI date change is allowed once per 6 months), so reseed before each run.
- Load test (final code, reseed + customer export), 1,000 users, `LL_THINK=8,16` (86 rps), 4 min, stats reset after ramp-up: 0 errors in 18,913 requests. Overall p50 14 / p95 33 / p99 49 ms. Worst action p95: start_call 40 ms (p99 100), request_app_approval 39, check_payment 36; every action p95 < 50 ms. PASS. `tools/out/loadtest.json`.
- Same run without resetting stats (ramp-up included): overall p95 57 ms, start_call p95 98 ms (new-connection burst), 0.02% errors. Saved in `tools/out/loadtest_spec_rate_with_ramp.json`.
- Stress, 1 to 3 s think time (about 457 rps, 4x the target), 3 min: 0 errors, p50 18 / p95 120 / p99 280 ms. Gateway and generator are CPU-bound on the same box. `tools/out/loadtest_stress_457rps.json`.
- Earlier single connection, confirm_readback: p50 ~8 ms, p95 ~12 ms.
- Web smoke (next build + start): `/`, `/ops`, `/metrics`, `/phone/priya`, `/gw/dashboard/calls`, `/gw/dashboard/metrics`, `/gw/phone/priya/sms` all 200; `/gw/actions/start_call` 404; SSE shows 34 `data:` lines during a simulator run with no full mobile.

## Fixes found during integration
- db/session.py: pool 20+20 per worker x 4 workers exceeded Postgres max_connections 100 ("too many clients", 33% errors at 1,000 users). Now 10+5.
- logging.py: the redaction filter flattened uvicorn.access args, so every access log line raised a logging error (CPU cost under load). Access args are now redacted in place.
- _runner.py: `call_id` is exempt from the secret scan; an all-digit Luhn-valid call id was rejected as a card number.
- speak templates: fixed broken Hinglish/Hindi/Marathi "ending 4417" sentence order; small Hinglish wording fixes.
- Simulator: UTF-8 stdout on Windows, SMS check by id (inbox capped at 50) with a short poll (SMS is a background task).
- Load test: wrong-verification calls use a fresh unregistered mobile (real customers hit the 3/hour lockout and failed their legitimate calls); `--reset-stats`; `LL_THINK`; `--note`.
- Redis rate-limit and session keys (`ll:*`) survive a reseed; flush them between load runs or verify_caller returns RATE_LIMITED for seeded customers.

## Final decisions
- Simulator checks compare speak with spaces removed because speak groups digits for TTS ("44 17").
- agent/system_prompt.md: when `next` = `confirm_readback`, read back `data.confirm` and call confirm_readback with that field/value.
- Untapped approvals appear in `/gw/dashboard/security` (ops attack view) once expired (2 min), not while pending.
- Dependencies beyond CLAUDE.md section 7 needing owner approval: `cryptography`, `pydantic-settings`, `asyncpg`, `locust`.

## Needs the owner
- [ ] Gnani speech API key available to the voice service (`GNANI_SPEECH_API_KEY`).
- [x] Create the GitHub repo and push.
- [ ] Mic test at /call/priya (hold to talk, Hinglish and Marathi).
- [ ] Short live Gnani STT/TTS check (credits are limited).
- [ ] Run `tools/make_test_audio.py` then `tools/stt_benchmark.py` (STT numbers), if credits allow.
- [ ] Record a voice clone for the attacker demo.
- [ ] Demo video.

## Open questions (CLAUDE.md has no section 4.5; these are the open items from docs/gnani-facts.md)
1. Caller ANI variable in Agent Builder? Not in docs; agent asks for registered mobile, caller_number is a claim only (guess).
2. Prisma v3 keyterms inside Agent Builder? Not in docs; use asrParams.phraseConfig (<=100 phrases) as fallback (guess).
3. Custom Action timeout range? Not in docs.
4. Concurrent call limit on the account? Not in docs.
5. Log redaction/retention of Gnani transcripts? Not in docs; we redact on our side.
6. Exact keyterms wire format (JSON list vs comma string)? Try JSON list, fall back to comma (guess).
7. Does `language` get sent by Agent Builder each call? Orchestrator says yes; the runner relies on it.

## How to run
```
docker compose up -d
cd gateway
uv sync
uv run python ../tools/seed_data.py     # 200 customers; drops/recreates dev DB
uv run uvicorn app.main:app --port 8000
uv run pytest -q                        # uses DB loanloop_test + Redis db 15
```
