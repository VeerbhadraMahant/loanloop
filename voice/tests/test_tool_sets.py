"""Tool sets by call state and per-turn FAQ grounding (settings tool_sets, faq_context)."""
import json

from test_voice import dev_env, env, new_call, tc, turn  # noqa: F401  (env is a fixture)
from test_v2 import OPS

from voice.app import TOOL_SETS, faq_reference, load_tools

AFTER = {"role": "assistant", "content": "ok"}
Q = "what is the minimum balance for a savings account"


def sent_tools(fake):
    return {t["function"]["name"] for t in fake.of("llm")[-1][2]["tools"]}


def english(c, d):
    turn(c, d, "English")  # first turn picks the language without the LLM


def test_sets_are_subsets_of_known_tools_and_sizes():
    tools, known = load_tools()
    assert all(s <= known for s in TOOL_SETS.values())
    assert not any({"start_call", "confirm_readback"} & s for s in TOOL_SETS.values())
    assert not {"record_ptp", "record_rtp"} & TOOL_SETS["in_verified"]
    sizes = {k: len(json.dumps([t for t in tools if t["function"]["name"] in s])) for k, s in TOOL_SETS.items()}
    assert all(v < len(json.dumps(tools)) for v in sizes.values())


def test_unverified_inbound_sees_no_customer_tools_and_set_switches_after_verification(env):
    c, fake = env
    d = new_call(c)
    english(c, d)
    fake.llm_script = [AFTER]
    turn(c, d, "hello there")
    names = sent_tools(fake)
    assert names == TOOL_SETS["in_unverified"] and not {"dues_info", "account_balance", "emi_info"} & names
    fake.llm_script = [tc("verify_caller", registered_mobile="9000014417", dob="1991-08-14"), AFTER]
    turn(c, d, "my mobile 9000014417 and dob 14 August 1991")
    fake.llm_script = [AFTER]
    turn(c, d, "hello again")
    names = sent_tools(fake)
    assert names == TOOL_SETS["in_verified"] and {"account_balance", "dues_info"} <= names
    assert not {"record_ptp", "record_rtp"} & names


def test_outbound_sees_collections_tools(env):
    c, fake = env
    d = c.post("/calls?tts=false", json={"direction": "outbound", "case_id": 7}, headers=OPS).json()
    fake.llm_script = [AFTER]
    turn(c, d, "hello")
    names = sent_tools(fake)
    assert names == TOOL_SETS["outbound"] and {"record_ptp", "record_rtp", "dues_info"} <= names
    assert "branch_lookup" not in names


def test_tool_sets_off_sends_all_tools():
    c, fake = dev_env()
    d = c.post("/calls?tts=false", json={"settings": {"tool_sets": False}}).json()
    english(c, d)
    fake.llm_script = [AFTER]
    turn(c, d, "hello there")
    assert sent_tools(fake) == load_tools()[1] - {"start_call"}


def test_tool_outside_the_set_is_still_executed_as_before(env):
    c, fake = env
    d = new_call(c)
    english(c, d)
    fake.llm_script = [tc("emi_info"), AFTER]
    turn(c, d, "hello there")
    assert any(s[1].endswith("/actions/emi_info") for s in fake.of("gw"))


def test_faq_block_only_in_current_turn_and_not_stored(env):
    c, fake = env
    d = new_call(c)
    english(c, d)
    fake.llm_script = [AFTER]
    turn(c, d, Q)
    last = fake.of("llm")[-1][2]["messages"][-1]
    assert last["role"] == "user" and last["content"].startswith(Q) and "Reference (bank FAQ" in last["content"]
    assert not any("Reference (bank FAQ" in str(m) for m in fake.of("llm")[-1][2]["messages"][:-1]) and "system" in fake.of("llm")[-1][2]["messages"][0]["role"]
    assert "Reference" not in fake.of("llm")[-1][2]["messages"][0]["content"]
    fake.llm_script = [AFTER]
    turn(c, d, "hello there")  # next turn: the earlier question is stored clean, no reference anywhere
    assert "Reference (bank FAQ" not in json.dumps(fake.of("llm")[-1][2]["messages"])


def test_faq_context_off_restores_old_message():
    c, fake = dev_env()
    d = c.post("/calls?tts=false", json={"settings": {"faq_context": False}}).json()
    english(c, d)
    fake.llm_script = [AFTER]
    turn(c, d, Q)
    assert fake.of("llm")[-1][2]["messages"][-1]["content"] == Q


def test_faq_reference_top3_language_and_no_match():
    r = faq_reference("how to open account and the minimum balance", "en")
    assert r.startswith("Reference (bank FAQ, use only if relevant):") and 1 <= r.count("\n- ") <= 3
    assert faq_reference("zzz qqq", "en") == ""
    assert faq_reference("open account", "hi").startswith("संदर्भ")
