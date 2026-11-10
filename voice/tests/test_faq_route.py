"""FAQ routing by confidence: HIGH answers without the LLM, MEDIUM is an LLM turn with the FAQ block, LOW is a plain LLM turn."""
import json
import time

from test_voice import dev_env, env, new_call, turn  # noqa: F401  (env is a fixture)
from test_v2 import FAQ, gw_calls

NF = {"ok": False, "speak": "nf", "error_code": "FAQ_NOT_FOUND"}  # the model's own prose fallback finds nothing either

from voice.app import faq_reference, faq_route, tool_owned

AFTER = {"role": "assistant", "content": "ok"}
HIGH_Q = "English. How do I open a savings account?"


def english(c, d):
    turn(c, d, "English")


def test_high_confidence_goes_direct_by_topic_without_llm(env):
    c, fake = env
    fake.gw["faq_lookup"] = FAQ
    d = new_call(c)
    r = turn(c, d, HIGH_Q).json()
    assert r["agent_text"] == "faq answer" and fake.of("llm") == []
    assert gw_calls(fake, "faq_lookup")[-1]["topic"] == "open_account"


def test_medium_confidence_is_llm_turn_with_faq_block(env):
    c, fake = env
    fake.gw["faq_lookup"] = NF
    d = new_call(c)
    english(c, d)
    fake.llm_script = [AFTER]
    r = turn(c, d, "Can I get a personal loan without a salary slip?").json()
    assert faq_route("Can I get a personal loan without a salary slip?", "en")[0] == "medium"
    assert r["agent_text"] == "ok" and len(fake.of("llm")) == 1
    assert "Reference (bank FAQ" in fake.of("llm")[-1][2]["messages"][-1]["content"]


def test_low_confidence_is_plain_llm_turn_no_block(env):
    c, fake = env
    fake.gw["faq_lookup"] = NF
    d = new_call(c)
    english(c, d)
    fake.llm_script = [AFTER]
    r = turn(c, d, "tell me something nice about the weather").json()
    assert r["agent_text"] == "ok" and len(fake.of("llm")) == 1
    assert "Reference (bank FAQ" not in fake.of("llm")[-1][2]["messages"][-1]["content"]


def test_tool_owned_questions_never_go_to_faq_even_with_a_faq_keyword(env):
    c, fake = env
    fake.gw["faq_lookup"] = FAQ
    for text in ["What is the IFSC of the Kothrud branch?", "Why did my EMI go up?", "I already paid my EMI", "I want to close my loan",
                 "Is the Kothrud branch open on Saturday", "I lost my job and cannot pay my EMI", "Can you send me my bank statement?"]:
        assert tool_owned(text), text
        assert faq_route(text, "en")[0] == "low", text
    d = new_call(c)
    english(c, d)
    fake.llm_script = [AFTER]
    turn(c, d, "Why did my EMI go up this month?")
    assert gw_calls(fake, "faq_lookup") == [] and len(fake.of("llm")) == 1


def test_account_specific_needs_high_confidence_and_never_gets_a_block():
    assert faq_route("Why has my bank account been frozen?", "en")[0] == "high"  # general topic, confident
    assert faq_route("How much money is currently on hold in my account?", "en")[0] == "low"  # medium score, account-specific: the tool/LLM decides


def test_thresholds_are_dev_console_settings():
    c, fake = dev_env()
    fake.gw["faq_lookup"] = NF
    d = c.post("/calls?tts=false", json={"settings": {"faq_direct_min": 30}}).json()  # nothing is that confident any more
    english(c, d)
    fake.llm_script = [AFTER]
    r = turn(c, d, "How do I open a savings account?").json()
    assert len(fake.of("llm")) == 1 and r["agent_text"] == "ok" and "Reference" in json.dumps(fake.of("llm")[-1][2]["messages"][-1])  # now medium: LLM with block
    keys = {k["key"] for k in c.get("/dev/config").json()["knobs"]}
    assert {"faq_direct_min", "faq_direct_margin", "faq_direct_cover", "faq_ref_min"} <= keys


def test_reference_block_respects_min_score():
    assert faq_reference("how to open account and the minimum balance", "en").startswith("Reference")
    assert faq_reference("how to open account and the minimum balance", "en", min_score=999) == ""


def test_match_time_is_milliseconds():
    faq_route("warm up the tables", "en")
    qs = ["How do I open a savings account?", "UPI payment failed but money deducted", "नया खाता कैसे खोलूँ?", "Why is the sky blue and who won the match"] * 10
    t0 = time.perf_counter()
    for q in qs:
        faq_route(q, "hinglish")
    ms = (time.perf_counter() - t0) * 1000 / len(qs)
    assert ms < 50, ms
