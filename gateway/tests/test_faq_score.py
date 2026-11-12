"""Weighted FAQ scorer: specific words beat generic ones, phrases beat single words, confidence levels, speed."""
import time

from app.routes.actions import faq_score as fs
from app.routes.actions.faq import load_faq, match


def test_rare_phrase_beats_generic_words_and_levels():
    intents = load_faq()
    ranked = fs.table_for(intents).rank("how do I open a savings account", "en")
    assert ranked[0][0] == "open_account"
    assert fs.classify(fs.table_for(intents).rank("what is the minimum balance", "en"))[0] == "high"
    assert fs.classify(fs.table_for(intents).rank("my account", "en"))[0] == "low"  # only generic words
    assert match(intents, "zzz qqq", "en") is None


def test_keyword_inside_another_word_does_not_match():
    intents = load_faq()
    assert not any(i == "statement_codes" for i, *_ in fs.table_for(intents).rank("what is my position in the queue", "en"))


def test_match_is_fast():
    intents = load_faq()
    match(intents, "warm", "en")
    t0 = time.perf_counter()
    for _ in range(50):
        match(intents, "UPI payment failed but money was deducted from my account", "hinglish")
    assert (time.perf_counter() - t0) * 1000 / 50 < 50


# --- beta-script matching (Gujarati/Tamil/Punjabi...): prefix match, folding, stopword coverage. Hindi/Marathi/ASCII are untouched.
GU = {
    "open_account": {"keywords": {"gu": ["ખાતું ખોલ"]}},
    "min_balance": {"keywords": {"gu": ["મિનિમમ બેલેન્સ"]}},
}


def test_beta_prefix_match_handles_suffix_inflection():
    t = fs.Table(GU)
    assert t.rank("નવું ખાતું ખોલાવું છે", "gu")[0][0] == "open_account"   # ખોલ- vs ખોલા-
    assert t.rank("ખોલ ખાતું", "gu")[0][0] == "open_account"                 # order-free
    assert t.rank("ખાતું બંધ કરો", "gu") == []                               # a missing content token: no hit


def test_beta_prefix_hit_weighs_less_than_exact():
    t = fs.Table(GU)
    exact, pref = t.rank("ખાતું ખોલ", "gu")[0][1], t.rank("ખોલાવું ખાતું", "gu")[0][1]
    assert 0 < pref < exact


def test_beta_folding_variants_and_zwj():
    assert fs.norm("ਬੈਲੈਂਸ") == fs.norm("ਬੇਲੇਂਸ") == fs.norm("ਬੇਲੇਸ")      # ai/e matra + anusvara
    assert fs.norm("மினிமம்‌") == fs.norm("மினிமம்")                 # ZWNJ
    assert fs.norm("मिनिमम बँलन्स") == "मिनिमम बँलन्स"                      # Devanagari untouched
    t = fs.Table({"x": {"keywords": {"pa": ["ਬੈਲੈਂਸ"]}}})
    assert t.rank("ਮੇਰਾ ਬੇਲੇਂਸ ਕਿੰਨਾ", "pa")[0][0] == "x"


def test_extra_stopwords_leave_the_coverage_denominator():
    t = fs.Table(GU)
    q = "મિનિમમ બેલેન્સ શું થાય"
    base = t.rank(q, "gu")[0][2]
    try:
        fs.set_extra_stopwords(["શું", "થાય"])
        assert t.rank(q, "gu")[0][2] > base
    finally:
        fs.set_extra_stopwords([])


def test_ascii_and_devanagari_rows_have_no_prefix_path():
    t = fs.Table({"a": {"keywords": {"en": ["open account"], "hi": ["खाता खोल"]}}})
    assert all(r[7] is None for r in t.rows)
    assert t.rank("खोलना खाता", "hi") == []  # Devanagari still needs the exact substring
