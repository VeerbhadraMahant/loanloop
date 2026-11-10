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
