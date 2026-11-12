"""Language files (i18n/<code>.json) on the voice side, with a fixture Tamil file: registry codes, detection, word sets, digits."""
import datetime as dt
import shutil
from pathlib import Path

import pytest
from test_voice import env, new_call, turn  # noqa: F401  (env is a fixture)

import voice.app as va

FIXTURE = Path(__file__).resolve().parents[2] / "gateway" / "tests" / "fixtures" / "i18n"
TODAY = dt.date(2026, 11, 10)


@pytest.fixture
def ta():
    assert "ta" in va.load_languages(FIXTURE)
    yield
    va.load_languages()


def test_registry_codes_for_all_modes():
    assert va.TTS_LANG["ta"] == "ta-IN" and va.TTS_LANG["hinglish"] == "hi-IN" and va.TTS_LANG["pa"] == "pa-IN"
    assert va.STT_LANG["ta"] == "ta-IN,en-IN" and va.STT_LANG["en"] == "en-IN" and va.STT_LANG["mr"] == "mr-IN,en-IN"
    assert set(va.TTS_LANG) == set(va.STT_LANG) == {"en", "hi", "hinglish", "mr", "bn", "gu", "kn", "ml", "pa", "ta", "te"}


def test_without_a_file_the_language_is_not_offered(tmp_path):
    shutil.copy(FIXTURE / "languages.json", tmp_path / "languages.json")  # registry only, no ta.json
    va.load_languages(tmp_path)
    assert va.ACTIVE_LANGS == ["en", "hi", "hinglish", "mr"]
    assert va.detect_language("Tamil", True)[0] == "unsupported"
    assert va.detect_language("என் இஎம்ஐ எவ்வளவு", False)[0] == "unsupported"
    assert "Tamil" not in va.LANG_SORRY
    va.load_languages()


def test_missing_registry_and_invalid_file_do_not_fail(tmp_path):
    assert va.load_languages(tmp_path) == ["en", "hi", "hinglish", "mr"]  # no registry at all
    shutil.copy(FIXTURE / "languages.json", tmp_path / "languages.json")
    (tmp_path / "ta.json").write_text('{"lang": "ta", "voice": {}}', encoding="utf-8")  # no words section
    assert va.load_languages(tmp_path) == ["en", "hi", "hinglish", "mr"]
    (tmp_path / "ta.json").write_text("{broken", encoding="utf-8")
    assert va.load_languages(tmp_path) == ["en", "hi", "hinglish", "mr"]
    va.load_languages()


def test_detection_by_name_and_script(ta):
    assert va.ACTIVE_LANGS[-1] == "ta"
    assert va.detect_language("Tamil", True) == ("ta", True, True)
    assert va.detect_language("தமிழ்", True) == ("ta", True, True)
    assert va.detect_language("तमिल", True)[0] == "ta"  # a Hindi speaker naming it
    assert va.detect_language("talk in Tamil", False)[0] == "ta"
    lang, pure, named = va.detect_language("என் இஎம்ஐ எவ்வளவு", False)  # script alone picks it
    assert (lang, pure, named) == ("ta", False, True)
    assert va.detect_language("मराठी", True)[0] == "mr" and va.detect_language("What is my EMI", False)[0] is None
    # not supported by Gnani, or no file loaded: sorry line
    for t in ("Odia", "urdu please", "ଓଡ଼ିଆ ଭାଷା", "اردو میں بات کریں", "Bengali", "আপনি কি বাংলায় কথা বলতে পারেন?"):
        assert va.detect_language(t, True)[0] == "unsupported", t
    assert "Tamil" in va.LANG_SORRY and "English" in va.LANG_SORRY


def test_word_sets_and_fixed_lines_extended(ta):
    assert va.is_bare_affirmative("ஆம்") and not va.is_bare_affirmative("இல்லை")
    assert va.is_goodbye("நன்றி")
    assert va.wants_human("மனிதர் பேச") and not va.wants_human("மனிதர் பேச வேண்டாம்")
    assert va.account_specific("என் இஎம்ஐ")
    assert va.parse_spoken_date("15 நவம்பர்", TODAY) == "2026-11-15"
    assert va.parse_spoken_date("௧௫ நவம்பர்", TODAY) == "2026-11-15"  # Tamil digits
    assert va.parse_spoken_date("திங்கள்", TODAY) == "2026-11-16"
    assert va.parse_spoken_date("15 தேதி", TODAY) == "2026-11-15"
    assert va.parse_amount("௫௦௦௦ ரூபாய்") == 5000 and va.parse_amount("முழு", {"overdue_amount": 4000, "charges": 100}) == 4100
    assert va.is_already_paid("ஏற்கனவே செலுத்தினேன்") and va.is_action_request("மாற்று")
    assert va.ask_text("ta", ["amount", "utr"]) == "[ta] தயவுசெய்து தொகை மற்றும் யூடிஆர் எண் சொல்லுங்கள்."
    assert va.LANG_OK["ta"].startswith("[ta]") and va.SAFE["ta"] and va.CUSTOMER_Q["ta"] and va.REPROMPT["ta"]
    assert [va._tokens(x) for x in ("தமிழ்",)] == [["தமிழ்"]]  # matras stay inside the token


def test_reload_drops_the_language_and_its_words(tmp_path):
    shutil.copy(FIXTURE / "languages.json", tmp_path / "languages.json")
    va.load_languages(FIXTURE)
    va.load_languages(tmp_path)
    assert "ta" not in va.LANG_OK and "ஆம்" not in va.AFFIRM_WORDS and "நவம்பர்" not in va._MONTHS_MAP
    assert not va.is_bare_affirmative("ஆம்")
    va.load_languages()


def test_pin_in_indic_digits_is_blocked():
    for digits in ("௧௨௩௪", "১২৩৪", "੧੨੩੪", "૧૨૩૪", "೧೨೩೪", "౧౨౩౪", "൧൨൩൪", "१२३४"):
        assert va.secret_spoken(f"my pin is {digits}") == "pin", digits
        assert va.secret_spoken(f"otp {digits[0]} {digits[1]} {digits[2]} {digits[3]}") == "otp", digits
    assert va.secret_spoken("how do I reset my PIN?") is None  # still a question about a secret
    assert "1234" == "".join("௧௨௩௪").translate(va._DEVA_DIGITS)


def test_call_in_tamil_end_to_end(env, ta):
    c, fake = env
    d = new_call(c)
    r = turn(c, d, "Tamil").json()
    assert r["language"] == "ta" and r["agent_text"] == va.LANG_OK["ta"] and fake.of("llm") == []
    r = c.post(f"/calls/{d['call_id']}/turn", json={"text": "தமிழ்"}).json()  # with audio on: Timbre gets the registry code
    assert fake.of("tts")[-1][2]["language"] == "ta-IN"
    r = turn(c, d, "my pin is ௧௨௩௪").json()  # secret path: blocked, gateway told, language kept
    assert r["actions"] == [{"name": "report_secret_spoken", "ok": True}] and r["language"] == "ta"
    assert fake.of("gw")[-1][2]["language"] == "ta"
    r = turn(c, d, "என் இஎம்ஐ எவ்வளவு").json()  # a Tamil sentence keeps the call in Tamil
    assert r["language"] == "ta"


def test_stt_hint_uses_registry(env, ta):
    c, fake = env
    d = new_call(c)
    turn(c, d, "Tamil")
    c.post(f"/calls/{d['call_id']}/turn?tts=false", files={"audio": ("t.wav", b"RIFFx" + b"\0" * 64, "audio/wav")})
    stt = fake.of("stt")
    assert stt and b"ta-IN,en-IN" in stt[-1][2]


def test_beta_romanised_short_words_do_not_hijack_core_turns():
    va.load_languages()  # the real i18n files
    assert va.detect_language("ok te", False)[0] != "te"
    assert va.detect_language("thanks ta", False)[0] != "ta"
    assert va.detect_language("5 ml", False)[0] != "ml"
    assert va.detect_language("Telugu", True)[0] == "te"
    assert va.wants_human("manager se baat karwao na")
    assert va.is_action_request("mera address badal do ki naya ye hai")


def test_beta_dob_digits_and_goodbye_from_the_real_files():
    va.load_languages()
    assert va._parse_dob("14 ஆகஸ்ட் 1991") == "1991-08-14" and va._parse_dob("১৪ আগস্ট ১৯৯১") == "1991-08-14"
    assert va._parse_dob("௧௪ ஆகஸ்ட் ௧௯௯௧") == "1991-08-14"  # Tamil digits
    assert va._extract_verify("என் எண் 9000014417 பிறந்த தேதி 14 ஆகஸ்ட் 1991") == ("verify_caller", {"registered_mobile": "9000014417", "dob": "1991-08-14"})
    assert va._extract_verify("৯০০০০১৪৪১৭ জন্মতারিখ ১৪ আগস্ট ১৯৯১") == ("verify_caller", {"registered_mobile": "9000014417", "dob": "1991-08-14"})
    assert va.is_goodbye("சரி, நன்றி, பை") and va.is_goodbye("ধন্যবাদ, বাই") and va.is_goodbye("nandri bye")
    assert not va.is_goodbye("வணக்கம்") and not va.is_goodbye("நன்றி, என் இஎம்ஐ தேதியை மாற்று") and not va.is_goodbye("நன்றி")  # thanks alone is not a farewell
