"""All upstreams (Ollama, gateway, Gnani) faked with httpx.MockTransport: no network, no Gnani credits."""
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from voice.app import Settings, create_app, load_tools, redact

KEY = "KEY-SHOULD-NEVER-LEAK-123"
SECRET = "GW-SECRET-XYZ"


class Fake:
    def __init__(self):
        self.llm_script = []  # list of ollama messages, popped per /api/chat call
        self.sent = []  # (kind, url, json/data)
        self.fail = None  # kind to fail with 500

    def handler(self, req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "11434" in url:
            kind = "llm"
        elif "/actions/" in url:
            kind = "gw"
        elif "stt/v3" in url:
            kind = "stt"
        else:
            kind = "tts"
        body = req.content if kind == "stt" else (json.loads(req.content) if req.content else {})
        self.sent.append((kind, url, body, dict(req.headers)))
        if self.fail == kind:
            return httpx.Response(500, text=f"upstream secret body {KEY}")
        if kind == "llm":
            msg = self.llm_script.pop(0) if self.llm_script else {"role": "assistant", "content": "ok"}
            return httpx.Response(200, json={"message": msg})
        if kind == "gw":
            name = url.rsplit("/", 1)[1]
            return httpx.Response(200, json={"ok": True, "speak": f"{name} done", "data": {}})
        if kind == "stt":
            return httpx.Response(200, json={"success": True, "transcript": "my pin is 4321 mobile 9876543210"})
        return httpx.Response(200, content=b"RIFFwav")

    def of(self, kind):
        return [s for s in self.sent if s[0] == kind]


def tc(name, **args):
    return {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": name, "arguments": args}}]}


@pytest.fixture
def env():
    fake = Fake()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    cfg = Settings(gnani_speech_api_key=KEY, gateway_shared_secret=SECRET)
    with TestClient(create_app(cfg, client)) as tc_:
        yield tc_, fake


def new_call(c):
    r = c.post("/calls", json={"customer": "priya"})
    assert r.status_code == 200
    return r.json()


def test_tools_from_actions_json():
    tools, known = load_tools()
    assert len(tools) == 23 and len(known) == 23
    for t in tools:
        f = t["function"]
        assert "call_id" not in f["parameters"]["properties"] and "call_id" not in f["parameters"]["required"]
    lang = next(t for t in tools if t["function"]["name"] == "verify_caller")["function"]["parameters"]["properties"]["language"]
    assert lang["enum"] == ["en", "hi", "hinglish", "mr"]


def test_health_and_cors(env):
    c, _ = env
    assert c.get("/health").json() == {"ok": True, "model": "qwen3:8b"}
    r = c.options("/calls", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    r = c.options("/calls", headers={"Origin": "http://evil.com", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers


def test_start_call_greeting_and_tts_toggle(env):
    c, fake = env
    d = new_call(c)
    assert d["agent_text"] == "start_call done" and d["audio_b64"] and d["mime"] == "audio/wav" and not d["ended"]
    n = len(fake.of("tts"))
    assert c.post("/calls?tts=false", json={}).json()["audio_b64"] == ""
    assert len(fake.of("tts")) == n
    tts_body = fake.of("tts")[0][2]
    assert tts_body["audio_config"]["container"] == "wav" and tts_body["language"] == "hi-IN"


def test_text_turn_injects_call_id_and_tracks_language(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info", call_id="ATTACKER", language="mr"), {"role": "assistant", "content": "Your EMI is X"}]
    r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "emi?"}).json()
    assert r["agent_text"] == "Your EMI is X" and r["language"] == "mr"
    assert r["actions"] == [{"name": "emi_info", "ok": True}]
    kind, url, body, headers = fake.of("gw")[-1]
    assert body["call_id"] == d["call_id"] and url.endswith("/actions/emi_info")
    assert headers["x-gateway-secret"] == SECRET
    assert fake.of("stt") == []
    assert fake.of("tts")[-1][2]["language"] == "mr-IN"
    # system prompt has the call id substituted
    sysmsg = fake.of("llm")[-1][2]["messages"][0]["content"]
    assert d["call_id"] in sysmsg and "{{conversation_id}}" not in sysmsg


def test_unknown_tool_rejected(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("drop_tables"), {"role": "assistant", "content": "sorry"}]
    r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hi"}).json()
    assert r["actions"] == [{"name": "unknown", "ok": False}]
    assert all("drop_tables" not in s[1] for s in fake.of("gw"))


def test_tool_loop_stops_at_5_and_falls_back_to_speak(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info") for _ in range(20)]
    r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hi"}).json()
    assert len(fake.of("llm")) == 5 and len(r["actions"]) == 5
    assert r["agent_text"] == "emi_info done"


def test_empty_llm_text_falls_back_to_speak_and_end_call(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("end_call", outcome="done"), {"role": "assistant", "content": ""}]
    r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "bye"}).json()
    assert r["agent_text"] == "end_call done" and r["ended"] is True


def test_audio_turn_calls_stt_and_redacts(env):
    c, fake = env
    d = new_call(c)
    r = c.post(f"/calls/{d['call_id']}/turn", files={"audio": ("t.wav", b"RIFFdata", "audio/wav")})
    assert r.status_code == 200
    kind, url, body, headers = fake.of("stt")[0]
    assert url == "https://api.vachana.ai/stt/v3" and headers["x-api-key-id"] == KEY
    assert b"prisma-v3.0" in body and b"audio_file" in body and b"keyterms" in body
    u = r.json()["user_text"]
    assert "4321" not in u and "9876543210" not in u
    assert redact("call me on 9876543210") == "call me on ******3210"  # long digit runs masked, last 4 kept
    # raw transcript still reached the LLM (it is the caller's words) but redaction is for the browser
    assert fake.of("llm")


def test_upstream_errors_are_generic_502(env):
    c, fake = env
    d = new_call(c)
    for kind in ("llm", "gw", "tts"):
        fake.fail = kind
        fake.llm_script = [tc("emi_info")] if kind == "gw" else []
        r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "hi"})
        assert r.status_code == 502 and KEY not in r.text and "upstream secret" not in r.text
    fake.fail = "stt"
    r = c.post(f"/calls/{d['call_id']}/turn", files={"audio": ("t.wav", b"x", "audio/wav")})
    assert r.status_code == 502 and KEY not in r.text


def test_keys_not_in_logs_or_responses(env, caplog):
    c, fake = env
    caplog.set_level(logging.DEBUG)
    d = new_call(c)
    fake.llm_script = [tc("emi_info"), {"role": "assistant", "content": "fine"}]
    r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "my otp is 123456"})
    fake.fail = "tts"
    c.post(f"/calls/{d['call_id']}/turn", json={"text": "again"})
    logs = caplog.text
    for secret in (KEY, SECRET, "123456"):
        assert secret not in logs and secret not in r.text
    assert "emi_info" in logs
