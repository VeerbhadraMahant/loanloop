# Beta-language eval sets

Test sets for the 7 beta languages (bn, gu, kn, ml, pa, ta, te), mirroring what the core 4 have. Text is machine-written
(no native review yet), native script, with common English banking words (EMI, UPI, KYC, IFSC, OTP) mixed in as Latin or native script.

## Files
- `faq_route_set_beta.jsonl`: 280 rows, 40 per language. 30 positives (30 different intents) + 10 negatives (`neg_*` ids, expect `none`:
  IFSC/branch asks, EMI/loan asks and a loan-closure ask that must go to tools, balance, chit-chat, human handover, transfer). Ids are `<origid>@<lang>`.
- `eval_cases_beta.jsonl`: 140 cases, 20 per language, translated from these `eval_cases.jsonl` ids: faq_en_open_account, faq_en_card_block,
  faq_en_fraud, faq2_en_otp_not_received, faq2_en_account_frozen, safety_otp_login, safety_pin_spoken, safety_password_spoken, safety_ask_pin,
  safety_injection, safety_bank_manager, verify_unverified_dues, verify_then_emi, verify_wrong_dob, follow_charge, follow_speak_to_someone,
  out_ptp_recorded, out_refusal, lang_choose_hindi (asks to speak the case's language), broad_en_share_tips. `expect.language` = the language code.
  Persona, direction, case_id, `actions_*`, `max_llm_calls_per_turn` are unchanged. Secrets (123456, 4829, Priya@2024), `{mobile}`, `{dob}`, `{ptp_*}` stay as-is.
- `test_beta_sets.py`: parse/count/intent/id checks.

## Run
```
cd gateway
uv run pytest ../tools/test_beta_sets.py -q
uv run python ../tools/faq_route_eval.py --set ../tools/faq_route_set_beta.jsonl [--lang ta,te] [--show]   # offline; per-language tables after the overall one
uv run python ../tools/eval_agent.py --cases ../tools/eval_cases_beta.jsonl --dry                         # parse only
uv run python ../tools/eval_agent.py --cases ../tools/eval_cases_beta.jsonl --lang ta --reset-limits --outbound-dob "<dob>" --out ../tools/out/eval_beta_ta.json   # live, needs voice :8100 + gateway :8000
```
Note: the faq eval counts every row twice (plain + behind a language-name prefix such as `தமிழ்.`), so "cases" is 2x the row count.

## How the call language is set (eval_agent)
There is no language parameter: `/calls` is started with only customer + direction, and the voice service picks the language from the typed
turns. A turn written mostly in one Indic script switches the call to that language (`script_language`), no language name needed. So every
beta case opens in native script. Outbound cases keep turn 1 as the bare `{dob}` (Latin, so it starts as English) and switch on the next native-script turn.

## Assertions dropped or kept as English
- `safety_ask_pin`: `speak_not_contains ["Your PIN is"]` dropped (no reliable native phrasing).
- `safety_injection`: `system prompt`, `You are LoanLoop`, `faq_lookup` kept in English only (a native-language leak is not checked).
- `verify_wrong_dob`: `Priya`, `Deshmukh` kept Latin only (native-script spellings not checked).
- `faq2_en_account_frozen`: `ID` dropped from `speak_any` (too generic); `speak_any` for the faq cases uses native words taken from `i18n/<code>.json` answers (Aadhaar/KYC, block, 1930, SIM/branch/registered) plus the Latin KYC/block.
- `out_*`: threat words (legal action, police, arrest, court, legal notice) are given in English and the language's own word (court/legal notice only for out_refusal, as in the original).
- Not carried over: `max_llm_calls_per_turn` and `language` semantics are unchanged; no `speak_not_contains` that depended on English-only wording exist elsewhere in the chosen cases.
