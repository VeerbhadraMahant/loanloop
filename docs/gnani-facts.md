# Gnani platform facts (read from docs.gnani.ai on 2026-11-02)

## Speech base and auth
- Base `https://api.vachana.ai`, header `X-API-Key-ID: <key>` (optional `X-API-Request-ID`).
- Errors: auth/rate `{"detail": {"error_code","message","status_code"}}`; 401 MISSING_API_KEY / INVALID_API_KEY, 403 SCOPE_NOT_ALLOWED, 429 RATE_LIMITED (no Retry-After). Retry 429/500/503/504 with backoff 0.5/1/2 s, 3 attempts.

## STT (Prisma)
- REST: `POST https://api.vachana.ai/stt/v3`, multipart. Fields: `audio_file`, `model=prisma-v3.0`, `language_code` (e.g. `hi-IN,mr-IN,en-IN` up to 4, or `indic-auto`), `format` (verbatim | transcribe | codemix | transliterate), `keyterms` (≤200), `topic` (≤1600 chars), `previous_text`, `enable_substitution`, `substitution_map`.
- Response: `success, request_id, transcript, model, detected_language_code, processing_time, end_to_end_latency`.
- Audio: WAV/MP3/OGG/FLAC/AAC/M4A, 0.1–30 s per clip.
- Streaming: `wss://api.vachana.ai/stt/v3/stream`, config in headers, raw PCM s16le mono, one transcript per VAD segment (no partials). Doc conflict: `model` vs `x-model` header.
- Python SDK: `pip install gnani-vachana` (not in our allowed deps; we use httpx).
- Exact keyterms wire format (JSON array vs comma string) is not spelled out: try JSON-encoded list first, fall back to comma-separated.

## TTS (Timbre)
- REST `POST /api/v1/tts/inference` (binary audio); SSE `POST /api/v1/tts/sse`; WS `wss://api.vachana.ai/api/v1/tts`.
- Only ONE active TTS request per account at a time, else 429 → tools must be sequential.
- `timbre-v3.0`: 13 voices, all speak all languages. Female: Shivani, Lakshmi, Kalpana, Chetana, Vasudha, Riyaa, Tarika. Male: Avinash, Shubham, Prakash, Devansh, Yashraj, Harshad.
- language: auto, hi-IN, en-IN, mr-IN, hi-en (Hinglish), ... ; speed 0.85–1.15; sample_rate 8000–48000; container wav/raw/mp3/ogg/mulaw/alaw.
- Text normalisation (relevant to our `speak` strings):
  - Rupees: write `₹2,50,000` (Indian grouping) → "two lakh fifty thousand rupees"; `₹4,312.50` → "... and fifty paise".
  - Dates: `DD/MM/YYYY`. `23/06` alone reads as a fraction — always include year, or use month names.
  - Long references (14+ digits) read raw → separate with hyphens/spaces.
  - Digits may compress ("448822" → "double four ..."). Fine for masked last-4.

## Voice cloning
- Embedding: `POST /api/v1/tts/voice-clone/embeddings`, multipart `audio_file`, 5–30 s clean audio. Returns `data.voice_clone_embedding {embedding, shape [1,768], dtype}`.
- Synthesis: same TTS endpoints with `model: "vachana-vc-v1"` and `speaker_embedding {embedding, shape, dtype}`, no `voice`.

## Agent Builder
See NOTES.md section "Agent Builder findings".
