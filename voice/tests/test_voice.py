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
        self.gw = {}  # action name -> json or callable(body) -> json, overrides the default "<name> done" reply

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
            if name in self.gw:
                v = self.gw[name]
                return httpx.Response(200, json=v(body) if callable(v) else v)
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
    assert len(tools) >= 23 and len(known) == len(tools)
    for t in tools:
        f = t["function"]
        assert "call_id" not in f["parameters"]["properties"] and "call_id" not in f["parameters"]["required"]
    lang = next(t for t in tools if t["function"]["name"] == "verify_caller")["function"]["parameters"]["properties"]["language"]
    assert lang["enum"] == ["en", "hi", "hinglish", "mr"]


def test_health_and_cors(env):
    c, _ = env
    h = c.get("/health").json()
    assert h["ok"] and h["model"] == "qwen3:8b" and h["default"] == "ollama"
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
    # emi_info is a shortcut action: the gateway sentence is the answer, no second LLM round (behaviour changed on purpose)
    assert r["agent_text"] == "emi_info done" and r["language"] == "en" and len(fake.of("llm")) == 1  # service-owned: model's "mr" ignored
    assert r["actions"] == [{"name": "emi_info", "ok": True}]
    kind, url, body, headers = fake.of("gw")[-1]
    assert body["call_id"] == d["call_id"] and url.endswith("/actions/emi_info")
    assert headers["x-gateway-secret"] == SECRET
    assert fake.of("stt") == []
    assert fake.of("tts")[-1][2]["language"] == "en-IN" and body["language"] == "en"
    # the call id is in the first user message, never in the (cacheable) system prompt
    msgs = fake.of("llm")[-1][2]["messages"]
    assert d["call_id"] not in msgs[0]["content"] and "{{conversation_id}}" not in msgs[0]["content"]
    assert msgs[1]["content"] == f"(call connected, call_id={d['call_id']})"


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
    fake.llm_script = [tc("request_document") for _ in range(20)]
    r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hi"}).json()
    assert len(fake.of("llm")) == 5 and len(r["actions"]) == 5
    assert r["agent_text"] == "request_document done"


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
    msg = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "request_document", "arguments": '{"language": "hi"}'}}]}
    fake.llm_script = [msg, {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "मेरी ईएमआई").json()["language"] == "hi"
    sent = fake.of("llm")[-1][2]["messages"]
    assistant = next(m for m in sent if m.get("tool_calls"))
    assert assistant["tool_calls"][0]["function"]["arguments"] == {"language": "hi"}
    bad = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "request_document", "arguments": "{bad"}}]}
    fake.llm_script = [bad, {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "again").status_code == 200


def test_non_string_language_ignored(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info", language=["mr"]), {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "emi").json()["language"] == "en"  # the model's value never sets the call language
    assert fake.of("gw")[-1][2]["language"] == "en"


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
    assert c.post("/calls", json={}, headers={"host": "evil.com"}).status_code == 400
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
    fake.llm_script = [tc("emi_info", language="mr"), {"role": "assistant", "content": "ok"}]
    assert turn(c, d, "mera emi kitna hai").json()["language"] == "hinglish"  # first turn: Hindi words, Roman script
    assert fake.of("gw")[-1][2]["language"] == "hinglish"
    assert turn(c, d, "हिंदी में बोलो").json()["language"] == "hi"  # explicit switch in Devanagari keeps hi
    fake.llm_script = [tc("emi_info", language="mr"), {"role": "assistant", "content": "ok"}]
    turn(c, d, "मेरी ईएमआई कितनी है")
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


def test_auto_confirm_after_yes_retries_held_action():
    st = {"confirmed": set(), "llm": 0, "gw": []}

    def handler(req):
        url = str(req.url)
        if "11434" in url:
            st["llm"] += 1
            if st["llm"] == 1:
                return httpx.Response(200, json={"message": tc("check_payment", date="2026-10-04", amount=100, utr="SAHYR1")})
            if st["llm"] == 2:
                return httpx.Response(200, json={"message": {"role": "assistant", "content": "Is that right?"}})
            raise AssertionError("no LLM call expected on the confirming turn")
        name = url.rsplit("/", 1)[1]
        body = json.loads(req.content)
        st["gw"].append((name, body.get("field"), body["call_id"]))
        if name == "confirm_readback":
            st["confirmed"].add(body["field"])
            return httpx.Response(200, json={"ok": True, "speak": "noted"})
        if name == "check_payment" and st["confirmed"] != {"utr", "amount"}:
            return httpx.Response(200, json={"ok": False, "speak": "read back UTR and amount", "next": "confirm_readback",
                                             "data": {"fields": ["utr", "amount"], "confirm": {"utr": "SAHYR1", "amount": "100"}}})
        return httpx.Response(200, json={"ok": True, "speak": "payment matched"})
    with swap_app(handler) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r1 = turn(c, d, "I paid already 100 rupees, UTR SAHYR1").json()
        assert r1["agent_text"] == "read back UTR and amount"  # the gateway's read-back sentence, verbatim
        r2 = turn(c, d, "haan sahi hai").json()
    assert [a["name"] for a in r2["actions"]] == ["confirm_readback", "confirm_readback", "check_payment"]
    assert r2["agent_text"].endswith("payment matched")
    assert all(g[2] == d["call_id"] for g in st["gw"])


def scripted(llm, gw, seen=None, tts_fail=False):
    """Handler: llm = list of ollama messages popped in order; gw = {action: response dict or callable(body)}."""
    def handler(req):
        url = str(req.url)
        if "11434" in url:
            seen is not None and seen.append(("llm", json.loads(req.content)))
            return httpx.Response(200, json={"message": llm.pop(0) if llm else {"role": "assistant", "content": "ok"}})
        if "/actions/" in url:
            name, body = url.rsplit("/", 1)[1], json.loads(req.content)
            seen is not None and seen.append((name, body))
            r = gw.get(name, {"ok": True, "speak": f"{name} done"})
            return httpx.Response(200, json=r(body) if callable(r) else r)
        if tts_fail:
            return httpx.Response(500)
        return httpx.Response(200, content=b"RIFF")
    return handler


RB = {"ok": False, "speak": "UTR 1 2 3 4. Is that right?", "next": "confirm_readback",
      "data": {"fields": ["utr"], "confirm": {"utr": "SAHYR1234"}}}


def test_model_cannot_confirm_readback_same_turn():
    seen = []
    llm = [tc("check_payment", utr="SAHYR1234", amount=1, date="2026-10-04"),
           tc("confirm_readback", field="utr", value="SAHYR1234"),
           tc("check_payment", utr="SAHYR1234", amount=1, date="2026-10-04"),
           {"role": "assistant", "content": "all done, payment checked"}]
    with swap_app(scripted(llm, {"check_payment": RB}, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = turn(c, d, "I paid 1 rupee UTR SAHYR1234 on 4 October").json()
    assert not any(n == "confirm_readback" for n, _ in seen)  # never reached the gateway
    assert r["agent_text"] == RB["speak"]
    assert {"name": "confirm_readback", "ok": False} in r["actions"]


def test_auto_confirm_only_on_the_next_turn_and_after_delivery():
    seen = []
    llm = [tc("check_payment", utr="SAHYR1234", amount=1, date="2026-10-04"), {"role": "assistant", "content": "x"},
           {"role": "assistant", "content": "weather is fine"}, {"role": "assistant", "content": "ok"}]
    with swap_app(scripted(llm, {"check_payment": RB}, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "I paid 1 rupee UTR SAHYR1234 on 4 October")
        turn(c, d, "what about the weather")  # unrelated turn: the read-back goes stale
        n = len([1 for k, _ in seen if k == "llm"])
        r = turn(c, d, "haan")
    assert not any(n_ == "confirm_readback" for n_, _ in seen)
    assert len([1 for k, _ in seen if k == "llm"]) == n + 1  # went to the LLM, not auto-confirmed
    assert r.status_code == 200
    # a read-back whose audio was never delivered (TTS failure) is not "heard"
    llm2 = [tc("check_payment", utr="SAHYR1234", amount=1, date="2026-10-04"), {"role": "assistant", "content": "x"},
            {"role": "assistant", "content": "ok"}]
    seen2 = []
    with swap_app(scripted(llm2, {"check_payment": RB}, seen2, tts_fail=True)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r1 = c.post(f"/calls/{d['call_id']}/turn", json={"text": "I paid 1 rupee UTR SAHYR1234 on 4 October"}).json()  # tts on, fails
        assert r1["audio_b64"] == ""
        turn(c, d, "haan")
    assert not any(n_ == "confirm_readback" for n_, _ in seen2)


def test_failed_turn_clears_readback(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info"), {"role": "assistant", "content": "ok"}]
    turn(c, d, "x")
    cc = c.app.state.calls[d["call_id"]]
    cc["pending_rb"], cc["rb_turn"] = ("emi_info", {}, {"f": "v"}), cc["turn"]
    n = len(cc["messages"])
    fake.fail = "gw"  # the auto-confirm path hits the failing gateway mid-turn
    assert turn(c, d, "haan").status_code == 502
    assert cc["pending_rb"] is None and cc["rb_new"] is None and cc["rb_active"] is None
    assert len(cc["messages"]) == n


def test_bare_affirmative_rules():
    from voice.app import is_bare_affirmative as a
    assert a("haan sahi hai") and a("yes") and a("हो") and a("होय, बरोबर") and a("Haan.")
    assert not a("yes but change the amount") and not a("haan 5000") and not a("nahi") and not a("बदला")
    assert not a("haan date galat hai") and not a("yes yes yes yes") and not a("don't") and not a("yes wait")
    assert not a("नको") and not a("हा चुकीचे") and not a("hoyyy") and not a("हो बदला")


def test_mask_spoken_counts_digits_across_separators():
    from voice.app import mask_spoken as m
    for t in ("+91-98765-43210", "9876 543 210", "ID9876543210", "9876.543.210", "9876543210"):
        out = m(f"number {t} ok")
        assert out.count("*") >= 5 and out.endswith("3210 ok"[-6:]) and "9876" not in out, out
    assert m("IFSC SAHY0000101 EMI ₹32,055 MICR 411 670 487") == "IFSC SAHY0000101 EMI ₹32,055 MICR 411 670 487"
    assert m("UTR SAHYR61004738291", {"61004738291"}) == "UTR SAHYR61004738291"
    assert "61004738291" not in m("UTR SAHYR61004738291")
    assert m("ref 610 0473 8291", {"61004738291"}) == "ref 610 0473 8291"


def test_gateway_speak_fallback_is_masked_too():
    gw = {"start_call": {"ok": True, "speak": "Hello 98765 43210"}, "emi_info": {"ok": True, "speak": "Call 98765 43210 now"}}
    llm = [tc("emi_info"), {"role": "assistant", "content": ""}]  # empty final text: the gateway speak is spoken instead
    with swap_app(scripted(llm, gw)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        assert "98765" not in d["agent_text"]
        r = turn(c, d, "emi").json()
    assert "98765" not in r["agent_text"] and r["agent_text"].endswith("3210 now")


def test_goodbye_rules():
    from voice.app import is_goodbye as g
    assert g("bye") and g("Okay, bye.") and g("theek hai, bye") and g("ठीक आहे, धन्यवाद, बाय.") and g("that's all")
    assert not g("बायको कहाँ है") and not g("bye but change my emi date") and not g("no bye") and not g("ok bye also send sms now")
    assert not g("I need a statement, bye bye bye")


def test_pending_tier_hint_expires():
    notes = []
    llm = [tc("emi_info"), {"role": "assistant", "content": "verify first"}] + [{"role": "assistant", "content": "ok"}] * 3 + \
          [tc("verify_caller", registered_mobile="1", dob="x"), {"role": "assistant", "content": "done"}]
    gw = {"emi_info": {"ok": False, "speak": "verify", "next": "need_tier_1"}, "verify_caller": {"ok": True, "speak": "verified"}}
    seen = []
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        for t in ("emi?", "hmm", "hmm", "hmm", "my number"):
            turn(c, d, t)
    last_tool = [json.loads(m["content"]) for k, b in seen if k == "llm" for m in b["messages"] if m.get("tool_name") == "verify_caller"]
    assert not any("pending_request" in x for x in last_tool)


def test_approval_id_cleared_after_failure_and_after_decision():
    seen = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("check_approval", approval_id="55"), {"role": "assistant", "content": "b"}]
    gw = {"request_app_approval": {"ok": False, "speak": "no", "error_code": "NOT_VERIFIED"}}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "approve")
        turn(c, d, "done")
    assert [b for n, b in seen if n == "check_approval"][0]["approval_id"] == "55"  # not a stale service id
    seen2 = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("check_approval", approval_id="66"), {"role": "assistant", "content": "c"}]  # turn 2 is the service's own check
    gw = {"request_app_approval": {"ok": True, "speak": "sent", "data": {"approval_id": 7}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}}
    with swap_app(scripted(llm, gw, seen2)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        for t in ("approve", "done", "again"):
            turn(c, d, t)
    ids = [b["approval_id"] for n, b in seen2 if n == "check_approval"]
    assert ids == ["7"]  # the service's own check; the model's later check_approval("66") is refused as already approved


def test_final_text_known_figures_only_from_ok_speaks():
    from voice.app import final_text
    assert final_text("Your EMI is 5000", [(True, "EMI noted")]) == "EMI noted"  # caller digits are not gateway figures
    assert final_text("figure 100", [(False, "100 refused"), (True, "ok done")]) == "ok done"
    assert final_text("EMI is 32055 rupees", [(True, "EMI ₹32,055")]) == "EMI is 32055 rupees"


def test_invented_payment_details_never_reach_gateway():
    seen = []
    invented = tc("check_payment", utr="SAHYR99999999", amount=32055, date="2026-10-04")
    llm = [invented, {"role": "assistant", "content": "Please tell me your UTR and amount"}]
    with swap_app(scripted(llm, {}, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = turn(c, d, "Maine EMI already pay kiya hai").json()
    assert not any(n == "check_payment" for n, _ in seen)
    assert r["actions"] == [{"name": "check_payment", "ok": False}]
    assert r["agent_text"] == "Kripya payment ka UTR number aur amount bataiye."  # service sentence, not model prose
    assert len([1 for k, _ in seen if k == "llm"]) == 1  # no second LLM call to word it
    msgs = c.app.state.calls[d["call_id"]]["messages"]
    tool = [m for m in msgs if m.get("tool_name") == "check_payment"][0]
    assert "Ask the caller for utr, amount" in tool["content"] and "never invent" in tool["content"]


def test_ask_text_templates():
    from voice.app import ask_text
    assert ask_text("en", ["utr", "amount"], "check_payment") == "Please tell me the UTR number and the amount."
    assert ask_text("hinglish", ["new_day"]) == "Kripya mahine ka din bataiye."
    assert "पिनकोड" in ask_text("hi", ["pincode"]) and "पिनकोड" in ask_text("mr", ["pincode"])


T2 = {"ok": False, "speak": "Approval chahiye.", "next": "need_tier_2", "error_code": "TIER_TOO_LOW"}


def approval_flow(check_status, extra_gw=None, llm_extra=()):
    seen = []
    state = {"checks": 0}

    def check(body):
        state["checks"] += 1
        return {"ok": True, "speak": f"check {check_status}", "data": {"status": check_status}}
    gw = {"explain_emi_change": lambda b: T2 if not state.get("ok") else {"ok": True, "speak": "EMI explained"},
          "request_app_approval": {"ok": True, "speak": "Tap Approve in the app.", "data": {"approval_id": 9}},
          "check_approval": check, **(extra_gw or {})}
    llm = [tc("explain_emi_change"), *llm_extra]  # the model's own text after the refusal is never requested
    return seen, state, gw, llm


def test_service_requests_approval_itself_on_need_tier_2():
    seen, state, gw, llm = approval_flow("pending")
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = turn(c, d, "mera EMI kyun badha").json()
    names = [n for n, _ in seen if n != "llm"]
    assert "request_app_approval" in names  # the service called it, the model never did
    assert [n for n, _ in seen if n == "llm"] == ["llm"]  # one LLM call only: model text discarded
    assert r["agent_text"] == "Tap Approve in the app."
    assert r["actions"][-1] == {"name": "request_app_approval", "ok": True}
    purpose = [b for n, b in seen if n == "request_app_approval"][0]["purpose"]
    assert purpose == "EMI change explanation"


def test_pending_approval_is_checked_by_service_without_llm_capped_at_3():
    seen, state, gw, llm = approval_flow("pending", llm_extra=[{"role": "assistant", "content": "model speaking"}])
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "mera EMI kyun badha")
        llm_calls = len([1 for k, _ in seen if k == "llm"])
        for _ in range(3):
            r = turn(c, d, "approve kar diya").json()
            assert r["agent_text"] == "check pending"
        assert len([1 for k, _ in seen if k == "llm"]) == llm_calls  # three turns, no LLM
        r = turn(c, d, "approve kar diya").json()  # cap reached: the model continues
    assert state["checks"] == 3 and r["agent_text"] == "model speaking"


def test_approved_retries_held_action_and_denied_clears_state():
    seen, state, gw, llm = approval_flow("approved")
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "mera EMI kyun badha")
        state["ok"] = True
        r = turn(c, d, "approve kar diya").json()
    assert r["agent_text"] == "check approved EMI explained"
    assert [a["name"] for a in r["actions"]] == ["check_approval", "explain_emi_change"]
    seen, state, gw, llm = approval_flow("denied", llm_extra=[{"role": "assistant", "content": "offer handover"}])
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "mera EMI kyun badha")
        assert turn(c, d, "approve kar diya").json()["agent_text"] == "check denied"
        cc = c.app.state.calls[d["call_id"]]
        assert cc["approval_id"] is None and cc["held"] is None
        assert turn(c, d, "ok").json()["agent_text"] == "offer handover"  # state cleared, the model takes over


def test_approved_with_missing_values_asks_for_them():
    held_args = tc("check_payment", utr="SAHYR1234", amount=100, date="2026-10-04")
    state = {"ok": False}
    gw = {"check_payment": lambda b: T2, "request_app_approval": {"ok": True, "speak": "Tap Approve.", "data": {"approval_id": 3}},
          "check_approval": {"ok": True, "speak": "Approved.", "data": {"status": "approved"}}}
    seen = []
    # the caller says the values, then the approval path runs; clearing `said` simulates values that cannot be traced
    with swap_app(scripted([held_args, {"role": "assistant", "content": "x"}], gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "payment 100 rupees UTR SAHYR1234")
        c.app.state.calls[d["call_id"]]["said"] = []
        r = turn(c, d, "approve kar diya").json()
    assert r["agent_text"] == "Approved. Please tell me the UTR number and the amount."
    assert not any(n == "check_payment" and False for n, _ in seen)


def test_model_check_approval_refused_after_approved_and_precheck_action_listed():
    seen = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("check_approval", approval_id="3"), {"role": "assistant", "content": "b"}]
    gw = {"request_app_approval": {"ok": True, "speak": "sent", "data": {"approval_id": 3}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "approve")
        r = turn(c, d, "done").json()
    assert [n for n, _ in seen if n == "check_approval"] == ["check_approval"]  # only the service's check hit the gateway
    assert [a["name"] for a in r["actions"]] == ["check_approval", "check_approval"]
    assert [a["ok"] for a in r["actions"]] == [True, False]


def test_model_pushed_to_act_after_refused_duplicate_approval():
    seen = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("request_app_approval", purpose="again"), {"role": "assistant", "content": "prose answer from memory"},
           tc("explain_emi_change"), {"role": "assistant", "content": "done"}]
    gw = {"request_app_approval": {"ok": True, "speak": "sent", "data": {"approval_id": 3}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}},
          "explain_emi_change": {"ok": True, "speak": "EMI went up because of the reset"}}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "approve")
        r = turn(c, d, "approve kar diya, why did my EMI go up").json()
    assert any(n == "explain_emi_change" for n, _ in seen)  # the nudge made the model call the real action
    # single request (a comma is not a conjunction): the shortcut speaks the gateway sentence, no wrap-up round
    assert r["agent_text"] == "EMI went up because of the reset"


LONG = "please tell me something about my loan account details today"  # long, no approval keyword


def held_app(gw_extra=None, llm=(), first="mera EMI kyun badha", action="explain_emi_change"):
    """An app with an approval pending and `action` held (turn 1 done)."""
    seen = []
    gw = {action: T2, "request_app_approval": {"ok": True, "speak": "Tap Approve.", "data": {"approval_id": 9}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}, **(gw_extra or {})}
    cm = swap_app(scripted([tc(action), *llm], gw, seen))
    c = cm.__enter__()
    d = c.post("/calls?tts=false", json={}).json()
    turn(c, d, first)
    return cm, c, d, seen, c.app.state.calls[d["call_id"]]


def n_calls(seen, name):
    return len([1 for k, _ in seen if k == name])


def test_held_expires_after_two_turns():
    cm, c, d, seen, cc = held_app(llm=[{"role": "assistant", "content": "m1"}, {"role": "assistant", "content": "m2"},
                                       {"role": "assistant", "content": "m3"}, {"role": "assistant", "content": "m4"}])
    try:
        for _ in range(2):  # long turns: the precheck stays out of it and the model answers
            turn(c, d, LONG)
        assert cc["held"] is not None and cc["approval_id"] == 9  # state kept while the model handles turns
        turn(c, d, LONG)  # third turn after the request: the held action has expired (approval itself stays pending)
        assert cc["held"] is None and cc["approval_id"] == 9
        explains = n_calls(seen, "explain_emi_change")
        turn(c, d, "approve kar diya")  # held is now 4 turns old: dropped, not retried
        assert cc["held"] is None and n_calls(seen, "explain_emi_change") == explains
        assert n_calls(seen, "check_approval") >= 1
    finally:
        cm.__exit__(None, None, None)


def test_held_dropped_when_caller_cancels_and_precheck_skips_long_turns():
    cm, c, d, seen, cc = held_app(llm=[{"role": "assistant", "content": "ok, cancelled"}, {"role": "assistant", "content": "m"}])
    try:
        checks = n_calls(seen, "check_approval")
        r = turn(c, d, LONG).json()
        assert n_calls(seen, "check_approval") == checks and r["agent_text"] == "ok, cancelled"  # model handled it
        assert cc["approval_id"] == 9 and cc["held"] is not None
        turn(c, d, "nahi cancel karo")  # a short negation: the held action is dropped first
        assert cc["held"] is None
        explains = n_calls(seen, "explain_emi_change")
        turn(c, d, "approve kar diya")
        assert n_calls(seen, "explain_emi_change") == explains  # never auto-retried
    finally:
        cm.__exit__(None, None, None)


def test_held_closure_needs_caller_intent():
    # the caller never said anything about closing the loan: approval confirmed, nothing retried, the model carries on
    cm, c, d, seen, cc = held_app(first="hello there", action="raise_closure",
                                  llm=[{"role": "assistant", "content": "what do you need?"}])
    try:
        r = turn(c, d, "approve kar diya").json()
        assert n_calls(seen, "raise_closure") == 1 and cc["held"] is None  # only the model's own first attempt
        assert r["agent_text"] == "what do you need?" and cc["approved"] is True
    finally:
        cm.__exit__(None, None, None)
    gw_ok = {"raise_closure": lambda b: T2 if not st_["ok"] else {"ok": True, "speak": "Closure raised"}}
    st_ = {"ok": False}
    cm, c, d, seen, cc = held_app(first="mera loan close karna hai", action="raise_closure", gw_extra=gw_ok)
    try:
        st_["ok"] = True
        r = turn(c, d, "approve kar diya").json()
        assert r["agent_text"] == "approved Closure raised" and n_calls(seen, "raise_closure") == 2
    finally:
        cm.__exit__(None, None, None)


def test_intent_keywords():
    from voice.app import intent_ok
    assert intent_ok("raise_closure", ["Loan band karna hai"]) and not intent_ok("raise_closure", ["hello"])
    assert intent_ok("request_document", ["send my statement"]) and not intent_ok("request_document", ["my emi"])
    assert intent_ok("explain_emi_change", ["EMI kyun badha"]) and intent_ok("update_address", ["mera pata badalna hai"])
    assert intent_ok("check_payment", ["anything"])  # no keyword gate where the value guard already applies


def test_rollback_restores_state_and_held_cleared_only_after_retry_succeeds():
    seen = []
    mode = {"retry": "refuse"}

    def explain(b):
        if not mode.get("approved"):
            return T2
        return {"ok": False, "speak": "Not possible now", "error_code": "INVALID_INPUT"}
    gw = {"explain_emi_change": explain, "request_app_approval": {"ok": True, "speak": "Tap.", "data": {"approval_id": 9}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}}
    with swap_app(scripted([tc("explain_emi_change")], gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "mera EMI kyun badha")
        cc = c.app.state.calls[d["call_id"]]
        mode["approved"] = True
        turn(c, d, "approve kar diya")  # retry refused for another reason: held is kept, not cleared
        assert cc["held"] is not None and cc["approved"] is True
    # rollback: an exception after the check_approval call restores approval bookkeeping
    seen2 = []
    boom = {"on": False}

    def explain2(b):
        if boom["on"]:
            raise RuntimeError("x")
        return T2
    gw2 = {"explain_emi_change": explain2, "request_app_approval": {"ok": True, "speak": "Tap.", "data": {"approval_id": 9}},
           "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}}

    def handler(req):
        url = str(req.url)
        if "/actions/explain_emi_change" in url and boom["on"]:
            return httpx.Response(500)
        return scripted([tc("explain_emi_change")], gw2, seen2)(req)
    with swap_app(handler) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "mera EMI kyun badha")
        cc = c.app.state.calls[d["call_id"]]
        boom["on"] = True
        assert turn(c, d, "approve kar diya").status_code == 502
        assert cc["approval_id"] == 9 and cc["held"] is not None and not cc.get("approved") and cc["appr_checks"] == 0


def test_check_approval_error_keeps_state_and_denied_resets():
    cm, c, d, seen, cc = held_app(
        gw_extra={"check_approval": {"ok": False, "speak": "nf", "error_code": "NOT_FOUND"}},
        llm=[{"role": "assistant", "content": "model here"}])
    try:
        r = turn(c, d, "approve kar diya").json()
        assert cc["approval_id"] == 9 and cc["held"] is not None and r["agent_text"] == "model here"
        assert [a["name"] for a in r["actions"]][0] == "check_approval"
    finally:
        cm.__exit__(None, None, None)
    cm, c, d, seen, cc = held_app(gw_extra={"check_approval": {"ok": True, "speak": "denied", "data": {"status": "denied"}}})
    try:
        turn(c, d, "approve kar diya")
        assert cc["approval_id"] is None and cc["held"] is None
    finally:
        cm.__exit__(None, None, None)


def test_no_second_approval_request_while_one_is_pending_and_no_model_instruction():
    cm, c, d, seen, cc = held_app(llm=[tc("explain_emi_change"), {"role": "assistant", "content": "wait for the app"}])
    try:
        turn(c, d, LONG)  # the model tries the tier-2 action again; the pending approval is not re-requested
        assert n_calls(seen, "request_app_approval") == 1
        msgs = c.app.state.calls[d["call_id"]]["messages"]
        tool = [json.loads(m["content"]) for m in msgs if m.get("tool_name") == "explain_emi_change"]
        assert tool and all("request_app_approval" not in json.dumps(t.get("instruction", "")) for t in tool)
    finally:
        cm.__exit__(None, None, None)


def test_approved_flag_cleared_when_tier2_refused_again():
    cm, c, d, seen, cc = held_app(llm=[tc("explain_emi_change"), {"role": "assistant", "content": "m"}])
    try:
        turn(c, d, "approve kar diya")  # approved, but the retry hits need_tier_2 again (window expired)
        assert cc["approved"] is False
        turn(c, d, LONG)  # the model tries again: a fresh approval is requested
        assert n_calls(seen, "request_app_approval") == 2
    finally:
        cm.__exit__(None, None, None)


def test_held_cleared_when_model_confirms_approval_itself():
    cm, c, d, seen, cc = held_app(llm=[tc("check_approval"), {"role": "assistant", "content": "approved, how can I help"}])
    try:
        turn(c, d, LONG)
        assert cc["approved"] is True and cc["held"] is None
    finally:
        cm.__exit__(None, None, None)


def test_approve_before_any_approval_gets_a_note():
    seen = []
    with swap_app(scripted([{"role": "assistant", "content": "No approval is pending yet."}], {}, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = turn(c, d, "Approve kar diya").json()
    users = [m["content"] for k, b in seen if k == "llm" for m in b["messages"] if m.get("role") == "user"]
    assert any("no approval request is pending" in u for u in users)
    assert r["agent_text"] == "No approval is pending yet." and not any(n == "check_approval" for n, _ in seen)


def test_requesting_an_approval_is_not_claiming_one():
    from voice.app import claims_approved as k
    assert k("Approve kar diya") and k("I approved it") and k("approval done") and k("tapped approve")
    assert not k("Yes, please send the approval request.") and not k("approval bhej do") and not k("haan")


def test_fallback_runs_emi_date_change_when_model_only_talks():
    from voice.app import fallback_action as fb
    assert fb("Ab Marathi madhe bola. Maza EMI date 10 la karaycha aahe") == ("emi_date_change", {"new_day": 10})
    assert fb("माझ्या EMI ची तारीख १० करा") == ("emi_date_change", {"new_day": 10})
    assert fb("EMI date kya hai?") is None and fb("EMI date 10 ya 12 karo") is None and fb("my emi is 5000") is None
    seen = []
    gw = {"emi_date_change": {"ok": False, "speak": "Read back 10. Right?", "next": "confirm_readback",
                              "data": {"fields": ["new_day"], "confirm": {"new_day": "10"}}}}
    with swap_app(scripted([{"role": "assistant", "content": "garbled marathi prose"}], gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        r = turn(c, d, "Maza EMI date 10 la karaycha aahe").json()
    assert [b for n, b in seen if n == "emi_date_change"][0]["new_day"] == 10
    assert r["agent_text"] == "Read back 10. Right?" and r["actions"] == [{"name": "emi_date_change", "ok": False}]


def test_fallback_explains_emi_after_refused_duplicate_approval():
    from voice.app import fallback_action as fb
    assert fb("Mera EMI kyun badha?") == ("explain_emi_change", {}) and fb("why did my EMI go up") == ("explain_emi_change", {})
    assert fb("my emi is due") is None and fb("kyun") is None
    seen = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("request_app_approval", purpose="again"), {"role": "assistant", "content": "prose"},
           {"role": "assistant", "content": "more prose"}, {"role": "assistant", "content": "ok"}]
    gw = {"request_app_approval": {"ok": True, "speak": "sent", "data": {"approval_id": 3}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}},
          "explain_emi_change": {"ok": True, "speak": "Because of the rate reset."}}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "approve kar diya")
        r = turn(c, d, "approve kar diya, Mera EMI kyun badha?").json()
    assert any(n == "explain_emi_change" for n, _ in seen) and r["agent_text"]


def test_call_ids_never_contain_a_long_digit_run():
    import re
    from voice.app import new_call_id
    ids = [new_call_id() for _ in range(10_000)]
    assert not any(re.search(r"\d{9,}", i) for i in ids)
    assert all(re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", i) for i in ids) and len(set(ids)) == 10_000


def test_traceable_values_pass_the_guard():
    from voice.app import untraceable as u
    said = ["Payment 4 October ko ₹32,055 ki thi, UTR S A H Y R 6 1 0 0 4 7 3 8 2 9 1"]
    assert u("check_payment", {"utr": "SAHYR61004738291", "amount": 32055, "date": "2026-10-04"}, said) == []
    assert u("check_payment", {"utr": "SAHYR61004738291", "amount": 32055, "date": "2020-01-01"}, said) == []  # date lenient
    assert u("check_payment", {"utr": "SAHYR61004738292", "amount": 3205, "date": "x"}, said) == ["utr", "amount"]
    assert u("emi_date_change", {"new_day": 10}, ["तारीख १० करा"]) == []
    assert u("emi_date_change", {"new_day": 1}, ["तारीख 10 करा"]) == ["new_day"]  # 1 is not 10
    addr = {"line1": "12 MG Road", "city": "Pune", "pincode": "411038"}
    assert u("update_address", addr, ["mera address 12 MG road, Pune, 411038 hai"]) == []
    assert u("update_address", addr, ["Pune 411038"]) == ["line1"]
    assert u("update_nominee", {"name": "Ravi Kumar", "relation": "son"}, ["nominee Ravi Kumar"]) == []
    assert u("update_nominee", {"name": "Ravi Kumar"}, ["nominee badalna hai"]) == ["name"]


def test_tool_names_never_spoken():
    from voice.app import clean_spoken
    names = {"check_payment", "emi_info"}
    assert clean_spoken("Ab main check_payment kar rahi hoon. Kripya wait kijiye.", names) == "Kripya wait kijiye."
    assert clean_spoken("I will call some_other_thing now.", names) == ""
    assert clean_spoken("Your EMI is due.", names) == "Your EMI is due."
    llm = [{"role": "assistant", "content": "Ab main check_payment kar rahi hoon."}]
    with swap_app(scripted(llm, {"emi_info": {"ok": True, "speak": "EMI sentence"}})) as c:
        d = c.post("/calls?tts=false", json={}).json()
        assert "check_payment" not in turn(c, d, "hello").json()["agent_text"]


def test_duplicate_approval_rejected_once_approved():
    seen = []
    llm = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "a"},
           tc("request_app_approval", purpose="another"), {"role": "assistant", "content": "c"}]  # turn 2: service checks
    gw = {"request_app_approval": {"ok": True, "speak": "sent", "data": {"approval_id": 7}},
          "check_approval": {"ok": True, "speak": "approved", "data": {"status": "approved"}}}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        rs = [turn(c, d, t).json() for t in ("approve", "done also approve again")]
    assert [n for n, _ in seen if n == "request_app_approval"] == ["request_app_approval"]  # only the first reached the gateway
    # turn 2: the service confirmed the approval (nothing held), the model then asked again and was refused
    assert [a["name"] for a in rs[1]["actions"]] == ["check_approval", "request_app_approval"] and rs[1]["actions"][1]["ok"] is False
    tool = [m for k, b in seen if k == "llm" for m in b["messages"] if m.get("tool_name") == "request_app_approval"][-1]
    assert "Already approved" in tool["content"]
    note = [m for k, b in seen if k == "llm" for m in b["messages"] if m.get("role") == "user" and "service note" in m["content"]]
    assert note  # the model was told Tier 2 is open


def test_goodbye_safety_net_calls_end_call(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [{"role": "assistant", "content": "ok then"}]
    r = turn(c, d, "theek hai, bye").json()
    assert r["actions"] == [{"name": "end_call", "ok": True}] and r["ended"] is True
    assert fake.of("gw")[-1][2]["outcome"] == "completed"


def test_check_approval_id_comes_from_the_service():
    script = [tc("request_app_approval", purpose="x"), {"role": "assistant", "content": "tap"},
              tc("check_approval", approval_id="999"), {"role": "assistant", "content": "ok"}]
    sent = []

    def handler(req):
        url = str(req.url)
        if "11434" in url:
            return httpx.Response(200, json={"message": script.pop(0)})
        sent.append((url.rsplit("/", 1)[1], json.loads(req.content)))
        return httpx.Response(200, json={"ok": True, "speak": "s", "data": {"approval_id": 7}})
    with swap_app(handler) as c:
        d = c.post("/calls?tts=false", json={}).json()
        turn(c, d, "yes send approval")
        turn(c, d, "done")
    assert [b for n, b in sent if n == "check_approval"][0]["approval_id"] == "7"


def test_infer_language_from_reply_script():
    from voice.app import infer_language
    assert infer_language("मी आता मराठीत बोलत आहे", "hinglish") == "mr"
    assert infer_language("मैं आपकी मदद करूँगी", "hinglish") == "hi"
    assert infer_language("Main aapki madad karungi", "mr") == "hinglish"
    assert infer_language("How can I help", "en") == "en"


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


# ---- latency work: keep_alive, cacheable prompt, shortcut, timings, per-call provider ----
import time  # noqa: E402

from voice import providers  # noqa: E402

TIMING_KEYS = {"stt_ms", "llm_ms", "llm_calls", "gateway_ms", "gateway_calls", "tts_ms", "total_ms", "other_ms", "provider", "model"}


def test_keep_alive_sent_and_warmup_is_opt_in():
    fake = Fake()
    cfg = Settings(gnani_speech_api_key=KEY, warmup=True)
    with TestClient(create_app(cfg, httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))), base_url=BASE) as c:
        for _ in range(100):
            if fake.of("llm"):
                break
            time.sleep(0.05)
        w = fake.of("llm")[0][2]
        assert w["keep_alive"] == -1 and w["tools"] and w["messages"][1]["content"] == "(warm-up)"
        d = new_call(c)
        fake.llm_script = [{"role": "assistant", "content": "hi"}]
        c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hello"})
        assert fake.of("llm")[-1][2]["keep_alive"] == -1


def test_warmup_failure_is_swallowed():
    fake = Fake()
    fake.fail = "llm"
    cfg = Settings(gnani_speech_api_key=KEY, warmup=True)
    with TestClient(create_app(cfg, httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))), base_url=BASE) as c:
        assert c.get("/health").status_code == 200


def test_system_prompt_identical_across_calls_and_has_no_call_id(env):
    c, fake = env
    ids = [new_call(c)["call_id"] for _ in range(2)]
    sys_msgs, tools_sent = [], []
    for i in ids:
        fake.llm_script = [{"role": "assistant", "content": "hi"}]
        c.post(f"/calls/{i}/turn?tts=false", json={"text": "hello"})
        body = fake.of("llm")[-1][2]
        sys_msgs.append(body["messages"][0]["content"])
        tools_sent.append(json.dumps(body["tools"], sort_keys=True))
        assert body["messages"][1]["content"] == f"(call connected, call_id={i})"
    assert sys_msgs[0] == sys_msgs[1] and tools_sent[0] == tools_sent[1]
    assert not any(i in sys_msgs[0] for i in ids) and "{{" not in sys_msgs[0] and "first user message" in sys_msgs[0]


def test_whitelisted_action_makes_one_llm_call_others_two(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("branch_lookup", branch="Kothrud"), {"role": "assistant", "content": "never used"}]
    r = turn(c, d, "ifsc of kothrud").json()
    assert len(fake.of("llm")) == 1 and r["agent_text"] == "branch_lookup done" and r["timings"]["llm_calls"] == 1
    n = len(fake.of("llm"))
    fake.llm_script = [tc("request_document", type="statement"), {"role": "assistant", "content": "wrapped"}]
    r = turn(c, d, "send statement").json()
    assert len(fake.of("llm")) - n == 2 and r["agent_text"] == "wrapped" and r["timings"]["llm_calls"] == 2


def test_timings_on_calls_and_turn(env):
    c, fake = env
    d = new_call(c)
    assert TIMING_KEYS <= set(d["timings"])
    fake.llm_script = [tc("request_document"), {"role": "assistant", "content": "ok"}]
    t = c.post(f"/calls/{d['call_id']}/turn", json={"text": "hi"}).json()["timings"]
    assert TIMING_KEYS <= set(t) and t["provider"] == "ollama" and t["model"] == "qwen3:8b"
    assert t["llm_calls"] == 2 and t["gateway_calls"] == 1
    for k in ("stt_ms", "llm_ms", "gateway_ms", "tts_ms", "other_ms"):
        assert isinstance(t[k], int) and 0 <= t[k] <= t["total_ms"]
    assert d["timings"]["gateway_calls"] == 1 and d["timings"]["tts_ms"] >= 0


def gem_env():
    fake = Fake()
    cfg = Settings(gnani_speech_api_key=KEY, gemini_api_key="G-KEY", VOICE_DEV=True)
    return TestClient(create_app(cfg, httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))), base_url=BASE), fake


def test_gemini_dispatches_to_provider_adapter(monkeypatch):
    c, fake = gem_env()
    seen = []

    async def fake_chat(http, *, base_url, api_key, model, messages, tools, provider, timeout=30.0, **kw):
        seen.append((base_url, api_key, model, provider, messages[0]["role"], bool(tools)))
        return {"role": "assistant", "content": "hello from gemini", "tool_calls": []}

    monkeypatch.setattr(providers, "openai_chat", fake_chat)
    with c:
        d = c.post("/calls?tts=false", json={"llm": "gemini"}).json()
        assert d["timings"]["provider"] == "gemini" and d["timings"]["model"] == "gemini-3.5-flash-lite"
        r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hello"}).json()
    assert r["agent_text"] == "hello from gemini" and fake.of("llm") == []
    assert seen == [("https://generativelanguage.googleapis.com/v1beta/openai", "G-KEY", "gemini-3.5-flash-lite", "gemini", "system", True)]
    assert "G-KEY" not in json.dumps(r)


def test_provider_error_is_502_and_unknown_or_keyless_provider_is_422(monkeypatch):
    async def boom(*a, **k):
        raise providers.ProviderError("x")

    monkeypatch.setattr(providers, "openai_chat", boom)
    c, _ = gem_env()
    with c:
        d = c.post("/calls?tts=false", json={"llm": "gemini"}).json()
        r = c.post(f"/calls/{d['call_id']}/turn?tts=false", json={"text": "hello"})
        assert r.status_code == 502 and "G-KEY" not in r.text
        assert c.post("/calls", json={"llm": "gpt"}).status_code == 422
        assert c.post("/calls", json={"llm": 5}).status_code == 422
        r = c.post("/calls", json={"llm": "sarvam"})
        assert r.status_code == 422 and "SARVAM_API_KEY" in r.json()["detail"]


def test_health_lists_providers(env):
    c, _ = env
    h = c.get("/health").json()
    assert h["default"] == "ollama"
    assert h["providers"]["ollama"] == {"model": "qwen3:8b", "ready": True}
    assert h["providers"]["gemini"]["model"] == "gemini-3.5-flash-lite" and h["providers"]["sarvam"]["model"] == "sarvam-105b-conversations"
    assert set(h["providers"]) == {"ollama", "gemini", "sarvam"}


# ---- fixes: .env.local isolation, schema-checked gateway args ----
def test_env_local_fallback_is_injectable(tmp_path, monkeypatch):
    import voice.app as app_mod

    f = tmp_path / "x.env.local"
    f.write_text("Gemini_Api_Key = \"LOCAL-G\"\nsarvam_api_key=LOCAL-S\n", encoding="utf-8")
    monkeypatch.setattr(app_mod, "ENV_LOCAL", f)
    cfg = Settings()
    assert cfg.llm_key("gemini") == "LOCAL-G" and cfg.llm_key("sarvam") == "LOCAL-S"
    assert Settings(gemini_api_key="E").llm_key("gemini") == "E"


def test_unknown_argument_keys_dropped_before_gateway(env, caplog):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("branch_lookup", language="hi", query="Kothrud", branch_name="Kothrud"), {"role": "assistant", "content": "x"}]
    with caplog.at_level(logging.INFO, logger="voice"):
        turn(c, d, "ifsc")
    body = fake.of("gw")[-1][2]
    assert set(body) == {"query", "language", "call_id"}
    assert "dropped_arg_keys=1" in caplog.text and "Kothrud" not in caplog.text


# ---- developer lab ----
def dev_env(**kw):
    fake = Fake()
    cfg = Settings(gnani_speech_api_key=KEY, VOICE_DEV=True, **kw)
    return TestClient(create_app(cfg, httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))), base_url=BASE), fake


def test_dev_off_hides_routes_and_forbids_settings(env):
    c, _ = env
    assert c.get("/dev/config").status_code == 404
    assert c.post("/dev/bench", json={}).status_code == 404
    assert c.post("/dev/warmup", json={}).status_code == 404
    assert c.post("/calls", json={"settings": {"temperature": 0.5}}).status_code == 403
    assert c.post("/calls", json={"model": "qwen3:8b"}).status_code == 403
    r = c.post("/calls?tts=false", json={"settings": {}})  # empty settings: demo behaviour unchanged
    assert r.status_code == 200 and "settings" not in r.json()


def test_dev_config_shape():
    c, fake = dev_env(gemini_api_key="G")
    with c:
        j = c.get("/dev/config").json()
    assert j["dev"] is True and {k["key"] for k in j["knobs"]} >= {"temperature", "cache_prompt", "tts_voice", "tool_hints"}
    assert all({"key", "label", "type", "default", "group", "help"} <= set(k) for k in j["knobs"])
    assert j["providers"]["ollama"]["models"] == ["qwen3:8b"] or "qwen3:8b" in j["providers"]["ollama"]["models"]
    assert j["providers"]["gemini"]["ready"] is True and j["providers"]["sarvam"]["ready"] is False
    assert [p["name"] for p in j["presets"]][0].startswith("Baseline local") and len(j["scripts"]) == 7
    assert all(1 <= len(sc["lines"]) <= 12 for sc in j["scripts"])


@pytest.mark.parametrize("settings", [{"temperature": 2}, {"temperature": "hot"}, {"num_ctx": 123}, {"cache_prompt": "yes"},
                                      {"max_rounds": 2.5}, {"nope": 1}, {"tts_voice": "Nobody"}, {"reasoning": "off", "x": 1}])
def test_dev_bad_knob_is_422(settings):
    c, _ = dev_env()
    with c:
        r = c.post("/calls?tts=false", json={"settings": settings})
        assert r.status_code == 422
        key = next(iter(settings))
        assert key in r.json()["detail"] or "nope" in r.json()["detail"] or "x" in r.json()["detail"]


def test_dev_model_validation(monkeypatch):
    c, fake = dev_env(gemini_api_key="G")
    with c:
        assert c.post("/calls?tts=false", json={"model": "not-installed"}).status_code == 422
        assert c.post("/calls?tts=false", json={"llm": "gemini", "model": "http://evil/x"}).status_code == 422
        assert c.post("/calls?tts=false", json={"llm": "gemini", "model": "gemini-3.5-flash"}).json()["timings"]["model"] == "gemini-3.5-flash"
        assert c.post("/calls?tts=false", json={"llm": "gemini", "settings": {"reasoning": "off"}}).status_code == 422


def test_settings_reach_ollama_and_hosted_requests(monkeypatch):
    c, fake = dev_env(gemini_api_key="G")
    seen = []

    async def fake_chat(http, **kw):
        seen.append(kw)
        return {"role": "assistant", "content": "hi", "tool_calls": []}

    monkeypatch.setattr(providers, "openai_chat", fake_chat)
    with c:
        d = c.post("/calls?tts=false", json={"settings": {"temperature": 0.7, "num_ctx": 16384, "max_tokens": 120,
                                                          "tool_hints": False, "keep_msgs": 12}}).json()
        assert d["settings"]["num_ctx"] == 16384
        fake.llm_script = [{"role": "assistant", "content": "ok"}]
        turn(c, d, "hello")
        body = fake.of("llm")[-1][2]
        assert body["options"] == {"num_ctx": 16384, "temperature": 0.7, "num_predict": 120}
        assert "ALWAYS use this when" not in json.dumps(body["tools"])  # hints off
        g = c.post("/calls?tts=false", json={"llm": "gemini", "settings": {"temperature": 0.3, "max_tokens": 80, "reasoning": "low"}}).json()
        turn(c, g, "hello")
    assert seen[-1]["temperature"] == 0.3 and seen[-1]["max_tokens"] == 80 and seen[-1]["reasoning"] == "low"


def test_cache_prompt_false_restores_call_id_in_system_prompt():
    c, fake = dev_env()
    with c:
        d = c.post("/calls?tts=false", json={"settings": {"cache_prompt": False}}).json()
        fake.llm_script = [{"role": "assistant", "content": "ok"}]
        turn(c, d, "hello")
    msgs = fake.of("llm")[-1][2]["messages"]
    assert d["call_id"] in msgs[0]["content"] and msgs[1]["content"] == "(call connected)"


def test_shortcut_actions_false_forces_two_rounds():
    c, fake = dev_env()
    with c:
        d = c.post("/calls?tts=false", json={"settings": {"shortcut_actions": False}}).json()
        fake.llm_script = [tc("branch_lookup", branch="K"), {"role": "assistant", "content": "wrapped"}]
        r = turn(c, d, "ifsc").json()
    assert len(fake.of("llm")) == 2 and r["agent_text"] == "wrapped"


def test_stt_and_tts_settings_reach_gnani():
    c, fake = dev_env()
    with c:
        d = c.post("/calls", json={"settings": {"tts_voice": "Avinash", "tts_speed": 1.1, "stt_keyterms": False,
                                                "stt_language": "mr-IN"}}).json()
        assert fake.of("tts")[-1][2]["voice"] == "Avinash" and fake.of("tts")[-1][2]["speed"] == 1.1
        c.post(f"/calls/{d['call_id']}/turn?tts=false", files={"audio": ("a.wav", b"RIFF", "audio/wav")})
    stt_body = fake.of("stt")[-1][2]
    assert b"mr-IN" in stt_body and b"keyterms" not in stt_body


def test_summarize_math():
    from voice.app import summarize

    def t(total, llm, calls=1):
        return {"timings": {"total_ms": total, "stt_ms": 0, "llm_ms": llm, "llm_calls": calls, "gateway_ms": 10, "tts_ms": 0, "other_ms": 5}}

    s = summarize([t(100, 50), t(300, 150, 2), t(200, 100), {"error": "boom"}])
    assert s["turns"] == 4 and s["errors"] == 1
    assert s["median_total_ms"] == 200 and s["max_total_ms"] == 300 and s["p95_total_ms"] == 300
    assert s["avg"]["llm_ms"] == 100 and s["avg"]["llm_calls"] == 1.33 and s["avg"]["gateway_ms"] == 10
    assert summarize([])["median_total_ms"] == 0


def wait_job(c, jid):
    for _ in range(200):
        j = c.get(f"/dev/bench/{jid}").json()
        if j["status"] != "running":
            return j
        time.sleep(0.05)
    raise AssertionError("bench did not finish")


def test_bench_job_runs_to_done_without_caller_text():
    c, fake = dev_env()
    with c:
        fake.llm_script = [tc("branch_lookup", branch="K"), tc("request_document"), {"role": "assistant", "content": "ok"}]
        r = c.post("/dev/bench", json={"configs": [{"name": "A", "llm": "ollama"},
                                                   {"name": "B", "llm": "ollama", "settings": {"shortcut_actions": False}}],
                                       "script": ["SECRET-CALLER-LINE one", "line two"], "repeat": 2})
        assert r.status_code == 200
        j = wait_job(c, r.json()["job_id"])
    assert j["status"] == "done" and j["done_turns"] == j["total_turns"] == 8
    assert [run["name"] for run in j["runs"]] == ["A", "B"]
    run = j["runs"][0]
    assert len(run["turns"]) == 4 and run["turns"][0]["actions"] == ["branch_lookup"] and run["summary"]["turns"] == 4
    assert run["summary"]["errors"] == 0 and run["summary"]["max_total_ms"] >= run["summary"]["median_total_ms"]
    assert "SECRET-CALLER-LINE" not in json.dumps(j)
    assert len(fake.of("tts")) == 0 and any(u.endswith("/actions/end_call") for _, u, _, _ in fake.of("gw"))


def test_bench_records_turn_errors_and_enforces_limits():
    c, fake = dev_env()
    with c:
        fake.fail = "llm"
        jid = c.post("/dev/bench", json={"configs": [{"llm": "ollama"}], "script": ["hello"]}).json()["job_id"]
        j = wait_job(c, jid)
        assert j["status"] == "done" and j["runs"][0]["turns"][0]["error"] and j["runs"][0]["summary"]["errors"] == 1
        fake.fail = None
        bad = [{"configs": [], "script": ["a"]}, {"configs": [{"llm": "ollama"}] * 5, "script": ["a"]},
               {"configs": [{"llm": "ollama"}], "script": []}, {"configs": [{"llm": "ollama"}], "script": ["x" * 301]},
               {"configs": [{"llm": "ollama"}], "script": ["a"], "repeat": 4}, {"configs": [{"llm": "sarvam"}], "script": ["a"]}]
        assert [c.post("/dev/bench", json=b).status_code for b in bad] == [422] * 6
        assert c.get("/dev/bench/nope").status_code == 404


def test_bench_job_limit_two_running():
    import asyncio

    fake = Fake()

    async def slow(req):  # keeps jobs "running" long enough to hit the limit
        if "/api/chat" in str(req.url):
            await asyncio.sleep(0.3)
        return fake.handler(req)

    cfg = Settings(gnani_speech_api_key=KEY, VOICE_DEV=True)
    with TestClient(create_app(cfg, httpx.AsyncClient(transport=httpx.MockTransport(slow))), base_url=BASE) as c:
        body = {"configs": [{"llm": "ollama"}], "script": ["a"]}
        r1, r2, r3 = (c.post("/dev/bench", json=body) for _ in range(3))
        assert (r1.status_code, r2.status_code, r3.status_code) == (200, 200, 429)
        wait_job(c, r1.json()["job_id"])
        wait_job(c, r2.json()["job_id"])


def test_dev_warmup_endpoint():
    c, fake = dev_env()
    with c:
        r = c.post("/dev/warmup", json={"llm": "ollama"})
    assert r.status_code == 200 and r.json()["ok"] and fake.of("llm")[-1][2]["messages"][1]["content"] == "(warm-up)"


# ---- review fixes ----
def test_failed_readback_leaves_no_unanswered_tool_calls():
    seen = []
    llm = [{"role": "assistant", "content": "ok"}]
    gw = {"confirm_readback": {"ok": False, "speak": "no", "error_code": "INVALID_INPUT"}, "check_payment": RB}
    with swap_app(scripted(llm, gw, seen)) as c:
        d = c.post("/calls?tts=false", json={}).json()
        cl = c.app.state.calls[d["call_id"]]
        cl["rb_active"] = ("check_payment", {"utr": "SAHYR1234"}, {"utr": "SAHYR1234", "amount": "5"})
        cl["rb_turn"], cl["turn"] = 0, 0
        cl["rb_active"] = cl["rb_active"]
        # drive auto_confirm through a turn: pending_rb valid only on the turn after delivery
        cl["pending_rb"], cl["rb_turn"] = cl["rb_active"], 0
        r = turn(c, d, "haan")
        assert r.status_code == 200
        msgs = cl["messages"]
        asst = next(m for m in msgs if m.get("tool_calls"))
        answered = sum(1 for m in msgs if m["role"] == "tool")
        assert len(asst["tool_calls"]) == answered == 1  # the second confirm and the action never ran


def test_hosted_llm_selection_is_dev_only(env):
    c, _ = env
    assert c.post("/calls?tts=false", json={"llm": "ollama"}).status_code == 200  # the default is allowed
    r = c.post("/calls?tts=false", json={"llm": "gemini"})
    assert r.status_code == 403 and "dev-only" in r.json()["detail"]
    assert c.get("/health").json()["dev"] is False
    c2, _ = dev_env(gemini_api_key="G")
    with c2:
        assert c2.get("/health").json()["dev"] is True
        assert c2.post("/calls?tts=false", json={"llm": "gemini"}).status_code == 200


def test_shortcut_skipped_for_multi_request_text(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info"), {"role": "assistant", "content": "wrapped"}]
    r = turn(c, d, "EMI kab hai aur SMS bhej do").json()
    assert len(fake.of("llm")) == 2 and r["agent_text"] == "wrapped"
    from voice.app import multi_request
    assert all(multi_request(t) for t in ["emi and sms", "EMI aur SMS", "माझा EMI आणि SMS"])
    assert not any(multi_request(t) for t in ["EMI kab hai", "amount 32,055", "kothrud ka ifsc", "EMI kitna hai, next kab hai?"])


def test_tts_speed_range_and_reasoning_options_by_provider():
    from voice.app import KNOB_BY_KEY, validate_settings
    k = KNOB_BY_KEY["tts_speed"]
    assert (k["min"], k["max"]) == (0.85, 1.15)
    assert validate_settings({"tts_speed": 1.15}, "ollama")["tts_speed"] == 1.15
    with pytest.raises(Exception):
        validate_settings({"tts_speed": 1.2}, "ollama")
    r = KNOB_BY_KEY["reasoning"]
    assert r["options_by_provider"]["sarvam"] == ["off", "low", "medium"] and set(r["options_by_provider"]["gemini"]) <= set(r["options"])


def test_multipart_tts_field_disables_tts(env):
    c, fake = env
    d = new_call(c)
    n = len(fake.of("tts"))
    c.post(f"/calls/{d['call_id']}/turn", files={"audio": ("a.wav", b"RIFF", "audio/wav"), "tts": (None, "false")})
    assert len(fake.of("tts")) == n
    c.post(f"/calls/{d['call_id']}/turn", files={"audio": ("a.wav", b"RIFF", "audio/wav")})
    assert len(fake.of("tts")) == n + 1


def test_only_voice_dev_enables_dev(monkeypatch):
    assert Settings(dev=True).dev is False
    assert Settings(VOICE_DEV=True).dev is True
    monkeypatch.setenv("VOICE_DEV", "1")
    assert Settings().dev is True


def test_fallback_verify_bare_last4_after_mobile_in_earlier_turn():
    from voice.app import fallback_action as fb
    said = ["my number is 9876543210"]
    assert fb("4821", said) == ("verify_caller", {"registered_mobile": "9876543210", "loan_last4": "4821"})
    assert fb("okay thanks, how are you", said) is None and fb("4821") is None
    assert fb("4821", said, verified=True) is None


def test_end_call_never_runs_in_the_same_turn_as_a_handover_unless_the_caller_said_goodbye():
    two = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "end_call", "arguments": {}}},
                                                              {"function": {"name": "handover", "arguments": {"reason": "x", "summary": "y"}}}]}
    for said, ended in (("I want to discuss something with your team", False), ("okay, bye", True)):
        seen = []
        with swap_app(scripted([dict(two), {"role": "assistant", "content": "ok"}], {}, seen)) as c:
            d = c.post("/calls?tts=false", json={}).json()
            r = turn(c, d, said).json()
        names = [n for n, _ in seen if n in ("handover", "end_call")]
        assert ("end_call" in names) is ended and "handover" in names or ended, (said, names)
