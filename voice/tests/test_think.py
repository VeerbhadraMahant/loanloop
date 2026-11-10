"""think_hard: qwen3 thinking only on LLM turns that look hard; the thinking text never reaches speech or history."""
import json

from test_voice import dev_env, new_call, turn  # noqa: F401

from voice.app import is_hard_turn

LONG = "English. I would like to know what the bank charges when a cheque bounces because of low funds in the account next month"
SECRET_THOUGHT = "ZZTHINK-do-not-say"


def body(fake):
    return fake.of("llm")[-1][2]


def english(c, d):
    turn(c, d, "English")


def test_trigger_rules():
    assert not is_hard_turn("what is the minimum balance", [])
    assert is_hard_turn(LONG, [])  # 18+ tokens
    assert is_hard_turn("branch address and timing", [])  # conjunction
    assert is_hard_turn("how do I block it? what about the fee?", [])  # two questions
    err = {"role": "tool", "content": json.dumps({"ok": False, "next": "need_tier_1"})}
    ok = {"role": "tool", "content": json.dumps({"ok": True})}
    assert is_hard_turn("hello", [err])  # previous round failed
    assert not is_hard_turn("hello", [ok]) and not is_hard_turn("hello", [{"role": "tool", "content": "not json"}])


def test_off_by_default_and_on_for_hard_turn_only():
    c, fake = dev_env()
    d = c.post("/calls?tts=false", json={}).json()
    english(c, d)
    fake.llm_script = [{"role": "assistant", "content": "ok"}]
    turn(c, d, LONG)
    assert body(fake)["think"] is False
    d = c.post("/calls?tts=false", json={"settings": {"think_hard": True}}).json()
    english(c, d)
    fake.llm_script = [{"role": "assistant", "content": "ok"}]
    turn(c, d, "hello there")
    assert body(fake)["think"] is False  # easy turn
    fake.llm_script = [{"role": "assistant", "content": "ok"}]
    turn(c, d, LONG)
    assert body(fake)["think"] is True and body(fake)["options"]["num_predict"] == 1500


def test_thinking_is_dropped_from_speech_and_history():
    c, fake = dev_env()
    d = c.post("/calls?tts=false", json={"settings": {"think_hard": True}}).json()
    english(c, d)
    fake.llm_script = [{"role": "assistant", "thinking": SECRET_THOUGHT, "content": f"<think>{SECRET_THOUGHT}</think>Sure, happy to help."}]
    r = turn(c, d, LONG).json()
    assert body(fake)["think"] is True
    assert SECRET_THOUGHT not in r["agent_text"] and "happy to help" in r["agent_text"]
    assert SECRET_THOUGHT not in json.dumps(c.app.state.calls[d["call_id"]]["messages"])


def test_empty_model_reply_becomes_a_reprompt_not_silence():
    c, fake = dev_env()
    d = c.post("/calls?tts=false", json={}).json()
    english(c, d)
    fake.llm_script = [{"role": "assistant", "content": ""}]
    assert turn(c, d, "hello there my friend").json()["agent_text"].strip()
