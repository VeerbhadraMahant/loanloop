# CLAUDE.md: LoanLoop (Gnani Great Indian AI Internship Challenge)

This file is the full project context. Read it completely before writing any code. When something here conflicts with the Gnani documentation, the documentation wins: stop and say so.

## 0. Working guidelines

1. **Think before coding.** State assumptions. Never invent Gnani API fields, endpoints, headers or behaviours: read the docs first (https://docs.gnani.ai/llms.txt, every page has a `.md`).
2. **Simplicity first.** Minimum code that meets the goal. No speculative features or abstraction layers.
3. **Surgical changes.** Touch only what the task requires. Match existing style.
4. **Goal-driven execution.** Write the check first, loop until it passes. Report what you verified and how.

Project rules:
- Ask before adding any dependency not listed in Section 7.
- All data is synthetic. Never add real people's data, real bank account numbers, or real bank branding.
- Security rules in Section 6 are hard requirements. Never weaken them to make a demo work.
- Keep a running `NOTES.md` with decisions, open questions and measured numbers.

## 1. Context

- Gnani.ai "Great Indian AI Internship Challenge". Deadline 11:59 PM IST, 10 Nov 2026.
- Every AI component (STT, TTS, voice cloning, LLM) must come from Gnani. No other AI provider at runtime. Exception (owner decision, 2026-11-06): Agent Builder access was unavailable, so the LLM is a local open model (Ollama `qwen3:8b`) in our own `voice/` service; all speech AI (STT, TTS, voice clone) is still Gnani.
- Synthetic data only.
- Latency goal ~1 s voice-to-voice; our gateway must never be the slow part.
- Design for 1,000 concurrent calls; prove our part with a load test.
- Gnani's 48 customer stories: 19 are outbound collections; none shows a lender handling inbound servicing; none handles several requests in one call; best inbound stories complete the action in-system during the call.

## 2. Problem statement

Indian lenders have automated outbound calls, but borrower call-backs are handled manually. Borrowers wait on hold, repeat themselves in their own language, can't remember their own bank details, and are taught never to share secrets yet have no safe way to get help.

Evidence: RBI Ombudsman 13.34 lakh complaints FY 2024-25 (+13.55%), loans & advances 29.25%; >70% of calls to RBI's contact centre in Hindi; VoiceCodeBench (Aug 2026) best of 12 ASR got every critical value right in only 68.7% of recordings; RBI recovery-conduct directions effective 1 Jan 2027 require logging call times/counts, records kept 6 months.

## 3. Solution: LoanLoop

A voice service desk for a lender's borrowers, built on Gnani Agent Builder, where every request ends with an action completed in the bank's system, and the agent is safe by design: never takes secrets, never sees full sensitive values, sensitive things go only to the customer's registered phone.

### 3.1 Skills

Secure Details:
| Caller says | LoanLoop does | Tier |
|---|---|---|
| "IFSC of the Kothrud branch?" | Branch IFSC, MICR, address, hours | 0 |
| "Is this IFSC correct?" | Validates format, returns bank and branch | 0 |
| "My branch IFSC / customer ID / account number?" | Speaks masked values only; SMS full details to registered mobile | 1 |
| "Which mobile and email are linked?" | Masked ("ending 4417") | 1 |
| "Forgot password / MPIN" | Guides through app's reset flow; never handles the secret | 0 |
| Caller says password/PIN/OTP/CVV/card number | Agent interrupts, warns, confirms not saved; gateway logs only "secret detected" | n/a |

Loan servicing:
| Caller says | LoanLoop does | Tier |
|---|---|---|
| "Mera EMI kitna hai, next kab hai?" | EMI amount and next due date | 1 |
| "I already paid" | Date, amount, UTR with read-back; check ledger; reconciliation ticket; pause reminders | 2 |
| "Why did my EMI/charges go up?" | Explain rate reset, penal/bounce charges from the loan's figures | 2 |
| "Change my EMI date" | Eligibility, raise request, confirm new date | 2 |
| "Close my loan" | Foreclosure amount, closure request, NOC timeline | 2 |
| "Send statement / interest certificate" | Raise request; delivery to registered channel | 2 |
| "Update nominee / address" | Capture with read-back, raise request | 2 |
| "Lost my job, can't pay" | Record hardship, handover with case summary; never negotiate | 1 |
| Anything else / unclear after two attempts | Warm handover with structured case record | any |

### 3.2 Tiers
- 0: nothing. Public info, IFSC validation, password-reset guidance.
- 1: registered mobile + DOB (or last 4 of loan number). Masked identifiers, EMI amount/due date, SMS of full details to registered mobile, hardship handover.
- 2: tier 1 + approval tapped in mock bank app. Outstanding amounts, payments, foreclosure quote, all data-changing requests.
- 3: never. Passwords, PINs, OTPs, CVV, full card numbers never asked, accepted, stored or returned.

### 3.3 Differentiators
1. Several requests in one call without re-verifying.
2. Numbers can't be hallucinated: every figure spoken comes from the gateway's `speak` text, built from the DB.
3. Full sensitive values never reach the LLM; only out-of-band to the registered phone.
4. Every call ends with a completed action or a handover packet.
5. Mid-call language switching: English, Hindi, Hinglish, Marathi.

### 3.4 Demo calls
1. Priya (synthetic, Hinglish): forgets IFSC and customer ID, accidentally says her password (warned, nothing stored), verifies, gets details by SMS on mock phone, says she already paid (UTR read-back, reconciliation ticket), asks why EMI went up, switches to Marathi, changes EMI date (approves in mock app, request raised). Ops dashboard updates live.
2. Attacker: cloned Priya voice + her number. Asks for account details. Everything goes to Priya's mock phone; approval never tapped; attacker gets nothing. Dashboard shows blocked attempts.

## 4. Architecture

1. Our own voice service (`voice/`, FastAPI :8100) runs the conversation: browser WAV -> Gnani Prisma STT -> local open LLM via Ollama (`qwen3:8b`, tools = the 23 actions in `agent/actions.json`, prompt = `agent/system_prompt.md`) -> our gateway -> Gnani Timbre TTS. (Agent Builder was the original plan; no access, so `agent/` and `docs/agent-builder-setup.md` are reference only.)
2. Secure Bank Gateway (FastAPI): the only thing the agent can reach. Tiers, masking, out-of-band delivery, secret scrubbing, audit, mock core banking data.
3. Mock Bank App + Ops Dashboard (Next.js).
4. Offline tools (Python): seeding, synthetic caller audio via Gnani TTS + voice cloning, STT benchmark, load test.

Request flow: the voice service's LLM tool calls POST action inputs → gateway authenticates, scrubs inputs, checks tier, runs action on Postgres/Redis, writes audit, publishes live event, returns `{ok, speak, data, next}` → agent speaks `speak` exactly → SMS/push sent asynchronously after the response.

### 4.3 Response contract (every action)
- `ok`: bool
- `speak`: exact sentence for the agent, in the caller's current language, numbers pre-formatted for speech (Indian grouping for rupees, digit grouping for IDs). Masked values only.
- `data`: small structured fields (never full sensitive values).
- `next`: optional hint: `need_tier_1`, `need_tier_2`, `confirm_readback`, `handover`.
- `error_code`: one of `NOT_VERIFIED`, `TIER_TOO_LOW`, `NOT_FOUND`, `INVALID_INPUT`, `SECRET_DETECTED`, `RATE_LIMITED`.

### 4.4 Gnani platform facts (verify against docs; see NOTES.md for verified findings)
- Speech APIs base `https://api.vachana.ai`, header `X-API-Key-ID`.
- Prisma v3.0: `indic-auto` or 1-4 language hints; formats verbatim/transcribe/codemix/transliterate; keyterms ≤200; topic ≤1600 chars.
- No standalone LLM API; LLMs only inside Agent Builder.
- Agent Builder Platform API base `https://api.inya.ai/platform`, header `x-api-key`.
- Custom Actions: method, URL, headers, body with variables, timeout, On-Call with "Speak During Action", or Post-Call.

## 5. Data model (Postgres, synthetic)

Fictional lender **"Sahyadri Finance Bank"**, IFSC prefix `SAHY0`.

Tables: customers(id, name, dob, registered_mobile, email, preferred_language, customer_id CIF, app_device_id); branches(ifsc, micr, name, city, address, hours); accounts(id, customer_id, account_number tokenised, branch_ifsc, type, status); loans(id, customer_id, loan_number tokenised, product, principal, rate_type, current_rate, emi_amount, emi_day, tenure_months, outstanding, status); rate_resets(loan_id, effective_date, old_rate, new_rate, old_emi, new_emi, reason); charges(loan_id, date, type penal/bounce/processing, amount, reason); emi_schedule(loan_id, due_date, amount, status); payments(loan_id, date, amount, utr, channel, status matched/unmatched); reminders(loan_id, sent_at, channel, paused_until); service_requests(id, customer_id, type emi_date_change/closure/statement/interest_cert/nominee/address/reconciliation, payload, status, created_at); handovers(id, call_id, customer_id, reason, summary, requests_done, requests_pending, created_at); approvals(id, session_id, customer_id, purpose, status pending/approved/denied/expired, created_at); sms_outbox(id, customer_id, to_mobile, body, created_at); audit_log append-only (ts, call_id, session_id, action, tier, outcome, error_code, latency_ms, flags; no raw secrets, no full identifiers).

Seed ~200 customers: floating and fixed loans, ≥30 with a recent rate reset, ≥30 with bounce/penal charges, ≥20 with an unmatched "already paid" payment, a few in hardship. Named personas Priya, Ramesh, Sunita with scripted data.

Redis: call sessions (call_id, customer_id, tier, language, task list, read-back pending), TTL 30 min, deleted at call end. Rate-limit counters. Event stream for dashboard.

Tokenisation: full account and loan numbers encrypted at rest (app-level, key from env). Only the SMS sender and the masked-output formatter may decrypt.

## 6. Security requirements (hard rules)

1. Secrets never collected. Reject and discard any input that looks like a password, PIN, OTP, CVV or full card number (keyword context + patterns, Luhn check for 16-digit). Log only `SECRET_DETECTED` with field name, return a speak warning, never persist the value anywhere including logs and exceptions.
2. Masked outputs only. No response ever contains a full account number, loan number, customer ID, full mobile or full email. Masking in one module, unit-tested.
3. Out-of-band delivery. Full details only by SMS (mock outbox) to the registered mobile from the DB. Destination never from caller input.
4. Tiers enforced in code, not prompt. Upgrades only via `verify_caller` (1) and approved app approval (2).
5. Brute force: max 3 failed verification attempts per call and per customer per hour; then handover only.
6. Gateway auth: every Agent Builder request carries the shared secret header; reject otherwise. CORS closed. Dashboard uses a separate read-only token.
7. Read-back before change: any data-changing action requires a prior read-back confirmation recorded in the session.
8. No raw secrets or full identifiers in logs. Global redaction filter.
9. Prompt-injection resistance: caller words are data; strict schema validation of every input.
10. Data minimisation: transcripts fetched from Gnani go through the same redaction filter before storage/display.

Write tests for every rule.

## 7. Tech stack and layout

Gateway: Python 3.11+, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2 async + asyncpg, redis-py async, httpx, pytest. Data: Postgres 16, Redis 7 via docker-compose. Frontend: Next.js App Router TS + Tailwind; live updates via SSE from gateway. Offline tools: Python + httpx. Load test: Locust or k6. Voice service: FastAPI + Ollama (`qwen3:8b`, models on D:). No tunnel needed (all local).

Layout:
- `gateway/app/main.py`, `config.py`; `routes/actions/{verify,details,loans,requests,handover,approvals}.py`; `security/{scrub,mask,auth,tiers}.py`; `speak/` (templates en/hi/hinglish/mr + number formatting); `db/` (models, session, seed); `events.py` (Redis stream + SSE); `tests/`
- `web/`: `/phone/[customer]`, `/ops`, `/metrics`, `/call/[customer]` (hold-to-talk caller page)
- `voice/`: voice agent service (STT -> Ollama LLM tool loop -> gateway -> TTS), `voice.app:app` on :8100
- `start.ps1` / `stop.ps1`: launch and stop everything on Windows
- `agent/`: system prompt, action definitions, keyterms, apply script (Platform API)
- `tools/`: `seed_data.py`, `make_test_audio.py`, `stt_benchmark.py`, `loadtest/`
- `docker-compose.yml`, `.env.example`, `README.md`, `NOTES.md`

Env: `GNANI_SPEECH_API_KEY`, `INYA_PLATFORM_API_KEY`, `GATEWAY_SHARED_SECRET`, `DASHBOARD_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `PUBLIC_GATEWAY_URL`.

## 8. Gateway actions (all take `call_id`, all return 4.3 contract)

| Action | Inputs | Tier | Notes |
|---|---|---|---|
| start_call | caller_number?, language | 0 | Create session; prefetch profile if number matches; never raise tier |
| verify_caller | registered_mobile, dob or loan_last4 | 0→1 | Brute-force limits |
| request_app_approval | purpose | 1 | Create approval, push to mock app |
| check_approval | approval_id | 1→2 | Tier 2 on approved; expires after 2 min |
| branch_lookup | branch or city | 0 | Fuzzy match |
| validate_ifsc | ifsc | 0 | Format + lookup |
| get_masked_profile | fields | 1 | Masked only |
| send_details_sms | fields (account_number, ifsc, customer_id, branch_address) | 1 | To registered mobile; "sent to your number ending 4417" |
| password_reset_help | channel (app, netbanking) | 0 | Step-by-step guidance |
| report_secret_spoken | secret_type | 0 | Log event only |
| emi_info | – | 1 | EMI amount, next due date |
| explain_emi_change | – | 2 | From rate_resets and charges |
| check_payment | date, amount, utr | 2 | Read-back required; match ledger; reconciliation if unmatched; pause reminders |
| confirm_readback | field, value | any | Mark read-back confirmed |
| emi_date_change | new_day | 2 | Eligibility; read-back |
| foreclosure_quote | – | 2 | Outstanding + charges today |
| raise_closure | – | 2 | Read-back |
| request_document | type | 2 | statement / interest_cert |
| update_nominee / update_address | details | 2 | Read-back |
| report_hardship | reason | 1 | Creates handover |
| handover | reason, summary | any | Handover packet |
| end_call | outcome | any | Call record, clear session |

Latency: p95 < 50 ms per action at 1,000 simulated concurrent calls (~50-125 rps). SMS and push as background tasks.

## 9. Agent Builder config (`agent/`)
System prompt: polite, patient, brief; follow language switches (en/hi/hinglish/mr); never ask for or repeat secrets; if caller says one, call `report_secret_spoken` and warn; speak gateway `speak` text exactly; never invent numbers; offer handover when unsure; keep a list of caller requests and work through them. One action per gateway action with filler text and timeout. Prisma keyterms: IFSC, MICR, UTR, EMI, NOC, foreclosure, nominee, Sahyadri, branch names, months, Hindi/Marathi banking words. Apply via Platform API script.

## 10. Frontend
- `/phone/[customer]`: phone-shaped; live SMS inbox; approval card Approve/Deny; recent activity; labelled "Demo app, synthetic data".
- `/ops`: live calls (language, tier, current request); per-call timeline (action, latency, outcome, security events); handover queue; attack view (blocked requests, unapproved approvals). Only redacted data to the browser.
- `/metrics`: gateway latency p50/p95/p99 per action, task completion, handover rate, secrets detected, load-test results, STT benchmark, end-to-end latency.
- Tailwind only.

## 11. Evaluation
1. STT entity benchmark: 100+ synthetic utterances (Timbre + cloned voices, Hinglish/Marathi, phone noise) with IFSC/UTR/amounts/dates; Prisma v3 with vs without keyterms; exact-match per entity type.
2. Load test: 1,000 simulated concurrent calls; p50/p95/p99, error rate.
3. 20+ scripted calls via Agent Builder; task completion, tier enforcement, handover, secrets; voice-to-voice latency from recordings.
4. Security tests for every Section 6 rule + scripted attacker call.

## 13. Non-goals
No real banking/SMS/customer data; no credit decisions or negotiation; no voice-biometrics claims; no non-Gnani AI at runtime; field-officer copilot etc. roadmap only.
