"""Dump the English (and Hindi reference) source text that translators work from into i18n/source/.
Run: cd gateway && uv run python ../tools/i18n_export.py"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "gateway"), str(ROOT)]
out = ROOT / "i18n" / "source"
out.mkdir(parents=True, exist_ok=True)

from app.speak import _REG  # noqa: E402

json.dump({k: {"en": v["en"], "hi": v.get("hi", "")} for k, v in sorted(_REG.items())},
          open(out / "gateway_templates.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

faq = json.loads((ROOT / "gateway" / "app" / "data" / "faq.json").read_text(encoding="utf-8"))
json.dump({i["id"]: {"sms": i.get("sms", False), "keywords_en": i["keywords"]["en"], "answer_en": i["answer"]["en"],
                     "sms_text_en": i.get("sms_text", {}).get("en", ""), "answer_hi": i["answer"].get("hi", "")}
           for i in faq["intents"]}, open(out / "faq.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

import voice.app as va  # noqa: E402

names = ["REPROMPT", "LANG_OK", "CUSTOMER_Q", "SAFE", "ASK", "FIELD_LABEL", "PURPOSE", "AFFIRM_WORDS", "NEGATE_WORDS",
         "BYE_WORDS", "APPROVAL_WORDS", "_LANG_WORDS", "_SWITCH_CUES", "_MONTHS_MAP", "_WEEKDAYS", "_QUESTION_WORDS",
         "_POSSESSIVE", "_ACCT_NOUNS", "_HUMAN_TARGET", "_HUMAN_VERB", "_NEG_HUMAN", "_FULL_WORDS", "_MULTI_WORDS",
         "_DATE_WORDS", "_VERIFY_WORDS"]
dump = {}
for n in names:
    v = getattr(va, n, None)
    if v is None:
        continue
    dump[n] = sorted(v) if isinstance(v, (set, frozenset)) else v
json.dump(dump, open(out / "voice_reference.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=list)
print({p.name: p.stat().st_size for p in out.iterdir()})
