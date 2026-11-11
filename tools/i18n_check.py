"""Validate every i18n/<code>.json that is present against i18n/source/ (format: i18n/README.md).
Run: python tools/i18n_check.py [i18n_dir]   (exit 1 on any problem; no files present is fine)."""
import json
import re
import sys
from pathlib import Path
from string import Formatter

ROOT = Path(__file__).resolve().parents[1]
BUILTIN = ("en", "hi", "hinglish", "mr")
LIST_WORDS = ["lang_names", "affirm", "negate", "bye", "approval", "switch_cues", "question", "possessive", "acct_nouns",
              "human_target", "human_verb", "neg_human", "full", "multi", "date", "verify", "already_paid", "action_verbs", "thanks"]
PHRASE_WORDS = ("already_paid", "date")  # matched as phrases inside a regex; every other list is compared token by token
_TOKEN = re.compile(r"[A-Za-z0-9'’]+|[ऀ-ൿ]+")  # same tokenizer as voice/app.py _TOKEN


def _fields(s: str) -> set[str]:
    return {f for _, f, _, _ in Formatter().parse(s) if f is not None}


def is_warning(problem: str) -> bool:
    """Missing faq intents only warn: faq_lookup falls back to the English answer."""
    return problem.startswith("warning:")


def _text(v) -> bool:
    return isinstance(v, str) and bool(v.strip())


def check_file(code: str, d: dict, src: dict) -> list[str]:
    """Problems in one language file (empty list = valid). `src` has gateway/faq/voice source dicts."""
    bad: list[str] = []
    if d.get("lang") != code:
        bad.append(f"lang is {d.get('lang')!r}, expected {code!r}")
    m = d.get("months")
    if not (isinstance(m, list) and len(m) == 12 and all(_text(x) for x in m)):
        bad.append("months must be 12 non-empty names")

    gw, gsrc = d.get("gateway"), src["gateway"]
    if not isinstance(gw, dict):
        bad.append("gateway section missing")
    else:
        bad += [f"gateway: missing key {k}" for k in gsrc if k not in gw]
        bad += [f"gateway: unknown key {k}" for k in gw if k not in gsrc]
        for k, en in gsrc.items():
            v = gw.get(k)
            if v is None:
                continue
            if not _text(v):
                bad.append(f"gateway.{k}: empty")
                continue
            try:
                if _fields(v) != _fields(en["en"]):
                    bad.append(f"gateway.{k}: placeholders {sorted(_fields(v))} != English {sorted(_fields(en['en']))}")
            except ValueError as e:
                bad.append(f"gateway.{k}: bad braces ({e})")

    faq, fsrc = d.get("faq"), src["faq"]
    if not isinstance(faq, dict):
        bad.append("faq section missing")
    else:
        bad += [f"warning: faq: missing intent {k} (callers get the English answer)" for k in fsrc if k not in faq]
        bad += [f"faq: unknown intent {k}" for k in faq if k not in fsrc]
        for k, s in fsrc.items():
            f = faq.get(k)
            if not isinstance(f, dict):
                continue
            kw = f.get("keywords")
            if not (isinstance(kw, list) and 3 <= len(kw) <= 20 and all(_text(x) for x in kw)):
                bad.append(f"faq.{k}: keywords must be 3-20 non-empty phrases")
            if not _text(f.get("answer")):
                bad.append(f"faq.{k}: answer empty")
            if s.get("sms") and not _text(f.get("sms_text")):
                bad.append(f"faq.{k}: sms_text required (sms is true)")

    v, vsrc = d.get("voice"), src["voice"]
    if not isinstance(v, dict):
        bad.append("voice section missing")
    else:
        bad += [f"voice.{k}: empty" for k in ("REPROMPT", "LANG_OK", "CUSTOMER_Q", "SAFE") if not _text(v.get(k))]
        a = v.get("ASK")
        if not (isinstance(a, list) and len(a) == 2 and all(_text(x) or x == " " for x in a) and "{x}" in a[0] and _fields(a[0]) == {"x"}):
            bad.append("voice.ASK must be [sentence containing {x}, joiner]")
        fl = v.get("FIELD_LABEL")
        if not isinstance(fl, dict):
            bad.append("voice.FIELD_LABEL missing")
        else:
            want = set(vsrc["FIELD_LABEL"]["en"])
            bad += [f"voice.FIELD_LABEL: missing {k}" for k in want - set(fl)]
            bad += [f"voice.FIELD_LABEL: unknown {k}" for k in set(fl) - want]
            bad += [f"voice.FIELD_LABEL.{k}: empty" for k in want & set(fl) if not _text(fl[k])]

    w = d.get("words")
    if not isinstance(w, dict):
        bad.append("words section missing")
    else:
        for k in LIST_WORDS:
            if not (isinstance(w.get(k), list) and w[k] and all(_text(x) for x in w[k])):
                bad.append(f"words.{k}: must be a non-empty list of strings")
            elif k not in PHRASE_WORDS:
                dead = [x for x in w[k] if _TOKEN.findall(x) != [x]]  # a phrase or a joiner-split word can never match a token
                if dead:
                    bad.append(f"words.{k}: entries must be single words (never matched): {dead[:3]}")
        for k, rng, n in (("month_words", range(1, 13), 12), ("weekdays", range(7), 7)):
            mw = w.get(k)
            if not (isinstance(mw, dict) and all(_text(x) and isinstance(y, int) and y in rng for x, y in mw.items())
                    and set(mw.values()) == set(rng)):
                bad.append(f"words.{k}: must map words to every value in {rng.start}-{rng.stop - 1}")
    return bad


def load_source(root: Path = ROOT) -> dict:
    s = root / "i18n" / "source"
    return {n: json.loads((s / f).read_text(encoding="utf-8"))
            for n, f in (("gateway", "gateway_templates.json"), ("faq", "faq.json"), ("voice", "voice_reference.json"))}


def check_all(i18n_dir: Path | None = None, source_root: Path = ROOT) -> dict[str, list[str]]:
    """{code: problems} for every registry language (beyond the built-in 4) whose file exists."""
    base = i18n_dir or ROOT / "i18n"
    modes = json.loads((base / "languages.json").read_text(encoding="utf-8"))["modes"]
    src, out = load_source(source_root), {}
    for m in modes:
        p = base / f"{m['code']}.json"
        if m["code"] in BUILTIN or not p.is_file():
            continue
        try:
            out[m["code"]] = check_file(m["code"], json.loads(p.read_text(encoding="utf-8")), src)
        except (ValueError, KeyError, TypeError) as e:
            out[m["code"]] = [f"unreadable: {e}"]
    return out


if __name__ == "__main__":
    res = check_all(Path(sys.argv[1]) if len(sys.argv) > 1 else None)
    for code, problems in res.items():
        errs = [p for p in problems if not is_warning(p)]
        print(f"{code}: " + ("ok" if not problems else f"{len(errs)} problem(s), {len(problems) - len(errs)} warning(s)"))
        for p in problems:
            print("  -", p)
    if not res:
        print("no language files present")
    sys.exit(1 if any(not is_warning(p) for v in res.values() for p in v) else 0)
