# NOTES

## Decisions
- Stack per CLAUDE.md. Host ports: Postgres 55432, Redis 56379. `gateway/.env` is local (gitignored); `.env.example` at root.
- Runner `app/routes/actions/_runner.py` owns auth, JSON parse, secret scan (before validation), validation, session+tier, audit, event. Pydantic errors never echo input values.
- Secret scan keys: any string value in the raw body (including unknown extra fields). `scan_exempt` skips named fields (report_secret_spoken.secret_type is an enum that is literally "password").
- Missing session -> NOT_VERIFIED for every action except start_call. Tier 0 vs tier-1 action -> NOT_VERIFIED/need_tier_1; tier 1 vs tier-2 action -> TIER_TOO_LOW/need_tier_2.
- Handler exceptions return ok=false, generic_error speak, next=handover, error_code None (contract has no internal-error code); only the exception type is logged.
- `ActionIn.language` is sent on every call and written to session.language by the runner.
- account_last4 / loan_last4 are plaintext columns so masking and verification never decrypt.

## Needs user approval
- `cryptography` (Fernet for tokenisation of account/loan numbers) is not in the Section 7 allow-list. Added to gateway/pyproject.toml.
- `pydantic-settings` and `asyncpg` (explicitly needed for config / Postgres) also beyond the literal list.

## Measured numbers
- Local, single connection, uvicorn on Windows, confirm_readback: p50 ~8 ms, p95 ~12 ms (not a load test).

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
