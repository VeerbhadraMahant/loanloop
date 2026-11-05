"""All upstreams (Ollama, gateway, Gnani) faked with httpx.MockTransport: no network, no Gnani credits."""
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from voice.app import Settings, create_app, load_tools, redact

BASE = "http://127.0.0.1:8100"
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
    with TestClient(create_app(cfg, client), base_url=BASE) as tc_:
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
    assert not fake.of("llm")  # the transcript held a PIN: handled without the LLM


def test_upstream_errors_are_generic_502(env):
    c, fake = env
    d = new_call(c)
    for kind in ("llm", "gw"):
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
    r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "my emi 123456"})
    fake.fail = "tts"
    c.post(f"/calls/{d['call_id']}/turn", json={"text": "again"})
    logs = caplog.text
    for secret in (KEY, SECRET, "123456"):
        assert secret not in logs and secret not in r.text
    assert "emi_info" in logs


def turn(c, d, text):
    return c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": text})


def swap_app(handler):
    cl = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return TestClient(create_app(Settings(gnani_speech_api_key=KEY), cl), base_url=BASE)


def test_raw_secret_never_reaches_ollama_or_history(env, caplog):
    c, fake = env
    caplog.set_level(logging.DEBUG)
    d = new_call(c)
    llm_before = len(fake.of("llm"))
    j = turn(c, d, "my pin is 4321").json()
    assert j["agent_text"] == "report_secret_spoken done"
    assert j["actions"] == [{"name": "report_secret_spoken", "ok": True}]
    assert len(fake.of("llm")) == llm_before  # no LLM call
    gw = fake.of("gw")[-1]
    assert gw[2]["secret_type"] == "pin" and gw[2]["call_id"] == d["call_id"]
    assert turn(c, d, "what is my emi").status_code == 200  # next LLM call sees only the placeholder
    blob = json.dumps(fake.of("llm")[-1][2]) + json.dumps(j) + caplog.text
    assert "4321" not in blob and "it was removed" in blob


def test_string_arguments_parsed_and_written_back(env):
    c, fake = env
    d = new_call(c)
    msg = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "emi_info", "arguments": '{"language": "hi"}'}}]}
    fake.llm_script = [msg, {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "मेरी ईएमआई").json()["language"] == "hi"
    sent = fake.of("llm")[-1][2]["messages"]
    assistant = next(m for m in sent if m.get("tool_calls"))
    assert assistant["tool_calls"][0]["function"]["arguments"] == {"language": "hi"}
    bad = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "emi_info", "arguments": "{bad"}}]}
    fake.llm_script = [bad, {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "again").status_code == 200


def test_non_string_language_ignored(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info", language=["mr"]), {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "emi").json()["language"] == "hinglish"


def test_ended_call_409_and_expired_404(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("end_call", outcome="done"), {"role": "assistant", "content": "bye"}]
    assert turn(c, d, "bye").json()["ended"] is True
    assert turn(c, d, "hello").status_code == 409
    d2 = new_call(c)
    c.app.state.calls[d2["call_id"]]["ts"] -= 4000
    assert turn(c, d2, "hi").status_code == 404
    assert d2["call_id"] not in c.app.state.calls


def test_failed_turn_truncates_history_and_tts_is_soft(env):
    c, fake = env
    d = new_call(c)
    n = len(c.app.state.calls[d["call_id"]]["messages"])
    fake.fail = "llm"
    assert turn(c, d, "hi").status_code == 502
    assert len(c.app.state.calls[d["call_id"]]["messages"]) == n
    fake.fail = "tts"
    r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "hi"})
    assert r.status_code == 200 and r.json()["audio_b64"] == "" and r.json()["agent_text"]


def test_history_capped_and_num_ctx(env):
    c, fake = env
    d = new_call(c)
    for i in range(25):
        turn(c, d, f"msg {i}")
    sent = fake.of("llm")[-1][2]
    assert sent["options"] == {"num_ctx": 8192}
    assert len(sent["messages"]) <= 31 and sent["messages"][0]["role"] == "system"
    assert sent["messages"][1]["role"] != "tool"


def test_oversize_413_and_binary_wav(env):
    c, fake = env
    d = new_call(c)
    big = c.post(f"/calls/{d['call_id']}/turn", files={"audio": ("t.wav", b"\0" * 2_100_000, "audio/wav")})
    assert big.status_code == 413 and not fake.of("stt")
    wav = bytes(range(256)) * 4 + b"\r\n--boundary\r\n"  # binary incl. CRLF bytes
    c.post(f"/calls/{d['call_id']}/turn?tts=false", files={"audio": ("t.wav", wav, "audio/wav")})
    assert wav in fake.of("stt")[-1][2]


def test_empty_transcript_reprompts_without_llm():
    seen = []

    def handler(req):
        seen.append(str(req.url))
        if "stt/v3" in str(req.url):
            return httpx.Response(200, json={"success": True, "transcript": "  "})
        if "/actions/" in str(req.url):
            return httpx.Response(200, json={"ok": True, "speak": "hi"})
        return httpx.Response(200, content=b"RIFF")
    with swap_app(handler) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = c.post(f"/calls/{d['call_id']}/turn?tts=false", files={"audio": ("t.wav", b"RIFFx", "audio/wav")}).json()
    assert "sunai nahi diya" in r["agent_text"] and r["actions"] == []
    assert not any("11434" in u for u in seen)


def test_content_type_host_and_call_cap(env):
    c, _ = env
    d = new_call(c)
    r = c.post(f"/calls/{d['call_id']}/turn", content='{"text": "hi"}', headers={"content-type": "text/plain"})
    assert r.status_code == 415
    assert c.get("/health", headers={"host": "evil.com"}).status_code == 400
    for _ in range(49):
        assert c.post("/calls?tts=false", json={}).status_code == 200
    assert c.post("/calls?tts=false", json={}).status_code == 429


def test_ifsc_and_amounts_survive_agent_text_but_mobiles_do_not(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [{"role": "assistant", "content": "IFSC SAHY0000101 EMI 32,055 ID 1234567 mobile 9000014417"}]
    t = turn(c, d, "hello").json()["agent_text"]
    assert "SAHY0000101" in t and "32,055" in t and "1234567" in t and "9000014417" not in t and t.endswith("4417")
    from voice.app import mask_digits
    assert mask_digits("SAHY0000101") == "SAHY0000101"  # also exempt in the stricter user-text mask


def test_roman_script_hi_becomes_hinglish_and_devanagari_keeps_hi(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info", language="hi"), {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "mera emi kitna hai").json()["language"] == "hinglish"
    assert fake.of("gw")[-1][2]["language"] == "hinglish"
    fake.llm_script = [tc("emi_info", language="hi"), {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "मेरी ईएमआई कितनी है").json()["language"] == "hi"
    assert fake.of("gw")[-1][2]["language"] == "hi"


def test_pending_request_hint_after_verify():
    state = {"verified": False}

    def handler(req):
        url = str(req.url)
        if "11434" in url:
            body = json.loads(req.content)
            last = body["messages"][-1]
            if last["role"] == "user" and "emi" in last["content"]:
                return httpx.Response(200, json={"message": tc("emi_info")})
            if last["role"] == "tool" and last["tool_name"] == "emi_info":
                return httpx.Response(200, json={"message": {"role": "assistant", "content": "done"}})
            if last["role"] == "user":
                return httpx.Response(200, json={"message": tc("verify_caller", registered_mobile="9000014417", dob="1991-08-14")})
            seen.append(last["content"])
            return httpx.Response(200, json={"message": {"role": "assistant", "content": "verified"}})
        if url.endswith("/actions/emi_info"):
            if not state["verified"]:
                return httpx.Response(200, json={"ok": False, "speak": "please verify", "next": "need_tier_1"})
            return httpx.Response(200, json={"ok": True, "speak": "EMI is X"})
        if url.endswith("/actions/verify_caller"):
            state["verified"] = True
            return httpx.Response(200, json={"ok": True, "speak": "verified", "next": None})
        return httpx.Response(200, json={"ok": True, "speak": "hi"})
    seen = []
    with swap_app(handler) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r1 = turn(c, d, "what is my emi")
        assert r1.json()["actions"] == [{"name": "emi_info", "ok": False}]
        turn(c, d, "my number is nine")
    assert any('"pending_request": "emi_info"' in s and "Now call emi_info" in s for s in seen)


def test_mask_digits_grouped_and_dates():
    from voice.app import mask_digits
    assert mask_digits("call 9876 543 210 now") == "call **** **3 210 now"
    assert mask_digits("9876-543-210") == "****-**3-210"
    assert mask_digits("due 2024-11-06") == "due 2024-11-06"
    assert mask_digits("ending 4417") == "ending 4417"


def test_agent_text_redacted_before_return(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [{"role": "assistant", "content": "your number is 9876543210"}]
    r = turn(c, d, "hello").json()
    assert "9876543210" not in r["agent_text"] and r["agent_text"].endswith("3210")


def test_gateway_non_dict_is_502():
    def handler(req):
        return httpx.Response(200, json=["x"])
    with swap_app(handler) as c:
        assert c.post("/calls", json={}).status_code == 502


def test_concurrent_turns_serialised():
    import asyncio
    fake = Fake()

    async def slow(req):
        await asyncio.sleep(0.05)
        return fake.handler(req)

    app = create_app(Settings(gnani_speech_api_key=KEY), httpx.AsyncClient(transport=httpx.MockTransport(slow)))

    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as cl:
            d = (await cl.post("/calls?tts=false", json={})).json()
            url = f"/calls/{d['call_id']}/turn?tts=false"
            await asyncio.gather(cl.post(url, json={"text": "a"}), cl.post(url, json={"text": "b"}))
            return [m["role"] for m in app.state.calls[d["call_id"]]["messages"]]
    assert asyncio.run(go()) == ["system", "user", "assistant", "user", "assistant", "user", "assistant"]
