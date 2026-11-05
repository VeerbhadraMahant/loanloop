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
NEED_TIER = {"need_tier_1", "need_tier_2"}
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
    voice_port: int = 8100  # only used for the Host-header check

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


TOOL_HINTS = {
    "send_details_sms": " ALWAYS use this when the caller says send / SMS / bhej / pathva for their account number, IFSC, customer ID or branch address.",
    "get_masked_profile": " ONLY for questions about what is on file (linked mobile or email). Never for 'send me my details': use send_details_sms.",
    "end_call": " Call it as soon as the caller says goodbye / bye / that is all, in any language.",
}


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
    for t in tools:  # nudges for a small local model, keyed by tool name; agent/actions.json stays untouched
        f = t["function"]
        f["description"] += TOOL_HINTS.get(f["name"], "")
    return tools, {a["name"] for a in acts}


def _load_scrub():
    # gateway's `app` package is not importable from here; load the pure module by path
    spec = importlib.util.spec_from_file_location("ll_scrub", ROOT / "gateway" / "app" / "security" / "scrub.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.find_secret, m.redact_secret


_find_secret, _redact_secret = _load_scrub()
_DIGITS = re.compile(r"(?P<ifsc>\b[A-Z]{4}0[A-Z0-9]{6}\b)|(?P<d>\d(?:[ -]?\d){5,})")  # IFSC codes are public: exempt
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_DEVANAGARI = re.compile("[ऀ-ॿ]")


def mask_digits(text: str, min_digits: int = 6, grouped: bool = True) -> str:
    """Mask digit runs of min_digits+ (also when grouped by spaces/dashes, if `grouped`) except the last 4 digits."""
    if not grouped:  # contiguous runs not glued to letters: spaced groups (MICR 411 670 487) and UTRs stay readable
        return re.sub(rf"(?<![A-Za-z\d])\d{{{min_digits},}}", lambda r: "*" * (len(r.group()) - 4) + r.group()[-4:], text)

    def sub(m):
        g = m.group()
        if m.group("ifsc"):
            return g
        n, out =sum(ch.isdigit() for ch in g), []
        if n < min_digits or _ISO_DATE.fullmatch(g):
            return g
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


AFFIRM = re.compile(r"\b(yes|yeah|yep|correct|right|haan|han|haa|ji|sahi|theek|thik|ok|okay|confirm)\b|हाँ|हां|सही|ठीक|हो|होय|बरोबर|बदला", re.I)
NEGATE = re.compile(r"\b(no|not|nahi|nahin|galat|wrong|incorrect|naa)\b|नहीं|नाही|गलत|चूक", re.I)
GOODBYE = re.compile(r"\b(bye|goodbye|good bye|alvida|that'?s all|nothing else|bas itna hi|bas itna|khuda hafiz)\b"
                     r"|बाय|अलविदा|बस इतना|बस एवढंच|एवढंच|कुछ नहीं चाहिए", re.I)
_MARATHI = re.compile(r"आहे|आहेत|(?:^|\s)मी(?:\s|$)|तुम्ही|आपण|करा|(?:^|\s)आता|(?:^|\s)मला|तुमची")  # no \b: matras are not \w


def infer_language(text: str, current: str) -> str:
    """Script of the reply decides Hindi vs Marathi vs Hinglish when no action carried a language."""
    if _DEVANAGARI.search(text):
        return "mr" if _MARATHI.search(text) else "hi"
    return "hinglish" if current in ("hi", "mr") else current


def final_text(model_text: str, speaks: list[tuple[bool, str]], user_text: str) -> str:
    """Numbers must come from the gateway. If the model's text carries a figure that is in neither this turn's
    `speak` texts nor the caller's own words (a hallucination or a paraphrase that changed a number), speak the
    gateway text verbatim instead. Paraphrases without new figures are kept: they keep the conversational question."""
    if not speaks:
        return model_text
    ok_speaks = [s for ok, s in speaks if ok] or [speaks[-1][1]]
    verbatim = " ".join(dict.fromkeys(ok_speaks))
    norm = lambda s: re.sub(r"(?<=\d)[,\s](?=\d)", "", s)
    known = set(re.findall(r"\d+", norm(" ".join(s for _, s in speaks) + " " + user_text)))
    if not model_text or any(n not in known for n in re.findall(r"\d+", norm(model_text))):
        return verbatim
    return model_text


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
        if request.headers.get("host", "") not in {f"127.0.0.1:{cfg.voice_port}", f"localhost:{cfg.voice_port}"}:
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

    def note_pending(c: dict, name: str, args: dict, res: dict) -> None:
        """Remember a request refused for lack of a tier; once the caller has the tier, tell the model to retry it."""
        ok, nxt = bool(res.get("ok")), res.get("next")
        data = res.get("data") if isinstance(res.get("data"), dict) else {}
        if not ok and nxt in NEED_TIER:
            c["pending"] = (name, nxt)
            if nxt == "need_tier_2":
                res["instruction"] = ("Tell the caller you are sending an approval request to their bank app, call "
                                      "request_app_approval with a short purpose, then ask them to tap Approve.")
            return
        if not ok and nxt == "confirm_readback":
            conf = data.get("confirm") if isinstance(data.get("confirm"), dict) else {}
            c["pending_rb"] = (name, args, dict(conf))
            res["instruction"] = (f"Read back to the caller exactly these values: {json.dumps(conf, ensure_ascii=False)}, then ask "
                                  f"'Is that right?'. When the caller says yes, call confirm_readback once for EACH field "
                                  f"in the same turn, then call {name} again.")
            return
        if name == (c.get("pending_rb") or (None,))[0] and ok:
            c["pending_rb"] = None
        if ok and name == "request_app_approval":
            c["approval_id"] = data.get("approval_id")
            res["instruction"] = (f"Ask the caller to tap Approve in the bank app and tell you when done, then call "
                                  f"check_approval with approval_id {data.get('approval_id')}.")
        if ok and name == "confirm_readback" and c.get("pending_rb"):
            n, a, conf = c["pending_rb"]
            conf.pop(args.get("field"), None)
            if conf:  # the caller's yes covers everything that was read back together
                res["instruction"] = (f"Still to confirm for {n}: {json.dumps(conf, ensure_ascii=False)}. If the caller said yes "
                                      f"to those values, call confirm_readback for each now.")
            else:
                res["instruction"] = f"All read-backs confirmed. Call {n} NOW with {json.dumps(a, ensure_ascii=False)}."
        p = c.get("pending")
        if not (ok and p):
            return
        if name == p[0]:
            c["pending"] = None
            return
        status = data.get("status")
        if name == "verify_caller" and p[1] == "need_tier_1":
            res["pending_request"], res["instruction"] = p[0], f"Now call {p[0]} (the caller's earlier request)."
            c["pending"] = None
        elif name == "verify_caller":  # still needs the app approval
            res["pending_request"], res["instruction"] = p[0], f"Next call request_app_approval, then {p[0]}."
        elif name == "check_approval" and status == "approved":
            res["pending_request"], res["instruction"] = p[0], f"Now call {p[0]} (the caller's earlier request)."
            c["pending"] = None

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

    async def exec_call(c: dict, name, args: dict, st: dict) -> dict:
        """Run one tool call (model's or the service's own) against the gateway; track speaks and pending state."""
        t0 = time.monotonic()
        if not isinstance(name, str) or name not in known:
            res, name = {"ok": False, "error_code": "INVALID_INPUT", "speak": ""}, "unknown"
        else:
            if args.get("language") == "hi" and not c.get("deva"):
                args["language"] = "hinglish"  # Roman-script input is Hinglish, not Devanagari Hindi
            if name == "check_approval" and c.get("approval_id"):
                args["approval_id"] = str(c["approval_id"])  # the model often mangles the id
            res = await gateway(c["id"], name, args)
            lang = args.get("language")
            if res.get("ok") and isinstance(lang, str) and lang in TTS_LANG:
                c["language"] = lang
            if isinstance(res.get("speak"), str) and res["speak"]:
                st["speaks"].append((bool(res.get("ok")), res["speak"]))
            st["last"] = res.get("speak") or st["last"]
            note_pending(c, name, args, res)
            if res.get("ok"):
                st["rb"] = ""
            elif res.get("next") == "confirm_readback" and isinstance(res.get("speak"), str):
                st["rb"] = res["speak"]  # the gateway's own read-back sentence is what gets spoken
        ok = bool(res.get("ok"))
        st["done"].append({"name": name, "ok": ok})
        log.info("call=%s action=%s ok=%s ms=%d", c["id"], name, ok, (time.monotonic() - t0) * 1000)
        if name == "end_call" and ok:
            c["ended"] = True
        return res

    def new_state() -> dict:
        return {"done": [], "speaks": [], "last": "", "rb": ""}

    async def run_actions(c: dict, st: dict | None = None) -> tuple[str, list[dict]]:
        st = st or new_state()
        for _ in range(MAX_ROUNDS):
            msg = await llm(c)
            tcs = msg.get("tool_calls")
            tcs = tcs if isinstance(tcs, list) else []
            argl = [clean_args(tc) for tc in tcs]
            c["messages"].append(msg)
            if not tcs:
                text = final_text((msg.get("content") or "").strip(), st["speaks"], c.get("user_text", "")) or st["last"]
                return st["rb"] or text, st["done"]
            for tc, args in zip(tcs, argl):
                fn = tc.get("function") if isinstance(tc, dict) else None
                name = fn.get("name") if isinstance(fn, dict) else None
                res = await exec_call(c, name, args, st)
                c["messages"].append({"role": "tool", "tool_name": name if isinstance(name, str) else "unknown",
                                      "content": json.dumps(res, ensure_ascii=False)})
        # round cap hit: speak the actions' sentences
        return st["rb"] or " ".join(dict.fromkeys(s for ok, s in st["speaks"] if ok)) or st["last"], st["done"]

    async def auto_confirm(c: dict, user_text: str) -> tuple[str, list[dict]] | None:
        """The caller said yes to a read-back the gateway asked for: record every read-back and retry the held action
        ourselves. A small model often forgets one of them or says it did the action without calling it."""
        rb = c.get("pending_rb")
        if not rb or len(user_text.split()) > 12 or not AFFIRM.search(user_text) or NEGATE.search(user_text):
            return None
        name, args, conf = rb
        if not conf:
            return None
        st = new_state()
        c["messages"].append({"role": "user", "content": user_text})
        calls_ = [("confirm_readback", {"field": f, "value": str(v), "language": c["language"]}) for f, v in conf.items()]
        calls_.append((name, dict(args)))
        c["messages"].append({"role": "assistant", "content": "", "tool_calls": [
            {"function": {"name": n, "arguments": a}} for n, a in calls_]})
        for n, a in calls_:
            res = await exec_call(c, n, a, st)
            c["messages"].append({"role": "tool", "tool_name": n, "content": json.dumps(res, ensure_ascii=False)})
            if n == "confirm_readback" and not res.get("ok"):
                break
        return st["rb"] or " ".join(dict.fromkeys(s for ok, s in st["speaks"] if ok)) or st["last"], st["done"]

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
        # only 9+ digit runs (mobiles, account numbers): amounts like 32,055 and IFSC codes are spoken as-is
        return mask_digits(text, 9, grouped=False) if isinstance(text, str) else ""

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
        c["deva"], c["user_text"] = bool(_DEVANAGARI.search(user_text)), "" if stype else user_text
        if not stype:
            lang0 = c["language"]
            auto = await auto_confirm(c, user_text)
            if not auto:
                c["messages"].append({"role": "user", "content": user_text})
            text, acts = auto if auto else await run_actions(c)
            if c["language"] == lang0:  # no action carried a language: infer it from the reply script
                c["language"] = infer_language(text, lang0)
            if GOODBYE.search(user_text) and not c["ended"]:  # safety net: a small model often just says bye
                outcome = "handover" if any(a["name"] == "handover" and a["ok"] for a in c.get("done", [])) else "completed"
                res = await gateway(c["id"], "end_call", {"language": c["language"], "outcome": outcome})
                acts.append({"name": "end_call", "ok": bool(res.get("ok"))})
                c["ended"] = c["ended"] or bool(res.get("ok"))
                if res.get("ok") and isinstance(res.get("speak"), str) and res["speak"]:
                    text = res["speak"]  # the gateway's goodbye replaces whatever the model said to "bye"
                log.info("call=%s action=end_call ok=%s auto=1", c["id"], bool(res.get("ok")))
            c.setdefault("done", []).extend(acts)
            return text, acts
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


