"""Hosted-LLM adapter (Gemini, Sarvam) over OpenAI-compatible chat completions, with tool calling.

Takes and returns Ollama-shaped messages so voice/app.py's loop stays provider-agnostic.
"""
import asyncio
import json

import httpx

MAX_TOKENS = 300
RETRY_STATUS = {429, 500, 502, 503, 504}


class ProviderError(Exception):
    """Short, key-free and prompt-free message; safe to log. .status is the HTTP status, None for timeout/connect/parse."""

    def __init__(self, msg: str, status: int | None = None):
        super().__init__(msg)
        self.status = status


def _to_openai(messages: list[dict], provider: str = "") -> list[dict]:
    out, pending = [], []  # pending: tool_call ids of the last assistant message not yet answered
    for i, m in enumerate(messages):
        role = m["role"]
        if role == "tool":
            if pending:
                out.append({"role": "tool", "tool_call_id": pending.pop(0), "content": m.get("content", "")})
            else:  # orphan (history trimmed): the API 400s on a tool message with no call, so demote it
                out.append({"role": "user", "content": f"[result of {m.get('tool_name', 'tool')}]: {m.get('content', '')}"})
            continue
        msg = {"role": role, "content": m.get("content") or ""}
        pending = []
        if role == "assistant" and m.get("tool_calls"):
            calls = []
            for j, tc in enumerate(m["tool_calls"]):
                f = tc["function"]
                args = f.get("arguments") or {}
                c = {"id": f"call_{i}_{j}", "type": "function",
                     "function": {"name": f["name"],
                                  "arguments": args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)}}
                if provider == "gemini":  # Gemini 3.x 400s on replayed calls without a signature; documented dummy value
                    c["extra_content"] = {"google": {"thought_signature": "skip_thought_signature_validator"}}
                calls.append(c)
            msg["tool_calls"] = calls
            pending = [c["id"] for c in calls]
        out.append(msg)
    return out


def _headers(api_key: str, provider: str) -> dict:
    h = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if provider == "sarvam":  # docs: api-subscription-key is canonical, Bearer also accepted
        h["api-subscription-key"] = api_key
    return h


def _args(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        v = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return v if isinstance(v, dict) else {}


async def openai_chat(http: httpx.AsyncClient, *, base_url: str, api_key: str, model: str,
                      messages: list[dict], tools: list[dict], provider: str, timeout: float = 30.0,
                      temperature: float | None = None, max_tokens: int | None = None, reasoning: str | None = None) -> dict:
    """temperature / max_tokens / reasoning: None keeps the defaults below; reasoning is the effort ("off" = thinking off)."""
    body = {"model": model, "messages": _to_openai(messages, provider), "tools": tools, "tool_choice": "auto",
            "temperature": 0.2 if temperature is None else temperature,
            "max_tokens": max_tokens or MAX_TOKENS, "stream": False}
    # latency: thinking off. Gemini 3.x rejects "none" (lowest is "minimal"), 2.5 flash accepts "none"; Sarvam thinking is on by default, null disables it.
    if provider == "sarvam":
        body["reasoning_effort"] = None
    else:
        body["reasoning_effort"] = "none" if model.startswith("gemini-2.5") else "minimal"
    if reasoning:
        body["reasoning_effort"] = None if reasoning == "off" else reasoning
    r = None
    for attempt in (0, 1):  # no side effects, so one retry on transient failures is safe
        wait = 0.3
        try:
            r = await http.post(base_url.rstrip("/") + "/chat/completions", json=body,
                                headers=_headers(api_key, provider), timeout=timeout)
            if r.status_code not in RETRY_STATUS:
                break
            try:
                wait = min(float(r.headers.get("retry-after", wait)), 2.0)
            except ValueError:
                pass
            err = ProviderError(f"{provider}: HTTP {r.status_code}", r.status_code)
        except httpx.TimeoutException:
            err = ProviderError(f"{provider}: timeout after {timeout}s")
        except httpx.HTTPError as e:
            err = ProviderError(f"{provider}: {type(e).__name__}")
        if attempt:
            raise err from None
        await asyncio.sleep(wait)
    if r.status_code >= 400:
        raise ProviderError(f"{provider}: HTTP {r.status_code}", r.status_code)
    try:
        msg = r.json()["choices"][0]["message"]
        calls = [{"function": {"name": tc["function"]["name"], "arguments": _args(tc["function"].get("arguments"))}}
                 for tc in (msg.get("tool_calls") or [])]
        return {"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise ProviderError(f"{provider}: malformed response (HTTP {r.status_code})", r.status_code) from None
