import pytest

from app.security.scrub import REMOVED, redact_secret


@pytest.mark.parametrize("text,raw", [
    ("my pin number is 4321", "4321"),
    ("the password for my account is hunter2", "hunter2"),
    ("Lost job. She said her password is Tiger@123. Wants callback.", "Tiger@123"),
    ("card 4111 1111 1111 1111 please", "4111"),
])
def test_free_text_redaction_drops_the_value(text, raw):
    out, _ = redact_secret("summary", text)
    assert raw not in out and REMOVED in out


def test_clean_sentences_survive():
    out, _ = redact_secret("summary", "Lost job. Her otp is 552211. Wants callback.")
    assert "Lost job." in out and "Wants callback." in out and "552211" not in out
