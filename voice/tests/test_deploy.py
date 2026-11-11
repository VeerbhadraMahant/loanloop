"""Public-deployment hardening: host allowlist, edge token, startup guard, LLM fallback."""
import httpx
import pytest
from fastapi.testclient import TestClient

from test_voice import BASE, KEY, Fake, new_call, turn  # noqa: F401
from voice.app import Settings, create_app

PUB = dict(gnani_speech_api_key=KEY, gateway_shared_secret="s3cret", dashboard_token="d4sh", voice_edge_token="edge",
           voice_allowed_hosts="voice.example.app")


def client(fake=None, **kw):
    fake = fake or Fake()
    cl = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    return TestClient(create_app(Settings(**{"gnani_speech_api_key": KEY, **kw}), cl), base_url=BASE), fake


def test_host_allowlist_and_health_exempt():
    c, _ = client(**PUB)
    h = {"X-Voice-Edge-Token": "edge"}
    with c:
        assert c.get("/health", headers={"Host": "railway-probe"}).status_code == 200
        assert c.post("/calls?tts=false", json={}, headers={**h, "Host": "evil.com"}).status_code == 400
        assert c.post("/calls?tts=false", json={}, headers={**h, "Host": "voice.example.app"}).status_code == 200
        assert c.post("/calls?tts=false", json={}, headers=h).status_code == 200  # localhost still allowed
    c2, _ = client()
    with c2:
        assert c2.get("/health", headers={"Host": "other"}).status_code == 200
        assert c2.post("/calls?tts=false", json={}, headers={"Host": "other"}).status_code == 400


def test_edge_token():
    c, _ = client(voice_edge_token="edge")
    with c:
        assert c.post("/calls?tts=false", json={}).status_code == 401
        assert c.post("/calls?tts=false", json={}, headers={"X-Voice-Edge-Token": "nope"}).status_code == 401
        assert c.post("/calls?tts=false", json={}, headers={"X-Voice-Edge-Token": "edge"}).status_code == 200
        assert c.get("/health").status_code == 200  # never needs the token
    c2, _ = client()
    with c2:
        assert c2.post("/calls?tts=false", json={}).status_code == 200  # disabled by default


@pytest.mark.parametrize("bad", [dict(gateway_shared_secret="dev-shared-secret-change-me"),
                                 dict(dashboard_token="dev-dashboard-token-change-me"),
                                 dict(voice_edge_token=""), dict(VOICE_DEV=True)])
def test_public_startup_guard_refuses(bad):
    with pytest.raises(RuntimeError, match="Refusing to start"):
        create_app(Settings(**{**PUB, **bad}), httpx.AsyncClient())


def test_public_startup_guard_allows_good_and_local():
    create_app(Settings(**PUB), httpx.AsyncClient())
    create_app(Settings(gnani_speech_api_key=KEY), httpx.AsyncClient())  # no allowed hosts: dev defaults fine


def test_port_env(monkeypatch):
    monkeypatch.delenv("VOICE_PORT", raising=False)
    monkeypatch.setenv("PORT", "9123")
    assert Settings().voice_port == 9123
    monkeypatch.setenv("VOICE_PORT", "7000")
    assert Settings().voice_port == 7000


def fb_client(primary_ok, calls):
    def handler(req):
        url = str(req.url)
        if "11434" in url:
            calls.append("ollama")
            if not primary_ok:
                return httpx.Response(500, text="boom")
            return httpx.Response(200, json={"message": {"role": "assistant", "content": "primary"}})
        if "generativelanguage" in url:
            calls.append("gemini")
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "fallback"}}]})
        return Fake().handler(req)

    cl = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return TestClient(create_app(Settings(gnani_speech_api_key=KEY, gemini_api_key="G", llm_fallback="gemini"), cl), base_url=BASE)


def test_fallback_used_when_primary_fails():
    calls = []
    with fb_client(False, calls) as c:
        d = new_call(c)
        r = turn(c, d, "hello there")
        assert r.status_code == 200 and "fallback" in r.json()["agent_text"]
        assert calls == ["ollama", "gemini"]
        assert r.json()["timings"]["provider"] == "gemini"


def test_fallback_not_used_when_primary_ok_and_still_502_when_none():
    calls = []
    with fb_client(True, calls) as c:
        d = new_call(c)
        assert turn(c, d, "hello there").status_code == 200
        assert calls == ["ollama"]
    c, fake = client()  # no fallback configured: unchanged 502
    with c:
        d = new_call(c)
        fake.fail = "llm"
        assert turn(c, d, "hello").status_code == 502


def test_railway_env_makes_public(monkeypatch):
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="Refusing to start"):  # dev defaults, no hosts set
        create_app(Settings(gnani_speech_api_key=KEY), httpx.AsyncClient())
    good = dict(gnani_speech_api_key=KEY, gateway_shared_secret="s3cret", dashboard_token="d4sh", voice_edge_token="edge")
    c, _ = client(**good)
    with c:
        assert c.get("/health").json() == {"ok": True}  # trimmed when public


def test_local_health_is_detailed(monkeypatch):
    for v in ("RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PUBLIC_DOMAIN"):
        monkeypatch.delenv(v, raising=False)
    c, _ = client()
    with c:
        assert "providers" in c.get("/health").json()
