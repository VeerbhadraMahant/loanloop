"""openai_chat adapter: no network, httpx.MockTransport."""
import asyncio
import json

import httpx
import pytest

from voice.providers import ProviderError, _to_openai, openai_chat

KEY = "KEY-SHOULD-NEVER-LEAK-123"
TOOLS = [{"type": "function", "function": {"name": "branch_lookup", "description": "d", "parameters": {"type": "object", "properties": {}}}}]


def run(handler, provider="gemini", messages=None, **kw):
    seen = {}

    def h(req):
        seen["req"] = req
        seen["body"] = json.loads(req.content)
        return handler(req)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as http:
            return await openai_chat(http, base_url="http://x/v1", api_key=KEY, model="m", provider=provider,
                                     messages=messages or [{"role": "user", "content": "hi"}], tools=TOOLS, **kw)

    return asyncio.run(go()), seen


def reply(msg):
    return lambda req: httpx.Response(200, json={"choices": [{"message": msg}]})


def test_conversion_ids_and_orphans():
    msgs = [
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "a", "arguments": {"x": "é"}}},
                                                             {"function": {"name": "b", "arguments": {}}}]},
        {"role": "tool", "tool_name": "a", "content": "r1"},
        {"role": "tool", "tool_name": "b", "content": "r2"},
        {"role": "tool", "tool_name": "c", "content": "r3"},  # orphan
    ]
    out = _to_openai(msgs)
    ids = [c["id"] for c in out[1]["tool_calls"]]
    assert ids == ["call_1_0", "call_1_1"]
    assert out[1]["tool_calls"][0]["function"]["arguments"] == '{"x": "é"}'
    assert out[2] == {"role": "tool", "tool_call_id": "call_1_0", "content": "r1"}
    assert out[3]["tool_call_id"] == "call_1_1"
    assert out[4] == {"role": "user", "content": "[result of c]: r3"}
    assert all("tool_name" not in m for m in out)
    assert "extra_content" not in out[1]["tool_calls"][0]
    assert "extra_content" in _to_openai(msgs, "gemini")[1]["tool_calls"][0]


def test_tool_call_parsing_and_request_shape():
    msg = {"role": "assistant", "content": None,
           "tool_calls": [{"id": "z", "type": "function", "function": {"name": "branch_lookup", "arguments": '{"branch":"Kothrud"}'}}]}
    out, seen = run(reply(msg))
    assert out == {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "branch_lookup", "arguments": {"branch": "Kothrud"}}}]}
    b = seen["body"]
    assert b["stream"] is False and b["tool_choice"] == "auto" and b["max_tokens"] <= 300 and b["tools"] == TOOLS
    assert seen["req"].url == "http://x/v1/chat/completions"


def test_invalid_json_args_become_empty_dict():
    msg = {"content": "", "tool_calls": [{"function": {"name": "t", "arguments": "{oops"}}]}
    assert run(reply(msg))[0]["tool_calls"][0]["function"]["arguments"] == {}


def test_text_only_reply():
    out, _ = run(reply({"role": "assistant", "content": "namaste"}))
    assert out == {"role": "assistant", "content": "namaste", "tool_calls": []}


def test_auth_headers_by_provider():
    _, g = run(reply({"content": "x"}), provider="gemini")
    assert g["req"].headers["authorization"] == f"Bearer {KEY}" and "api-subscription-key" not in g["req"].headers
    assert g["body"]["reasoning_effort"] == "minimal"
    _, s = run(reply({"content": "x"}), provider="sarvam")
    assert s["req"].headers["api-subscription-key"] == KEY and s["req"].headers["authorization"] == f"Bearer {KEY}"
    assert s["body"]["reasoning_effort"] is None


def test_http_500_and_timeout_and_malformed_hide_key():
    def boom(req):
        return httpx.Response(500, text=f"echo {KEY}")

    with pytest.raises(ProviderError) as e:
        run(boom)
    assert "500" in str(e.value) and "gemini" in str(e.value) and KEY not in str(e.value)

    def slow(req):
        raise httpx.ReadTimeout(f"timed out {KEY}")

    with pytest.raises(ProviderError) as e:
        run(slow, provider="sarvam")
    assert "timeout" in str(e.value) and KEY not in str(e.value)

    with pytest.raises(ProviderError):
        run(lambda req: httpx.Response(200, json={"choices": []}))
