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

`VOICE_PORT` (8100) must match the port you serve on: the Host-header check only accepts `127.0.0.1:<port>` and `localhost:<port>`.
End-to-end typed demo calls (no Gnani credits): `python tools/voice_e2e.py --voice http://127.0.0.1:8100`.

API: `POST /calls`, `POST /calls/{id}/turn` (multipart `audio` WAV, or JSON `{"text": "..."}`), `GET /health`.
Add `?tts=false` (or `"tts": false` in the JSON body) to skip TTS and save credits.
