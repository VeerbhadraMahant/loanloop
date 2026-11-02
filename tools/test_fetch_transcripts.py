import json

from fetch_transcripts import main, redact_all


def test_transcript_is_redacted():
    t = {"response": [{"messages": [{"role": "user", "text": "mera mobile 9000014417, card 4111 1111 1111 1111, account 123456789012 hai"}],
                       "meta": {"phone": "9876500000", "email": "priya@example.com"}}]}
    out = json.dumps(redact_all(t))
    for raw in ("9000014417", "4111", "123456789012", "9876500000", "priya@example.com"):
        assert raw not in out
    assert "[card]" in out and "[num]" in out


def test_dry_run_needs_no_key(capsys, monkeypatch):
    monkeypatch.delenv("INYA_PLATFORM_API_KEY", raising=False)
    assert main(["--dry-run"]) == 0
    assert "conversations/logs" in capsys.readouterr().out
