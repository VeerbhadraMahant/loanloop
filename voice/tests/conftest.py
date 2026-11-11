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
