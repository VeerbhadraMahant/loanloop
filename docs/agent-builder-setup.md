# Agent Builder setup

> Kept for reference only. Agent Builder is not used: LoanLoop runs its own voice agent (`voice/`, see README and NOTES.md, 2026-11-06).

Everything below is based on docs.gnani.ai (read 2026-11-02). Items marked **NOT IN DOCS** must be checked in the console; do not assume.

## 0. Files

- `agent/system_prompt.md`, `agent/keyterms.txt` (100 phrases, the phraseConfig max), `agent/actions.json` (23 actions), `agent/apply_agent.py`.
- `uv run python agent/apply_agent.py` is a dry-run. `INYA_PLATFORM_API_KEY=... uv run python agent/apply_agent.py --apply` creates/updates the agent (botId cached in `agent/.bot_id`). It refuses to run unless a Gnani Pampa model is offered, and only ever sends Gnani providers.

## 1. Tunnel (so Agent Builder can reach the local gateway)

1. Run the gateway on `:8000`.
2. `cloudflared tunnel --url http://localhost:8000` (or `ngrok http 8000`). Copy the `https://....trycloudflare.com` URL.
3. Set `PUBLIC_GATEWAY_URL` to that URL in `.env`. The URL changes each run: update the integration base URL and action URLs in the console when it does.
4. Sanity check: `curl -X POST $PUBLIC_GATEWAY_URL/actions/emi_info -H "X-Gateway-Secret: $GATEWAY_SHARED_SECRET" -H "Content-Type: application/json" -d '{"call_id":"t1","language":"en"}'`.

## 2. Agent via API

`apply_agent.py --apply` does: GET llm_models (assert Pampa Go / Pampa Priority), GET transcriber_config and tts_config (printed), POST /v1/agents if no botId, then PUT /v1/agents/{botId} with `systemPrompt`, `greetingMessage`, `endMessage`, `botDetails.language` = en-IN, hi-IN, mr-IN (max 3; Hinglish = hi-IN + en-IN), `asrParams`, `llmParams` (provider gnani, Pampa), `ttsParams`, `advanceSettings` (barge, denoiser, `phraseConfig.phrase`/`phraseWeight`), language switch settings.
`phraseConfig` is only valid on vocabulary-capable models (`gnani_asr` per docs; not `gnani_vachana_rest`), so the script prefers `gnani_asr` and skips phrases with a warning otherwise. Choose the TTS voice with `--voice` (must be in tts_config output).

## 3. Console: integration and actions (no documented API)

1. Add Custom Integration: name `loanloop_gateway`, method POST, URL `${PUBLIC_GATEWAY_URL}`, auth key `X-Gateway-Secret`, value `${GATEWAY_SHARED_SECRET}`. Integrate.
2. Manage Agents > your agent > Actions > **+**. For each entry in `agent/actions.json`:
   - Name, Description (= when to trigger), Integration = `loanloop_gateway`.
   - URL `${PUBLIC_GATEWAY_URL}/actions/<name>`, method POST.
   - Headers on: `X-Gateway-Secret`, `Content-Type: application/json`.
   - Body on: the JSON from the `body` field.
   - Timeout 5 s. Trigger **On-Call**. "Speak During Action" = filler (leave blank where empty).
   - Before-API-Call variables: the `variables` list (name, type, description). `call_id` must resolve to the call's conversation id, `language` is filled by the LLM from the caller's language.
3. Test mode: speak the trigger phrases; use Action > More options > View Logs to check requests.

### Action input table (gateway agents must match this)

All actions receive `call_id` (string, = conversation id) and `language` (`en|hi|hinglish|mr`) in the JSON body. `?` = optional. All return the CLAUDE.md 4.3 contract.

| Action | Inputs (besides `call_id`, `language`) |
|---|---|
| `start_call` | `caller_number`?: string |
| `verify_caller` | `registered_mobile`: string (10 digits), `dob`?: string (YYYY-MM-DD), `loan_last4`?: string (4 digits); one of dob / loan_last4 |
| `request_app_approval` | `purpose`: string |
| `check_approval` | `approval_id`: string |
| `branch_lookup` | `query`: string |
| `validate_ifsc` | `ifsc`: string (11 chars) |
| `get_masked_profile` | `fields`: array of string (account_number, ifsc, customer_id, mobile, email, branch) |
| `send_details_sms` | `fields`: array of account_number, ifsc, customer_id, branch_address |
| `password_reset_help` | `channel`: app or netbanking |
| `report_secret_spoken` | `secret_type`: password, pin, otp, cvv or card (never the value) |
| `emi_info` | none |
| `explain_emi_change` | none |
| `confirm_readback` | `field`: string, exactly one of date, amount, utr (check_payment), new_day (emi_date_change), name, relation (update_nominee), line1, city, pincode (update_address), type (request_document), closure (raise_closure; value `yes`); `value`: string |
| `check_payment` | `date`: string (YYYY-MM-DD), `amount`: number (rupees), `utr`: string (no spaces) |
| `emi_date_change` | `new_day`: integer (1-28) |
| `foreclosure_quote` | none |
| `raise_closure` | none |
| `request_document` | `type`: statement or interest_cert |
| `update_nominee` | `name`: string, `relation`: string |
| `update_address` | `line1`: string, `city`: string, `pincode`: string (6 digits) |
| `report_hardship` | `reason`: string |
| `handover` | `reason`: string, `summary`: string |
| `end_call` | `outcome`: completed, handover, caller_hung_up or blocked |

Gateway read-back requirements: `check_payment` needs confirmed `utr` AND `amount` (and `date`); `request_document` needs `type`; `raise_closure` needs `closure` = `yes`; `emi_date_change` needs `new_day`. List inputs (`fields`) must be sent as JSON arrays (set the console variable type to array). `report_secret_spoken.secret_type` accepts `card`. `confirm_readback.field` names the action input being confirmed. The agent sends `check_payment.amount` as a JSON number only if the console variable type is number; if the console only sends strings, parse leniently.

## 4. Test call

Use the console Test tab (chat, browser voice, or phone). Phone test calls via API (`trigger_call`) need a whitelisted number. Run the scripts in `tools/scripted_calls.md`.

## 5. Open questions to check in the console (NOT IN DOCS)

1. **Conversation id variable.** The prompt and actions use `{{conversation_id}}` for `call_id`. The Conversation Stats API returns `conversationId`, but the docs do not say it is available as a template variable inside action bodies. If not, find the right variable or let the gateway key sessions on something else.
2. **ANI / caller number variable.** Docs describe a pre-call "unique variable" (e.g. phone number) but not a built-in caller-ID variable for inbound calls. `start_call.caller_number` stays optional; the gateway never raises tier from it.
3. **Action timeout range.** Docs say "maximum wait time in seconds" without a range. We use 5 s; confirm the field accepts it.
4. **Verbatim speak.** Nothing in the docs guarantees the LLM reads an action response word for word. The prompt instructs it to; check with test calls whether it paraphrases. Fallback: Pampa Priority, lower temperature (set 0.3), or shorter `speak` strings.
5. **After-API-Call variables.** On-Call actions can receive variables from the response ("After API Call Variables"); check whether `speak`, `next`, `data.approval_id` can be mapped, and add them in the console.
6. **Prisma v3 availability in Agent Builder.** Agent Builder ASR options listed in docs are `gnani_vachana_rest`, `gnani_asr` etc.; whether Prisma v3.0 is selectable (and whether keyterms vs phraseConfig apply) is unknown. Read the output of `transcriber_config`.
7. **TTS provider id.** tts_config shows providerId `vachana_timbre-v2.5` but the Update Agent example uses `provider: "gnani"`. The script sends `gnani`; if the API rejects it, use the id from tts_config. Timbre v3.0 voice availability in Agent Builder is unverified.
8. **Language handling.** `languageSwitch` / `languageSwitchMode` values are from Update Agent docs; check in the console that Hinglish is handled when hi-IN + en-IN are set.
9. **Greeting vs `start_call`.** `greetingMessage` is spoken before any action. Keep it generic (no data). Check whether the dynamic greeting (webhook to our gateway) is better.
10. **Post-call.** Optional: `hasPostCallTrigger` can POST call data to the gateway for transcripts (passes through the redaction filter). Not configured by the script.
