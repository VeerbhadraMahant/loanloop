"""LoanLoop voice agent: browser audio -> Gnani Prisma STT -> Ollama LLM (23 gateway tools) -> Gnani Timbre TTS."""
import asyncio
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
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
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
TTL_S, MAX_ROUNDS, MAX_CALLS, MAX_UPLOAD, KEEP_MSGS = 1800, 5, 50, 2_000_000, 30
ALLOWED_HOSTS = {"127.0.0.1:8100", "localhost:8100"}
SECRET_KINDS = {"password", "pin", "otp", "cvv", "card"}
REPROMPT = {"en": "Sorry, I could not hear that. Could you say it again?",
            "hi": "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोबारा बोल सकते हैं?",
            "hinglish": "Sorry, mujhe sunai nahi diya. Kya aap dobara bol sakte hain?",
            "mr": "माफ करा, मला ऐकू आले नाही. कृपया पुन्हा सांगाल का?"}


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
    return m.find_secret, m.redact_secret


_find_secret, _redact_secret = _load_scrub()
_DIGITS = re.compile(r"\d(?:[ -]?\d){5,}")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def mask_digits(text: str) -> str:
    """Mask digit runs of 6+ (also when grouped by spaces/dashes) except the last 4 digits."""
    def sub(m):
        g = m.group()
        if _ISO_DATE.fullmatch(g):
            return g
        n, out = sum(ch.isdigit() for ch in g), []
        seen = 0
        for ch in g:
            if ch.isdigit():
                seen += 1
                out.append(ch if seen > n - 4 else "*")
            else:
                out.append(ch)
        return "".join(out)
    return _DIGITS.sub(sub, text)


def redact(text: str) -> str:
    r = _redact_secret("user_text", text)
    if r:
        text = r[0]
    return mask_digits(text)


def trim(msgs: list[dict]) -> list[dict]:
    """System + last KEEP_MSGS messages, never starting on an orphaned tool result."""
    tail = msgs[1:][-KEEP_MSGS:]
    while tail and tail[0].get("role") == "tool":
        tail = tail[1:]
    return msgs[:1] + tail


def parse_audio(content_type: str, body: bytes) -> bytes | None:
    """Minimal multipart reader (python-multipart is not a dependency): returns the `audio` part."""
    msg = email.message_from_bytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
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
    app.state.calls = calls
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.middleware("http")
    async def host_check(request: Request, call_next):  # DNS-rebinding guard
        if request.headers.get("host", "") not in ALLOWED_HOSTS:
            return JSONResponse({"detail": "bad host"}, status_code=400)
        return await call_next(request)

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
            res = r.json()
        except (httpx.HTTPError, ValueError):
            raise bad_gateway("gateway", cid) from None
        if not isinstance(res, dict):
            raise bad_gateway("gateway", cid)
        return res

    async def llm(c: dict) -> dict:
        try:
            r = await http.post(f"{cfg.ollama_url}/api/chat", json={
                "model": cfg.ollama_model, "messages": trim(c["messages"]), "tools": tools, "stream": False,
                "think": False, "options": {"num_ctx": 8192}})
            r.raise_for_status()
            msg = r.json()["message"]
            if not isinstance(msg, dict):
                raise ValueError
            return msg
        except (httpx.HTTPError, KeyError, ValueError):
            raise bad_gateway("ollama", c["id"]) from None

    def clean_args(tc) -> dict:
        """Ollama rejects string arguments on the next call: parse and write the dict back."""
        fn = tc.get("function") if isinstance(tc, dict) else None
        if not isinstance(fn, dict):
            return {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except ValueError:
                args = {}
        if not isinstance(args, dict):
            args = {}
        fn["arguments"] = args
        return args

    async def run_actions(c: dict) -> tuple[str, list[dict]]:
        done, last_speak = [], ""
        for _ in range(MAX_ROUNDS):
            t0 = time.monotonic()
            msg = await llm(c)
            tcs = msg.get("tool_calls")
            tcs = tcs if isinstance(tcs, list) else []
            argl = [clean_args(tc) for tc in tcs]
            c["messages"].append(msg)
            if not tcs:
                return (msg.get("content") or "").strip() or last_speak, done
            for tc, args in zip(tcs, argl):
                fn = tc.get("function") if isinstance(tc, dict) else None
                name = fn.get("name") if isinstance(fn, dict) else None
                if not isinstance(name, str) or name not in known:
                    res, name = {"ok": False, "error_code": "INVALID_INPUT", "speak": ""}, "unknown"
                else:
                    res = await gateway(c["id"], name, args)
                    lang = args.get("language")
                    if res.get("ok") and isinstance(lang, str) and lang in TTS_LANG:
                        c["language"] = lang
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
        except (httpx.HTTPError, ValueError, AttributeError):
            raise bad_gateway("stt", cid) from None

    async def tts(text: str, lang: str, cid: str) -> str:
        """Soft failure: no audio, text still returned (a retry would repeat data-changing actions)."""
        payload = {"text": text, "model": "timbre-v3.0", "voice": VOICE, "language": TTS_LANG.get(lang, "hi-IN"),
                   "speed": 1.0, "audio_config": AUDIO_CONFIG}
        try:
            r = await http.post(TTS_URL, headers={"X-API-Key-ID": cfg.gnani_key()}, json=payload, timeout=60)
            r.raise_for_status()
            return base64.b64encode(r.content).decode()
        except httpx.HTTPError:
            log.warning("call=%s tts_failed", cid)
            return ""

    def reply(c: dict, text: str, acts: list[dict], audio: str, **extra) -> dict:
        return {**extra, "agent_text": text, "audio_b64": audio, "mime": "audio/wav", "language": c["language"],
                "actions": acts, "ended": c["ended"]}

    async def read_body(request: Request) -> bytes:
        try:
            too_big = int(request.headers.get("content-length") or 0) > MAX_UPLOAD
        except ValueError:
            too_big = True
        if too_big:
            raise HTTPException(413, "too large")
        raw = await request.body()
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "too large")
        return raw

    def json_body(request: Request, raw: bytes) -> dict:
        if not request.headers.get("content-type", "").startswith("application/json"):
            raise HTTPException(415, "expected application/json")
        try:
            body = json.loads(raw)
        except ValueError:
            raise HTTPException(422, "invalid json") from None
        if not isinstance(body, dict):
            raise HTTPException(422, "invalid json")
        return body

    def redact_agent(text) -> str:
        # digits only: keyword redaction would delete legitimate "never share your PIN" warnings
        return mask_digits(text) if isinstance(text, str) else ""

    @app.get("/health")
    async def health():
        return {"ok": True, "model": cfg.ollama_model}

    @app.post("/calls")
    async def start(request: Request, tts_q: bool = Query(True, alias="tts")):
        raw = await read_body(request)
        body = json_body(request, raw) if raw.strip() else {}
        now = time.time()
        for k in [k for k, v in calls.items() if now - v["ts"] > TTL_S]:
            del calls[k]
        if len(calls) >= MAX_CALLS:
            raise HTTPException(429, "too many calls")
        cid = uuid.uuid4().hex
        c = {"id": cid, "language": "hinglish", "ended": False, "ts": now, "lock": asyncio.Lock(),
             "messages": [{"role": "system", "content": prompt.replace("{{conversation_id}}", cid)}]}
        res = await gateway(cid, "start_call", {"language": c["language"]})
        text = redact_agent(res.get("speak"))
        c["messages"] += [{"role": "user", "content": "(call connected)"}, {"role": "assistant", "content": text}]
        calls[cid] = c
        audio = await tts(text, c["language"], cid) if text and tts_q and body.get("tts") is not False else ""
        return {"call_id": cid, **reply(c, text, [{"name": "start_call", "ok": bool(res.get("ok"))}], audio)}

    async def handle_text(c: dict, user_text: str) -> tuple[str, list[dict]]:
        if not user_text:
            return REPROMPT.get(c["language"], REPROMPT["hinglish"]), []
        stype = _find_secret("user_text", user_text)
        if not stype:
            c["messages"].append({"role": "user", "content": user_text})
            return await run_actions(c)
        # secret: the value never enters history, logs or the LLM; the gateway is told, we answer directly
        stype = "card" if stype == "card_number" else stype
        stype = stype if stype in SECRET_KINDS else "password"
        res = await gateway(c["id"], "report_secret_spoken", {"language": c["language"], "secret_type": stype})
        speak = res.get("speak") if isinstance(res.get("speak"), str) else ""
        c["messages"] += [{"role": "user", "content": f"[caller started to say a secret ({stype}); it was removed]"},
                          {"role": "assistant", "content": speak}]
        log.info("call=%s action=report_secret_spoken ok=%s", c["id"], bool(res.get("ok")))
        return speak, [{"name": "report_secret_spoken", "ok": bool(res.get("ok"))}]

    @app.post("/calls/{call_id}/turn")
    async def turn(call_id: str, request: Request, tts_q: bool = Query(True, alias="tts")):
        c = calls.get(call_id)
        if c and time.time() - c["ts"] > TTL_S:
            calls.pop(call_id, None)
            c = None
        if not c:
            raise HTTPException(404, "unknown call")
        raw = await read_body(request)
        ctype = request.headers.get("content-type", "")
        want_tts = tts_q
        wav = user_text = None
        if ctype.startswith("multipart/"):
            wav = parse_audio(ctype, raw)
            if not wav:
                raise HTTPException(422, "missing audio")
        else:
            body = json_body(request, raw)
            if not isinstance(body.get("text"), str):
                raise HTTPException(422, "expected audio or text")
            user_text, want_tts = body["text"].strip(), tts_q and body.get("tts") is not False
        async with c["lock"]:  # one turn at a time per call
            if c["ended"]:
                raise HTTPException(409, "call ended")
            c["messages"] = trim(c["messages"])
            n0 = len(c["messages"])
            try:
                if wav is not None:
                    user_text = await stt(wav, c["language"], call_id)
                text, acts = await handle_text(c, user_text)
            except BaseException:
                del c["messages"][n0:]  # failed turn leaves no half-finished history
                raise
            c["ts"] = time.time()
            text = redact_agent(text)
            audio = await tts(text, c["language"], call_id) if text and want_tts else ""
            return reply(c, text, acts, audio, user_text=redact(user_text))

    return app


app = create_app()


