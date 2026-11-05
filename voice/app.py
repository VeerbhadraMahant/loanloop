"""LoanLoop voice agent: browser audio -> Gnani Prisma STT -> Ollama LLM (23 gateway tools) -> Gnani Timbre TTS."""
import base64
import email
import importlib.util
import json
import logging
import re
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent
log = logging.getLogger("voice")  # never log transcripts, LLM messages or keys: call_id, action, ok, latency only

# Request shapes copied from tools/stt_benchmark.py (stt) and tools/make_test_audio.py (tts_payload).
STT_URL = "https://api.vachana.ai/stt/v3"
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"
TTS_LANG = {"en": "en-IN", "hi": "hi-IN", "hinglish": "hi-IN", "mr": "mr-IN"}
STT_LANG = {"en": "en-IN", "hinglish": "hi-IN,en-IN", "hi": "hi-IN,en-IN", "mr": "mr-IN,en-IN"}
VOICE = "Shivani"
AUDIO_CONFIG = {"sample_rate": 16000, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"}
TTL_S, MAX_ROUNDS = 1800, 5


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / "gateway" / ".env", extra="ignore")
    gnani_speech_api_key: str = ""
    gateway_url: str = "http://127.0.0.1:8000"
    gateway_shared_secret: str = "dev-shared-secret-change-me"
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"

    def gnani_key(self) -> str:
        if self.gnani_speech_api_key:
            return self.gnani_speech_api_key
        try:  # fallback: repo-root .env.local, lowercase name
            for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
                k, _, v = line.partition("=")
                if k.strip().lower() == "gnani_api_key":
                    return v.strip().strip("\"'")
        except OSError:
            pass
        return ""


def load_tools() -> tuple[list[dict], set[str]]:
    acts = json.loads((ROOT / "agent" / "actions.json").read_text(encoding="utf-8"))["actions"]
    tools = []
    for a in acts:
        props, req = {}, []
        for v in a["variables"]:
            if v["name"] == "call_id":
                continue
            t = {"type": "array", "items": {"type": "string"}} if v["type"] == "array<string>" else {"type": v["type"]}
            props[v["name"]] = {**t, "description": v.get("description", ""), **({"enum": v["enum"]} if "enum" in v else {})}
            if v.get("required"):
                req.append(v["name"])
        tools.append({"type": "function", "function": {"name": a["name"], "description": a["description"],
                      "parameters": {"type": "object", "properties": props, "required": req}}})
    return tools, {a["name"] for a in acts}


def _load_scrub():
    # gateway's `app` package is not importable from here; load the pure module by path
    spec = importlib.util.spec_from_file_location("ll_scrub", ROOT / "gateway" / "app" / "security" / "scrub.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.redact_secret


_redact_secret = _load_scrub()
_DIGITS = re.compile(r"\d{6,}")


def redact(text: str) -> str:
    r = _redact_secret("user_text", text)
    if r:
        text = r[0]
    return _DIGITS.sub(lambda m: "*" * (len(m.group()) - 4) + m.group()[-4:], text)


def parse_audio(content_type: str, body: bytes) -> bytes | None:
    """Minimal multipart reader (python-multipart is not a dependency): returns the `audio` part."""
    msg = email.message_from_bytes(f"Content-Type: {content_type}\r\n\r\n".encode() + body)
    for part in msg.walk():
        if part.get_param("name", header="content-disposition") == "audio":
            return part.get_payload(decode=True)
    return None


def create_app(settings: Settings | None = None, client: httpx.AsyncClient | None = None) -> FastAPI:
    cfg = settings or Settings()
    tools, known = load_tools()
    prompt = (ROOT / "agent" / "system_prompt.md").read_text(encoding="utf-8")
    keyterms = [l.strip() for l in (ROOT / "agent" / "keyterms.txt").read_text(encoding="utf-8").splitlines() if l.strip()][:200]
    calls: dict[str, dict] = {}
    http = client or httpx.AsyncClient(timeout=120)

    app = FastAPI(title="LoanLoop voice agent")
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])

    def bad_gateway(what: str, cid: str = "-"):
        log.warning("call=%s upstream_error=%s", cid, what)
        return HTTPException(502, "upstream service error")

    async def gateway(cid: str, name: str, args: dict) -> dict:
        args = {**args, "call_id": cid}  # always ours, never the model's
        try:
            r = await http.post(f"{cfg.gateway_url}/actions/{name}", json=args,
                                headers={"X-Gateway-Secret": cfg.gateway_shared_secret}, timeout=15)
            if r.status_code >= 500 or r.status_code in (401, 403):
                raise bad_gateway("gateway", cid)
            return r.json()
        except (httpx.HTTPError, ValueError):
            raise bad_gateway("gateway", cid) from None

    async def llm(c: dict) -> dict:
        try:
            r = await http.post(f"{cfg.ollama_url}/api/chat", json={"model": cfg.ollama_model, "messages": c["messages"],
                                "tools": tools, "stream": False, "think": False})
            r.raise_for_status()
            return r.json()["message"]
        except (httpx.HTTPError, KeyError, ValueError):
            raise bad_gateway("ollama", c["id"]) from None

    async def run_actions(c: dict) -> tuple[str, list[dict]]:
        done, last_speak = [], ""
        for _ in range(MAX_ROUNDS):
            t0 = time.monotonic()
            msg = await llm(c)
            c["messages"].append(msg)
            tcs = msg.get("tool_calls") or []
            if not tcs:
                return (msg.get("content") or "").strip() or last_speak, done
            for tc in tcs:
                fn = tc.get("function", {})
                name, args = fn.get("name"), fn.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except ValueError:
                        args = {}
                if name not in known or not isinstance(args, dict):
                    res, name = {"ok": False, "error_code": "INVALID_INPUT", "speak": ""}, "unknown"
                else:
                    if args.get("language") in TTS_LANG:
                        c["language"] = args["language"]
                    res = await gateway(c["id"], name, args)
                    last_speak = res.get("speak") or last_speak
                ok = bool(res.get("ok"))
                done.append({"name": name, "ok": ok})
                log.info("call=%s action=%s ok=%s ms=%d", c["id"], name, ok, (time.monotonic() - t0) * 1000)
                if name == "end_call" and ok:
                    c["ended"] = True
                c["messages"].append({"role": "tool", "tool_name": name, "content": json.dumps(res, ensure_ascii=False)})
        return last_speak, done  # round cap hit: speak the last action's sentence

    async def stt(wav: bytes, lang: str, cid: str) -> str:
        data = {"model": "prisma-v3.0", "language_code": STT_LANG.get(lang, STT_LANG["hinglish"]), "format": "transcribe",
                "keyterms": json.dumps(keyterms, ensure_ascii=False)}
        try:
            r = await http.post(STT_URL, headers={"X-API-Key-ID": cfg.gnani_key()}, data=data,
                                files={"audio_file": ("turn.wav", wav, "audio/wav")}, timeout=60)
            r.raise_for_status()
            return (r.json().get("transcript") or "").strip()
        except (httpx.HTTPError, ValueError):
            raise bad_gateway("stt", cid) from None

    async def tts(text: str, lang: str, cid: str) -> str:
        payload = {"text": text, "model": "timbre-v3.0", "voice": VOICE, "language": TTS_LANG.get(lang, "hi-IN"),
                   "speed": 1.0, "audio_config": AUDIO_CONFIG}
        try:
            r = await http.post(TTS_URL, headers={"X-API-Key-ID": cfg.gnani_key()}, json=payload, timeout=60)
            r.raise_for_status()
            return base64.b64encode(r.content).decode()
        except httpx.HTTPError:
            raise bad_gateway("tts", cid) from None

    def reply(c: dict, text: str, acts: list[dict], audio: str, **extra) -> dict:
        return {**extra, "agent_text": text, "audio_b64": audio, "mime": "audio/wav", "language": c["language"],
                "actions": acts, "ended": c["ended"]}

    @app.get("/health")
    async def health():
        return {"ok": True, "model": cfg.ollama_model}

    @app.post("/calls")
    async def start(request: Request, tts: bool = True):
        try:
            body = await request.json()
        except ValueError:
            body = {}
        want_tts = tts and not (isinstance(body, dict) and body.get("tts") is False)
        now = time.time()
        for k in [k for k, v in calls.items() if now - v["ts"] > TTL_S]:
            del calls[k]
        cid = uuid.uuid4().hex
        c = {"id": cid, "language": "hinglish", "ended": False, "ts": now,
             "messages": [{"role": "system", "content": prompt.replace("{{conversation_id}}", cid)}]}
        res = await gateway(cid, "start_call", {"language": c["language"]})
        text = res.get("speak") or ""
        c["messages"] += [{"role": "user", "content": "(call connected)"}, {"role": "assistant", "content": text}]
        calls[cid] = c
        audio = await _tts(text, c["language"], cid) if text and want_tts else ""
        return {"call_id": cid, **reply(c, text, [{"name": "start_call", "ok": bool(res.get("ok"))}], audio)}

    _tts = tts  # `/calls` shadows the name with its query flag

    @app.post("/calls/{call_id}/turn")
    async def turn(call_id: str, request: Request, tts: bool = True):
        c = calls.get(call_id)
        if not c or time.time() - c["ts"] > TTL_S:
            raise HTTPException(404, "unknown call")
        ctype = request.headers.get("content-type", "")
        raw = await request.body()
        want_tts = tts
        if ctype.startswith("multipart/"):
            wav = parse_audio(ctype, raw)
            if not wav:
                raise HTTPException(422, "missing audio")
            user_text = await stt(wav, c["language"], call_id)
        else:
            try:
                body = json.loads(raw)
                user_text = str(body["text"])
            except (ValueError, KeyError, TypeError):
                raise HTTPException(422, "expected audio or text") from None
            want_tts = tts and body.get("tts") is not False
        c["ts"] = time.time()
        c["messages"].append({"role": "user", "content": user_text})
        text, acts = await run_actions(c)
        audio = await _tts(text, c["language"], call_id) if text and want_tts else ""
        return reply(c, text, acts, audio, user_text=redact(user_text))

    return app


app = create_app()
