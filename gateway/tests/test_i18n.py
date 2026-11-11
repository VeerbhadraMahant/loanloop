"""Language files (i18n/<code>.json): loading, fallback, FAQ merge, digit normalisation, and the validator over real files."""
import importlib.util
import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from app import i18n, speak
from app.contract import ActionIn
from app.routes.actions import _runner, faq
from app.security.scrub import find_secret
from tests.conftest import call

FIXTURE = Path(__file__).parent / "fixtures" / "i18n"
ROOT = Path(__file__).resolve().parents[2]


def _load_check():
    spec = importlib.util.spec_from_file_location("i18n_check", ROOT / "tools" / "i18n_check.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture
def ta(monkeypatch):
    """The fixture Tamil file is the only language file in the registry directory."""
    monkeypatch.setattr(i18n, "I18N_DIR", FIXTURE)
    speak.reload()
    yield
    monkeypatch.undo()
    speak.reload()


def test_registry_gives_all_modes():
    assert set(_runner.LANGS) == {"en", "hi", "hinglish", "mr", "bn", "gu", "kn", "ml", "pa", "ta", "te"}
    assert ActionIn(call_id="c1", language="ta").language == "ta"
    with pytest.raises(ValueError):
        ActionIn(call_id="c1", language="xx")


def test_loaded_template_months_and_fallback(ta):
    assert speak.t("call_started", "ta").startswith("[ta]")
    assert speak.t("faq_sms_sent", "ta", v="ending 4417") == "[ta] இதை உங்கள் எண் ending 4417 க்கும் அனுப்பியுள்ளேன்."
    assert speak.t("call_started", "hi") != speak.t("call_started", "ta")  # built-in languages untouched
    en = speak.t("faq_not_found", "en")
    assert speak.t("faq_not_found", "ta") == en  # key absent from the file: English
    assert speak.t("faq_sms_offer", "ta") == speak.t("faq_sms_offer", "en")  # placeholders differ from English: skipped
    assert speak.fmt_date(date(2026, 11, 10), "ta") == "10 நவம்பர் 2026"
    assert speak.fmt_date(date(2026, 11, 10), "te") == "10 November 2026"  # no file: English month


def test_missing_and_invalid_files_never_break_startup(tmp_path, monkeypatch, caplog):
    shutil.copy(FIXTURE / "languages.json", tmp_path / "languages.json")
    monkeypatch.setattr(i18n, "I18N_DIR", tmp_path)
    (tmp_path / "ta.json").write_text("{not json", encoding="utf-8")
    (tmp_path / "te.json").write_text(json.dumps({"lang": "kn"}), encoding="utf-8")  # wrong lang
    speak.reload()
    assert speak.t("call_started", "ta") == speak.t("call_started", "en")
    assert "skipping i18n/ta.json" in caplog.text and "skipping i18n/te.json" in caplog.text
    monkeypatch.setattr(i18n, "I18N_DIR", tmp_path / "nowhere")  # no registry at all: built-in modes
    speak.reload()
    assert speak.t("call_started", "mr")
    monkeypatch.undo()
    speak.reload()


def test_bad_translation_cannot_crash_t(ta):
    speak._REG["faq_sms_sent"]["ta"] = "[ta] {nope}"  # a placeholder the caller never passes
    assert speak.t("faq_sms_sent", "ta", v="x") == speak.t("faq_sms_sent", "en", v="x")


def test_fallback_logged_once_at_debug(ta, caplog):
    import logging

    caplog.set_level(logging.DEBUG, logger="speak")
    speak.t("faq_not_found", "ta")
    speak.t("faq_not_found", "ta")
    assert sum("faq_not_found" in r.getMessage() for r in caplog.records) == 1


def test_faq_merge_and_match(ta):
    intents = faq.load_faq()
    it = intents["open_account"]
    assert it["answer"]["ta"].startswith("[ta]") and it["sms_text"]["ta"].startswith("[ta]")
    assert faq.match(intents, "எனக்கு புதிய கணக்கு வேண்டும்", "ta") == "open_account"
    assert it["answer"]["en"] and it["answer"]["hi"]  # others intact


async def test_action_in_new_language(ta, client):
    r = await call(client, "start_call", call_id="ta1", language="ta")
    assert r["speak"].startswith("[ta]")
    r = await call(client, "faq_lookup", call_id="ta1", language="ta", topic="open_account")
    assert r["speak"].startswith("[ta]")
    r = await call(client, "faq_lookup", call_id="ta1", language="te", topic="open_account")  # no file: English answer
    assert r["ok"] and not r["speak"].startswith("[ta]")


def test_indic_digits_are_seen_by_the_secret_scan():
    tamil, bengali, gurmukhi = "௧௨௩௪", "১২৩৪", "੧੨੩੪"
    for digits in (tamil, bengali, gurmukhi, "೧೨೩೪", "౧౨౩౪", "൧൨൩൪", "૧૨૩૪"):
        assert find_secret("note", f"my pin is {digits}") == "pin", digits
        assert find_secret("otp", f"{digits}56") == "otp", digits  # field named otp + 3-6 digits
    tamil_card = "".join(chr(0xBE6 + int(c)) if c.isdigit() else c for c in "4111 1111 1111 1111")
    assert find_secret("note", tamil_card) == "card_number"


def test_validator_accepts_complete_file_and_rejects_broken_ones():
    chk = _load_check()
    src = chk.load_source()
    full = {"lang": "ta", "months": [f"m{i}" for i in range(12)],
            "gateway": {k: v["en"] for k, v in src["gateway"].items()},
            "faq": {k: {"keywords": ["a", "b", "c", "d"], "answer": "x", **({"sms_text": "y"} if s["sms"] else {})} for k, s in src["faq"].items()},
            "voice": {"REPROMPT": "r", "LANG_OK": "l", "CUSTOMER_Q": "c", "SAFE": "s", "ASK": ["Say {x}.", " and "],
                      "FIELD_LABEL": {k: "l" for k in src["voice"]["FIELD_LABEL"]["en"]}},
            "words": {**{k: ["w"] for k in chk.LIST_WORDS}, "month_words": {f"m{i}": i for i in range(1, 13)},
                      "weekdays": {f"d{i}": i for i in range(7)}}}
    assert chk.check_file("ta", full, src) == []
    k = next(k for k, v in src["gateway"].items() if "{" in v["en"])
    bad = json.loads(json.dumps(full))
    bad["gateway"][k] = bad["gateway"][k].replace("{", "{x")
    bad["gateway"].pop(next(x for x in src["gateway"] if x != k))
    bad["faq"].pop(next(iter(src["faq"])))
    bad["months"] = bad["months"][:11]
    bad["voice"]["ASK"] = ["no placeholder", " and "]
    bad["words"]["affirm"] = []
    bad["words"]["negate"] = ["no", "not at all", "ಬೇ‌ಡ"]  # a phrase and a ZWNJ-split word never match a token
    bad["words"]["already_paid"] = ["already paid"]  # phrase lists may hold phrases
    problems = " | ".join(chk.check_file("ta", bad, src))
    for frag in (f"gateway.{k}: placeholders", "gateway: missing key", "warning: faq: missing intent", "months must be 12", "voice.ASK", "words.affirm", "words.negate: entries must be single words"):
        assert frag in problems, frag
    assert "words.already_paid" not in problems


def test_every_present_language_file_is_valid():
    """Drop i18n/<code>.json in and this runs on it: keys, placeholders, intent ids, sms_text, months, ASK, FIELD_LABEL, words."""
    res = _load_check().check_all()
    chk = _load_check()
    assert not [p for v in res.values() for p in v if not chk.is_warning(p)], res
