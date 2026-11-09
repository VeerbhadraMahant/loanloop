"""SSE parsing, retry, cache and token rules. Mock transport only: no network, no Gnani credits."""
import asyncio
import base64
import json

import httpx
from fastapi.testclient import TestClient

from voice import tts as T
from voice.app import Settings, create_app

BASE = "http://127.0.0.1:8100"


def sse(*chunks: bytes) -> bytes:
    out = b"".join(b"event: chunk\ndata: " + json.dumps({"chunk_index": i, "audio": base64.b64encode(c).decode(), "is_final": False}).encode() + b"\n\n"
                   for i, c in enumerate(chunks))
    return out + b'event: complete\ndata: {"audio": "", "is_final": true}\n\n'


class Split(httpx.AsyncByteStream):
    def __init__(self, data: bytes, n: int):
        self.parts = [data[i:i + n] for i in range(0, len(data), n)]

    async def __aiter__(self):
        for p in self.parts:
            yield p


def collect(handler):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as h:
            return [c async for c in T.stream_pcm(h, "k", {"text": "x"})]
    return asyncio.run(go())


def test_chunks_split_across_reads_and_complete():
    body = sse(b"\x01\x02\x03", b"\x04\x05")
    got = collect(lambda r: httpx.Response(200, stream=Split(body, 7)))  # reads cut mid-line
    assert got == [b"\x01\x02\x03", b"\x04\x05"]


def test_retry_429_then_ok(monkeypatch):
    monkeypatch.setattr(T, "BACKOFF", (0, 0, 0))
    codes = [429, 503]

    def h(r):
        return httpx.Response(codes.pop(0)) if codes else httpx.Response(200, content=sse(b"ab"))
    assert collect(h) == [b"ab"] and not codes


def test_gives_up_after_retries(monkeypatch):
    monkeypatch.setattr(T, "BACKOFF", (0, 0))
    try:
        collect(lambda r: httpx.Response(429))
        raise AssertionError("expected error")
    except httpx.HTTPStatusError:
        pass


def test_error_event_raises():
    try:
        collect(lambda r: httpx.Response(200, content=b'event: error\ndata: {"message": "no"}\n\n'))
        raise AssertionError("expected error")
    except T.TTSError:
        pass


def test_cache_lru():
    c = T.PcmCache(2)
    c.put("a", b"1"), c.put("b", b"2"), c.get("a"), c.put("c", b"3")
    assert c.get("a") == b"1" and c.get("b") is None and c.get("c") == b"3"


def test_token_single_use_bound_and_expires(monkeypatch):
    t = T.Tokens(60)
    k = t.issue("call1", {})
    assert t.take("call2", k) is None  # wrong call (and consumed)
    k = t.issue("call1", {})
    assert t.take("call1", k) and t.take("call1", k) is None
    k = t.issue("call1", {})
    now = T.time.monotonic()
    monkeypatch.setattr(T.time, "monotonic", lambda: now + 61)
    assert t.take("call1", k) is None


def app_client(sse_calls):
    def h(r: httpx.Request):
        u = str(r.url)
        if "/actions/" in u:
            return httpx.Response(200, json={"ok": True, "speak": "hello there", "data": {}})
        if "tts/sse" in u:
            sse_calls.append(json.loads(r.content))
            return httpx.Response(200, content=sse(b"\x01\x00\x02\x00"))
        return httpx.Response(200, json={"message": {"role": "assistant", "content": "ok"}})
    cl = httpx.AsyncClient(transport=httpx.MockTransport(h))
    return TestClient(create_app(Settings(gnani_speech_api_key="K"), cl), base_url=BASE)


def test_stream_mode_url_cache_and_single_use():
    calls = []
    with app_client(calls) as c:
        d = c.post("/calls?stream=1", json={}).json()
        assert d["audio_b64"] == "" and d["audio_url"].startswith(f"/calls/{d['call_id']}/audio/")
        assert c.get("/calls/other/audio/zzz").status_code == 404
        r = c.get(d["audio_url"])
        assert r.content == b"\x01\x00\x02\x00" and r.headers["x-sample-rate"] == "16000"
        assert calls[0]["audio_config"]["container"] == "raw"
        assert c.get(d["audio_url"]).status_code == 404  # single use
        d2 = c.post("/calls?stream=1", json={}).json()  # same greeting: served from cache, no second SSE call
        assert c.get(d2["audio_url"]).content == b"\x01\x00\x02\x00" and len(calls) == 1
        t = c.post(f"/calls/{d['call_id']}/turn?stream=1", json={"text": "hi"}).json()
        assert t["audio_url"] and t["audio_b64"] == ""


def test_default_path_unchanged():
    with app_client([]) as c:
        assert "audio_url" not in c.post("/calls?tts=false", json={}).json()
