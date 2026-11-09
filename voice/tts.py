"""Gnani Timbre SSE streaming (headerless 16-bit mono PCM) + small caches. Never logs text or keys."""
import asyncio
import base64
import json
import secrets
import time
from collections import OrderedDict

import httpx

SSE_URL = "https://api.vachana.ai/api/v1/tts/sse"
RATE = 16000
RAW_CONFIG = {"sample_rate": RATE, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "raw"}
RETRY_CODES, BACKOFF = {429, 500, 503, 504}, (0.5, 1, 2)  # Gnani allows ONE active TTS request per account


class TTSError(RuntimeError):
    pass


async def parse_sse(lines):
    """SSE lines -> PCM bytes. `event: chunk` carries base64 audio; `complete` (or is_final) ends the stream."""
    event = "message"
    async for line in lines:
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            try:
                d = json.loads(line[5:])
            except ValueError:
                raise TTSError("bad sse data") from None
            if event == "error" or not isinstance(d, dict):
                raise TTSError("sse error")
            if d.get("audio"):
                yield base64.b64decode(d["audio"])
            if event == "complete" or d.get("is_final"):
                return
        elif not line:
            event = "message"


async def stream_pcm(http: httpx.AsyncClient, key: str, payload: dict, url: str = SSE_URL):
    """Yield PCM chunks as Gnani produces them. Retries 429/5xx before the first byte only."""
    for attempt in range(len(BACKOFF) + 1):
        async with http.stream("POST", url, headers={"X-API-Key-ID": key}, json=payload, timeout=60) as r:
            if r.status_code in RETRY_CODES and attempt < len(BACKOFF):
                await r.aread()
            else:
                r.raise_for_status()
                async for pcm in parse_sse(r.aiter_lines()):
                    yield pcm
                return
        await asyncio.sleep(BACKOFF[attempt])


class PcmCache:
    """LRU of full PCM for fixed lines, keyed by (text, voice, language, speed)."""

    def __init__(self, size: int = 64):
        self.size, self.d = size, OrderedDict()

    def get(self, k):
        if k in self.d:
            self.d.move_to_end(k)
            return self.d[k]

    def put(self, k, pcm: bytes):
        self.d[k] = pcm
        if len(self.d) > self.size:
            self.d.popitem(last=False)


class Tokens:
    """Random, single-use, short-lived, bound to one call."""

    def __init__(self, ttl: float = 60):
        self.ttl, self.d = ttl, {}

    def issue(self, call_id: str, job: dict) -> str:
        now = time.monotonic()
        for t in [t for t, v in self.d.items() if v["exp"] < now]:
            del self.d[t]
        t = secrets.token_urlsafe(16)
        self.d[t] = {**job, "call_id": call_id, "exp": now + self.ttl}
        return t

    def take(self, call_id: str, token: str) -> dict | None:
        v = self.d.pop(token, None)
        return v if v and v["call_id"] == call_id and v["exp"] >= time.monotonic() else None
