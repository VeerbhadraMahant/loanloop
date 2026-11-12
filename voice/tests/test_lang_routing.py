"""Per-turn LLM routing by the call's CURRENT language (languages.json "llm"): beta languages -> Sarvam, default is the fallback."""
import json
import logging
import shutil
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from test_voice import BASE, KEY, Fake, new_call, turn
from voice import app as va
from voice.app import Settings, create_app

FIXTURE = Path(__file__).resolve().parents[2] / "gateway" / "tests" / "fixtures" / "i18n"
TAMIL = "என் இஎம்ஐ எவ்வளவு"
ENGLISH = "hello there"


@pytest.fixture
def routed_ta(tmp_path):
    """The fixture i18n dir with Tamil routed to Sarvam (the real languages.json does this for all 7 beta languages)."""
    shutil.copytree(FIXTURE, tmp_path / "i18n")
    reg = tmp_path / "i18n" / "languages.json"
    d = json.loads(reg.read_text(encoding="utf-8"))
    next(m for m in d["modes"] if m["code"] == "ta")["llm"] = "sarvam"
    reg.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    va.load_languages(tmp_path / "i18n")
    yield
    va.load_languages()


def make(sarvam_ok=True, **kw):
    hits = []
    fake = Fake()

    def handler(req):
        url = str(req.url)
        if "api.sarvam.ai" in url:
            hits.append("sarvam")
            if not sarvam_ok:
                return httpx.Response(500, text="boom")
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "from sarvam"}}]})
        if "11434" in url:
            hits.append("ollama")
            return httpx.Response(200, json={"message": {"role": "assistant", "content": "from ollama"}})
        return fake.handler(req)

    cl = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    cfg = Settings(**{"gnani_speech_api_key": KEY, "sarvam_api_key": "S", **kw})
    return TestClient(create_app(cfg, cl), base_url=BASE), hits


def test_real_registry_routes_every_beta_language_and_no_core_language():
    va.load_languages()
    assert va.LLM_ROUTE == {c: "sarvam" for c in ("bn", "gu", "kn", "ml", "pa", "ta", "te")}


def test_routed_turn_uses_sarvam_and_core_stays_on_default(routed_ta):
    c, hits = make()
    with c:
        d = new_call(c)
        turn(c, d, "Tamil")  # language choice: answered by the service, no LLM
        r = turn(c, d, TAMIL).json()
        assert hits == ["sarvam"] and r["agent_text"] == "from sarvam" and r["timings"]["provider"] == "sarvam"
        turn(c, d, "English")
        r = turn(c, d, ENGLISH).json()
        assert hits == ["sarvam", "ollama"] and r["agent_text"] == "from ollama"


def test_mid_call_switch_picks_provider_per_turn(routed_ta):
    c, hits = make()
    with c:
        d = new_call(c)
        turn(c, d, ENGLISH)
        turn(c, d, "Tamil")
        turn(c, d, TAMIL)
        turn(c, d, "English")
        turn(c, d, ENGLISH)
        turn(c, d, "Tamil")
        turn(c, d, TAMIL)
        assert hits == ["ollama", "sarvam", "ollama", "sarvam"]


def test_missing_key_uses_default_and_warns_once(routed_ta, caplog):
    caplog.set_level(logging.WARNING, logger="voice")
    c, hits = make(sarvam_api_key="")
    with c:
        d = new_call(c)
        turn(c, d, "Tamil")
        assert turn(c, d, TAMIL).json()["agent_text"] == "from ollama"
        turn(c, d, TAMIL)
        assert hits == ["ollama", "ollama"]
    assert sum("no SARVAM_API_KEY" in r.getMessage() for r in caplog.records) == 1


def test_routing_off_uses_default(routed_ta):
    c, hits = make(llm_lang_routing=False)
    with c:
        d = new_call(c)
        turn(c, d, "Tamil")
        turn(c, d, TAMIL)
        assert hits == ["ollama"]
        assert c.get("/health").json()["lang_routing"] == {}


def test_routing_env_switch(monkeypatch):
    monkeypatch.setenv("LLM_LANG_ROUTING", "false")
    assert Settings().llm_lang_routing is False
    monkeypatch.delenv("LLM_LANG_ROUTING")
    assert Settings().llm_lang_routing is True


def test_routed_failure_falls_back_to_default(routed_ta):
    c, hits = make(sarvam_ok=False)
    with c:
        d = new_call(c)
        turn(c, d, "Tamil")
        r = turn(c, d, TAMIL)
        assert r.status_code == 200 and r.json()["agent_text"] == "from ollama"
        assert hits[-1] == "ollama" and set(hits[:-1]) == {"sarvam"} and r.json()["timings"]["provider"] == "ollama"  # the adapter may retry a 5xx first


def test_dev_pinned_provider_is_not_routed(routed_ta, monkeypatch):
    monkeypatch.setenv("VOICE_DEV", "1")
    c, hits = make()
    with c:
        d = c.post("/calls", json={"customer": "priya", "llm": "ollama"}).json()  # an explicit dev choice wins over the route
        turn(c, d, "Tamil")
        turn(c, d, TAMIL)
        assert hits == ["ollama"]
        d = new_call(c)  # no explicit choice: routed as usual
        turn(c, d, "Tamil")
        turn(c, d, TAMIL)
        assert hits == ["ollama", "sarvam"]


def test_health_shows_the_active_routes(routed_ta):
    c, _ = make()
    with c:
        assert c.get("/health").json()["lang_routing"] == {"ta": "sarvam"}
    c, _ = make(sarvam_api_key="")
    with c:
        assert c.get("/health").json()["lang_routing"] == {}
