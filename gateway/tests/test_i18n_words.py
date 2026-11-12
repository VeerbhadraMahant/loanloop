"""words.secret_words and words.stopwords from a language file reach the gateway (secret scrubbing, FAQ scorer); the validator knows the new keys."""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

from app import i18n, speak
from app.routes.actions import faq, faq_score
from app.security.scrub import find_secret, redact_secret

FIXTURE = Path(__file__).parent / "fixtures" / "i18n"
ROOT = Path(__file__).resolve().parents[2]
SECRET = {"otp": ["ஓடிபி"], "pin": ["பின் எண்"], "cvv": ["சிவிவி"], "password": ["கடவுச்சொல்"]}


@pytest.fixture
def use(tmp_path, monkeypatch):
    def go(words: dict | None = None):
        d = tmp_path / "i18n"
        shutil.rmtree(d, ignore_errors=True)
        shutil.copytree(FIXTURE, d)
        f = d / "ta.json"
        j = json.loads(f.read_text(encoding="utf-8"))
        j["words"].update(words or {})
        f.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(i18n, "I18N_DIR", d)
        speak.reload()
    yield go
    monkeypatch.undo()
    speak.reload()


def test_secret_words_in_native_script_are_scrubbed(use):
    use()
    assert find_secret("note", "என் ஓடிபி ஆகும்") is None  # the gap: a Tamil-script OTP word was invisible
    use({"secret_words": SECRET})
    for text, typ in (("என் ஓடிபி ஆகும்", "otp"), ("என் பின் எண் ஆகும்", "pin"), ("சிவிவி சொல்கிறேன்", "cvv"), ("என் கடவுச்சொல் ஆகும்", "password")):
        assert find_secret("note", text) == typ
    out = redact_secret("note", "என் ஓடிபி ஆகும். நன்றி")
    assert out and "ஓடிபி" not in out[0] and out[1] == "otp"


def test_secret_scrubbing_only_gains_words(use):
    use({"secret_words": SECRET})
    assert find_secret("note", "my pin is 4321") == "pin" and find_secret("note", "मेरा पासवर्ड abc") == "password"
    assert find_secret("note", "my pin code is 411038") is None  # built-in exclusions untouched
    use({"secret_words": {"otp": ["ab"], "bogus": ["ஓடிபி"], "pin": "not a list"}})  # too short romanised, unknown type, wrong shape: ignored
    assert find_secret("note", "ab ஓடிபி") is None
    use()
    assert find_secret("note", "என் ஓடிபி ஆகும்") is None  # a reload without the key removes it again


def test_stopwords_feed_the_faq_scorer(use):
    use({"stopwords": ["அந்த"]})
    faq.load_faq()
    assert "அந்த" in faq_score._extra
    use()
    faq.load_faq()
    assert "அந்த" not in faq_score._extra


def test_validator_new_keys_warn_when_missing_and_check_shape_when_present():
    spec = importlib.util.spec_from_file_location("i18n_check", ROOT / "tools" / "i18n_check.py")
    chk = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chk)
    miss = chk.check_new_words({})
    assert miss and all(chk.is_warning(p) for p in miss)
    assert len(miss) == len(chk.NEW_TOKEN_WORDS) + len(chk.NEW_PHRASE_WORDS) + len(chk.NEW_GROUPS)
    ok = {**{k: ["ஏன்"] for k in chk.NEW_TOKEN_WORDS}, **{k: ["மோசடி வழக்கு"] for k in chk.NEW_PHRASE_WORDS},
          "topics": {"emi": ["தவணை"]}, "intent_cues": {"closure": ["மூடு"]}, "faq_cues": {"ask": ["கேட்கும்"]}, "secret_words": SECRET}
    assert chk.check_new_words(ok) == []
    bad = dict(ok, why=["two words"], txn="x", topics={"nope": ["a"]}, faq_cues={"ask": ["a phrase"]}, secret_words={"otp": []})
    msgs = " | ".join(chk.check_new_words(bad))
    for frag in ("words.why: entries must be single words", "words.txn: must be a non-empty list", "words.topics: unknown name nope",
                 "words.faq_cues.ask: entries must be single words", "words.secret_words.otp: must be a non-empty list"):
        assert frag in msgs, frag
    assert not any(chk.is_warning(p) for p in chk.check_new_words(bad))
