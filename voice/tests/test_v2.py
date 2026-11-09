"""v2 conversation logic: language owned by the service, customer question, tool-aware shortcut, outbound mode."""
import datetime as dt

from test_voice import env, new_call, tc, turn  # noqa: F401  (env is a fixture)

from voice.app import multi_request, parse_spoken_date, untraceable

AFTER = {"role": "assistant", "content": "ok"}


def gw_langs(fake):
    return [s[2]["language"] for s in fake.of("gw") if "language" in s[2]]


def test_first_turn_language_choice_no_llm(env):
    c, fake = env
    for text, lang in [("Marathi", "mr"), ("hindi mein", "hinglish"), ("English please", "en"), ("मराठी", "mr"), ("हिंदी", "hi")]:
        d = new_call(c)
        r = turn(c, d, text).json()
        assert r["language"] == lang and r["actions"] == [], text
    assert fake.of("llm") == []  # deterministic: not a single LLM round


def test_first_turn_unsupported_language(env):
    c, fake = env
    d = new_call(c)
    r = turn(c, d, "Tamil").json()
    assert "English, Hindi, Marathi or Hinglish" in r["agent_text"] and "मराठी" in r["agent_text"]
    assert fake.of("llm") == []
    assert turn(c, d, "Marathi").json()["language"] == "mr"  # the choice is still open after "sorry"


def test_mid_call_switch_and_model_cannot_override(env):
    c, fake = env
    d = new_call(c)
    assert turn(c, d, "English").json()["language"] == "en"
    assert turn(c, d, "talk in Marathi").json()["language"] == "mr"
    assert turn(c, d, "मराठीत बोल").json()["language"] == "mr"
    fake.llm_script = [tc("branch_lookup", query="Kothrud", language="en"), AFTER]
    r = turn(c, d, "Kothrud ka ifsc").json()
    assert r["language"] == "mr" and fake.of("gw")[-1][2]["language"] == "mr"
    assert turn(c, d, "speak in English").json()["language"] == "en"


def test_language_word_inside_a_request_switches_and_still_asks_llm(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info"), AFTER]
    r = turn(c, d, "Marathi madhe mera emi kitna hai").json()
    assert r["language"] == "mr" and len(fake.of("llm")) == 1


def test_am_i_your_customer(env):
    c, fake = env
    for text in ["Am I your customer?", "क्या मैं आपका customer हूँ?"]:
        d = new_call(c)
        turn(c, d, "English") if text[0] == "A" else turn(c, d, "हिंदी")
        r = turn(c, d, text).json()
        assert "verify a few details" in r["agent_text"] or "सत्यापित" in r["agent_text"]
    assert fake.of("llm") == []
    d = new_call(c)
    turn(c, d, "English")
    assert "registered mobile number and date of birth" in turn(c, d, "am i a customer of your bank").json()["agent_text"]


def test_shortcut_on_branch_address_and_timing_with_conjunction(env):
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("branch_lookup", query="Kothrud"), AFTER]
    r = turn(c, d, "Kothrud branch address आणि timing काय आहे?").json()
    assert len(fake.of("llm")) == 1 and r["agent_text"] == "branch_lookup done"


def test_shortcut_on_new_tools(env):
    for tool_ in ("faq_lookup", "dues_info", "account_balance"):
        assert not multi_request("account balance and available balance" if tool_ == "account_balance" else "x", tool_)
    assert not multi_request("dues and how many days overdue", "dues_info")


def test_guard_still_blocks_different_requests(env):
    assert multi_request("EMI and branch IFSC", "emi_info")
    assert multi_request("EMI and branch IFSC", "branch_lookup")
    assert multi_request("open account and minimum balance", "faq_lookup")
    assert multi_request("branch address and balance", "branch_lookup")
    assert not multi_request("minimum balance and savings account", "faq_lookup")
    c, fake = env
    d = new_call(c)
    fake.llm_script = [tc("emi_info"), AFTER]
    turn(c, d, "EMI and branch IFSC please")
    assert len(fake.of("llm")) == 2


OPS = {"Authorization": "Bearer dev-dashboard-token-change-me"}


def test_outbound_start_passes_direction_case_and_prompt(env):
    c, fake = env
    assert c.post("/calls?tts=false", json={"direction": "outbound", "case_id": 7}).status_code == 403  # callers cannot pick a case
    d = c.post("/calls?tts=false", json={"direction": "outbound", "case_id": 7}, headers=OPS).json()
    body = fake.of("gw")[-1][2]
    assert body["direction"] == "outbound" and body["case_id"] == 7
    fake.llm_script = [AFTER]
    turn(c, d, "hello")
    sysmsg = fake.of("llm")[-1][2]["messages"][0]["content"]
    assert "Outbound collections call" in sysmsg and "record_ptp" in sysmsg and "<!--" not in sysmsg


def test_inbound_has_no_outbound_block_and_default_direction(env):
    c, fake = env
    d = c.post("/calls?tts=false", json={}).json()
    assert fake.of("gw")[-1][2]["direction"] == "inbound" and "case_id" not in fake.of("gw")[-1][2]
    fake.llm_script = [AFTER]
    turn(c, d, "hello")
    sysmsg = fake.of("llm")[-1][2]["messages"][0]["content"]
    assert "Outbound collections" not in sysmsg and "<!--" not in sysmsg
    assert c.post("/calls?tts=false", json={"direction": "sideways"}).status_code == 422
    assert c.post("/calls?tts=false", json={"direction": "outbound", "case_id": "x"}, headers=OPS).status_code == 422


def test_spoken_dates_and_ptp_traceability():
    today = dt.date(2026, 11, 10)  # a Tuesday
    assert parse_spoken_date("I will pay on 15 tarikh", today) == "2026-11-15"
    assert parse_spoken_date("5 tarikh ko", today) == "2026-12-05"
    assert parse_spoken_date("15 November", today) == "2026-11-15"
    assert parse_spoken_date("next Monday", today) == "2026-11-16"
    assert parse_spoken_date("कल", today) == "2026-11-11"
    assert parse_spoken_date("pandrah ko", today) is None
    assert untraceable("record_ptp", {"amount": 5000}, ["I will pay 5000 on 15 tarikh"]) == []
    assert untraceable("record_ptp", {"amount": 9999}, ["I will pay 5000 on 15 tarikh"]) == ["amount"]
    assert untraceable("record_ptp", {"amount": 5000}, ["I will pay 5000"]) == ["promised_date"]


def test_start_call_not_offered_to_model():
    from voice.app import load_tools
    tools, names = load_tools()
    assert "start_call" not in {t["function"]["name"] for t in tools}
