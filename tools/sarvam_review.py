"""Second machine reviewer for the caller-facing wording of the 7 beta languages, using Sarvam's OpenAI-compatible chat endpoint.
Run: python tools/sarvam_review.py [codes...] [--out DIR] [--batch N]   (default: all 7; key from env or repo-root .env.local; never printed)
Writes docs/i18n-review/sarvam-<code>.md and <DIR>/<code>.json (machine verdicts). It only reports; applying fixes is a human step."""
import argparse
import asyncio
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from string import Formatter

import httpx

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "i18n" / "source"
CODES = ["bn", "gu", "kn", "ml", "pa", "ta", "te"]
NAMES = {"bn": "Bengali", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "ta": "Tamil", "te": "Telugu"}
ISSUES = ("meaning", "grammar", "unnatural", "register", "placeholder", "script", "english_left")
MAX_REQUESTS = 150
MONTHS_EN = "January February March April May June July August September October November December".split()


def setting(name: str, default: str = "") -> str:
    """Same lookup as voice/app.py Settings: environment first, then repo-root .env.local (name matched case-insensitively)."""
    if os.environ.get(name):
        return os.environ[name]
    try:
        for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            if k.strip().lower() == name.lower():
                return v.strip().strip("\"'")
    except OSError:
        pass
    return default


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def items_for(code: str) -> list[dict]:
    """[{key, en, text}] for every caller-facing string except word lists."""
    d, gs, fs, vs = load(ROOT / "i18n" / f"{code}.json"), load(SRC / "gateway_templates.json"), load(SRC / "faq.json"), load(SRC / "voice_reference.json")
    out = [{"key": f"gateway.{k}", "en": v["en"], "text": d["gateway"][k]} for k, v in gs.items() if k in d["gateway"]]
    v = d["voice"]
    for k in ("REPROMPT", "LANG_OK", "CUSTOMER_Q", "SAFE"):
        out.append({"key": f"voice.{k}", "en": vs[k]["en"], "text": v[k]})
    out.append({"key": "voice.ASK.0", "en": vs["ASK"]["en"][0], "text": v["ASK"][0]})
    out += [{"key": f"voice.FIELD_LABEL.{k}", "en": en, "text": v["FIELD_LABEL"][k]} for k, en in vs["FIELD_LABEL"]["en"].items() if k in v["FIELD_LABEL"]]
    for k, s in fs.items():
        f = d["faq"].get(k)
        if not f:
            continue
        out.append({"key": f"faq.{k}.answer", "en": s["answer_en"], "text": f["answer"]})
        if f.get("sms_text"):
            out.append({"key": f"faq.{k}.sms_text", "en": s["sms_text_en"], "text": f["sms_text"]})
    out.append({"key": "months", "en": ", ".join(MONTHS_EN), "text": ", ".join(d["months"])})
    return out


PROMPT = """You are a native {lang} speaker and a banking call-centre language reviewer. Below are phone-banking lines an AI voice agent SPEAKS to bank customers in {lang}. Each has an English source and the {lang} translation.
Judge ONLY whether the {lang} would sound correct and natural when spoken aloud on a phone call. Be strict about real errors, silent about taste.
Issue codes: meaning (differs from English: wrong, missing or added facts), grammar, unnatural (a native speaker would not say it), register (rude, over-formal or colloquial for a polite bank), placeholder (a {{placeholder}} changed, translated, dropped or added), script (wrong script or garbled characters), english_left (untranslated English that has a normal {lang} word; accepted loanwords such as EMI, SMS, OTP, UPI, IFSC, app, KYC are fine).
Rules: spoken, polite, short phone-banking register is the goal. Every {{placeholder}} must stay exactly as in English; amounts, dates, names and numbers are inserted later, so do not flag them. Do NOT flag style preferences, synonyms, or word-order choices that are fine. If a line is acceptable, ok=true.
Reply with ONLY a JSON array, one object per item, same order, no prose, no code fences:
[{{"key": "<key>", "ok": true|false, "issue": "<one issue code or empty>", "back_translation": "<English back-translation of the {lang}>", "suggestion": "<corrected {lang} line keeping all placeholders, or empty if ok>"}}]
Items:
{items}"""


def _fields(s: str) -> set:
    try:
        return {f for _, f, _, _ in Formatter().parse(s) if f is not None}
    except ValueError:
        return set()


def parse(raw: str, keys: list[str]) -> list[dict] | None:
    raw = re.sub(r"<think>.*?</think>", "", raw or "", flags=re.S).strip()
    m = re.search(r"\[.*\]", raw, flags=re.S)
    try:
        arr = json.loads(m.group(0)) if m else None
    except ValueError:
        return None
    if not isinstance(arr, list):
        return None
    by = {a.get("key"): a for a in arr if isinstance(a, dict)}
    return [by[k] for k in keys] if all(k in by for k in keys) else None


class Reviewer:
    def __init__(self):
        self.key, self.model, self.base = setting("SARVAM_API_KEY"), setting("SARVAM_MODEL", "sarvam-105b-conversations"), setting("SARVAM_BASE_URL", "https://api.sarvam.ai/v1")
        if not self.key:
            sys.exit("SARVAM_API_KEY not set (environment or repo-root .env.local)")
        self.n, self.last = 0, 0.0
        self.http = httpx.AsyncClient(timeout=120)

    async def ask(self, prompt: str) -> str:
        if self.n >= MAX_REQUESTS:
            raise RuntimeError(f"request cap {MAX_REQUESTS} reached")
        wait = 1.0 - (asyncio.get_event_loop().time() - self.last)  # ~1 request/s
        if wait > 0:
            await asyncio.sleep(wait)
        self.last, self.n = asyncio.get_event_loop().time(), self.n + 1
        body = {"model": self.model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 8000,
                "stream": False, "reasoning_effort": None}  # thinking off, as voice/providers.py does for sarvam
        r = await self.http.post(self.base.rstrip("/") + "/chat/completions", json=body,
                                 headers={"Authorization": f"Bearer {self.key}", "api-subscription-key": self.key, "Content-Type": "application/json"})
        r.raise_for_status()
        return r.json()["choices"][0]["message"].get("content") or ""

    async def batch(self, code: str, items: list[dict]) -> list[dict]:
        keys = [i["key"] for i in items]
        body = json.dumps([{"key": i["key"], "english": i["en"], code: i["text"]} for i in items], ensure_ascii=False, indent=1)
        prompt = PROMPT.format(lang=NAMES[code], items=body)
        for attempt in (0, 1):  # one retry on bad JSON or a transient HTTP error
            try:
                res = parse(await self.ask(prompt), keys)
            except (httpx.HTTPError, KeyError, ValueError) as e:
                print(f"  {code}: request failed ({type(e).__name__}), attempt {attempt + 1}", file=sys.stderr)
                res = None
            if res:
                return res
        return [{"key": k, "ok": None, "issue": "review_failed"} for k in keys]


def verdicts(items: list[dict], res: list[dict]) -> list[dict]:
    out = []
    for it, r in zip(items, res):
        ok = r.get("ok")
        issue = (r.get("issue") or "").strip().lower()
        sug = (r.get("suggestion") or "").strip()
        if ok is False and issue not in ISSUES:
            issue = "other"
        out.append({**it, "ok": ok, "issue": issue, "back_translation": r.get("back_translation", ""), "suggestion": sug,
                    "suggestion_placeholders_ok": _fields(sug) == _fields(it["en"]) if sug else None})
    return out


def esc(s: str) -> str:
    return (s or "").replace("|", "\\|").replace("\n", " ")


def report(code: str, vs: list[dict]) -> str:
    flagged = [v for v in vs if v["ok"] is False]
    failed = [v for v in vs if v["ok"] is None]
    c = Counter(v["issue"] for v in flagged)
    lines = [f"# Sarvam review: {NAMES[code]} ({code})", "",
             f"Reviewed {len(vs)} caller-facing strings (gateway, voice, faq answers and SMS texts, months) with a Sarvam model. "
             f"Flagged {len(flagged)}; {len(failed)} not reviewed (bad model output). Machine reviewer: a second opinion, not ground truth.", "",
             "| issue | count |", "|---|---|"] + [f"| {k} | {n} |" for k, n in c.most_common()]
    if flagged:
        lines += ["", "| key | issue | back-translation | current | suggestion |", "|---|---|---|---|---|"]
        lines += [f"| {v['key']} | {v['issue']} | {esc(v['back_translation'])} | {esc(v['text'])} | {esc(v['suggestion'])} |" for v in flagged]
    if failed:
        lines += ["", "Not reviewed: " + ", ".join(v["key"] for v in failed)]
    return "\n".join(lines) + "\n"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codes", nargs="*", default=CODES)
    ap.add_argument("--out", default=str(ROOT / "tools" / "out" / "sarvam_review"))
    ap.add_argument("--batch", type=int, default=20)
    a = ap.parse_args()
    rv, out = Reviewer(), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (ROOT / "docs" / "i18n-review").mkdir(parents=True, exist_ok=True)
    for code in a.codes:
        items = items_for(code)
        n = -(-len(items) // a.batch)
        size = -(-len(items) // n)  # even batches
        res = []
        for i in range(0, len(items), size):
            res += await rv.batch(code, items[i:i + size])
        vs = verdicts(items, res)
        (out / f"{code}.json").write_text(json.dumps(vs, ensure_ascii=False, indent=1), encoding="utf-8")
        (ROOT / "docs" / "i18n-review" / f"sarvam-{code}.md").write_text(report(code, vs), encoding="utf-8", newline="\n")
        print(code, "items", len(vs), "flagged", sum(v["ok"] is False for v in vs), "failed", sum(v["ok"] is None for v in vs), "requests so far", rv.n)
    await rv.http.aclose()
    print("requests", rv.n)


if __name__ == "__main__":
    asyncio.run(main())
