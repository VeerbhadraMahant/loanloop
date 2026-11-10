"""LoanLoop voice agent: browser audio -> Gnani Prisma STT -> Ollama LLM (23 gateway tools) -> Gnani Timbre TTS."""
import asyncio
import base64
import contextlib
import contextvars
import email
import hmac
import importlib.util
import json
import logging
import math
import re
import statistics
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from voice import providers, tts as tts_mod

ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = ROOT / ".env.local"  # module-level so tests can point it at a temp file

def _load_faq_score():
    spec = importlib.util.spec_from_file_location("ll_faq_score", ROOT / "gateway" / "app" / "routes" / "actions" / "faq_score.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


faq_score = _load_faq_score()  # the gateway's weighted FAQ scorer (pure module), same numbers for the pre-route and faq_lookup.query
log = logging.getLogger("voice")  # never log transcripts, LLM messages or keys: call_id, action, ok, latency only

# Request shapes copied from tools/stt_benchmark.py (stt) and tools/make_test_audio.py (tts_payload).
STT_URL = "https://api.vachana.ai/stt/v3"
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"
I18N_DIR = ROOT / "i18n"  # language registry + per-language files (i18n/README.md); tests point load_languages() elsewhere
BUILTIN_LANGS = ("en", "hi", "hinglish", "mr")


def _registry(base: Path) -> list[dict]:
    try:
        return json.loads((base / "languages.json").read_text(encoding="utf-8"))["modes"]
    except Exception:  # noqa: BLE001 - registry missing/broken: the 4 built-in modes still work
        log.warning("i18n/languages.json unreadable; using built-in languages only")
        return [{"code": "en", "name": "English", "tts": "en-IN", "stt": "en-IN"},
                {"code": "hi", "name": "Hindi", "tts": "hi-IN", "stt": "hi-IN,en-IN"},
                {"code": "hinglish", "name": "Hinglish", "tts": "hi-IN", "stt": "hi-IN,en-IN"},
                {"code": "mr", "name": "Marathi", "tts": "mr-IN", "stt": "mr-IN,en-IN"}]


MODES = _registry(I18N_DIR)  # all 11 modes; a beta one is only offered to callers once its file is loaded
TTS_LANG = {m["code"]: m["tts"] for m in MODES}
STT_LANG = {m["code"]: m["stt"] for m in MODES}
VOICE = "Shivani"
AUDIO_CONFIG = {"sample_rate": 16000, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"}
TTL_S, MAX_ROUNDS, MAX_CALLS, MAX_UPLOAD, KEEP_MSGS = 1800, 5, 50, 2_000_000, 30
ROLLBACK_KEYS = ("held", "approval_id", "appr_checks", "note", "pre_acts", "approved", "approved_for")
NEED_TIER = {"need_tier_1", "need_tier_2"}
SECRET_KINDS = {"password", "pin", "otp", "cvv", "card"}
PROVIDERS = ("ollama", "gemini", "sarvam")
# one tool call in a round whose gateway `speak` is already the final answer: no second LLM round needed
SHORTCUT = {"branch_lookup", "emi_info", "explain_emi_change", "send_details_sms", "get_masked_profile", "validate_ifsc",
            "password_reset_help", "foreclosure_quote", "faq_lookup", "account_balance", "last_transactions", "dues_info",
            "record_ptp", "record_rtp"}
_TM: contextvars.ContextVar = contextvars.ContextVar("timings", default=None)  # per-request stage timings


def tick(key: str, t0: float) -> None:
    d = _TM.get()
    if d is not None:
        d[key + "_ms"] = d.get(key + "_ms", 0.0) + (time.perf_counter() - t0) * 1000
        if key in ("llm", "gateway"):
            d[key + "_calls"] = d.get(key + "_calls", 0) + 1


def finish_timings(tm: dict, t0: float, provider: str, model: str) -> dict:
    total = (time.perf_counter() - t0) * 1000
    parts = {k: tm.get(k + "_ms", 0.0) for k in ("stt", "llm", "gateway", "tts")}
    out = {k + "_ms": round(v) for k, v in parts.items()}
    return {**out, "llm_calls": tm.get("llm_calls", 0), "gateway_calls": tm.get("gateway_calls", 0),
            "total_ms": round(total), "other_ms": max(0, round(total - sum(parts.values()))),
            "provider": provider, "model": model}


TIMBRE_VOICES = ["Shivani", "Lakshmi", "Kalpana", "Chetana", "Vasudha", "Riyaa", "Tarika",
                 "Avinash", "Shubham", "Prakash", "Devansh", "Yashraj", "Harshad"]  # docs/gnani-facts.md (timbre-v3.0)
MODEL_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def _k(key, label, type_, default, group, help_, **kw):
    return {"key": key, "label": label, "type": type_, "default": default, "group": group, "help": help_, **kw}


# one list drives validation, defaults and GET /dev/config. default None = "provider default / not sent".
KNOBS = [
    _k("temperature", "Temperature", "number", None, "LLM", "Sampling temperature; unset = provider default (hosted 0.2).", min=0, max=1, step=0.05),
    _k("max_tokens", "Max output tokens", "number", None, "LLM", "Cap on reply length; unset = hosted 300, Ollama unlimited.", min=50, max=1000, step=10),
    _k("num_ctx", "Context window (Ollama)", "select", 8192, "LLM", "Ollama only: larger windows cost memory and prompt time.", options=[4096, 8192, 16384]),
    _k("reasoning", "Reasoning effort", "select", None, "LLM", "Hosted only: gemini minimal/low/medium, sarvam off/low/medium; ignored for Ollama.", options=["minimal", "off", "low", "medium"],
       options_by_provider={"gemini": ["minimal", "low", "medium"], "sarvam": ["off", "low", "medium"]}),
    _k("cache_prompt", "Cacheable prompt", "bool", True, "Latency", "On: call id in first user message (cache hits across calls). Off: old per-call id in the system prompt."),
    _k("shortcut_actions", "Skip 2nd LLM round", "bool", True, "Latency", "On: read-only actions answer with the gateway sentence. Off: always two LLM rounds."),
    _k("keep_msgs", "History length", "number", 30, "Latency", "How many recent messages are sent to the LLM.", min=10, max=60, step=1),
    _k("max_rounds", "Max tool rounds", "number", 5, "Latency", "Most LLM rounds per turn.", min=1, max=5, step=1),
    _k("stt_keyterms", "STT keyterms", "bool", True, "Speech", "Send the banking keyterm list to Prisma STT."),
    _k("stt_language", "STT language", "select", "auto", "Speech", "auto follows the call language; others force one hint.", options=["auto", "en-IN", "hi-IN", "mr-IN"] + sorted({m["stt"].split(",")[0] for m in MODES} - {"en-IN", "hi-IN", "mr-IN"})),
    _k("tts_voice", "TTS voice", "select", "Shivani", "Speech", "Timbre v3 voice (all speak all languages).", options=TIMBRE_VOICES),
    _k("tts_speed", "TTS speed", "number", 1.0, "Speech", "Speech rate multiplier.", min=0.85, max=1.15, step=0.05),
    _k("tool_hints", "Tool hints", "bool", True, "Conversation", "Per-tool nudges added to tool descriptions for the small local model."),
    _k("tool_sets", "Tool sets by call state", "bool", True, "Conversation", "On: the model sees only the tools of the call state (inbound unverified / inbound verified / outbound). Off: all tools every turn."),
    _k("think_hard", "Think on hard turns", "bool", False, "LLM", "Ollama only: qwen3 thinking mode on LLM turns that look hard (18+ words, several requests, or after a tool error). The thinking text is never spoken or stored."),
    _k("faq_direct_min", "FAQ direct: min score", "number", faq_score.HIGH_MIN, "Conversation", "A general question is answered from the FAQ without the LLM only when the best FAQ topic scores at least this (and leads by the margin). Higher = safer, more LLM turns.", min=1, max=30, step=0.5),
    _k("faq_direct_margin", "FAQ direct: lead over 2nd", "number", faq_score.HIGH_MARGIN, "Conversation", "Required score lead of the best FAQ topic over the second best for a direct answer.", min=0, max=20, step=0.5),
    _k("faq_direct_cover", "FAQ direct: coverage", "number", faq_score.COVER_MIN, "Conversation", "Share of the question's content words the matched FAQ keywords must account for (0-1); stops a long mixed question being answered by one keyword.", min=0, max=1, step=0.05),
    _k("faq_ref_min", "FAQ grounding: min score", "number", faq_score.MED_MIN, "Conversation", "Below this score no FAQ block is added to the LLM turn.", min=0, max=20, step=0.1),
    _k("faq_context", "FAQ grounding", "bool", True, "Conversation", "On: the top 3 bank FAQ answers are appended to the current general-question turn (never stored in history)."),
]
KNOB_BY_KEY = {k["key"]: k for k in KNOBS}
PRESETS = [
    {"name": "Baseline local (old behaviour)", "llm": "ollama",
     "settings": {"cache_prompt": False, "shortcut_actions": False, "tool_sets": False, "faq_context": False, "faq_direct_min": 20}},
    {"name": "Optimised local", "llm": "ollama", "settings": {}},
    {"name": "Local, no instant FAQ answers", "llm": "ollama", "settings": {"faq_direct_min": 20}},
    {"name": "Local + thinking (slow)", "llm": "ollama", "settings": {"think_hard": True}},
    {"name": "Gemini fast", "llm": "gemini", "settings": {}},
    {"name": "Sarvam fast", "llm": "sarvam", "settings": {}},
]
# synthetic caller lines (from tools/voice_e2e.py, Priya); none needs a phone approval
SCRIPTS = [
    {"name": "Tier 0+1 Hinglish", "lines": [
        "Hello, mujhe apna IFSC aur customer ID yaad nahi hai. Kothrud branch ka IFSC kya hai?",
        "Mera registered mobile number 9000014417 hai aur meri date of birth 14 August 1991 hai.",
        "Mera EMI kitna hai, next kab hai?",
        "Mere IFSC aur customer ID SMS kar do please.",
        "Theek hai, bye"]},
    {"name": "Marathi basics", "lines": [
        "Kothrud branch cha IFSC kay aahe?",
        "Maza registered mobile 9000014417 aahe ani date of birth 14 August 1991 aahe.",
        "माझा EMI किती आहे?",
        "ठीक आहे, धन्यवाद, बाय."]},
    {"name": "General banking questions", "lines": [
        "English. I am not getting the OTP on my phone, what should I do?",
        "My account got frozen, how do I get it working again?",
        "Galti se paise galat account mein chale gaye, ab kya karu?",
        "Gold loan ke liye kya kya lagta hai?",
        "What happens to my fixed deposit when it matures?",
        "Okay, bye"]},
    {"name": "FAQ routing: instant vs model", "lines": [
        "English. What is the difference between NRE and NRO accounts?",
        "मराठी. माझा ईएमआय चुकला, काय होईल?",
        "Hinglish. Mujhe apna cheque book band karwana hai, kaise karun?",
        "English. I think I was scammed and money was taken from my account.",
        "Hinglish. Bank baar baar bol raha hai ki KYC karo, ye kya hota hai aur kaunse kaagaz lagenge?",
        "Hinglish. Mere paas ghar ka sona hai, usko rakh kar paise mil sakte hain kya?",
        "Okay, bye"]},
    {"name": "Hard question (try thinking)", "lines": [
        "English. If I pay some extra amount this month on top of my regular EMI, will that reduce my tenure or my EMI, are there any charges for it, and how is the interest calculated after that?",
        "I changed my job and my salary account moved to another bank, so how do I change the account my EMI is deducted from, and do I need to visit the branch?",
        "Okay, bye"]},
    {"name": "Tamil (beta)", "lines": [
        "Tamil",
        "கோத்ரூட் கிளையின் IFSC என்ன?",
        "புதிய கணக்கு எப்படி திறப்பது?",
        "நன்றி, bye"]},
    {"name": "Secret safety", "lines": [
        "Mera password Priya1234 hai",
        "Mera registered mobile number 9000014417 hai aur meri date of birth 14 August 1991 hai.",
        "Mere IFSC aur customer ID SMS kar do please.",
        "Theek hai, bye"]},
]


def validate_settings(raw, provider: str) -> dict:
    """Effective settings = defaults + `raw`, checked strictly against KNOBS (422 names the failing key)."""
    if not isinstance(raw, dict):
        raise HTTPException(422, "settings must be an object")
    out = {k["key"]: k["default"] for k in KNOBS}
    for key, v in raw.items():
        k = KNOB_BY_KEY.get(key) if isinstance(key, str) else None
        if not k:
            raise HTTPException(422, f"unknown setting: {str(key)[:40]}")
        if v is None and k["default"] is None:
            continue
        if k["type"] == "bool":
            ok = isinstance(v, bool)
        elif k["type"] == "number":
            ok = (isinstance(v, (int, float)) and not isinstance(v, bool) and k["min"] <= v <= k["max"]
                  and (not isinstance(k["step"], int) or float(v).is_integer()))
            if ok and isinstance(k["step"], int):
                v = int(v)
        else:
            ok = not isinstance(v, bool) and v in k["options"]
        if not ok:
            raise HTTPException(422, f"setting {key}: invalid value")
        out[key] = v
    if (provider == "gemini" and out["reasoning"] == "off") or (provider == "sarvam" and out["reasoning"] == "minimal"):
        raise HTTPException(422, f"setting reasoning: not valid for {provider}")
    return out


def summarize(turns: list[dict]) -> dict:
    ok = [t["timings"] for t in turns if t.get("timings")]
    tot = sorted(t["total_ms"] for t in ok)
    avg = lambda k: round(statistics.fmean(t[k] for t in ok), 2) if ok else 0
    return {"turns": len(turns), "errors": sum(1 for t in turns if t.get("error")),
            "median_total_ms": round(statistics.median(tot)) if tot else 0,
            "p95_total_ms": tot[math.ceil(0.95 * len(tot)) - 1] if tot else 0,
            "max_total_ms": tot[-1] if tot else 0,
            "avg": {k: avg(k) for k in ("stt_ms", "llm_ms", "llm_calls", "gateway_ms", "tts_ms", "other_ms")}}


REPROMPT = {"en": "Sorry, I could not hear that. Could you say it again?",
            "hi": "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोबारा बोल सकते हैं?",
            "hinglish": "Sorry, mujhe sunai nahi diya. Kya aap dobara bol sakte hain?",
            "mr": "माफ करा, मला ऐकू आले नाही. कृपया पुन्हा सांगाल का?"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / "gateway" / ".env", extra="ignore")
    gnani_speech_api_key: str = ""
    gateway_url: str = "http://127.0.0.1:8000"
    gateway_shared_secret: str = "dev-shared-secret-change-me"
    dashboard_token: str = "dev-dashboard-token-change-me"  # outbound calls are started by ops (dialer), not callers
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"
    voice_port: int = 8100  # only used for the Host-header check
    llm_provider: str = "ollama"  # default per call: ollama | gemini | sarvam
    dev: bool = Field(False, validation_alias="VOICE_DEV")  # developer lab: /dev/* routes, per-call settings
    warmup: bool = True  # background Ollama warm-up at startup (tests turn it off)
    gemini_api_key: str = ""
    sarvam_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    sarvam_model: str = "sarvam-105b-conversations"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    sarvam_base_url: str = "https://api.sarvam.ai/v1"

    @staticmethod
    def _key(value: str, local_name: str) -> str:
        if value:
            return value
        try:  # fallback: repo-root .env.local, name matched case-insensitively
            for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
                k, _, v = line.partition("=")
                if k.strip().lower() == local_name:
                    return v.strip().strip("\"'")
        except OSError:
            pass
        return ""

    def gnani_key(self) -> str:
        return self._key(self.gnani_speech_api_key, "gnani_api_key")

    def llm_key(self, provider: str) -> str:
        return self._key(getattr(self, f"{provider}_api_key"), f"{provider}_api_key")

    def llm_model(self, provider: str) -> str:
        return self.ollama_model if provider == "ollama" else getattr(self, f"{provider}_model")


TOOL_HINTS = {
    "verify_caller": " ONLY call this tool when the caller has stated BOTH their 10-digit mobile number AND their date of birth (or loan number). If they only gave the mobile number, DO NOT call this tool yet: ask them for their date of birth first. Convert dob to YYYY-MM-DD.",
    "send_details_sms": " ALWAYS use this when the caller says send / SMS / bhej / pathva for their account number, IFSC, customer ID or branch address.",
    "get_masked_profile": " ONLY for questions about what is on file (linked mobile or email). Never for 'send me my details': use send_details_sms.",
    "request_app_approval": " Only after a Tier 2 action was refused and nothing is approved yet. Never for 'why did my EMI change' etc.: call explain_emi_change.",
    "faq_lookup": " USE THIS for every general banking question (opening an account -> topic open_account, minimum balance, KYC, UPI, cards, NEFT/RTGS/IMPS, fraud, cheques, charges). Never answer those from your own knowledge.",
    "account_balance": " Only after verification; the caller asks for their account balance.",
    "last_transactions": " Only after verification; pass count (1 to 5) only if the caller said a number.",
    "dues_info": " Only after verification; the overdue amount, missed EMIs and days past due.",
    "record_ptp": " Only after the caller SAID the amount and the date they will pay. amount in plain rupees, promised_date as YYYY-MM-DD.",
    "record_rtp": " When the caller will not or cannot pay now: pass the closest reason_code (\"I already paid\" on an outbound call: already_paid). Never argue.",
    "end_call": " Call it as soon as the caller says goodbye / bye / that is all, in any language.",
}


# Tools the model sees per call state (the gateway still enforces tiers). Three FIXED lists keep the prompt prefix cacheable.
# confirm_readback is never offered (the service records the caller's yes); start_call is service-only (see load_tools).
_FLOW_TOOLS = {"verify_caller", "request_app_approval", "check_approval", "report_secret_spoken", "handover", "end_call"}
_TIER0_TOOLS = {"faq_lookup", "branch_lookup", "validate_ifsc", "password_reset_help"}
TOOL_SETS: dict[str, set[str]] = {
    "in_unverified": _FLOW_TOOLS | _TIER0_TOOLS,
    "in_verified": _FLOW_TOOLS | _TIER0_TOOLS | {
        "get_masked_profile", "send_details_sms", "emi_info", "explain_emi_change", "check_payment", "emi_date_change",
        "foreclosure_quote", "raise_closure", "request_document", "update_nominee", "update_address", "report_hardship",
        "account_balance", "last_transactions", "dues_info"},
    # check_payment stays out: the prompt forbids it on outbound calls ("already paid" -> record_rtp)
    "outbound": {"dues_info", "record_ptp", "record_rtp", "report_hardship", "handover", "verify_caller", "faq_lookup",
                 "report_secret_spoken", "end_call"},
}


def tool_set_key(c: dict) -> str:
    if c.get("direction") == "outbound":
        return "outbound"
    return "in_verified" if c.get("verified") else "in_unverified"


def load_tools(hints: bool = True) -> tuple[list[dict], set[str]]:
    acts = json.loads((ROOT / "agent" / "actions.json").read_text(encoding="utf-8"))["actions"]
    tools = []
    acts = [a for a in acts if a["name"] != "start_call"]  # service-only: a model call could reset the session (e.g. to outbound)
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
    for t in tools if hints else ():  # nudges for a small local model, keyed by tool name; agent/actions.json stays untouched
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


_SPOKEN = re.compile(r"(?P<ifsc>\b[A-Z]{4}0[A-Z0-9]{6}\b)|(?P<d>\+?\d(?:[ \-.]?\d)*)")


def mask_spoken(text: str, refs: set[str] | None = None) -> str:
    """Last line of defence before TTS/browser: mask phone/account-like digit strings, keep the last 4 digits.
    Counts digits across single space/dash/dot separators, also when glued to letters. 9+ contiguous or 10+ separated
    digits are masked (MICR 411 670 487, amounts with commas, IFSC and the caller's own UTR digits stay readable)."""
    def sub(m):
        g = m.group()
        if m.group("ifsc"):
            return g
        digits = re.sub(r"\D", "", g)
        if len(digits) < (9 if g.lstrip("+").isdigit() else 10) or any(digits in r for r in (refs or ()) if len(digits) >= 6):
            return g
        seen, out = 0, []
        for ch in g:
            if ch.isdigit():
                seen += 1
                out.append(ch if seen > len(digits) - 4 else "*")
            else:
                out.append(ch)
        return "".join(out)
    return _SPOKEN.sub(sub, text)


def redact(text: str) -> str:
    r = _redact_secret("user_text", text)
    if r:
        text = r[0]
    return mask_digits(text)


def trim(msgs: list[dict], keep: int = KEEP_MSGS) -> list[dict]:
    """System + last `keep` messages, never starting on an orphaned tool result."""
    tail = msgs[1:][-keep:]
    while tail and tail[0].get("role") == "tool":
        tail = tail[1:]
    return msgs[:1] + tail


_TOKEN = re.compile(r"[A-Za-z0-9'’]+|[\u0900-\u0d7f]+")  # explicit Indic range (Devanagari..Malayalam): matras are not \w, so no \b
AFFIRM_WORDS = {"yes", "yeah", "yep", "yup", "correct", "right", "haan", "han", "haa", "ji", "jee", "sahi", "theek", "thik",
                "hai", "hain", "ok", "okay", "confirm", "confirmed", "ho", "hoy", "that", "that's", "thats", "is", "it", "its",
                "हाँ", "हां", "सही", "ठीक", "है", "हैं", "हो", "होय", "बरोबर", "आहे", "हा", "जी"}
NEGATE_WORDS = {"no", "not", "nope", "naa", "na", "nahi", "nahin", "don't", "dont", "cancel", "stop", "wait", "change", "wrong",
                "incorrect", "galat", "मत", "ना", "नहीं", "नको", "नका", "चुकीचे", "चुक", "नाही", "गलत"}
BYE_WORDS = {"bye", "goodbye", "alvida", "बाय", "अलविदा"}
FILLER_WORDS = AFFIRM_WORDS | {"thanks", "thank", "you", "dhanyavaad", "dhanyawad", "shukriya", "bas", "all", "nothing", "else",
                               "itna", "hi", "then", "good", "chalo", "धन्यवाद", "शुक्रिया", "आभार", "चलो", "बस", "इतना"}


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(text)]


def is_bare_affirmative(text: str) -> bool:
    """A whole reply of at most 3 words, all affirmative, no digits, no negation: 'haan sahi hai', 'yes', 'हो'."""
    t = _tokens(text)
    return 1 <= len(t) <= 3 and not re.search(r"\d", text) and not set(t) & NEGATE_WORDS and all(w in AFFIRM_WORDS for w in t)


def is_goodbye(text: str) -> bool:
    """Short farewell only (<=5 words, nothing but farewell/filler words, no negation)."""
    t = _tokens(text)
    if not t or len(t) > 5 or set(t) & NEGATE_WORDS or not all(w in BYE_WORDS | FILLER_WORDS | {"that's", "thats"} for w in t):
        return False
    s = set(t)
    return bool(s & BYE_WORDS or {"that's", "all"} <= s or {"thats", "all"} <= s or {"nothing", "else"} <= s or {"bas", "itna"} <= s)
_MARATHI = re.compile(r"आहे|आहेत|(?:^|\s)मी(?:\s|$)|तुम्ही|आपण|करा|(?:^|\s)आता|(?:^|\s)मला|तुमची")  # no \b: matras are not \w


def infer_language(text: str, current: str) -> str:
    """Script of the reply decides Hindi vs Marathi vs Hinglish when no action carried a language."""
    if _DEVANAGARI.search(text):
        return "mr" if _MARATHI.search(text) else "hi"
    return "hinglish" if current in ("hi", "mr") else current


# Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam digits -> ASCII (secret_spoken uses this table)
_DEVA_DIGITS = {z + i: 48 + i for z in (0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66) for i in range(10)}
_IDENT = re.compile(r"\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b")


def clean_spoken(text: str, names: set[str]) -> str:
    """Never speak tool names: drop every sentence that contains an action name or a snake_case identifier."""
    if not text:
        return text
    # every multi-word action name is snake_case, so _IDENT covers them; the plain word "handover" stays speakable
    bad = re.compile(r"\b(?:" + "|".join(sorted((re.escape(n) for n in names if "_" in n), key=len, reverse=True) or ["(?!)"]) + r")\b")
    parts = re.split(r"(?<=[.!?\u0964])\s+", text)
    return " ".join(x for x in parts if not (_IDENT.search(x) or bad.search(x))).strip()


def _flat(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", text.translate(_DEVA_DIGITS)).upper()


def untraceable(name: str, args: dict, said: list[str]) -> list[str]:
    """Argument names whose values the caller never said in this call (a small model invents plausible ones)."""
    t = " ".join(said).translate(_DEVA_DIGITS)
    flat, nocomma = _flat(t), re.sub(r"(?<=\d)[,\s](?=\d)", "", t)
    bad = []

    def has_text(v) -> bool:
        return bool(v) and _flat(str(v)) in flat

    def has_number(v) -> bool:
        try:
            n = str(round(float(v)))
        except (TypeError, ValueError):
            return False
        return re.search(rf"(?<!\d){re.escape(n)}(?!\d)", nocomma) is not None

    if name == "check_payment":
        if not has_text(args.get("utr")):
            bad.append("utr")
        if not has_number(args.get("amount")):
            bad.append("amount")
        # date: only checked implicitly; if utr and amount trace, the date is accepted
    elif name == "record_ptp":
        if not has_number(args.get("amount")):
            bad.append("amount")
        if not parse_spoken_date(t):
            bad.append("promised_date")
    elif name == "emi_date_change":
        if not has_number(args.get("new_day")):
            bad.append("new_day")
    elif name == "update_address":
        if not has_number(args.get("pincode")) or len(str(args.get("pincode"))) != 6:
            bad.append("pincode")
        bad += [f for f in ("line1", "city") if not has_text(args.get(f))]
    elif name == "update_nominee":
        if not has_text(args.get("name")):
            bad.append("name")
    return bad


def new_call_id() -> str:
    """'v-' + 4 groups of 8 hex chars: no run of 9+ digits can occur (the gateway redacts 9-18 digit runs)."""
    h = uuid.uuid4().hex
    return "v-" + "-".join(h[i:i + 8] for i in range(0, 32, 8))


PURPOSE = {"check_payment": "Payment check", "explain_emi_change": "EMI change explanation",
           "emi_date_change": "EMI date change", "foreclosure_quote": "Foreclosure quote",
           "raise_closure": "Loan closure request", "request_document": "Document request",
           "update_nominee": "Nominee update", "update_address": "Address update"}
FIELD_LABEL = {
    "en": {"utr": "UTR number", "amount": "amount", "new_day": "day of the month", "pincode": "pincode",
           "line1": "first line of the address", "city": "city", "name": "nominee's name",
           "promised_date": "date you will pay"},
    "hinglish": {"utr": "UTR number", "amount": "amount", "new_day": "mahine ka din", "pincode": "pincode",
                 "line1": "address ki pehli line", "city": "sheher", "name": "nominee ka naam",
                 "promised_date": "payment ki date"},
    "hi": {"utr": "यूटीआर नंबर", "amount": "रकम", "new_day": "महीने का दिन", "pincode": "पिनकोड",
           "line1": "पते की पहली लाइन", "city": "शहर", "name": "नामांकित व्यक्ति का नाम",
           "promised_date": "भुगतान की तारीख"},
    "mr": {"utr": "यूटीआर क्रमांक", "amount": "रक्कम", "new_day": "महिन्याचा दिवस", "pincode": "पिनकोड",
           "line1": "पत्त्याची पहिली ओळ", "city": "शहर", "name": "नामनिर्देशित व्यक्तीचे नाव",
           "promised_date": "पैसे भरण्याची तारीख"},
}
ASK = {"en": ("Please tell me the {x}.", " and the "), "hinglish": ("Kripya {x} bataiye.", " aur "),
       "hi": ("कृपया {x} बताइए।", " और "), "mr": ("कृपया {x} सांगा.", " आणि ")}


def ask_text(lang: str, fields: list[str], name: str = "") -> str:
    """Service-written question for values the caller has not said yet (never model prose)."""
    lang = lang if lang in ASK else "hinglish"
    labels = [FIELD_LABEL[lang].get(f, f) for f in fields]
    if name == "check_payment" and lang == "hinglish":
        labels = ["payment ka " + labels[0]] + labels[1:]
    tmpl, joiner = ASK[lang]
    return tmpl.format(x=joiner.join(labels))


INTENT = {  # a held action is only auto-retried if the caller's own words this call point at it
    "raise_closure": ("clos", "band", "foreclos", "बंद", "बंद"),
    "foreclosure_quote": ("clos", "band", "foreclos", "बंद", "बंद"),
    "request_document": ("statement", "certificate", "certi", "stmt", "प्रमाणपत्र", "स्टेटमेंट", "दस्तावेज"),
    "explain_emi_change": ("why", "kyun", "kyu ", "kyon", "badh", "bada", "increas", "went up", "hike", "वाढ", "क्यों", "बढ़"),
    "update_nominee": ("nominee", "nominy", "नामांकित", "नॉमिनी"),
    "update_address": ("address", "pata", "पता", "पत्ता"),
}
APPROVAL_WORDS = {"approve", "approved", "approval", "tapped", "tap", "done", "kar", "diya", "kiya", "kardiya", "confirm",
                  "अप्रूव", "मंजूर", "कर", "दिया", "केले", "केलं", "झाले"}


_DATE_WORDS = {"date", "tareekh", "tarikh", "tarik", "dinank", "तारीख", "तारिख", "दिनांक"}
_CHANGE_CUES = {"change", "badal", "badlo", "badalna", "badla", "karaycha", "karna", "karo", "karne", "shift", "move",
                "करा", "करायचा", "करायची", "बदल", "बदला", "बदलो", "बदलना", "लावा"}


_WHY_WORDS = {"why", "kyun", "kyu", "kyon", "kaaran", "karan", "क्यों", "क्यूं", "कारण", "का", "कसा", "का"}
_UP_WORDS = {"badha", "badh", "badhi", "badhgayi", "increase", "increased", "up", "hike", "बढ़ी", "बढ़ा", "वाढली", "वाढला", "वाढले"}


_MONTHS_MAP = {
    "jan": 1, "january": 1, "जनवरी": 1, "जानेवारी": 1,
    "feb": 2, "february": 2, "फ़रवरी": 2, "फेब्रुवारी": 2, "फरवरी": 2,
    "mar": 3, "march": 3, "मार्च": 3,
    "apr": 4, "april": 4, "अप्रैल": 4, "एप्रिल": 4,
    "may": 5, "मई": 5, "मे": 5,
    "jun": 6, "june": 6, "जून": 6,
    "jul": 7, "july": 7, "जुलाई": 7, "जुलै": 7,
    "aug": 8, "august": 8, "अगस्त": 8, "ऑगस्ट": 8,
    "sep": 9, "september": 9, "सितंबर": 9, "सप्टेंबर": 9, "सितम्बर": 9,
    "oct": 10, "october": 10, "अक्टूबर": 10, "ऑक्टोबर": 10,
    "nov": 11, "november": 11, "नवंबर": 11, "नोव्हेंबर": 11,
    "dec": 12, "december": 12, "दिसंबर": 12, "डिसेंबर": 12,
}


def _parse_dob(v: str) -> str | None:
    m = re.search(r"\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b", v)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b", v)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z\u0900-\u097f]+)[,\s]+(\d{4})", v)
    if m and m.group(2).lower() in _MONTHS_MAP:
        return f"{m.group(3)}-{_MONTHS_MAP[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"([a-zA-Z\u0900-\u097f]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})", v)
    if m and m.group(1).lower() in _MONTHS_MAP:
        return f"{m.group(3)}-{_MONTHS_MAP[m.group(1).lower()]:02d}-{int(m.group(2)):02d}"
    return None


def _extract_verify(text: str, said: list[str] | None = None) -> tuple[str, dict] | None:
    t = text.translate(_DEVA_DIGITS)
    all_text = (" ".join(said) + " " + text).translate(_DEVA_DIGITS) if said else t
    m_mob = re.search(r"(?:(?:\+?91|0)?[ -]?)?([6-9]\d{9})\b", all_text)
    if not m_mob:
        return None
    mob = m_mob.group(1)
    dob = _parse_dob(all_text)
    if dob:
        return ("verify_caller", {"registered_mobile": mob, "dob": dob})
    m_loan = re.search(r"(?:loan|कर्ज|खाते|last\s*4|last\s*four)\D{0,15}(\d{4})\b", all_text, re.I)
    if m_loan:
        return ("verify_caller", {"registered_mobile": mob, "loan_last4": m_loan.group(1)})
    return None


def fallback_action(text: str, said: list[str] | None = None) -> tuple[str, dict] | None:
    """Only when the model answered with prose and no action: 'EMI date 10 la karaycha aahe' is unambiguous enough
    to run emi_date_change(new_day=10) ourselves (the read-back and approval flows then take over)."""
    fb_v = _extract_verify(text, said)
    if fb_v:
        return fb_v
    t = set(_tokens(text))
    if {"emi", "ईएमआय", "एमआय"} & t and _WHY_WORDS & t and _UP_WORDS & t:
        return ("explain_emi_change", {})
    if not ({"emi", "ईएमआय", "एमआय"} & t and _DATE_WORDS & t and _CHANGE_CUES & t):
        return None
    days = [int(n) for n in re.findall(r"(?<!\d)\d{1,2}(?!\d)", text.translate(_DEVA_DIGITS)) if 1 <= int(n) <= 31]
    return ("emi_date_change", {"new_day": days[0]}) if len(days) == 1 else None


def claims_approved(text: str) -> bool:
    """'Approve kar diya' / 'I approved it': the caller says it is done (a request like 'send the approval' is not)."""
    t = set(_tokens(text))
    return bool(t & {"approved", "tapped"} or (t & {"approve", "approval", "अप्रूव"} and t & {"diya", "kiya", "done", "दिया", "केले", "केलं"}))


def intent_ok(name: str, said: list[str]) -> bool:
    keys = INTENT.get(name)
    return True if not keys else any(k in " ".join(said).lower() for k in keys)


def looks_like_approval_turn(text: str) -> bool:
    """Short replies and anything that talks about the approval; other turns belong to the model."""
    t = _tokens(text)
    return len(t) <= 4 or bool(set(t) & APPROVAL_WORDS)


def final_text(model_text: str, speaks: list[tuple[bool, str]]) -> str:
    """Numbers must come from the gateway. If the model's text carries a figure that is not in this turn's ok `speak`
    texts (a hallucination, an echo of the caller's digits, or a paraphrase that changed a number), speak the gateway
    text verbatim instead. Paraphrases without new figures are kept: they keep the conversational question."""
    if not speaks:
        return model_text
    ok_speaks = [s for ok, s in speaks if ok] or [speaks[-1][1]]
    verbatim = " ".join(dict.fromkeys(ok_speaks))
    norm = lambda s: re.sub(r"(?<=\d)[,\s](?=\d)", "", s)
    known = set(re.findall(r"\d+", norm(" ".join(ok_speaks))))  # only figures the gateway said this turn, not the caller's
    if not model_text or any(n not in known for n in re.findall(r"\d+", norm(model_text))):
        return verbatim
    return model_text


_MULTI_WORDS = {"and", "also", "plus", "aur", "bhi", "tatha", "ani", "aani", "आणि", "और", "भी", "तथा"}


_TOPICS = {  # request topics; a tool "covers" some of them (its speak already answers all of those)
    "branch": r"branch|ifsc|micr|address|timing|hours|शाखा|पत्ता|पता|वेळ|समय|ब्रांच",
    "emi": r"\bemi\b|instal?lment|due date|ईएमआय|एमआय|किस्त|हप्ता",
    "dues": r"overdue|dues|pending amount|outstanding|बकाया|थकबाकी",
    "balance": r"(?<!minimum )(?<!min )\bbalance|बैलेंस|शिल्लक",
    "txn": r"transaction|ट्रांजैक्शन|व्यवहार",
    "sms": r"\bsms\b|\bmessage\b|bhej|pathva|भेज|पाठव",
    "f_open": r"\bopen(?:ing)?\b.*\baccount|account.*\bopen|खाता खोल|खाते उघड|account khol",
    "f_minbal": r"minimum|\bmin\b|maintain|न्यूनतम|किमान",
    "f_kyc": r"\bkyc\b|केवायसी",
    "f_upi": r"\bupi\b|यूपीआई",
    "f_card": r"\bcard\b|कार्ड",
    "f_neft": r"neft|rtgs|imps",
    "f_fraud": r"fraud|scam|phishing|धोखा|फसवणूक",
    "f_cheque": r"cheque|check book|चेक",
}
_FAQ = {k for k in _TOPICS if k.startswith("f_")}
_COVERS = {"branch_lookup": {"branch"}, "validate_ifsc": {"branch"}, "emi_info": {"emi"}, "explain_emi_change": {"emi"},
           "dues_info": {"dues", "emi"}, "account_balance": {"balance"}, "last_transactions": {"txn", "balance"},
           "send_details_sms": {"sms", "branch"}, "foreclosure_quote": {"dues"}, "record_ptp": {"dues", "emi"},
           "record_rtp": {"dues", "emi"}, "faq_lookup": _FAQ}


def multi_request(text: str, tool: str | None = None) -> bool:
    """The caller's words look like more than one request: a conjunction word. Commas alone do not count
    ("EMI kitna hai, next kab hai?" is one request); measured: a comma rule disabled the shortcut on most turns.
    With the tool that ran: a conjunction inside ONE topic that the tool's speak already covers
    ("Kothrud branch address and timing") is still one request; one FAQ answer covers one FAQ topic only."""
    if not set(_tokens(text)) & _MULTI_WORDS:
        return False
    if tool not in _COVERS:
        return True
    low = text.lower()
    hit = {k for k, rx in _TOPICS.items() if re.search(rx, low)}
    if not hit or not hit <= _COVERS[tool]:
        return True
    return tool == "faq_lookup" and len(hit & _FAQ) > 1


# ---- language owned by the service ----
_LANG_WORDS = {"en": {"english", "inglish", "इंग्लिश", "अंग्रेजी", "अंग्रेज़ी", "इंग्रजी", "अँग्रेजी"},
               "hinglish": {"hinglish", "हिंग्लिश"},
               "hi": {"hindi", "हिंदी", "हिन्दी", "हिंदीत"},
               "mr": {"marathi", "मराठी", "मराठीत", "मराठीमध्ये"}}
# How a caller may name each beta language (Roman and Devanagari, as Hindi/Marathi speakers say it); each file adds its own lang_names.
_BETA_NAMES = {"bn": {"bengali", "bangla", "bangali", "बंगाली", "बांग्ला", "बंगला"},
               "gu": {"gujarati", "gujrati", "गुजराती", "गुजरातीत"},
               "kn": {"kannada", "kannad", "कन्नड", "कन्नड़"},
               "ml": {"malayalam", "malayali", "मलयालम"},
               "pa": {"punjabi", "panjabi", "पंजाबी"},
               "ta": {"tamil", "tamizh", "तमिल", "तमिळ"},
               "te": {"telugu", "तेलुगु", "तेलुगू", "तेलगू"}}
# Languages Gnani does not support (or that have no file loaded): named or written, the caller gets the sorry line.
_UNSUPPORTED = {"odia", "oriya", "urdu", "assamese", "asomiya", "kashmiri", "konkani", "sindhi", "nepali", "maithili", "dogri",
                "bodo", "santali", "manipuri", "meitei", "ओडिया", "उर्दू", "असमिया", "कश्मीरी", "कोंकणी", "सिंधी", "नेपाली", "मैथिली"}
_UNSUP_SCRIPT = re.compile("[\u0600-\u06ff\u0b00-\u0b7f]")  # Arabic/Urdu, Odia
_SCRIPT_BLOCK = {"Bengali": (0x980, 0x9FF), "Gurmukhi": (0xA00, 0xA7F), "Gujarati": (0xA80, 0xAFF), "Tamil": (0xB80, 0xBFF),
                 "Telugu": (0xC00, 0xC7F), "Kannada": (0xC80, 0xCFF), "Malayalam": (0xD00, 0xD7F)}
_SCRIPT_LANG = {m["code"]: m["script"] for m in MODES if m.get("script") in _SCRIPT_BLOCK}  # code -> script, from the registry
_ANY_INDIC_NON_DEVA = re.compile("[\u0980-\u0d7f]")
ACTIVE_LANGS: list[str] = list(BUILTIN_LANGS)  # built-in 4 + every language whose file loaded
_INACTIVE_NAMES: set[str] = set()  # names of registry languages with no (valid) file: the caller gets the sorry line
_SWITCH_CUES = {"talk", "speak", "switch", "change", "in", "mein", "me", "madhe", "bolo", "bol", "bolna", "bolu", "kar", "karo", "kara",
                "sang", "sanga", "बोल", "बोलो", "बोला", "बोलिए", "बोलें", "बोलू", "बोलना", "बात", "मध्ये", "मराठीत", "हिंदीत", "में", "मैं",
                "कर", "करो", "करा", "बदल", "बदला", "सांग", "सांगा"}
_LANG_STOP = {"please", "pls", "plz", "kripya", "ji", "jee", "ok", "okay", "yes", "sure", "baat", "kijiye", "kijiyega", "karein", "karen",
              "kare", "kariye", "bolein", "boliye", "dijiye", "we", "can", "could", "you", "i", "want", "would", "like", "to", "the",
              "a", "lets", "let", "let's", "hum", "aap", "ab", "se", "continue", "only", "language"}
_FIRST_TURN_HINGLISH = {"hai", "kya", "mera", "meri", "mujhe", "kitna", "ka", "ki", "ko", "nahi", "kab", "bata", "batao", "aap", "mere"}
LANG_OK = {"en": "Sure, I will continue in English. How can I help you?",
           "hinglish": "Theek hai, hum Hinglish mein baat karenge. Main aapki kaise madad kar sakta hoon?",
           "hi": "ठीक है, मैं हिंदी में बात करूँगा। मैं आपकी कैसे मदद कर सकता हूँ?",
           "mr": "ठीक आहे, मी मराठीत बोलेन. मी तुमची कशी मदत करू शकतो?"}
LANG_SORRY = ""  # set by _sorry_line(): lists the languages that are active


def _sorry_line() -> str:
    names = [m["name"] for m in sorted(MODES, key=lambda m: m["code"] == "hinglish") if m["code"] in ACTIVE_LANGS]
    return (f"Sorry, I can speak {', '.join(names[:-1])} or {names[-1]}. Which would you like? "
            "माफ़ कीजिए, मैं अंग्रेज़ी, हिंदी, मराठी या हिंग्लिश में बात कर सकता हूँ। आप कौन सी भाषा चाहेंगे?"
            if len(names) > 1 else "Sorry, I could not follow that language.")


LANG_SORRY = _sorry_line()
CUSTOMER_Q = {"en": "To check that, I need to verify a few details: your registered mobile number and date of birth.",
              "hinglish": "Ye check karne ke liye mujhe kuch details verify karni hongi: aapka registered mobile number aur date of birth.",
              "hi": "यह जाँचने के लिए मुझे कुछ विवरण सत्यापित करने होंगे: आपका रजिस्टर्ड मोबाइल नंबर और जन्मतिथि।",
              "mr": "ते तपासण्यासाठी मला काही तपशील पडताळावे लागतील: तुमचा नोंदणीकृत मोबाइल नंबर आणि जन्मतारीख."}


def first_named(toks: list[str]) -> bool:
    return any(set(toks) & w for w in _LANG_WORDS.values())


def script_language(text: str) -> str | None:
    """The language whose script dominates the text (Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi): a registry
    code, or 'unsupported' when that language is not loaded, or Odia/Urdu script. None for Latin/Devanagari text."""
    if _UNSUP_SCRIPT.search(text):
        return "unsupported"
    best, n = None, 0
    for script, (lo, hi) in _SCRIPT_BLOCK.items():
        k = sum(lo <= ord(ch) <= hi for ch in text)
        if k > n:
            best, n = script, k
    if not best:
        return None
    code = next((c for c, sc in _SCRIPT_LANG.items() if sc == best), None)
    return code if code in ACTIVE_LANGS else "unsupported"


def detect_language(text: str, first: bool) -> tuple[str | None, bool, bool]:
    """(language | 'unsupported' | None, whole reply is just the language choice, caller named one at all)."""
    toks = _tokens(text.lower())
    named = next((k for k, w in _LANG_WORDS.items() if set(toks) & w), None)
    if not named and (sl := script_language(text)):  # written in another Indic script: that is the language
        return sl, False, True
    bad = bool(set(toks) & (_UNSUPPORTED | _INACTIVE_NAMES))
    cue = bool(set(toks) & _SWITCH_CUES)
    if not (named or bad) or not (first or cue or len(toks) <= 2):
        return None, False, False
    if bad and not named:
        return "unsupported", True, True
    rest = set(toks) - set().union(*_LANG_WORDS.values()) - _SWITCH_CUES - _LANG_STOP
    return named, not rest and len(toks) <= 8, True  # only a language choice; "Hinglish. KYC kaise karein?" is a question too


def first_turn_language(text: str, current: str) -> str:
    """No language named: Devanagari picks Hindi/Marathi, Roman text with Hindi words is Hinglish, otherwise English."""
    if _DEVANAGARI.search(text):
        return infer_language(text, current)
    return "hinglish" if set(_tokens(text.lower())) & _FIRST_TURN_HINGLISH else "en"


def is_customer_question(text: str) -> bool:
    t = set(_tokens(text.lower()))
    if not t & {"customer", "customers", "ग्राहक", "कस्टमर"}:
        return False
    return bool({"am", "i"} <= t or t & {"main", "mai", "mein", "मैं"} and t & {"hun", "hoon", "hu", "हूँ", "हूं"}
                or t & {"mi", "मी"} and t & {"ahe", "aahe", "आहे"} or "क्या" in t and t & {"मैं", "मी"})


# ---- deterministic safety nets (the small model ignores prompt text) ----
_NUM_VAL = re.compile(r"\d(?:[\s-]?\d){2,}")  # 3+ digits, also spoken with gaps ("4 3 2 1")
# Words that make a sentence ABOUT a secret (a question or a help request), not a disclosure of one.
_ABOUT_SECRET = {"how", "what", "why", "does", "do", "can", "should", "ask", "asks", "asked", "asking",
                 "reset", "forgot", "forget", "change", "create", "generate", "set", "share", "never", "safe", "someone",
                 "kaise", "kya", "kyu", "kyon", "kab", "kaun", "bhool", "bhul", "badal", "maang", "maangta", "maang", "poochh",
                 "कैसे", "क्या", "क्यों", "भूल", "बदल", "मांग", "पूछ", "कसा", "कसे", "काय", "का", "विसर", "बदल", "मागत", "विचार"}


def secret_spoken(text: str) -> str | None:
    """A secret was SAID. Any digits near a secret word, a card number, or a secret word in a sentence that is not a
    question or help request ('mera password tiger hai') counts. 'Does the bank ask for OTP?' or 'UPI PIN reset
    kaise' is about a secret and goes to the FAQ. When unsure we block: rule 1 beats a missed FAQ answer."""
    st = _find_secret("user_text", text)
    if not st or st == "card_number":
        return st
    t = text.translate(_DEVA_DIGITS)
    if _NUM_VAL.search(t):
        return st
    if "?" in t or set(_tokens(t.lower())) & _ABOUT_SECRET:
        return None
    return st


_POSSESSIVE = {"my", "mera", "meri", "mere", "mujhe", "mujhko", "मेरा", "मेरी", "मेरे", "मुझे", "माझा", "माझी", "माझे", "मला"}
_ACCT_NOUNS = {"emi", "balance", "loan", "payment", "paid", "transaction", "transactions", "dues", "due", "overdue", "outstanding",
               "ईएमआई", "ईएमआय", "बैलेंस", "बॅलन्स", "लोन", "कर्ज", "खाता", "खाते", "अकाउंट", "account", "ifsc", "number", "नंबर"}


# General-process and safety topics: answered from the FAQ even with "my ... account" (fraud, bereavement, KYC, a missed EMI as a
# question). Balance / EMI amount / payment lookups stay account-specific and need verification.
_GENERAL_TOPIC = re.compile(
    r"fraud|scam|phishing|unauthori[sz]ed|धोखा|ठगी|फसवणूक|स्कॅम|deceased|passed away|\bdeath\b|मृत|"
    r"dormant|inactive|inoperative|निष्क्रिय|डॉरमेंट|डॉर्मंट|\bkyc\b|केवाईसी|केवायसी|"
    r"\bmiss(?:ed)?\b|bounce|not paid|छूट गई|छूट गया|चुकला|चुकली|"
    r"complaint|grievance|ombudsman|shikayat|शिकायत|तक्रार|लोकपाल|"
    r"(?:block|lost|stolen).{0,12}card|card.{0,12}(?:block|lost|stolen)|कार्ड ब्लॉक|bank.{0,15}(?:asks?|never|maang)")


def account_specific(text: str) -> bool:
    low = text.lower()
    t = set(_tokens(low))
    return bool(t & _POSSESSIVE and t & _ACCT_NOUNS and not _GENERAL_TOPIC.search(low))


# Questions a TOOL answers (account data, branch/IFSC lookups, requests): never routed to the FAQ even if a FAQ keyword matches.
_TOOL_OWNED = re.compile(
    r"\b(?:my|mera|meri|mere)\s+(?:branch\s+)?ifsc\b|\bifsc\b.{0,25}\b(?:of|for|ka)\b.{0,20}\bbranch\b|\bbranch\b.{0,20}\bifsc\b|"
    r"\b(?:validate|verify|check)\b.{0,12}\bifsc\b|\bifsc\b.{0,15}\b(?:correct|valid|sahi|right)\b|\b[a-z]{4}0[a-z0-9]{6}\b|"
    r"\b(?:last|recent|latest|mini)\b.{0,12}\b(?:transactions?|txns?|statement)\b|"
    r"\bnext\s+emi\b|\bemi\b.{0,20}\b(?:kitna|kab|kiti)\b|(?:ईएमआई|बैलेंस).{0,15}कितना|\b(?:what|how much)\b.{0,25}\b(?:i owe|do i owe|outstanding|my emi|my balance|dues?)\b|"
    r"\bemi\b.{0,30}\b(?:go|went|gone|increase[d]?|hike[d]?|up|badh)\b|\b(?:why|kyun|kyu)\b.{0,25}\b(?:emi|charges?)\b.{0,25}\b(?:more|high|higher|up|badh|increase[d]?)\b|"
    r"\balready\s+paid\b|\bpaid\s+already\b|\bpaid\s+(?:my\s+)?emi\b|pay\s+kar\s+diya|भर\s+दिया|भरले|"
    r"\bclose\s+(?:my|the)\s+loan\b|\bforeclos\w*\b.{0,20}\b(?:my|amount|quote)\b|\bloan\s+(?:band|close)\b|\bband\s+karo\b|"
    r"\bchange\b.{0,12}\bemi\s+date\b|\bemi\s+date\b.{0,12}\bchange\b|\b(?:sms|message)\b.{0,20}\b(?:my|mera)\b.{0,15}\b(?:ifsc|customer id|account)\b|"
    r"\bwhich\b.{0,15}\b(?:mobile|email|phone)\b.{0,15}\b(?:linked|registered)\b|\bcustomer\s+id\b|\b(?:what|which)\s+(?:is|are)\s+my\b|"
    r"\blost\s+(?:my\s+)?job\b|\bnaukri\b|नौकरी|नोकरी|\bwife|\bhusband|\bi\s+(?:will|promise)\s+pay\b|\bnominee\b.{0,12}\bto\b\s+my\b|"
    r"(?:check|show|tell|know|what(?:'s| is)(?:\s+my|\s+the)?|how much)\s+(?:my\s+)?(?:(?:current|savings?|available|account)\s+)*balance|"
    r"\b(?:send|give|email|mail)\s+me\b.{0,20}\bstatement\b|\b(?:want|need)\b.{0,12}\bmy\b.{0,15}\bstatement\b|"
    r"\bcheck\b.{0,25}\bmy\b.{0,15}\baccount\b|\brequest\b.{0,20}\b(?:status|pending)\b|\b(?:status|pending)\b.{0,20}\brequest\b|"
    r"\b(?!(?:nearest|nearby|my|your|the|a|any|another|bank|home|this|that|same|other|closest|which|what|near|new|local|our|their|visit\w*)\b)[a-z]+\s+branch\b", re.I)


# Possessive "my EMI / my balance" in Hindi/Marathi: a tool question unless it is a general topic ("माझा ईएमआय चुकला" = a missed EMI, an FAQ).
_TOOL_OWNED_POSS = re.compile(r"मेरा\s+(?:बैलेंस|ईएमआई|ईएमआय)|माझा\s+(?:बॅलन्स|ईएमआय)|माझे\s+(?:शेवटचे|व्यवहार)")


def tool_owned(text: str) -> bool:
    return bool(_TOOL_OWNED.search(text) or (_TOOL_OWNED_POSS.search(text) and not _GENERAL_TOPIC.search(text.lower())))


def faq_text_ok(text: str, tool_guard: bool = True, acct_guard: bool = True) -> bool:
    """Call-state-free part of faq_ok: an FAQ-shaped question, not an action request or account/tool question."""
    return bool(len(_tokens(text)) >= 2 and not is_bare_affirmative(text) and not is_action_request(text) and not (acct_guard and account_specific(text))
                and not (tool_guard and tool_owned(text)))


def faq_args(text: str) -> dict | None:
    """Arguments for faq_lookup. The gateway rejects any input that names a secret ('PIN', 'OTP'), so those questions
    map to their FAQ topic here instead of going as a query (contract change request: exempt faq_lookup.query)."""
    if not _find_secret("user_text", text):
        return {"query": text[:200]}
    t = set(_tokens(text.lower()))
    asks = t & {"ask", "asks", "asked", "maang", "maangta", "maangti", "mangta", "मांग", "मांगता", "मांगते", "मागते", "मागतो", "विचारते", "विचारतो", "पूछता"}
    if t & {"bank", "बैंक", "बँक"} and asks:
        return {"topic": "bank_never_asks"}
    if t & {"upi", "यूपीआई", "युपीआय", "यूपीआय"}:
        collect = {"receive", "collect", "someone", "koi", "कोई", "कोणी", "money", "paisa", "paise", "पैसे", "पैसा", "prapt"}
        return {"topic": "upi_fraud_collect" if t & collect else "upi_pin_reset"}
    if t & {"card", "atm", "debit", "कार्ड", "एटीएम", "डेबिट"}:
        return {"topic": "card_pin"}
    return None


_faq_cache: dict = {"sig": None, "intents": [], "by_id": {}}
_FAQ_HEAD = {"en": "Reference (bank FAQ, use only if relevant):", "hi": "संदर्भ (बैंक FAQ, केवल प्रासंगिक हो तो उपयोग करें):",
             "hinglish": "Reference (bank FAQ, sirf kaam ka ho to use karein):", "mr": "संदर्भ (बँक FAQ, फक्त संबंधित असेल तर वापरा):"}


def _faq_intents() -> list[dict]:
    """faq.json plus every i18n/<code>.json `faq` section, merged like the gateway does; reloaded when a file changes."""
    paths = [ROOT / "gateway" / "app" / "data" / "faq.json", *sorted(p for p in (ROOT / "i18n").glob("*.json") if p.name != "languages.json")]
    sig = tuple((str(p), p.stat().st_mtime) for p in paths if p.exists())
    if _faq_cache["sig"] != sig:
        intents: dict[str, dict] = {}
        try:
            intents = {i["id"]: i for i in json.loads(paths[0].read_text(encoding="utf-8"))["intents"]}
            for p in paths[1:]:
                try:
                    d = json.loads(p.read_text(encoding="utf-8"))
                    if d.get("lang") != p.stem:
                        continue
                    for iid, f in (d.get("faq") or {}).items():
                        it = intents.get(iid)
                        if it is not None and isinstance(f, dict) and isinstance(f.get("answer"), str) and f["answer"].strip():
                            it.setdefault("keywords", {})[p.stem] = [k for k in f.get("keywords", []) if isinstance(k, str) and k.strip()]
                            it.setdefault("answer", {})[p.stem] = f["answer"]
                except (OSError, ValueError, AttributeError):
                    continue
        except (OSError, ValueError, KeyError):
            intents = {}
        _faq_cache.update(sig=sig, intents=list(intents.values()), by_id=intents)
    return _faq_cache["intents"]


def strip_lang_lead(text: str) -> str:
    """"English. What is NRE?" -> "What is NRE?": a leading sentence made only of language-choice words is not part of the question."""
    for i, ch in enumerate(text):
        if ch in ".!?।":
            head = set(_tokens(text[:i].lower()))
            if head and head <= set().union(*_LANG_WORDS.values()) | _SWITCH_CUES | _LANG_STOP | {"बताइए", "बात", "कीजिए", "बोलो", "बोला", "बोलिए", "सांगा", "बताओ"}:
                return text[i + 1:].strip()
            break
    return text


def faq_rank(text: str, lang: str) -> list[tuple[str, float, float]]:
    _faq_intents()
    return faq_score.table_for(_faq_cache["by_id"]).rank(strip_lang_lead(text), lang)


def faq_route(text: str, lang: str, st: dict | None = None) -> tuple[str, str | None]:
    """('high', id) answer directly, ('medium', id) LLM turn with the FAQ block, ('low', None) plain LLM turn.
    Pure on the text (call-state guards stay in faq_ok); thresholds from the call's settings, else the defaults."""
    text = strip_lang_lead(text)
    if not faq_text_ok(text, acct_guard=False):
        return "low", None
    st = st or {}
    out = faq_score.classify(faq_rank(text, lang), st.get("faq_direct_min", faq_score.HIGH_MIN), st.get("faq_direct_margin", faq_score.HIGH_MARGIN),
                              st.get("faq_ref_min", faq_score.MED_MIN), st.get("faq_direct_cover", faq_score.COVER_MIN))
    return out


def faq_reference(text: str, lang: str, n: int = 3, min_score: float = faq_score.MED_MIN) -> str:
    """Top-n FAQ answers by the weighted scorer, as a short block; "" if none score above min_score."""
    by_id, top = _faq_cache["by_id"] if _faq_intents() else {}, []
    for iid, sc, _ in faq_rank(text, lang)[:n]:
        a = by_id[iid].get("answer")
        if sc >= min_score and isinstance(a, dict):
            top.append((a.get(lang) or a.get("en") or "")[:400])
    top = [a for a in top if a]
    return _FAQ_HEAD.get(lang, _FAQ_HEAD["en"]) + "\n" + "\n".join(f"- {a}" for a in top) if top else ""


THINK_WORDS = 18  # a turn this long (in tokens) counts as hard


def is_hard_turn(text: str, msgs: list[dict]) -> bool:
    """A turn that reached the LLM and looks hard: long, several requests / questions, or the last tool call failed."""
    t = _tokens(text or "")
    if len(t) >= THINK_WORDS or set(t) & _MULTI_WORDS or sum(w in _QUESTION_WORDS for w in t) >= 2 or (text or "").count("?") >= 2:
        return True
    last = msgs[-1] if msgs else None
    if isinstance(last, dict) and last.get("role") == "tool":
        try:
            return json.loads(last.get("content") or "{}").get("ok") is False
        except (ValueError, AttributeError):
            return False
    return False


_THINK_TAG = re.compile(r"<think>.*?(?:</think>|$)", re.S)


_ACTION_STEMS = ("update", "change", "close", "send", "raise", "cancel", "block", "apply", "badal", "badla", "band", "bhej", "bhejo",
                 "बदल", "बंद", "भेज", "अपडेट", "पाठव", "रद्द")
_QUESTION_WORDS = {"how", "what", "when", "why", "where", "which", "can", "kaise", "kya", "kab", "kyun", "kahan", "kaun",
                   "कैसे", "कैसा", "कैसी", "कसा", "कशी", "कशा", "कसं", "क्या", "कब", "क्यों", "कहाँ", "कसे", "काय", "केव्हा", "कधी", "कुठे"}


def is_action_request(text: str) -> bool:
    """An imperative/desire to DO something (no question word): skip the FAQ pre-route and let the model call the action."""
    t = _tokens(text.lower())
    return not set(t) & _QUESTION_WORDS and any(w.startswith(_ACTION_STEMS) for w in t)


_HUMAN_TARGET = {"someone", "somebody", "human", "agent", "person", "manager", "executive", "representative", "officer", "staff",
                 "insaan", "insan", "इंसान", "आदमी", "व्यक्ति", "मैनेजर", "एजेंट", "अधिकारी", "माणूस", "माणसाशी", "मॅनेजर", "एजंट",
                 "कोणाशी", "कोणाला", "kisi", "किसी"}
_HUMAN_VERB = {"speak", "talk", "connect", "transfer", "baat", "bat", "bolna", "बात", "बोलना", "बोलायचे", "बोलायचं", "बोलू", "बोलवा",
               "जोड़ो", "जोडा", "बोलने", "bolne", "milao", "मिलाओ"}


_EN_HUMAN_REQ = re.compile(r"\b(?:speak|talk|connect|transfer)\b(?:\W+\w+){0,3}?\W+(?:to|with)\b(?:\W+\w+){0,3}?\W+(?:"
                           + "|".join(w for w in _HUMAN_TARGET if w.isascii()) + r")\b")
_EN_VERBS = {"speak", "talk", "connect", "transfer"}
_NEG_HUMAN = {"not", "no", "never", "dont", "don't", "don’t", "nahi", "nahin", "nako", "naka", "नहीं", "नको", "नका", "नाही"}
_SELF_CLAIM = re.compile(r"\bi(?:'|’)?m\s+(?:the|a|an)\b|\bi\s+am\s+(?:the|a|an)\b")


def wants_human(text: str) -> bool:
    """A request (verb + human noun in that order for English; Indic word order is free) with no negation and
    no 'I am the manager' self-claim."""
    low = text.lower()
    t = set(_tokens(low))
    if t & _NEG_HUMAN or _SELF_CLAIM.search(low):
        return False
    return bool(_EN_HUMAN_REQ.search(low) or (t & _HUMAN_TARGET and t & (_HUMAN_VERB - _EN_VERBS)))


_LEAK = re.compile(r"system\s*prompt|tool\s*list|\b(?:my|the|these|those|above|previous|original)\s+instructions\b|"
                   r"\bmy\s+prompt\b|सिस्टम\s*प्रॉम्प्ट", re.I)
_INJECT = re.compile(r"system\s*prompt|tool\s*list|(?:ignore|forget|disregard)\s+(?:all\s+)?(?:the\s+)?(?:previous|above|prior|earlier)\s+instructions", re.I)
SAFE = {"en": "I can only help with banking requests. How can I help you?",
        "hinglish": "Main sirf banking requests mein madad kar sakta hoon. Main aapki kaise madad karun?",
        "hi": "मैं केवल बैंकिंग से जुड़े अनुरोधों में मदद कर सकता हूँ। मैं आपकी कैसे मदद करूँ?",
        "mr": "मी फक्त बँकिंग विनंत्यांमध्ये मदत करू शकतो. मी तुमची कशी मदत करू?"}
_VERIFY_WORDS = {"mobile", "number", "dob", "birth", "date", "janam", "tithi", "tarikh", "born", "registered", "and", "my", "is", "mera",
                 "meri", "aur", "hai", "the", "of", "i", "am", "जन्म", "तारीख", "जन्मतारीख", "मोबाईल", "मोबाइल", "नंबर", "आणि", "आहे", "है",
                 "और", "मेरा", "माझा", "माझी", "जन्मतिथि", "मेरी", "का", "ka", "ki", "तिथि"}
_FILL = {"was", "on", "in", "at", "for", "ko", "को", "रोजी"}
_VERIFY_ASK = {
    "en": "Please also tell me your date of birth or the last four digits of your loan number.",
    "hinglish": "Kripya apni date of birth ya loan number ke last 4 digits bhi bataiye.",
    "hi": "कृपया अपनी जन्मतिथि या लोन नंबर के आखिरी चार अंक भी बताइए।",
    "mr": "कृपया तुमची जन्मतारीख किंवा कर्ज क्रमांकाचे शेवटचे चार अंक सांगा."}
ARGLESS = {"account_balance", "last_transactions", "emi_info", "dues_info", "get_masked_profile"}


def earlier_request(said: list[str]) -> str:
    """The caller's most recent substantive request (not a bare language choice or verification details)."""
    for t in reversed(said):
        if detect_language(t, False)[1]:
            continue
        if len([w for w in _tokens(t) if w not in _VERIFY_WORDS and w not in _MONTHS_MAP and w not in _FILL and not w.isdigit()]) >= 2:
            return t
    return ""


_WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
             "सोमवार": 0, "मंगलवार": 1, "बुधवार": 2, "गुरुवार": 3, "शुक्रवार": 4, "शनिवार": 5, "रविवार": 6,
             "सोमवारी": 0, "मंगळवार": 1, "गुरुवारी": 3}


def parse_spoken_date(text: str, today=None) -> str | None:
    """'15 tarikh', '15 November', 'next Monday', 'kal', 'tomorrow', '2026-11-15' -> YYYY-MM-DD; None if not clear
    (number words like 'pandrah' are not parsed: the caller is asked again)."""
    import datetime as dt
    today = today or dt.date.today()
    t = text.translate(_DEVA_DIGITS).lower()
    try:
        m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
        if m:
            return dt.date(int(m[1]), int(m[2]), int(m[3])).isoformat()
        toks = set(_tokens(t))
        if toks & {"today", "aaj", "आज"}:
            return today.isoformat()
        if toks & {"tomorrow", "kal", "कल", "उद्या"}:
            return (today + dt.timedelta(days=1)).isoformat()
        for w, wd in _WEEKDAYS.items():
            if w in toks:
                return (today + dt.timedelta(days=(wd - today.weekday()) % 7 or 7)).isoformat()
        for m in re.finditer(r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+([a-z" + _INDIC + r"]+)(?:\s+(20\d\d)(?!\d))?", t):
            if mon := _MONTHS_MAP.get(m[2]):  # "5 rupees on 17 November": skip the non-month pair
                d = dt.date(int(m[3] or today.year), mon, int(m[1]))
                return (d if d >= today or m[3] else d.replace(year=today.year + 1)).isoformat()
        m = _DATE_DAY.search(t)
        if m:
            day = int(m[1] or m[2])
            d = dt.date(today.year, today.month, day)
            if d < today:
                d = dt.date(today.year + (today.month == 12), today.month % 12 + 1, day)
            return d.isoformat()
    except ValueError:
        return None
    return None


_INDIC = "\u0900-\u0d7f"
_PAID_BASE = (r"already paid|paid already|\bi(?:'ve| have)? paid\b|\bpaid (?:last|yesterday|earlier|before)|"
              r"pay(?:ment)?\s+(?:kar\s+)?(?:diya|kar diya|kar di)\b|bhar diya|jama kar|भर दिया|भुगतान कर दिया|दे दिया|भरले|भरलेत|भरल्या")


def _alt(words) -> str:
    return "|".join(map(re.escape, sorted(set(words), key=lambda w: (-len(w), w))))


def _build_regexes() -> None:
    """(Re)compile the patterns that embed word lists; called at import and after language files are merged."""
    global _DATE_SPANS, _DATE_DAY, _PAID
    _DATE_SPANS = re.compile(  # a bare "on 15" is left in: two figures -> not auto-routed
        r"\d{4}-\d{2}-\d{2}|(?<!\d)\d{1,2}(?:st|nd|rd|th)?\s+(?:" + _alt(_MONTHS_MAP) + r")(?:\s+20\d\d)?(?![a-z" + _INDIC + r"])"
        r"|(?<!\d)\d{1,2}\s*(?:" + _alt(_DATE_WORDS) + ")")
    _DATE_DAY = re.compile(r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*(?:" + _alt(_DATE_WORDS) + r")|(?:on|by|को|ला)\s+(\d{1,2})(?!\d)")
    _PAID = re.compile(_PAID_BASE + "".join("|" + re.escape(x) for x in _PAID_EXTRA))


_PAID_EXTRA: list[str] = []
_BIG_NUMBER_WORDS = {"k", "thousand", "hazaar", "hajar", "lakh", "lac", "हजार", "हज़ार", "लाख", "हजारांचे"}
_FULL_WORDS = {"full", "pura", "poora", "puri", "poori", "whole", "entire", "saara", "saari", "पूरा", "पूरी", "सारी", "सारा", "संपूर्ण", "पूर्ण"}

def parse_amount(text: str, dues: dict | None = None) -> int | None:
    """The one rupee figure in a promise ('1000 rupees on 17 November'), or the whole due ('pura') from the last dues_info.
    None when unclear ('two thousand', two figures): the model or a re-ask handles it."""
    t = text.translate(_DEVA_DIGITS).lower()
    nums = re.findall(r"(?<![\d,])\d[\d,]*(?!\d)", _DATE_SPANS.sub(" ", t))
    toks = set(_tokens(t))
    if len(nums) == 1 and not toks & _BIG_NUMBER_WORDS:
        return int(nums[0].replace(",", "")) or None
    if not nums and toks & _FULL_WORDS and dues and isinstance(dues.get("overdue_amount"), int):
        return dues["overdue_amount"] + int(dues.get("charges") or 0)
    return None


_TXN = re.compile(r"(?:last|recent|latest)(?: \d)? transactions?|mini statement|शेवटचे व्यवहार|शेवटचा व्यवहार|(?:आखिरी|पिछले|अंतिम) (?:लेन|ट्रांजैक्शन)|pichle transaction")


def last_txn_count(text: str) -> int | None:
    """Asked for the last few transactions with no other request in the sentence; the count only if the caller said 1 to 5."""
    low = text.translate(_DEVA_DIGITS).lower()
    if not _TXN.search(low) or set(_tokens(low)) & _MULTI_WORDS:
        return None
    n = re.findall(r"(?<!\d)[1-5](?!\d)", low)
    return int(n[0]) if len(n) == 1 else 0


def is_already_paid(text: str) -> bool:
    return bool(_PAID.search(text.lower()))


def parse_field(content_type: str, body: bytes, name: str) -> str | None:
    msg = email.message_from_bytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    for part in msg.walk():
        if part.get_param("name", header="content-disposition") == name:
            return (part.get_payload(decode=True) or b"").decode("utf-8", "ignore")
    return None


def parse_audio(content_type: str, body: bytes) -> bytes | None:
    """Minimal multipart reader (python-multipart is not a dependency): returns the `audio` part."""
    msg = email.message_from_bytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    for part in msg.walk():
        if part.get_param("name", header="content-disposition") == "audio":
            return part.get_payload(decode=True)
    return None


_BYE_FILLER_BASE = set(FILLER_WORDS)
_WORDSETS = {"affirm": AFFIRM_WORDS, "negate": NEGATE_WORDS, "bye": BYE_WORDS, "approval": APPROVAL_WORDS, "switch_cues": _SWITCH_CUES,
             "question": _QUESTION_WORDS, "possessive": _POSSESSIVE, "acct_nouns": _ACCT_NOUNS, "human_target": _HUMAN_TARGET,
             "human_verb": _HUMAN_VERB, "neg_human": _NEG_HUMAN, "full": _FULL_WORDS, "multi": _MULTI_WORDS, "date": _DATE_WORDS,
             "verify": _VERIFY_WORDS}
_SNAP = ({k: set(v) for k, v in _WORDSETS.items()}, dict(_MONTHS_MAP), dict(_WEEKDAYS))  # the built-in words, to reload from


def _beta_token_ok(s: str) -> bool:
    """Beta-language words: native script always; romanised only from 4 chars, so "na", "ki", "te", "pan" cannot hijack en/hi/hinglish/mr turns."""
    s = s.strip()
    return bool(s) and (not s.isascii() or len(s) >= 4)


def load_languages(base: Path | None = None) -> list[str]:
    """Merge every present <base>/<code>.json (registry languages beyond the built-in 4) into the fixed lines and word sets.
    A missing or invalid file is skipped with a warning. Returns the active language codes. Safe to call again."""
    global ACTIVE_LANGS, LANG_SORRY, _ACTION_STEMS, MODES
    base = base or I18N_DIR
    MODES = _registry(base)
    TTS_LANG.update({m["code"]: m["tts"] for m in MODES})
    STT_LANG.update({m["code"]: m["stt"] for m in MODES})
    _SCRIPT_LANG.clear()
    _SCRIPT_LANG.update({m["code"]: m["script"] for m in MODES if m.get("script") in _SCRIPT_BLOCK})
    for c in [c for c in ACTIVE_LANGS if c not in BUILTIN_LANGS]:  # drop a previous load
        for d in (REPROMPT, LANG_OK, CUSTOMER_Q, SAFE, ASK, FIELD_LABEL, _LANG_WORDS):
            d.pop(c, None)
    ACTIVE_LANGS = list(BUILTIN_LANGS)
    for k, v in _WORDSETS.items():
        v.clear()
        v.update(_SNAP[0][k])
    for tbl, snap in ((_MONTHS_MAP, _SNAP[1]), (_WEEKDAYS, _SNAP[2])):
        tbl.clear()
        tbl.update(snap)
    _PAID_EXTRA.clear()
    extra_stems: list[str] = []
    for m in MODES:
        code = m["code"]
        p = base / f"{code}.json"
        if code in BUILTIN_LANGS or not p.is_file():
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            v, w = d["voice"], d["words"]
            if d.get("lang") != code:
                raise ValueError("'lang' does not match the file name")
            for k in ("REPROMPT", "LANG_OK", "CUSTOMER_Q", "SAFE"):
                if not (isinstance(v[k], str) and v[k].strip()):
                    raise ValueError(f"voice.{k} empty")
            ask = v["ASK"]
            if not (isinstance(ask, list) and len(ask) == 2 and "{x}" in ask[0]):
                raise ValueError("voice.ASK malformed")
            if not isinstance(v["FIELD_LABEL"], dict):
                raise ValueError("voice.FIELD_LABEL malformed")
        except Exception as e:  # noqa: BLE001
            log.warning("skipping i18n/%s.json: %s", code, e)
            continue
        REPROMPT[code], LANG_OK[code], CUSTOMER_Q[code], SAFE[code] = v["REPROMPT"], v["LANG_OK"], v["CUSTOMER_Q"], v["SAFE"]
        ASK[code] = (ask[0], ask[1])
        FIELD_LABEL[code] = {k: x for k, x in v["FIELD_LABEL"].items() if isinstance(x, str) and x.strip()}

        def words(key: str) -> list[str]:
            x = w.get(key)
            return [i.lower() for i in x if isinstance(i, str) and _beta_token_ok(i)] if isinstance(x, list) else []

        def table(key: str, ok) -> dict[str, int]:
            x = w.get(key)
            return {k.lower(): n for k, n in x.items() if isinstance(k, str) and _beta_token_ok(k) and isinstance(n, int) and ok(n)} if isinstance(x, dict) else {}

        _LANG_WORDS[code] = {m["name"].lower(), m.get("native", "").lower(), *_BETA_NAMES.get(code, ()), *words("lang_names")}
        _LANG_WORDS[code].discard("")
        for name, target in _WORDSETS.items():
            target.update(words(name))
        _MONTHS_MAP.update(table("month_words", lambda n: 1 <= n <= 12))
        _WEEKDAYS.update(table("weekdays", lambda n: 0 <= n <= 6))
        _PAID_EXTRA.extend(words("already_paid"))
        extra_stems += words("action_verbs")
        ACTIVE_LANGS.append(code)
    _INACTIVE_NAMES.clear()
    for m in MODES:
        if m["code"] not in ACTIVE_LANGS:
            _INACTIVE_NAMES.update({m["name"].lower(), m.get("native", "").lower(), *_BETA_NAMES.get(m["code"], ())})
    _INACTIVE_NAMES.discard("")
    _ACTION_STEMS = tuple(dict.fromkeys(_ACTION_STEMS_BASE + tuple(extra_stems)))
    FILLER_WORDS.clear()
    FILLER_WORDS.update(_BYE_FILLER_BASE | AFFIRM_WORDS)
    _build_regexes()
    LANG_SORRY = _sorry_line()
    return ACTIVE_LANGS


_ACTION_STEMS_BASE = _ACTION_STEMS
_build_regexes()
load_languages()


def create_app(settings: Settings | None = None, client: httpx.AsyncClient | None = None) -> FastAPI:
    cfg = settings or Settings()
    tools, known = load_tools()
    tools_plain, _ = load_tools(hints=False)
    by_state = {h: {k: [t for t in (tools if h else tools_plain) if t["function"]["name"] in names] for k, names in TOOL_SETS.items()}
                for h in (True, False)}
    raw_prompt = (ROOT / "agent" / "system_prompt.md").read_text(encoding="utf-8")
    # the call id moves to the first user message so the system prompt (and Ollama's prefix cache) is identical across calls
    out_m = re.search(r"<!-- OUTBOUND -->(.*?)<!-- /OUTBOUND -->", raw_prompt, re.S)
    outbound_block = out_m.group(1).strip() if out_m else ""
    base_prompt = re.sub(r"<!-- OUTBOUND -->.*?<!-- /OUTBOUND -->", "", raw_prompt, flags=re.S).rstrip() + "\n"
    prompt = re.sub(r"[^\n]*\{\{conversation_id\}\}[^\n]*",
                    "2. Pass `call_id` exactly as given in the first user message, and `language`, in every action.", base_prompt)
    keyterms = [l.strip() for l in (ROOT / "agent" / "keyterms.txt").read_text(encoding="utf-8").splitlines() if l.strip()][:200]
    calls: dict[str, dict] = {}
    schemas = {t["function"]["name"]: set(t["function"]["parameters"]["properties"]) for t in tools}
    tags_cache: dict = {"t": 0.0, "models": []}
    http = client or httpx.AsyncClient(timeout=120)

    async def warm_up() -> None:
        try:  # load the model and prime the prompt cache; never blocks or breaks startup
            await http.post(f"{cfg.ollama_url}/api/chat", json={
                "model": cfg.ollama_model, "messages": [{"role": "system", "content": prompt},
                                                        {"role": "user", "content": "(warm-up)"}],
                "tools": by_state[True]["in_unverified"], "stream": False, "think": False, "keep_alive": -1,
                "options": {"num_ctx": 8192, "num_predict": 1}})
        except Exception as e:  # noqa: BLE001
            log.warning("ollama warm-up failed: %s", type(e).__name__)

    @contextlib.asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(warm_up()) if cfg.warmup else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="LoanLoop voice agent", lifespan=lifespan)
    app.state.calls = calls
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.middleware("http")
    async def host_check(request: Request, call_next):  # DNS-rebinding guard
        if request.headers.get("host", "") not in {f"127.0.0.1:{cfg.voice_port}", f"localhost:{cfg.voice_port}"}:
            return JSONResponse({"detail": "bad host"}, status_code=400)
        return await call_next(request)

    def bad_gateway(what: str, cid: str = "-", status: int | None = None):
        log.warning("call=%s upstream_error=%s status=%s", cid, what, status)
        return HTTPException(502, "upstream service error")

    async def gateway(cid: str, name: str, args: dict) -> dict:
        props = schemas.get(name)
        if props is not None:  # a small model sometimes invents argument names: drop keys outside the tool's schema
            kept = {k: v for k, v in args.items() if k in props or k == "language"}
            if len(kept) != len(args):
                log.info("call=%s action=%s dropped_arg_keys=%d", cid, name, len(args) - len(kept))
            args = kept
        args = {**args, "call_id": cid}  # always ours, never the model's
        t0 = time.perf_counter()
        try:
            r = await http.post(f"{cfg.gateway_url}/actions/{name}", json=args,
                                headers={"X-Gateway-Secret": cfg.gateway_shared_secret}, timeout=15)
            if r.status_code >= 500 or r.status_code in (401, 403):
                raise bad_gateway("gateway", cid)
            res = r.json()
        except (httpx.HTTPError, ValueError):
            raise bad_gateway("gateway", cid) from None
        finally:
            tick("gateway", t0)
        if not isinstance(res, dict):
            raise bad_gateway("gateway", cid)
        return res

    async def llm(c: dict) -> dict:
        p, t0, st_ = c["llm"], time.perf_counter(), c["set"]
        msgs, tl = trim(c["messages"], st_["keep_msgs"]), tools if st_["tool_hints"] else tools_plain
        if st_["tool_sets"]:
            tl = by_state[st_["tool_hints"]][tool_set_key(c)]
        if (ref := c.get("faq_ref")) and c.get("faq_msg") is not None:  # this turn only: the stored message stays clean
            msgs = [{**m, "content": f"{m['content']}\n\n{ref}"} if m is c["faq_msg"] else m for m in msgs]
        try:
            if p != "ollama":
                return await providers.openai_chat(
                    http, base_url=getattr(cfg, f"{p}_base_url"), api_key=cfg.llm_key(p), model=c["model"],
                    messages=msgs, tools=tl, provider=p, temperature=st_["temperature"], max_tokens=st_["max_tokens"],
                    reasoning=st_["reasoning"])
            opts = {"num_ctx": st_["num_ctx"]}
            if st_["temperature"] is not None:
                opts["temperature"] = st_["temperature"]
            if st_["max_tokens"]:
                opts["num_predict"] = st_["max_tokens"]
            think = bool(st_["think_hard"] and is_hard_turn(c.get("user_text", ""), msgs))
            if think and not opts.get("num_predict"):
                opts["num_predict"] = 1500  # bounds a rambling thought
            r = await http.post(f"{cfg.ollama_url}/api/chat", json={
                "model": c["model"], "messages": msgs, "tools": tl, "stream": False,
                "think": think, "keep_alive": -1, "options": opts})
            r.raise_for_status()
            msg = r.json()["message"]
            if not isinstance(msg, dict):
                raise ValueError
            msg.pop("thinking", None)  # never spoken, never stored in history
            if think:
                log.info("call=%s think=1", c["id"])
                if isinstance(msg.get("content"), str):
                    msg["content"] = _THINK_TAG.sub("", msg["content"]).strip()
            return msg
        except providers.ProviderError as e:
            raise bad_gateway(p, c["id"], e.status) from None
        except (httpx.HTTPError, KeyError, ValueError):
            raise bad_gateway(p, c["id"]) from None
        finally:
            tick("llm", t0)

    FLOW = {"verify_caller", "request_app_approval", "check_approval", "report_secret_spoken", "start_call"}

    def note_pending(c: dict, name: str, args: dict, res: dict) -> None:
        """Track refusals so the model gets a hint to retry once the caller has the tier. Read-backs are NOT confirmed
        here: a refusal with confirm_readback only records a candidate (`rb_new`); the turn handler promotes it to
        `pending_rb` once the sentence has actually been delivered, and only the service's auto_confirm may confirm."""
        ok, nxt = bool(res.get("ok")), res.get("next")
        data = res.get("data") if isinstance(res.get("data"), dict) else {}
        p = c.get("pending")
        if p and (c["turn"] - p[2] > 2 or (ok and name not in FLOW and name != p[0])):
            c["pending"] = p = None  # stale (2 turns) or the caller moved on to something else
        if name == "request_app_approval" and not ok:
            c["approval_id"] = None
        if not ok and nxt in NEED_TIER:
            c["pending"] = (name, nxt, c["turn"])  # tier 2: the service requests the approval itself
            return
        if not ok and nxt == "confirm_readback":
            conf = data.get("confirm") if isinstance(data.get("confirm"), dict) else {}
            c["rb_new"] = (name, dict(args), dict(conf))
            res["instruction"] = ("Read the gateway's sentence to the caller and WAIT for their answer. Do NOT call "
                                  "confirm_readback yourself; the system records the caller's yes and retries the action.")
            return
        if ok and c.get("rb_new") and name == c["rb_new"][0]:
            c["rb_new"] = None
        if ok and name == "request_app_approval":
            c["approval_id"] = data.get("approval_id")
            res["instruction"] = (f"Ask the caller to tap Approve in the bank app and tell you when done, then call "
                                  f"check_approval with approval_id {data.get('approval_id')}.")
        status = data.get("status")
        if ok and name == "check_approval" and status == "approved":
            c["approved"], c["approved_for"] = True, (p[0] if p else c.get("approved_for"))
            c["held"] = None  # confirmed through the model's own check: nothing left to retry automatically
        if name == "check_approval" and status in ("approved", "denied", "expired"):
            c["approval_id"] = None
        if not (ok and p):
            return
        if name == p[0]:
            c["pending"] = None
        elif name == "verify_caller" and p[1] == "need_tier_1":
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

    async def exec_call(c: dict, name, args: dict, st: dict, internal: bool = False) -> dict:
        """Run one tool call (model's or the service's own) against the gateway; track speaks and pending state."""
        t0 = time.monotonic()
        if not isinstance(name, str) or name not in known:
            res, name = {"ok": False, "error_code": "INVALID_INPUT", "speak": ""}, "unknown"
        elif name == "report_secret_spoken" and not internal:
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": "",
                   "instruction": "no secret was spoken; answer the question"}
        elif name == "confirm_readback" and not internal:
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": "",
                   "instruction": "You may not confirm read-backs. Read the values back to the caller and wait for their "
                                  "yes; the system records it. Do not claim anything was confirmed."}
        elif not internal and name == "request_app_approval" and (c.get("approved") or c.get("approval_id")):
            st["dup_appr"] = st["dup_seen"] = bool(c.get("approved"))
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": "",
                   "instruction": (f"Already approved; now call {c.get('approved_for') or 'the action that serves the caller'}. "
                                   "Do not request again. Tier 2 is open: call explain_emi_change, check_payment, foreclosure_quote, "
                                   "raise_closure, emi_date_change, request_document, update_nominee or update_address as the caller asked."
                                   if c.get("approved") else "An approval is already pending; the system checks it. Do not request again.")}
        elif not internal and name == "check_approval" and c.get("approved"):
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": "",
                   "instruction": "The approval is already confirmed. Carry on with the caller's request; do not check again."}
        elif not internal and name == "verify_caller" and not args.get("dob") and not args.get("loan_last4") and not _parse_dob(" ".join(c.get("said", []))):
            ask = _VERIFY_ASK.get(c.get("language"), _VERIFY_ASK["en"])
            st["speaks"].append((False, ask))
            st["last"] = ask
            c["ask_verify_turn"] = c["turn"]
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": ask,
                   "instruction": "Verification requires BOTH mobile and date of birth (or loan last 4). Ask the caller for their date of birth; do not call verify_caller again until they state it."}
        elif not internal and (missing := untraceable(name, args, c.get("said", []))):
            st["ask"] = (name, missing)
            res = {"ok": False, "error_code": "INVALID_INPUT", "speak": "",
                   "instruction": f"Ask the caller for {', '.join(missing)}; never invent values. Do not call {name} until they say them."}
        else:
            if name == "verify_caller" and c["direction"] == "outbound":
                # DOB-only: the gateway looks the customer up by a given mobile, and a model-invented one never verifies
                args.pop("registered_mobile", None)
                args.pop("loan_last4", None)
            if name == "verify_caller":
                if c["direction"] == "outbound":
                    pass
                elif not args.get("registered_mobile"):
                    m_prev = re.search(r"(?:(?:\+?91|0)?[ -]?)?([6-9]\d{9})\b", " ".join(c.get("said", [])))
                    if m_prev:
                        args["registered_mobile"] = m_prev.group(1)
                elif isinstance(args.get("registered_mobile"), str):
                    d = re.sub(r"\D", "", args["registered_mobile"])
                    if len(d) >= 10:
                        args["registered_mobile"] = d[-10:]
                if not args.get("dob") and not args.get("loan_last4"):
                    dob_prev = _parse_dob(" ".join(c.get("said", [])))
                    if dob_prev:
                        args["dob"] = dob_prev
                if args.get("dob") and isinstance(args["dob"], str):
                    p_dob = _parse_dob(args["dob"])
                    if p_dob:
                        args["dob"] = p_dob
            utr = args.get("utr")
            if isinstance(utr, str) and len(re.sub(r"\D", "", utr)) >= 6:
                c.setdefault("refs", set()).add(re.sub(r"\D", "", utr))  # the caller's own UTR may be read back
            args["language"] = c["language"]  # the service owns the call language, never the model's argument
            if name == "record_ptp":  # spoken dates are parsed by us, not trusted from the model
                # newest utterance first, one at a time: joining them let an earlier date of birth ("17 June 1988") win
                args["promised_date"] = next(filter(None, (parse_spoken_date(u) for u in reversed(c.get("said", [])[-3:]))), None) or args.get("promised_date")
            if name == "check_approval" and c.get("approval_id"):
                args["approval_id"] = str(c["approval_id"])  # the model often mangles the id
            res = await gateway(c["id"], name, args)
            if name == "verify_caller" and res.get("ok"):
                c["verified"] = True
            if name == "dues_info" and res.get("ok") and isinstance(res.get("data"), dict):
                c["dues_data"] = res["data"]
            if isinstance(res.get("speak"), str) and res["speak"]:
                st["speaks"].append((bool(res.get("ok")), res["speak"]))
            st["last"] = res.get("speak") or st["last"]
            note_pending(c, name, args, res)
            if name == "verify_caller" and res.get("ok"):
                st["verified_now"], st["pend"] = True, res.get("pending_request")
            t2 = not res.get("ok") and (res.get("next") == "need_tier_2" or res.get("error_code") == "TIER_TOO_LOW")
            if t2:
                c["approved"], c["approved_for"] = False, None  # the approval window expired: allow a fresh request
            if not internal and t2 and not c.get("approval_id") and not c.get("approved"):
                st["need_appr"] = (name, dict(args))  # the service asks for the approval itself, not the model
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

    def in_flow(c: dict) -> bool:
        return bool(c.get("pending") or c.get("held") or c.get("approval_id") or c.get("rb_active") or c.get("pending_rb")
                    or c.get("rb_new") or c.get("ask_verify_turn", -9) >= c["turn"] - 1)

    def faq_ok(c: dict, text: str, pre: bool = False) -> bool:
        if pre and is_action_request(text):
            return False  # "update nominee" is an action for the model, not an FAQ
        return bool(len(_tokens(text)) >= 2 and c["direction"] == "inbound" and not c["ended"] and not in_flow(c) and not is_bare_affirmative(text)
                    and (pre or not account_specific(text)) and not tool_owned(text) and not (not c.get("verified") and _extract_verify(text, c.get("said"))))

    async def faq_call(c: dict, text: str, st: dict, topic: str | None = None) -> str | None:
        """faq_lookup run by the service. Failures leave no trace in the turn state. The gateway has no match strength,
        so only a reply carrying a matched `topic` counts. `topic` = the intent our scorer already chose with high confidence."""
        args = {"topic": topic} if topic else faq_args(text)
        if not args:
            return None
        saved = (list(st["speaks"]), st["last"], len(st["done"]))
        res = await exec_call(c, "faq_lookup", args, st, internal=True)
        data = res.get("data") if isinstance(res.get("data"), dict) else {}
        if res.get("ok") and isinstance(res.get("speak"), str) and res["speak"] and data.get("topic"):
            return res["speak"]
        st["speaks"], st["last"] = saved[0], saved[1]
        del st["done"][saved[2]:]
        return None

    async def faq_fallback(c: dict, st: dict) -> str | None:
        """The model answered a general question in prose with no action: ground it in the FAQ instead."""
        st["faq_tried"] = True
        text = c.get("user_text", "")
        return await faq_call(c, text, st) if faq_ok(c, text) else None

    async def faq_direct(c: dict, text: str) -> tuple[str, list[dict]] | None:
        if not faq_ok(c, text, pre=True):
            return None
        sec = faq_args(text) if _find_secret("user_text", text) else None  # secret-word questions: fixed topic map, always direct
        level, iid = ("high", None) if sec else faq_route(text, c["language"], c["set"])
        if level != "high":
            return None  # medium: the LLM answers with the FAQ block; low: plain LLM turn
        st = new_state()
        speak = await faq_call(c, text, st, iid)
        if not speak:
            return None
        c.pop("note", None)
        c["messages"] += [{"role": "user", "content": text}, {"role": "assistant", "content": speak}]
        return speak, st["done"]

    async def outbound_turn(c: dict, text: str) -> tuple[str, list[dict]] | None:
        """Outbound, verified: a clear promise (amount + date, or 'the full amount' + date) or 'I already paid' is recorded by the
        service, so the gateway's own read-back sentence is what the caller hears (the model asks 'are you saying...?' instead)."""
        if c["direction"] != "outbound" or not c.get("verified") or c["ended"] or set(_tokens(text.lower())) & NEGATE_WORDS:
            return None
        if (when := parse_spoken_date(text)) and (amount := parse_amount(text, c.get("dues_data"))):
            name, args = "record_ptp", {"amount": amount, "promised_date": when}
        elif is_already_paid(text):
            name, args = "record_rtp", {"reason_code": "already_paid"}
        else:
            return None
        st = new_state()
        res = await exec_call(c, name, {**args, "language": c["language"]}, st, internal=True)
        speak = st["rb"] or (res.get("speak") if isinstance(res.get("speak"), str) else "")
        if not speak:
            return None
        c.pop("note", None)
        c["messages"] += [{"role": "user", "content": text}, {"role": "assistant", "content": speak}]
        return speak, st["done"]

    async def txn_turn(c: dict, text: str) -> tuple[str, list[dict]] | None:
        """Verified caller asks for their last transactions: run it, no model round (the small model drifted to other tools)."""
        n = last_txn_count(text)
        if n is None or not c.get("verified") or c["direction"] != "inbound" or c["ended"]:
            return None
        st = new_state()
        res = await exec_call(c, "last_transactions", {"language": c["language"], **({"count": n} if n else {})}, st, internal=True)
        speak = res.get("speak") if res.get("ok") and isinstance(res.get("speak"), str) else ""
        if not speak:
            return None
        c["messages"] += [{"role": "user", "content": text}, {"role": "assistant", "content": speak}]
        return speak, st["done"]

    async def human_turn(c: dict, text: str) -> tuple[str, list[dict]] | None:
        if not wants_human(text):
            return None
        st = new_state()
        res = await exec_call(c, "handover", {"reason": "caller asked for a human", "summary": "Caller asked to speak to a person."},
                              st, internal=True)
        speak = res.get("speak") if isinstance(res.get("speak"), str) else ""
        c["messages"] += [{"role": "user", "content": text}, {"role": "assistant", "content": speak}]
        return speak, st["done"]

    async def pre_verify(c: dict, text: str) -> dict | None:
        """The caller gave the details verify_caller needs: run it before the LLM (outbound: date of birth only)."""
        if c.get("verified") or c["ended"]:
            return None
        if c["direction"] == "outbound":
            dob = _parse_dob(text)
            args = {"dob": dob} if dob else None
        else:
            fb = _extract_verify(text, c.get("said"))
            args = fb[1] if fb else None
        key = tuple(sorted((args or {}).items()))
        if not args or key in c.setdefault("vtried", set()):
            return None
        c["vtried"].add(key)
        st = new_state()
        res = await exec_call(c, "verify_caller", dict(args), st, internal=True)
        c["messages"] += [{"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "verify_caller", "arguments": args}}]},
                          {"role": "tool", "tool_name": "verify_caller", "content": json.dumps(res, ensure_ascii=False)}]
        if res.get("ok") and c["direction"] == "outbound":
            # the small model often skips dues_info after verifying: the service reads the dues out itself, no LLM round
            dres = await exec_call(c, "dues_info", {"language": c["language"]}, st, internal=True)
            if dres.get("ok") and isinstance(dres.get("speak"), str) and dres["speak"]:
                st["direct"] = " ".join(x for x in (res.get("speak"), dres["speak"]) if isinstance(x, str) and x)
        return st

    async def run_actions(c: dict, st: dict | None = None) -> tuple[str, list[dict]]:
        st = st or new_state()
        for _ in range(c["set"]["max_rounds"]):
            msg = await llm(c)
            tcs = msg.get("tool_calls")
            tcs = tcs if isinstance(tcs, list) else []
            argl = [clean_args(tc) for tc in tcs]
            c["messages"].append(msg)
            if (not tcs and not st.get("fb") and (not st["done"] or st.get("dup_seen"))
                    and (fb := fallback_action(c.get("user_text", ""), c.get("said", [])))):
                st["fb"] = True  # replace the model's prose with the action it should have called
                msg = {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": fb[0], "arguments": fb[1]}}]}
                c["messages"][-1] = msg
                tcs, argl = msg["tool_calls"], [fb[1]]
            if not tcs and st.pop("dup_appr", False):
                # the model asked for a second approval, got refused and answered with prose: push it to act once
                c["messages"].append({"role": "user", "content": "[service note: the approval is already confirmed. "
                                      "Call the Tier 2 action that answers the caller's last request now; do not answer from memory. Why did my EMI change: "
                                      "explain_emi_change. Change the EMI date to day N: emi_date_change with new_day N. Close the loan: "
                                      "foreclosure_quote / raise_closure. Statement or certificate: request_document.]"})
                continue
            if not tcs and st.get("verified_now") and not st.get("av_done") and not any(
                    a["ok"] and a["name"] not in FLOW for a in st["done"]):
                st["av_done"] = True  # verified this turn but the model stopped: do the caller's earlier request
                if st.get("pend") in ARGLESS:
                    res = await exec_call(c, st["pend"], {}, st, internal=True)
                    if res.get("ok") and isinstance(res.get("speak"), str) and res["speak"]:
                        c["messages"][-1] = {"role": "assistant", "content": res["speak"]}
                        return res["speak"], st["done"]
                if req := earlier_request(c.get("said", [])):
                    c["messages"].append({"role": "user", "content": "[service note: the caller is now verified. Do their request now "
                                          f"by calling the matching action; do not ask again. Their request: {mask_digits(req)}]"})
                    continue
            if not tcs and not st["done"] and not st.get("faq_tried") and (faq := await faq_fallback(c, st)):
                c["messages"][-1] = {"role": "assistant", "content": faq}
                return faq, st["done"]
            if not tcs:
                raw = (msg.get("content") or "").strip()
                if _LEAK.search(raw):  # never discuss the prompt, instructions or tools
                    c["messages"][-1] = {"role": "assistant", "content": SAFE[c["language"]]}
                    return SAFE[c["language"]], st["done"]
                # gateway sentences are trusted as-is; only the model's own words are scrubbed of tool names
                text = final_text(clean_spoken((msg.get("content") or "").strip(), known), st["speaks"]) or st["last"]
                return st["rb"] or text, st["done"]
            for tc, args in zip(tcs, argl):
                fn = tc.get("function") if isinstance(tc, dict) else None
                name = fn.get("name") if isinstance(fn, dict) else None
                res = await exec_call(c, name, args, st)
                c["messages"].append({"role": "tool", "tool_name": name if isinstance(name, str) else "unknown",
                                      "content": json.dumps(res, ensure_ascii=False)})
            if (c["set"]["shortcut_actions"] and not multi_request(c.get("user_text", ""), name) and len(tcs) == 1 and name in SHORTCUT and res.get("ok") and isinstance(res.get("speak"), str) and res["speak"]
                    and not (st.get("ask") or st.get("need_appr") or st["rb"] or c.get("rb_new"))):
                c["messages"].append({"role": "assistant", "content": res["speak"]})  # the gateway sentence is the answer
                return res["speak"], st["done"]
            if st.get("ask"):  # values the caller never said: ask in a service-written sentence, drop the model's text
                text = ask_text(c["language"], st["ask"][1], st["ask"][0])
                c["messages"].append({"role": "assistant", "content": text})
                return text, st["done"]
            if st.get("need_appr") and not c.get("approval_id"):  # tier 2: request the approval ourselves
                held = st.pop("need_appr")
                res = await exec_call(c, "request_app_approval",
                                      {"purpose": PURPOSE.get(held[0], "Account request"), "language": c["language"]},
                                      st, internal=True)
                text = res.get("speak") if isinstance(res.get("speak"), str) else ""
                if res.get("ok"):
                    c["held"], c["appr_checks"] = (*held, c["turn"]), 0
                c["messages"].append({"role": "assistant", "content": text})
                return text, st["done"]
        # round cap hit: speak the actions' sentences
        return st["rb"] or " ".join(dict.fromkeys(s for ok, s in st["speaks"] if ok)) or st["last"], st["done"]

    async def approval_precheck(c: dict, user_text: str) -> tuple[str, list[dict]] | None:
        """While an approval is pending, the service checks it on short / approval-like caller turns (max 3 pending
        checks), retries a still-relevant held action once approved, and otherwise leaves the turn to the model."""
        held = c.get("held")
        if held and (c["turn"] - held[2] > 2 or set(_tokens(user_text)) & NEGATE_WORDS):
            c["held"] = held = None  # stale or cancelled by the caller; the approval itself stays pending
        if not c.get("approval_id") and not c.get("approved") and claims_approved(user_text):
            c["note"] = "no approval request is pending in this call yet; tell the caller that and ask what they need"
            return None
        if (not c.get("approval_id") or c.get("approved") or c.get("appr_checks", 0) >= 3 or is_goodbye(user_text)
                or not looks_like_approval_turn(user_text)):
            return None
        st = new_state()
        c["appr_checks"] = c.get("appr_checks", 0) + 1
        res = await exec_call(c, "check_approval", {"language": c["language"]}, st, internal=True)
        status = (res.get("data") or {}).get("status") if isinstance(res.get("data"), dict) else None
        text = res.get("speak") if isinstance(res.get("speak"), str) else ""
        if not res.get("ok"):  # an error says nothing about the approval: keep all state, the model carries on
            c["pre_acts"] = st["done"]
            return None
        if status == "approved":
            if not held or not intent_ok(held[0], c.get("said", [])):
                c["held"] = None  # nothing held, or the caller never asked for it: the model asks / carries on
                c["note"] = "the caller's app approval was just confirmed; Tier 2 is open, carry on with their request"
                c["pre_acts"] = st["done"]  # the check still shows up in this turn's actions
                return None
            name, args = held[0], held[1]
            c["held"] = held  # note_pending cleared it on the approval; it is only dropped once the retry succeeds
            if missing := untraceable(name, args, c.get("said", [])):
                text = f"{text} {ask_text(c['language'], missing, name)}".strip()  # held kept: the model retries with values
            else:
                res2 = await exec_call(c, name, dict(args), st, internal=True)
                if res2.get("ok") or res2.get("next") == "confirm_readback":
                    c["held"] = None  # done, or handed to the read-back flow
                text = st["rb"] or " ".join(dict.fromkeys(x for ok, x in st["speaks"] if ok)) or text
        elif status != "pending":  # denied / expired / unknown: start over
            c["held"], c["appr_checks"], c["approval_id"] = None, 0, None
        c["messages"].append({"role": "user", "content": user_text})
        c["messages"].append({"role": "assistant", "content": text})
        return text, st["done"]

    async def auto_confirm(c: dict, user_text: str) -> tuple[str, list[dict]] | None:
        """The caller said a bare yes to the read-back spoken on the previous turn: record every read-back and retry the
        held action ourselves (a small model forgets one, or claims it acted without calling). The model can never
        confirm; stale or same-turn read-backs are never accepted."""
        rb = c.get("rb_active")
        if not rb or not is_bare_affirmative(user_text):
            return None
        name, args, conf = rb
        if not conf:
            return None
        st = new_state()
        c["messages"].append({"role": "user", "content": user_text})
        calls_ = [("confirm_readback", {"field": f, "value": str(v), "language": c["language"]}) for f, v in conf.items()]
        calls_.append((name, dict(args)))
        asst = {"role": "assistant", "content": "", "tool_calls": []}  # only calls actually executed: hosted APIs 400 on unanswered ones
        c["messages"].append(asst)
        for n, a in calls_:
            asst["tool_calls"].append({"function": {"name": n, "arguments": a}})
            res = await exec_call(c, n, a, st, internal=True)
            c["messages"].append({"role": "tool", "tool_name": n, "content": json.dumps(res, ensure_ascii=False)})
            if n == "confirm_readback" and not res.get("ok"):
                break
        return st["rb"] or " ".join(dict.fromkeys(s for ok, s in st["speaks"] if ok)) or st["last"], st["done"]

    async def stt(wav: bytes, lang: str, cid: str, s: dict) -> str:
        data = {"model": "prisma-v3.0", "format": "transcribe", "language_code":
                STT_LANG.get(lang, STT_LANG["hinglish"]) if s["stt_language"] == "auto" else s["stt_language"]}
        if s["stt_keyterms"]:
            data["keyterms"] = json.dumps(keyterms, ensure_ascii=False)
        t0 = time.perf_counter()
        try:
            r = await http.post(STT_URL, headers={"X-API-Key-ID": cfg.gnani_key()}, data=data,
                                files={"audio_file": ("turn.wav", wav, "audio/wav")}, timeout=60)
            r.raise_for_status()
            return (r.json().get("transcript") or "").strip()
        except (httpx.HTTPError, ValueError, AttributeError):
            raise bad_gateway("stt", cid) from None
        finally:
            tick("stt", t0)

    async def tts(text: str, lang: str, cid: str, s: dict) -> str:
        """Soft failure: no audio, text still returned (a retry would repeat data-changing actions)."""
        payload = {"text": text, "model": "timbre-v3.0", "voice": s["tts_voice"], "language": TTS_LANG.get(lang, "hi-IN"),
                   "speed": s["tts_speed"], "audio_config": AUDIO_CONFIG}
        t0 = time.perf_counter()
        try:
            r = await http.post(TTS_URL, headers={"X-API-Key-ID": cfg.gnani_key()}, json=payload, timeout=60)
            r.raise_for_status()
            return base64.b64encode(r.content).decode()
        except httpx.HTTPError:
            log.warning("call=%s tts_failed", cid)
            return ""
        finally:
            tick("tts", t0)

    pcm_cache, tokens = tts_mod.PcmCache(), tts_mod.Tokens()

    def tts_defer(c: dict, text: str, fixed: bool) -> dict:
        """Streaming mode: synthesis happens when the browser GETs audio_url (after the turn JSON is out)."""
        s = c["set"]
        payload = {"text": text, "model": "timbre-v3.0", "voice": s["tts_voice"], "language": TTS_LANG.get(c["language"], "hi-IN"),
                   "speed": s["tts_speed"], "audio_config": tts_mod.RAW_CONFIG}
        key = (text, s["tts_voice"], payload["language"], s["tts_speed"]) if fixed else None
        t = tokens.issue(c["id"], {"payload": payload, "key": key})
        return {"audio_url": f"/calls/{c['id']}/audio/{t}", "audio_rate": tts_mod.RATE}

    @app.get("/calls/{call_id}/audio/{token}")
    async def audio_stream(call_id: str, token: str):
        job = tokens.take(call_id, token)
        c = calls.get(call_id)
        if not job or not c:
            raise HTTPException(404, "unknown audio")
        key, payload = job["key"], job["payload"]

        async def body():
            t0, first, got, hit = time.perf_counter(), None, bytearray(), pcm_cache.get(key) if key else None
            try:
                if hit is not None:
                    first = 0.0
                    yield hit
                else:
                    async for pcm in tts_mod.stream_pcm(http, cfg.gnani_key(), payload):
                        first = first if first is not None else (time.perf_counter() - t0) * 1000
                        got += pcm
                        yield pcm
                    if key and got:
                        pcm_cache.put(key, bytes(got))
            except (httpx.HTTPError, tts_mod.TTSError):
                log.warning("call=%s tts_failed", call_id)  # soft failure: the text is already shown
            finally:  # synthesis runs after the turn JSON, so its timings are logged and kept on the call record
                c["last_tts"] = {"tts_first_ms": round(first or 0), "tts_ms": round((time.perf_counter() - t0) * 1000), "cached": hit is not None}
                log.info("call=%s tts_stream %s", call_id, json.dumps(c["last_tts"]))

        return StreamingResponse(body(), media_type="application/octet-stream",
                                 headers={"X-Sample-Rate": str(tts_mod.RATE), "Access-Control-Expose-Headers": "X-Sample-Rate", "Cache-Control": "no-store"})

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

    def redact_agent(text, refs=None) -> str:
        # digits only: keyword redaction would delete legitimate "never share your PIN" warnings
        # only 9+ digit runs (mobiles, account numbers): amounts like 32,055 and IFSC codes are spoken as-is
        return mask_spoken(text, refs) if isinstance(text, str) else ""

    @app.get("/health")
    async def health():
        return {"ok": True, "model": cfg.ollama_model, "default": cfg.llm_provider, "dev": cfg.dev,
                "providers": {p: {"model": cfg.llm_model(p), "ready": p == "ollama" or bool(cfg.llm_key(p))} for p in PROVIDERS}}

    async def ollama_models() -> list[str]:
        if time.time() - tags_cache["t"] > 60:
            try:
                r = await http.get(f"{cfg.ollama_url}/api/tags", timeout=5)
                r.raise_for_status()
                tags_cache["models"] = [m["name"] for m in r.json()["models"]]
            except Exception:  # noqa: BLE001
                tags_cache["models"] = [cfg.ollama_model]
            tags_cache["t"] = time.time()
        return tags_cache["models"]

    async def resolve_opts(body: dict) -> tuple[str, str, dict]:
        """provider, model, effective settings for a new call. Settings and model are developer-lab only (403 otherwise)."""
        if not cfg.dev and (body.get("settings") or body.get("model")):
            raise HTTPException(403, "settings and model need developer mode (VOICE_DEV=1)")
        provider = body.get("llm", cfg.llm_provider)
        if not cfg.dev and provider != cfg.llm_provider:
            raise HTTPException(403, "hosted LLM selection is dev-only")
        if provider not in PROVIDERS:
            raise HTTPException(422, f"llm must be one of {', '.join(PROVIDERS)}")
        if provider != "ollama" and not cfg.llm_key(provider):
            raise HTTPException(422, f"{provider} is selected but no {provider.upper()}_API_KEY is configured")
        model = body.get("model") or cfg.llm_model(provider)
        if body.get("model"):
            if not isinstance(model, str) or not (MODEL_RE.match(model) if provider != "ollama" else model in await ollama_models()):
                raise HTTPException(422, f"model: not allowed for {provider}")
        return provider, model, validate_settings(body.get("settings") or {}, provider)

    async def open_call(provider: str, model: str, sett: dict, want_tts: bool, direction: str = "inbound",
                        case_id: int | None = None, stream: bool = False) -> dict:
        tm, t_start = {}, time.perf_counter()
        _TM.set(tm)
        now = time.time()
        for k in [k for k, v in calls.items() if now - v["ts"] > TTL_S]:
            del calls[k]
        live = [k for k, v in calls.items() if not v["ended"]]
        if len(live) >= MAX_CALLS:
            raise HTTPException(429, "too many calls")
        cid = new_call_id()
        sysmsg = prompt if sett["cache_prompt"] else base_prompt.replace("{{conversation_id}}", cid)
        if direction == "outbound":
            sysmsg += "\n\n" + outbound_block
        c = {"id": cid, "llm": provider, "model": model, "set": sett, "language": "hinglish", "ended": False, "ts": now, "direction": direction, "lang_set": direction == "outbound",
             "lock": asyncio.Lock(), "turn": 0, "held": None, "appr_checks": 0, "rb_turn": -9, "pending_rb": None,
             "rb_new": None, "rb_active": None, "messages": [{"role": "system", "content": sysmsg}]}
        start_args = {"language": c["language"], "direction": direction, **({"case_id": case_id} if direction == "outbound" else {})}
        res = await gateway(cid, "start_call", start_args)
        text = redact_agent(res.get("speak"))
        hello = f"(call connected, call_id={cid})" if sett["cache_prompt"] else "(call connected)"
        c["messages"] += [{"role": "user", "content": hello}, {"role": "assistant", "content": text}]
        calls[cid] = c
        aud = tts_defer(c, text, True) if text and want_tts and stream else {}
        audio = await tts(text, c["language"], cid, sett) if text and want_tts and not stream else ""
        timings = finish_timings(tm, t_start, provider, model)
        log.info("call=%s turn=0 timings=%s", cid, json.dumps(timings))
        return {"call_id": cid, **reply(c, text, [{"name": "start_call", "ok": bool(res.get("ok"))}], audio, **aud),
                "timings": timings, **({"settings": sett} if cfg.dev else {})}

    @app.post("/calls")
    @app.post("/start")
    async def start(request: Request, tts_q: bool = Query(True, alias="tts"), stream_q: bool = Query(False, alias="stream")):
        raw = await read_body(request)
        body = json_body(request, raw) if raw.strip() else {}
        provider, model, sett = await resolve_opts(body)
        direction, case_id = body.get("direction", "inbound"), body.get("case_id")
        if direction not in ("inbound", "outbound") or (case_id is not None and (not isinstance(case_id, int) or isinstance(case_id, bool))):
            raise HTTPException(422, "direction must be inbound or outbound; case_id an integer")
        if direction == "outbound":  # DOB-only verification is tied to the case, so only ops may pick a case
            auth = request.headers.get("authorization", "")
            if not hmac.compare_digest(auth.encode(), f"Bearer {cfg.dashboard_token}".encode()):
                raise HTTPException(403, "outbound calls are started from ops only")
            if case_id is None:
                raise HTTPException(422, "outbound needs case_id")
        return await open_call(provider, model, sett, tts_q and body.get("tts") is not False, direction, case_id,
                               stream_q or body.get("stream") is True)

    def canned(c: dict, user_text: str, text: str) -> tuple[str, list[dict]]:
        c["messages"] += [{"role": "user", "content": user_text}, {"role": "assistant", "content": text}]
        return text, []

    def language_turn(c: dict, user_text: str) -> tuple[str, list[dict]] | None:
        """Language choice and 'am I a customer' are answered here, no LLM round. Sets c['language'] (service-owned)."""
        first = not c.get("lang_set") and c["direction"] == "inbound"
        lang, pure, named = detect_language(user_text, first)
        c["lang_set"] = True
        if lang == "unsupported":
            c["lang_set"] = not first
            return canned(c, user_text, LANG_SORRY)
        if lang:
            c["language"] = lang  # an explicit choice is honoured: "Hindi" -> hi, only "Hinglish" -> hinglish
            if pure:
                return canned(c, user_text, LANG_OK[c["language"]])
            c["note"] = f"the caller chose {c['language']}; answer in that language"
        elif first and not named:
            c["language"] = first_turn_language(user_text, c["language"])
        if is_customer_question(user_text) and not c.get("verified") and c["direction"] == "inbound":
            return canned(c, user_text, CUSTOMER_Q[c["language"]])
        return None

    async def handle_text(c: dict, user_text: str) -> tuple[str, list[dict]]:
        if not user_text:
            return REPROMPT.get(c["language"], REPROMPT["hinglish"]), []
        c["faq_ref"] = c["faq_msg"] = None  # per-turn reference block; set below only for a general question
        stype = secret_spoken(user_text)
        c["deva"], c["user_text"] = bool(_DEVANAGARI.search(user_text)), "" if stype else user_text
        if not stype:
            c.setdefault("said", []).append(user_text)
            if (early := language_turn(c, user_text)):
                return early
            if _INJECT.search(user_text):  # a prompt-extraction attempt never reaches the model (it can ramble for minutes)
                return canned(c, user_text, SAFE[c["language"]])
            auto = (await human_turn(c, user_text) or await approval_precheck(c, user_text) or await auto_confirm(c, user_text)
                    or await faq_direct(c, user_text) or await outbound_turn(c, user_text) or await txn_turn(c, user_text))
            pst = None
            if not auto:
                note = c.pop("note", None)
                c["messages"].append({"role": "user", "content": f"{user_text}\n[service note: {note}]" if note else user_text})
                c["faq_ref"] = (faq_reference(user_text, c["language"], min_score=c["set"]["faq_ref_min"])
                                if c["set"]["faq_context"] and faq_ok(c, user_text, pre=True) and faq_route(user_text, c["language"], c["set"])[0] != "low" else "")
                c["faq_msg"] = c["messages"][-1]
                pst = await pre_verify(c, user_text)
            if pst and pst.get("direct"):
                auto = (pst["direct"], pst["done"])
                c["messages"].append({"role": "assistant", "content": pst["direct"]})
            text, acts = auto if auto else await run_actions(c, pst)
            acts = (c.pop("pre_acts", None) or []) + acts
            if is_goodbye(user_text) and not c["ended"]:  # safety net: a small model often just says bye
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
        lang, _, _ = detect_language(user_text, not c.get("lang_set") and c["direction"] == "inbound")
        c["lang_set"] = True
        if lang and lang != "unsupported":
            c["language"] = lang  # naming a language alongside a secret still switches it
        res = await gateway(c["id"], "report_secret_spoken", {"language": c["language"], "secret_type": stype})
        speak = res.get("speak") if isinstance(res.get("speak"), str) else ""
        c["messages"] += [{"role": "user", "content": f"[caller started to say a secret ({stype}); it was removed]"},
                          {"role": "assistant", "content": speak}]
        log.info("call=%s action=report_secret_spoken ok=%s", c["id"], bool(res.get("ok")))
        return speak, [{"name": "report_secret_spoken", "ok": bool(res.get("ok"))}]

    async def do_turn(c: dict, wav: bytes | None, user_text: str | None, want_tts: bool, stream: bool = False) -> dict:
        tm, t_start = {}, time.perf_counter()
        _TM.set(tm)
        call_id = c["id"]
        async with c["lock"]:  # one turn at a time per call
            if c["ended"]:
                raise HTTPException(409, "call ended")
            c["messages"] = trim(c["messages"], c["set"]["keep_msgs"])
            n0 = len(c["messages"])
            c["turn"] += 1
            rb = c.get("pending_rb")  # single use: valid only on the turn right after it was delivered
            c["rb_active"] = rb if rb and c["turn"] == c["rb_turn"] + 1 else None
            c["pending_rb"] = c["rb_new"] = None
            snap = {k: c[k] for k in ROLLBACK_KEYS if k in c}
            try:
                if wav is not None:
                    user_text = await stt(wav, c["language"], call_id, c["set"])
                text, acts = await handle_text(c, user_text)
            except BaseException:
                del c["messages"][n0:]  # failed turn leaves no half-finished history
                c["pending_rb"] = c["rb_new"] = c["rb_active"] = None
                for k in ROLLBACK_KEYS:  # approval bookkeeping goes back to where it was before the failed turn
                    if k in snap:
                        c[k] = snap[k]
                    else:
                        c.pop(k, None)
                raise
            c["ts"] = time.time()
            if not (text or "").strip() and not c["ended"]:  # the model sometimes returns nothing: never answer with silence
                text = REPROMPT.get(c["language"], REPROMPT["hinglish"])
            text = redact_agent(text, c.get("refs"))
            aud = tts_defer(c, text, text in REPROMPT.values()) if text and want_tts and stream else {}
            audio = await tts(text, c["language"], call_id, c["set"]) if text and want_tts and not stream else ""
            if c.get("rb_new") and (audio or aud or not want_tts):  # a read-back counts as heard only once it was delivered
                c["pending_rb"], c["rb_turn"] = c["rb_new"], c["turn"]
            c["rb_new"] = c["rb_active"] = None
            timings = finish_timings(tm, t_start, c["llm"], c["model"])
            log.info("call=%s turn=%d timings=%s", call_id, c["turn"], json.dumps(timings))
            return reply(c, text, acts, audio, user_text=redact(user_text), timings=timings, **aud)

    @app.post("/calls/{call_id}/turn")
    async def turn(call_id: str, request: Request, tts_q: bool = Query(True, alias="tts"), stream_q: bool = Query(False, alias="stream")):
        c = calls.get(call_id)
        if c and time.time() - c["ts"] > TTL_S:
            calls.pop(call_id, None)
            c = None
        if not c:
            raise HTTPException(404, "unknown call")
        raw = await read_body(request)
        ctype = request.headers.get("content-type", "")
        want_tts, stream = tts_q, stream_q
        wav = user_text = None
        if ctype.startswith("multipart/"):
            wav = parse_audio(ctype, raw)
            if not wav:
                raise HTTPException(422, "missing audio")
            field = parse_field(ctype, raw, "tts")
            want_tts = tts_q and (field is None or field.strip().lower() not in ("false", "0"))
        else:
            body = json_body(request, raw)
            if not isinstance(body.get("text"), str):
                raise HTTPException(422, "expected audio or text")
            user_text, want_tts = body["text"].strip(), tts_q and body.get("tts") is not False
            stream = stream or body.get("stream") is True
        return await do_turn(c, wav, user_text, want_tts, stream)

    if cfg.dev:  # developer lab: not registered at all when off, so every /dev/* route is a plain 404
        jobs: dict[str, dict] = {}
        bench_lock = asyncio.Lock()

        def providers_info() -> dict:
            return {p: {"ready": p == "ollama" or bool(cfg.llm_key(p)), "default_model": cfg.llm_model(p), "models": m}
                    for p, m in (("ollama", None), ("gemini", ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"]),
                                 ("sarvam", ["sarvam-105b-conversations", "sarvam-105b"]))}

        @app.get("/dev/config")
        async def dev_config():
            info = providers_info()
            info["ollama"]["models"] = await ollama_models()
            return {"dev": True, "knobs": KNOBS, "providers": info, "presets": PRESETS, "scripts": SCRIPTS}

        @app.post("/dev/warmup")
        async def dev_warmup(request: Request):
            body = json_body(request, await read_body(request))
            provider, model, sett = await resolve_opts({k: body.get(k) for k in ("llm", "model") if body.get(k)})
            c = {"id": "warmup", "llm": provider, "model": model, "set": sett,
                 "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": "(warm-up)"}]}
            t0 = time.perf_counter()
            await llm(c)
            return {"ok": True, "provider": provider, "model": model, "llm_ms": round((time.perf_counter() - t0) * 1000)}

        async def run_job(job: dict, specs: list[dict], script: list[str], repeat: int, want_tts: bool) -> None:
            try:
                async with bench_lock:  # one turn at a time overall: numbers stay comparable
                    for spec, run in zip(specs, job["runs"]):
                        for rep_ in range(1, repeat + 1):
                            c = None
                            try:
                                opened = await open_call(spec["llm"], spec["model"], spec["settings"], want_tts)
                                c = calls.get(opened["call_id"])
                            except Exception as e:  # noqa: BLE001
                                err = f"{type(e).__name__}: {getattr(e, 'detail', '')}"[:80]
                            for idx, line in enumerate(script):
                                t = {"rep": rep_, "index": idx, "actions": [], "ok": False}
                                try:
                                    if c is None:
                                        raise RuntimeError(err)
                                    r = await do_turn(c, None, line, want_tts)
                                    t.update(actions=[a["name"] for a in r["actions"]], timings=r["timings"],
                                             ok=all(a["ok"] for a in r["actions"]))
                                except Exception as e:  # noqa: BLE001 - a failed turn is recorded, the run goes on
                                    t["error"] = f"{type(e).__name__}: {getattr(e, 'detail', e)}"[:80]
                                run["turns"].append(t)
                                job["done_turns"] += 1
                            if c is not None and not c["ended"]:
                                with contextlib.suppress(Exception):
                                    await gateway(c["id"], "end_call", {"language": c["language"], "outcome": "completed"})
                            if c is not None:
                                calls.pop(c["id"], None)
                        run["summary"] = summarize(run["turns"])
                job["status"] = "done"
            except Exception as e:  # noqa: BLE001
                job["status"], job["error"] = "error", type(e).__name__

        @app.post("/dev/bench")
        async def dev_bench(request: Request):
            body = json_body(request, await read_body(request))
            now = time.time()
            for k in [k for k, v in jobs.items() if now - v["ts"] > 3600]:
                del jobs[k]
            cfgs, script, repeat = body.get("configs"), body.get("script"), body.get("repeat", 1)
            if not isinstance(cfgs, list) or not 1 <= len(cfgs) <= 4:
                raise HTTPException(422, "configs: 1 to 4 entries")
            if (not isinstance(script, list) or not 1 <= len(script) <= 12
                    or not all(isinstance(x, str) and 1 <= len(x) <= 300 for x in script)):
                raise HTTPException(422, "script: 1 to 12 lines of at most 300 characters")
            if not isinstance(repeat, int) or isinstance(repeat, bool) or not 1 <= repeat <= 3:
                raise HTTPException(422, "repeat: 1 to 3")
            if not isinstance(body.get("tts", False), bool) or not isinstance(body.get("customer", ""), str):
                raise HTTPException(422, "tts must be a boolean and customer a string")
            specs = []
            for i, cf in enumerate(cfgs):
                if not isinstance(cf, dict):
                    raise HTTPException(422, f"configs[{i}]: expected an object")
                provider, model, sett = await resolve_opts(cf)
                specs.append({"llm": provider, "model": model, "settings": sett, "name": str(cf.get("name") or f"config {i + 1}")[:60]})
            if sum(1 for j in jobs.values() if j["status"] == "running") >= 2:
                raise HTTPException(429, "too many running bench jobs")
            jid = uuid.uuid4().hex[:12]
            job = {"ts": now, "status": "running", "done_turns": 0, "total_turns": len(specs) * repeat * len(script),
                   "runs": [{"name": s_["name"], "llm": s_["llm"], "model": s_["model"], "settings": s_["settings"],
                             "turns": [], "summary": summarize([])} for s_ in specs]}
            jobs[jid] = job
            job["task"] = asyncio.create_task(run_job(job, specs, script, repeat, body.get("tts", False)))
            return {"job_id": jid}

        @app.get("/dev/bench/{job_id}")
        async def dev_bench_get(job_id: str):
            job = jobs.get(job_id)
            if not job or time.time() - job["ts"] > 3600:
                raise HTTPException(404, "unknown job")
            return {k: v for k, v in job.items() if k not in ("ts", "task")}

    return app


app = create_app()


