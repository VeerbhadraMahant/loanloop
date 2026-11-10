"""Fixes from live eval run 2: FAQ allowlist past account_specific, language-only replies, PTP date/amount, already paid, last txns."""
import datetime as dt

import pytest
from test_v2 import OPS, gw_calls
from test_v2_fixes import FAQ
from test_voice import env, new_call, tc, turn  # noqa: F401  (env is a fixture)

from voice.app import account_specific, detect_language, is_already_paid, last_txn_count, parse_amount, parse_spoken_date


@pytest.mark.parametrize("text,want", [
    ("English. I think I was scammed and money was taken from my account.", False),
    ("My father passed away, how do I access his bank account?", False),
    ("Mera account dormant ho gaya hai, dobara kaise chalu karun?", False),
    ("माझा ईएमआय चुकला, काय होईल?", False),
    ("मेरी ईएमआई छूट गई है, अब क्या होगा?", False),
    ("My account was hit by fraud", False),
    ("What is my EMI amount?", True),
    ("Mera EMI kitna hai", True),
    ("my account balance", True),
])
def test_account_specific_allowlist(text, want):
    assert account_specific(text) is want


def test_language_reply_is_only_a_language_choice():
    assert detect_language("Hindi please", True)[1] and detect_language("Marathi", True)[1] and detect_language("talk in Marathi", False)[1]
    assert not detect_language("Hinglish. KYC update kaise karein?", True)[1]
    assert detect_language("Hinglish. KYC update kaise karein?", True)[0] == "hinglish"


def test_language_plus_question_goes_to_faq(env):
    c, fake = env
    fake.gw["faq_lookup"] = FAQ
    d = new_call(c)
    r = turn(c, d, "Hinglish. KYC update kaise karein?").json()
    assert r["language"] == "hinglish" and r["agent_text"] == "faq answer"
    d = new_call(c)
    assert turn(c, d, "English. I think I was scammed and money was taken from my account.").json()["agent_text"] == "faq answer"


def test_dates_year_and_skipping_non_month_pairs():
    today = dt.date(2026, 11, 10)
    assert parse_spoken_date("I can pay 1000 rupees on 17 November 2026.", today) == "2026-11-17"
    assert parse_spoken_date("5 rupees on 17 November", today) == "2026-11-17"
    assert parse_spoken_date("17 June 1988", today) == "2027-06-17"  # a date of birth is only a date when it is the newest utterance


def test_amounts():
    assert parse_amount("I can pay 1000 rupees on 17 November 2026.") == 1000
    assert parse_amount("मैं 17 November 2026 को 1,500 रुपये दे दूँगा।") == 1500
    assert parse_amount("I will pay on 17 November") is None
    assert parse_amount("pay two thousand on 15 tarikh") is None
    assert parse_amount("2 thousand on 15 tarikh") is None
    assert parse_amount("pura pay karunga", {"overdue_amount": 4000, "charges": 500}) == 4500
    assert is_already_paid("I already paid this last week.") and is_already_paid("maine payment kar diya")
    assert not is_already_paid("I will pay next week")
    assert last_txn_count("Show my last 2 transactions") == 2 and last_txn_count("शेवटचे व्यवहार सांगा") == 0
    assert last_txn_count("last transactions and balance") is None


def outbound(c, fake):
    d = c.post("/calls?tts=false", json={"direction": "outbound", "case_id": 7}, headers=OPS).json()
    fake.gw["verify_caller"] = {"ok": True, "speak": "You are verified."}
    fake.gw["dues_info"] = {"ok": True, "speak": "Dues are 4000.", "data": {"overdue_amount": 4000, "charges": 500}}
    r = turn(c, d, "17 June 1988").json()
    assert r["agent_text"] == "You are verified. Dues are 4000." and fake.of("llm") == []  # dues read out without the model
    return d


def test_outbound_ptp_uses_newest_date_not_the_date_of_birth(env):
    c, fake = env
    fake.gw["record_ptp"] = {"ok": False, "speak": "1000 on 17 November. Right?", "next": "confirm_readback",
                             "data": {"fields": ["amount"], "confirm": {"amount": "1000"}}}
    d = outbound(c, fake)
    r = turn(c, d, "I can pay 1000 rupees on 17 November 2026.").json()
    assert r["agent_text"] == "1000 on 17 November. Right?" and fake.of("llm") == []
    assert gw_calls(fake, "record_ptp")[-1]["promised_date"] == "2026-11-17" and gw_calls(fake, "record_ptp")[-1]["amount"] == 1000


def test_outbound_full_amount_and_already_paid(env):
    c, fake = env
    d = outbound(c, fake)
    turn(c, d, "मैं 17 November 2026 को पूरा दे दूँगा")
    assert gw_calls(fake, "record_ptp")[-1]["amount"] == 4500
    turn(c, d, "I already paid this last week.")
    assert gw_calls(fake, "record_rtp")[-1]["reason_code"] == "already_paid"
    assert gw_calls(fake, "check_payment") == []


def test_inbound_ptp_phrase_is_not_routed(env):
    c, fake = env
    d = new_call(c)
    turn(c, d, "I can pay 1000 rupees on 17 November 2026.")
    assert gw_calls(fake, "record_ptp") == []


def test_verified_last_transactions_in_marathi(env):
    c, fake = env
    d = new_call(c)
    turn(c, d, "मराठीत")
    turn(c, d, "माझा मोबाईल 9000030912 आणि जन्मतारीख 5 November 1979 आहे.")
    r = turn(c, d, "आता माझे शेवटचे व्यवहार सांगा.").json()
    assert gw_calls(fake, "last_transactions") and r["agent_text"] == "last_transactions done"


def test_bengali_script_is_unsupported_language():
    assert detect_language("আপনি কি বাংলায় কথা বলতে পারেন?", True)[0] == "unsupported"
    assert detect_language("मराठीत बोला", True)[0] == "mr"
