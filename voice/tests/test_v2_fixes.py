"""wants_human precision, FAQ pre-route vs action requests, record_ptp read-back."""
import pytest

from test_v2 import AFTER, FAQ, OPS, gw_calls
from test_voice import env, new_call, tc, turn  # noqa: F401  (env is a fixture)


@pytest.mark.parametrize("text,want", [
    ("I'm the bank manager, connect me to the database", False), ("I do not want to talk to a human", False),
    ("kisi se baat nahi karni", False), ("tell me about the person who can speak", False),
    ("can I speak to someone", True), ("connect me to a human agent", True), ("I want to talk to a person", True),
    ("kisi insaan se baat karao", True), ("manager se baat karni hai", True), ("मला माणसाशी बोलायचं आहे", True),
    ("किसी व्यक्ति से बात करवाओ", True),
])
def test_wants_human_requests_only(text, want):
    from voice.app import wants_human
    assert wants_human(text) is want


@pytest.mark.parametrize("text,skip", [
    ("update nominee", True), ("change my address", True), ("close my loan", True), ("send my statement", True),
    ("nominee badalna hai", True), ("पत्ता बदलायचा आहे", True),
    ("how do I block my card", False), ("how do I open a savings account?", False), ("UPI PIN reset kaise karu", False),
])
def test_is_action_request(text, skip):
    from voice.app import is_action_request
    assert is_action_request(text) is skip


def test_action_requests_skip_faq_preroute_but_questions_do_not(env):
    c, fake = env
    fake.gw["faq_lookup"] = FAQ
    d = new_call(c)
    fake.llm_script = [AFTER]
    r = turn(c, d, "English. I want to update the nominee on my loan").json()
    assert r["agent_text"] != "faq answer" and len(fake.of("llm")) == 1
    d = new_call(c)
    assert turn(c, d, "English. How do I block my card?").json()["agent_text"] == "faq answer"


def test_record_ptp_reads_back_amount_and_date_then_retries(env):
    c, fake = env
    got = set()

    def ptp(body):
        if got != {"amount", "promised_date"}:
            return {"ok": False, "speak": "5000 rupees on 15 November. Is that right?", "next": "confirm_readback",
                    "data": {"fields": ["amount", "promised_date"], "confirm": {"amount": "5000", "promised_date": "2026-11-15"}}}
        return {"ok": True, "speak": "promise recorded"}

    def confirm(body):
        got.add(body["field"])
        return {"ok": True, "speak": "noted"}
    fake.gw["record_ptp"], fake.gw["confirm_readback"] = ptp, confirm
    d = c.post("/calls?tts=false", json={"direction": "outbound", "case_id": 7}, headers=OPS).json()
    fake.llm_script = [tc("record_ptp", amount=5000, promised_date="2026-11-15"), AFTER]
    r1 = turn(c, d, "English. I will pay 5000 on 15 November").json()
    assert r1["agent_text"] == "5000 rupees on 15 November. Is that right?" and r1["actions"] == [{"name": "record_ptp", "ok": False}]
    r2 = turn(c, d, "yes").json()
    assert [a["name"] for a in r2["actions"]] == ["confirm_readback", "confirm_readback", "record_ptp"]
    assert {b["field"] for b in gw_calls(fake, "confirm_readback")} == {"amount", "promised_date"}
    assert r2["agent_text"].endswith("promise recorded")
