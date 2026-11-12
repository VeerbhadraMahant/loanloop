import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ["WARMUP"] = "false"  # tests never touch the network, not even a background warm-up


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path):
    """Tests never read the real repo-root .env.local or provider keys / dev flag from the environment."""
    import voice.app as app_mod

    monkeypatch.setattr(app_mod, "ENV_LOCAL", tmp_path / "missing.env.local")
    monkeypatch.setenv("DASHBOARD_TOKEN", "dev-dashboard-token-change-me")
    for name in ("GEMINI_API_KEY", "SARVAM_API_KEY", "LLM_PROVIDER", "VOICE_DEV", "GNANI_SPEECH_API_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def service_bearer(request, monkeypatch):
    """Existing tests act as the service identity (DASHBOARD_TOKEN bearer); a module can opt out with NO_DEFAULT_AUTH = True."""
    if getattr(request.module, "NO_DEFAULT_AUTH", False):
        return
    import httpx
    from starlette.testclient import TestClient

    orig = TestClient.request

    def request_(self, method, url, **kw):
        h = httpx.Headers(kw.get("headers") or {})
        h.setdefault("authorization", "Bearer dev-dashboard-token-change-me")
        return orig(self, method, url, **{**kw, "headers": h})

    monkeypatch.setattr(TestClient, "request", request_)
