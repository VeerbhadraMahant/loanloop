# LoanLoop voice agent

Browser audio -> Gnani Prisma STT -> Ollama (qwen3:8b, 23 gateway actions as tools) -> gateway -> Gnani Timbre TTS.
Uses the gateway's uv project; no extra dependencies.

Run (gateway must be up on :8000, `ollama serve` with the model pulled):

    cd gateway
    uv run uvicorn voice.app:app --port 8100 --host 127.0.0.1 --app-dir ..

Test (all upstreams faked, no network, no Gnani credits):

    cd gateway && uv run pytest ../voice/tests

Env (process env, then `gateway/.env`): `GNANI_SPEECH_API_KEY` (fallback: `gnani_api_key` in repo-root `.env.local`),
`GATEWAY_URL` (http://127.0.0.1:8000), `GATEWAY_SHARED_SECRET`, `OLLAMA_URL` (http://127.0.0.1:11434), `OLLAMA_MODEL` (qwen3:8b).

LLM provider per call (hosted ones exist only for latency comparison; default stays local qwen3:8b, speech stays Gnani):
`LLM_PROVIDER` (ollama | gemini | sarvam, default ollama), `GEMINI_API_KEY`, `SARVAM_API_KEY` (both also read, case-insensitive,
from repo-root `.env.local`), `GEMINI_MODEL` (gemini-3.5-flash-lite), `SARVAM_MODEL` (sarvam-m),
`GEMINI_BASE_URL` (https://generativelanguage.googleapis.com/v1beta/openai), `SARVAM_BASE_URL` (https://api.sarvam.ai/v1),
`WARMUP` (true: one background Ollama warm-up request at startup; `keep_alive` is -1 on every Ollama request).
Keys are never logged or returned.

`POST /calls` takes an optional JSON field `"llm": "ollama" | "gemini" | "sarvam"` (default `LLM_PROVIDER`). Unknown value or a
provider without a key gives 422. The choice is fixed for the whole call.

Timings: `POST /calls` and `POST /calls/{id}/turn` return `"timings"` (ints in ms): `stt_ms`, `llm_ms`, `llm_calls`, `gateway_ms`,
`gateway_calls`, `tts_ms`, `total_ms`, `other_ms`, plus `provider` and `model`. One log line per turn carries the same numbers.
Latency: the system prompt no longer holds the call id (it is in the first user message), so Ollama's prompt cache is shared
across calls; a single read-only action (branch_lookup, emi_info, explain_emi_change, send_details_sms, get_masked_profile,
validate_ifsc, password_reset_help, foreclosure_quote) answers with the gateway sentence without a second LLM round.

`GET /health` also returns `"default"` and `"providers": {"ollama": {"model", "ready"}, "gemini": {...}, "sarvam": {...}}`
(`ready` = a key is configured; ollama is always true).

`VOICE_PORT` (8100) must match the port you serve on: the Host-header check only accepts `127.0.0.1:<port>` and `localhost:<port>`.
End-to-end typed demo calls (no Gnani credits): `python tools/voice_e2e.py --voice http://127.0.0.1:8100`.

API: `POST /calls`, `POST /calls/{id}/turn` (multipart `audio` WAV, or JSON `{"text": "..."}`), `GET /health`.
Add `?tts=false` (or `"tts": false` in the JSON body) to skip TTS and save credits.
