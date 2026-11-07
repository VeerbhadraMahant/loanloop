"""Placeholder: the real hosted-LLM adapter (OpenAI-compatible chat for Gemini/Sarvam) replaces this file at merge."""
import httpx


class ProviderError(Exception):
    pass


async def openai_chat(http: httpx.AsyncClient, *, base_url: str, api_key: str, model: str,
                      messages: list[dict], tools: list[dict], provider: str, timeout: float = 30.0) -> dict:
    raise ProviderError("not implemented")
