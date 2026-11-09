# LoanLoop v2 contract (shared by every agent)

Source of truth for the v2 work (2026-11-10). If you need to change anything here, do not silently diverge:
say so in your final report under "Contract changes" and the coordinator updates this file.

Why v2: live test on 2026-11-09 (16 voice turns, local qwen3:8b) measured median 6.8 s per turn:
LLM 5.4 s, Timbre TTS 2.0 s (whole-WAV wait), STT 0.3 s, gateway 0.05 s. Worst turn 17 s
(`branch_lookup` took two LLM rounds because "address आणि timing" tripped the conjunction guard).
Testers also asked for: language choice first, correct "am I a customer" answer, language switch that
applies to everything, account-opening steps, SMS offer for long answers, a real bank-like database,
collections (outbound, firm) vs servicing (inbound, soft), cron jobs, PTP and RTP tables.

## Hard rules (unchanged from CLAUDE.md, apply to all new code)
- Synthetic data only. Never collect or store PIN, OTP, password, CVV, full card number.
- Numbers the agent speaks come from the gateway `speak`, never from the model.
- Account and loan numbers: last 4 only in speech and logs; full values stay Fernet-encrypted.
- Audit log stays append-only with masked metadata only.
- Collections: firm and direct, never threatening, never shaming, never contacting third parties,
  never promising waivers, discounts or settlements. Calls only 08:00-19:00 IST (RBI fair practice).
- Languages: `en`, `hi`, `hinglish`, `mr`. Every new speak template needs all four.
- No new dependencies unless unavoidable; say why in the report.

## File ownership (one writer per area)
| Agent | Owns | Must not edit |
|---|---|---|
| A TTS | new `voice/tts.py`; the `tts()` function and audio fields of `reply()` in `voice/app.py`; new audio route in `voice/app.py`; `web/lib/` audio helpers; audio playback code in `web/app/call/`, `web/app/phone/`, `web/app/dev/` | gateway, agent/, other voice logic |
| B Bank DB | everything under `gateway/` (models, seed, actions, speak templates, jobs, dashboard routes, tests); `agent/actions.json` new entries | voice/, web/, agent/system_prompt.md, `gateway/app/data/faq.json` |
| C Agent | `voice/app.py` conversation logic (everything except A's parts); `voice/tests/`; `agent/system_prompt.md` | gateway/, web/, agent/actions.json |
| D Knowledge | `gateway/app/data/faq.json`; `tools/eval_agent.py`; `tools/eval_cases.jsonl` | everything else |
| E Ops UI (phase 2) | `web/app/ops/`, new `web/app/collections/`, `web/components/` | gateway, voice |

## New gateway actions (B builds, C wires into the agent, D's data feeds faq_lookup)
All are `POST /actions/<name>` via `@action` in `gateway/app/routes/actions/`, response = `ActionResponse`
(`ok`, `speak`, `data`, `error_code`, `next`). Every input carries `language`.

| Action | Tier | Input | Speak |
|---|---|---|---|
| `faq_lookup` | 0 | `topic` (intent id from faq.json, enum in actions.json) or `query` (free text, keyword match) | the FAQ answer in the call language. If the session is verified and the intent has `sms: true`, also queue the full answer to `sms_outbox` and end the speak with "I have also sent this to your number ending NNNN". If unverified and `sms: true`, end with an offer: "Once you verify, I can send this by SMS." Unknown topic: `ok=false`, `error_code="FAQ_NOT_FOUND"`. |
| `account_balance` | 1 | none | savings balance, available balance, amount on hold (rupees, spoken) |
| `last_transactions` | 1 | `count` 1-5 (default 3) | date, debit/credit, amount, short narration; no counterparty account numbers |
| `dues_info` | 1 | none | overdue amount, number of missed EMIs, days past due, charges; "no dues" if none |
| `record_ptp` | 1 | `amount` (int rupees), `promised_date` (YYYY-MM-DD) | read back amount and date, tag full/partial. Rules: amount > 0 and <= outstanding; date today..today+30 days, else `ok=false` with a speak asking for a valid one. One open PTP per case: a new one replaces (status `cancelled`) the old. |
| `record_rtp` | 1 | `reason_code` (job_loss, medical, income_reduced, dispute, already_paid, unwilling, other), `note` (optional, <=120 chars, secret-scanned) | neutral acknowledgement; for job_loss/medical/income_reduced also offer `report_hardship`; for already_paid point to `check_payment`; for dispute offer `handover` |

`start_call` gains optional `direction` (`inbound` default | `outbound`) and `case_id` (int, outbound only).
- Inbound greeting (all 4 languages in one short line): welcome + "Which language would you like: English, Hindi, Marathi or Hinglish?"
- Outbound greeting: "This is LoanLoop calling from Sahyadri Bank about your loan. To continue, please confirm your date of birth." (outbound verification = DOB against the case's customer; B decides the cleanest way, e.g. `verify_caller` accepts DOB only when the session is outbound with a case_id).

## New tables (B)
- `collection_cases(id, loan_id unique, customer_id, overdue_amount, missed_emis, dpd, bucket, status, priority, attempts, last_call_at, next_action_at, updated_at)`;
  bucket in `0`, `1-30`, `31-60`, `61-90`, `90+`; status in `open`, `ptp`, `rtp`, `resolved`.
- `promises_to_pay(id, case_id, loan_id, customer_id, call_id, direction, amount, promised_date, amount_tag full|partial, status open|kept|broken|cancelled, paid_amount, created_at, resolved_at)`.
- `refusals_to_pay(id, case_id, loan_id, customer_id, call_id, direction, reason_code, note, overdue_amount, created_at, follow_up_at)`.
- `account_transactions(id, account_id, date, direction dr|cr, amount, narration, ref, balance_after)`; `accounts` gains `balance`, `hold_amount`.
- `job_runs(id, job, started_at, finished_at, stats JSON)`.

## Cron jobs (B, `gateway/app/jobs.py`)
Started from the FastAPI lifespan as an asyncio loop, interval `JOBS_INTERVAL_S` (default 3600, `0` = off, tests use 0).
Each run writes a `job_runs` row. Also `POST /dashboard/jobs/run` (dashboard auth) to run all now for the demo.
1. `mark_overdue`: unpaid EMIs past due -> status `overdue`; upsert `collection_cases` (amount, missed count, dpd, bucket); close cases with nothing overdue (`resolved`).
2. `settle_ptps`: open PTPs whose date has passed: matched payments since `created_at` >= amount -> `kept`, some -> `broken` with `paid_amount`, none -> `broken`. Broken -> case back to `open`, priority up.
3. `build_queue`: open cases, not called in the last 24 h, no open PTP still in date, ordered by priority then dpd; sets `next_action_at` inside the 08:00-19:00 IST window.
Dashboard reads: `GET /dashboard/collections` -> `{cases, ptps, rtps, queue, last_runs}` (masked: loan last 4, first name + last initial).

## Voice service (C, A)
- `POST /start` body gains `direction` and `case_id`, passed to `start_call`. Outbound uses the firm prompt section.
- The service, not the model, owns `c["language"]`; every gateway call gets `language=c["language"]`.
- New tools go into `SHORTCUT` when their speak is the final answer: `faq_lookup`, `account_balance`, `last_transactions`, `dues_info`, `record_ptp`, `record_rtp`.
- Turn timings keep `stt_ms, llm_ms, gateway_ms, tts_ms`; A adds `tts_first_ms` (time to first audio byte).

## faq.json format (D writes, B's `faq_lookup` reads)
```json
{"version": 1, "intents": [
  {"id": "open_account", "sms": true,
   "keywords": {"en": ["open account", "new account"], "hi": ["खाता खोल"], "hinglish": ["account kholna"], "mr": ["खाते उघड"]},
   "answer": {"en": "...", "hi": "...", "hinglish": "...", "mr": "..."},
   "sms_text": {"en": "...", "hi": "...", "hinglish": "...", "mr": "..."}}
]}
```
`answer` is spoken: 1-3 short sentences, no lists, no URLs, numbers written as words or plain digits.
`sms_text` is the full detail (steps, documents). Ids are snake_case. Facts must be generic Indian-bank
facts that are safe to state (RBI rules, typical process); bank-specific numbers say "Sahyadri Bank".

## Branch and commits
Feature branch `v2`. Each agent commits on its own worktree branch with clear messages; the coordinator merges.
