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

### Voice agent: final state (2026-11-06)
- Tests: gateway 170 passed, voice 65 passed (all upstreams faked; no Gnani calls). `web` build + lint clean.
- `tools/voice_e2e.py --scenario all` (typed, tts=false, after reseed from the MAIN checkout's gateway/): Priya original 13/13 and Priya browser phrasings 9/9 on 4 runs; attacker 6/6 on 3 of 4 runs (1 run the model skipped send_details_sms: a missed action, not a leak). Median typed turn ~2.0 s on RTX 4060 (no STT/TTS).
- Browser QA (Playwright, typed, voice replies off): full Priya flow 10/10 steps, /ops timeline shows all events, no full mobile/password/account/CIF visible outside the customer's own SMS inbox.
- Service-side guards added because an 8B model is unreliable: secrets never reach the LLM (service calls report_secret_spoken), model cannot confirm read-backs (service confirms only on a bare affirmative the turn after the read-back was spoken), action values must be traceable to the caller's words, app approval requested/checked by the service, duplicate approvals blocked, tool names stripped from speech, spoken digit runs >= 9 masked, call ids never contain 9+ digit runs (gateway redaction would mangle them).
- Known limits: model's Marathi/Hinglish wording is sometimes rough (gateway `speak` text is used for all figures); call history is in memory (restart drops calls); voice service accepts only Host 127.0.0.1/localhost on VOICE_PORT (8100); seed from the main checkout (worktree .env lacks ENCRYPTION_KEY); live Gnani STT/TTS and the mic path are NOT yet tested.

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
- [ ] Mic test at /call after signing in as a customer (hold to talk, Hinglish and Marathi).
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

## 2026-11-08
- Owner decision: hosted LLMs (Gemini, Sarvam) added only for latency comparison; default stays local qwen3:8b; speech stays Gnani.
- Voice latency: Ollama `keep_alive=-1` plus startup warm-up; call id moved out of the system prompt so the prefix cache hits across calls; single read-only actions skip the second LLM round; per-stage `timings` on every call/turn.

## How to run
```
docker compose up -d
cd gateway
uv sync
uv run python ../tools/seed_data.py     # 200 customers; drops/recreates dev DB
uv run uvicorn app.main:app --port 8000
uv run pytest -q                        # uses DB loanloop_test + Redis db 15
```

### 2026-11-08 latency measurements (final dev-lab code, RTX 4060)
- Typed, TTS off, "Tier 0+1 Hinglish" x2, median / p95 per turn: Baseline local 2.93 / 6.75 s; Optimised local 2.32 / 3.95 s; Gemini gemini-3.5-flash-lite 2.17 / 3.65 s (1/10 HTTP 429 free-tier limit); Sarvam sarvam-105b-conversations 0.40 / 0.52 s.
- The one-call shortcut is skipped when the caller text has a conjunction (multi-request safety); without that guard Optimised local measured 1.19 s median.
- Voice turns (Gnani STT + LLM + gateway + Gnani TTS): local 4.0-6.6 s (LLM 2.7-4.8 s, TTS 1.1-2.2 s); Sarvam 2.9-3.3 s (LLM 0.2-0.5 s, TTS 2.3-2.9 s). STT ~0.2 s. Next lever: streaming TTS (play the first chunk instead of waiting for the full WAV).
- Before the fixes: voice turns 4.8-9.0 s, median 5.8 s; cold start 8.6 s model load + 2.8 s prompt read.

### 2026-11-10 v2 (branch v2, contract in docs/V2-CONTRACT.md)
- Input: live tests on 9 Nov (tools: test-data-raw*.md, local qwen3:8b on Mac): median 6.8 s/turn, LLM 5.4 s, Timbre TTS 2.0 s (whole-WAV wait), worst 17 s (branch_lookup with "address आणि timing" took 2 LLM rounds).
- Streaming TTS: Timbre SSE (`/api/v1/tts/sse`, raw 16 kHz PCM) played chunk by chunk in the browser. First chunk 120-226 ms vs 1.1-1.4 s for the full REST WAV (tools/out/tts_stream.json). Gnani allows one active TTS request per account, so no parallel per-sentence synthesis.
- Bank DB: savings balances + transactions, collection_cases (dpd buckets), promises_to_pay (amount, date, full/partial tag, open/kept/broken/cancelled), refusals_to_pay (reason codes), job_runs. Jobs every JOBS_INTERVAL_S: mark_overdue, settle_ptps, build_queue (08:00-19:00 IST window). /collections page; outbound demo call /call/outbound/201 (Vikram Sawant, DOB 17 Jun 1988).
- Agent: language asked first; service owns the call language; deterministic paths for language choice, "am I a customer", FAQ grounding (47 intents, en/hi/hinglish/mr), outbound DOB verify, human handover, prompt-leak guard. Outbound is firm, inbound soft; no waivers or threats.
- Security decisions: outbound starts need the ops token; the model can no longer call start_call; the gateway refuses to reset a live session; secret detection blocks when unsure. Recorded exceptions: dues_info tier 1 on outbound only (tier 2 inbound); record_ptp tier 1 with read-back; /dashboard/jobs/run behind the dashboard token (demo only).
- Known limitation: /ops, /collections, /gw and /voice-out have no login (localhost demo). Production needs an ops login.
- Eval (tools/eval_agent.py, 88 typed cases, TTS off, local qwen3:8b, RTX 4060): run 1 53/88; run 2 76/88 (faq 26/33, language 6/6, verification 6/8, follow-up 8/8, safety 20/20, outbound 9/12). Median 0.96 s/turn, p95 5.98 s, 0.89 LLM calls/turn. Sarvam on 20 cases: median 0.21 s.
- Upgrade: startup adds missing v2 columns; reseed (start.ps1 -Seed) recommended.
- Eval run 3 (after fixes): 84/88 (faq 33/33, outbound 12/12, safety 19/20 then 20/20 on re-run after the injection guard, follow-up 7/8, verification 7/8, language 5/6). Deterministic paths answer in 15-50 ms; median 48.6 ms; p95 31 s is local qwen3:8b on long prompt-extraction turns. Open: follow_online ("can I do it online?" after a cheque answer) gets a model answer, verify_multi_request_no_reverify is flaky on the model.
- Eval tip: the outbound case id and DOB change on reseed; pass --case-id and --outbound-dob explicitly.

### 2026-11-10 all Gnani languages (11 modes)
- Modes: en, hi, hinglish, mr + beta bn, gu, kn, ml, pa, ta, te. Registry `i18n/languages.json` (STT `<l>-IN,en-IN` hints, TTS `<l>-IN`, codes from docs.gnani.ai). Dropping a valid `i18n/<code>.json` activates a language on gateway and voice; `tools/i18n_check.py` validates (also run by the gateway tests). Format: `i18n/README.md`.
- The 7 beta files are machine-written by agents, not reviewed by native speakers. Callers pick by name (any script) or by speaking in that script; other Indian languages (Odia, Assamese, Urdu...) get the sorry line listing supported ones.
- Indic digits in 9 scripts normalise to ASCII before the secret scan (PIN in Tamil digits is blocked). Known gap: PIN/OTP/password keywords written in the new scripts (no digits, no Latin word) are not detected by the gateway scrub.
- Live Timbre v3.0 check, one LANG_OK line each: first chunk bn 354, gu 178, kn 152, ml 208, pa 364, ta 306, te 146 ms; all returned audio. STT in these languages not tested live.

### Running the behaviour eval (typed, local qwen3:8b)
Needs gateway + voice up (voice in dev mode: `VOICE_DEV=1`, which `start.ps1` sets by default), seeded DB (`start.ps1 -Seed`). Outbound cases need the dashboard token (read from `gateway/.env`, never printed), the collection case id of the outbound persona and that customer's DOB. Seed values: case 201, Vikram Sawant, DOB `17 June 1988` (`gateway/app/db/seed.py`, OUT_ID 201). Without `--outbound-dob` the six `out_*` cases fail or are skipped; that was the old "failures", not a product bug (12/12 with the right flags).
```
cd gateway
uv run python ../tools/eval_agent.py --reset-limits --outbound-dob "17 June 1988" --case-id 201 [--only faq_] [--set tool_sets=false --set faq_context=false] [--out ../tools/out/x.json]
```
- The voice service caps live calls at 50 (an ended call counts for 30 min): for a full run restart voice when the harness prints `STOP`, then add `--resume` (keeps earlier results; `--retry-failed` re-runs failures). Restarting only the voice window is safe; Ollama keeps the model loaded.
- `--set key=value` (repeatable) sends per-call settings to `/calls` (dev mode only). The summary reports `llm_turn_ms`: median/p95 over turns that called the model.
- Pass condition for the `broad_*` cases (general questions with no FAQ intent) is only "no forbidden tool ran"; read the log for invented figures.

### 2026-11-10 smart branch eval (qwen3:8b, RTX 4060, 100 cases = 88 old + 12 new)
- Old code baseline 77/88 (6 outbound "failures" were harness flags; 12/12 with `--outbound-dob "17 June 1988" --case-id 201`). Merged code 91/100 (12 new cases: 2/12 pass of the new 12 at first); final code (prompt examples + empty-reply guard) 93/100, safety 20/20, LLM-turn median 2.78 s / p95 9.2 s.
- tool_sets off / faq_context off on the 17 changed cases: 8/17 and 7/17 vs 6/17 default: within run-to-run noise, no effect either way.
- think_hard (default off), 46-case subset: off 35/46, LLM median 2.6 s / p95 11 s; on 40/46, median 4.2 s / p95 29 s (max 47 s), safety 20/20 both. With the six prompt examples (35-case subset): off 29/35 (median 2.2 / p95 4.1 s), on 31/35 (4.2 / 19 s).
- Open: paraphrased questions with no FAQ keyword (KYC in Hinglish, bank hold in Marathi, gold in Hinglish, login code in English) are answered from model memory instead of faq_lookup; "FD pura hone par" in Hindi hits fd_open on the keyword "फिक्स्ड डिपॉजिट"; "home insurance" gets the home-loan FAQ; verify_sunita_hardship forbids "माफ" which also matches the apology "माफ़ कीजिए".
- Bake-off (2026-11-10, old code): qwen3:8b 77/88, safety 20/20, median turn 1.5 s, 100% GPU. ornith-1.5:9b 76/88, safety 19/20, 2.6 s, 12% CPU spill, Cyrillic leaking into Hindi: rejected. mimo-v2.6:9b needs a newer Ollama than 0.31.2: not tested. Six of the 11 baseline failures were the outbound cases run without `--outbound-dob/--case-id`.
- Decision: think_hard stays off (p95 19-29 s is too slow for a call). tool_sets and faq_context stay on but showed no measurable effect on the eval (within run-to-run noise). Review fix: bare "ifsc" keyword removed from account_number_ifsc (it took branch IFSC questions away from branch_lookup).
- Open: paraphrased general questions with no FAQ keyword are answered from the model's memory instead of faq_lookup; needs meaning-based retrieval.

## FAQ routing by confidence (branch faq-route)

Scorer: `gateway/app/routes/actions/faq_score.py` (pure stdlib, shared by the gateway `faq_lookup.query` and the voice pre-route). Keyword weight = IDF of its words over the 80 intents (generic words ~0), multi-word phrase bonus, call-language keywords full weight, other languages x0.6, all-words-present (not adjacent) x0.7, question coverage check. Outcomes in `voice/app.py` `faq_route`: HIGH -> `faq_lookup` by topic, no LLM; MEDIUM -> LLM turn with the top-3 FAQ block; LOW -> plain LLM turn. "My ... account" questions only go to the FAQ when HIGH. Tool-owned guard list (`_TOOL_OWNED`: balance, last transactions, next EMI, my/branch IFSC, validate IFSC, EMI went up, already paid, close loan, EMI date change, branch-name questions, "send me my statement", request status) is checked in `faq_ok` and `faq_route`.
Defaults (dev-console settings `faq_direct_min`, `faq_direct_margin`, `faq_direct_cover`, `faq_ref_min`): 4.0, 2.0, 0.5, 1.2. Scores scale with the number of intents (IDF), so re-tune if faq.json grows a lot.
Measured with `cd gateway && uv run python ../tools/faq_route_eval.py` on `tools/faq_route_set.jsonl` (268 labelled questions, 46 hijack negatives, labels are my own judgement; no live LLM used):

| | old | new |
|---|---|---|
| answered without the LLM (set + prefixed variants) | 270 | 268 |
| of which correct | 117 | 129 |
| HIGH precision | 92.9% | 99.2% |
| hijack negatives answered directly | 1 | 0 |
| HIGH recall | 58.2% | 64.2% |
| MEDIUM / LOW | - | 10.4% / 41.0% |
| mean match time (incl. guards) | 11.2 ms | 8.1 ms |

The one wrong direct answer left is a two-topic question (standing instructions after account closure). Thresholds were tuned on this same set (grid over min/margin/cover), so expect a little less on unseen questions.
- Weighted FAQ routing, live eval against qwen3:8b (2026-11-10): `--only faq` 37/41 (was 34/41 on the first version, median 214 ms -> 30 ms, LLM calls per turn 0.51 -> 0.34); safety 20/20. Remaining misses are paraphrases with no FAQ keyword (faq2_hing_kyc_basics, faq2_mr_account_frozen, faq2_en_otp_not_received) and one flaky wrong-topic pick by qwen on the MEDIUM path (faq_en_fraud, passes on re-run). Regressions found live and fixed: language-choice prefix diluted coverage; Indic "my EMI" guard blocked general topics.

### Decision 2026-11-12: LLM turns of the 7 beta languages go to Sarvam
- Owner decided the 7 beta languages (bn, gu, kn, ml, pa, ta, te) get their LLM turns from Sarvam (`sarvam-105b-conversations`) via language routing (`languages.json` "llm"), on by default. Local qwen3:8b stays the fallback and answers the core 4 languages. `LLM_LANG_ROUTING=false` restores all-local (zero cost). Speech stays Gnani.
- A routed attempt has a short budget so a hung Sarvam cannot cause dead air: `llm_route_timeout` 8 s (Sarvam normally answers in 0.2-1 s; one p95 of ~9 s was seen for Kannada, comparable to qwen's own p95 9.2 s) with no retry. After a failure, routing to that provider is skipped for `llm_route_cooldown` 60 s; `/health` (non-public) shows `route_cooldown_s`.

### Decision 2026-11-12: per-user login, two doors (branch feat/auth)
- Two doors: staff at `/staff/login` (email and password), customers at `/login` (registered mobile and 6-digit passcode). Three staff roles: `bank_manager` (`/bank`, `/ops`, collections), `engineer` (`/dev`, `/metrics`), `admin` (both). Customers see only their own `/phone` and `/call`; the customer is no longer in the URL.
- The gateway is the lock. It owns the sessions (Redis, idle timeout 30 min staff and 15 min customer, 8 h absolute), the scrypt password hashes, the role checks and the lockout (5 failures, 15 min). The Next proxies only turn the cookies into headers; the voice service asks the gateway whether a session is valid. Scripts keep the bearer tokens.
- Accounts: `uv run python -m app.db.create_user staff|customer ...` (password prompted, never printed). `-Seed` creates the demo logins from `DEMO_STAFF_PASSWORD` and `DEMO_CUSTOMER_PASSCODE`; a public deployment must change both. Spec: `docs/AUTH-CONTRACT.md`.
- Not done: an in-call `verify_caller` is not tied to the signed-in customer (the call still verifies by date of birth, like a phone line). No password reset or sign-up page. No per-IP rate limit (only per account). No multi-bank `bank_id`.
