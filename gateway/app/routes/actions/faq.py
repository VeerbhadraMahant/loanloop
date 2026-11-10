"""faq_lookup: answers from app/data/faq.json (format in docs/V2-CONTRACT.md). Loaded lazily, reloaded when the file changes."""
import json
import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app import i18n
from app.contract import ActionIn, ActionResponse
from app.db.models import Customer
from app.routes.actions import faq_score
from app.routes.actions._runner import action
from app.sms import send_sms
from app.speak import t
from app.speak.templates.details import ending

router = APIRouter(prefix="/actions")
FAQ_PATH = Path(__file__).resolve().parents[2] / "data" / "faq.json"
_cache: dict = {"mtime": None, "intents": {}}


def _merge_lang_files(intents: dict[str, dict]) -> None:
    """Add each present i18n/<code>.json `faq` section: keywords, answer, sms_text per intent."""
    for code, d in i18n.load_lang_files().items():
        for iid, f in (d.get("faq") or {}).items():
            it = intents.get(iid)
            if it is None or not isinstance(f, dict) or not isinstance(f.get("answer"), str) or not f["answer"].strip():
                continue
            it.setdefault("keywords", {})[code] = [k for k in f.get("keywords", []) if isinstance(k, str) and k.strip()]
            it.setdefault("answer", {})[code] = f["answer"]
            if isinstance(f.get("sms_text"), str) and f["sms_text"].strip():
                it.setdefault("sms_text", {})[code] = f["sms_text"]


def load_faq() -> dict[str, dict]:
    sig = (FAQ_PATH.stat().st_mtime, tuple((c, p.stat().st_mtime) for c, p in i18n.present().items()), str(i18n.I18N_DIR))
    if _cache["mtime"] != sig:
        data = json.loads(FAQ_PATH.read_text(encoding="utf-8"))
        intents = {i["id"]: i for i in data["intents"]}
        _merge_lang_files(intents)
        _cache.update(mtime=sig, intents=intents)
    return _cache["intents"]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().replace("’", "'")).strip()  # curly apostrophe from typed/pasted text


def match(intents: dict[str, dict], query: str, lang: str) -> str | None:
    """Best intent by the weighted scorer (faq_score), any match counts: the caller (the model) already decided to look up."""
    ranked = faq_score.table_for(intents).rank(query, lang)
    return ranked[0][0] if ranked else None


class FaqIn(ActionIn):
    topic: str | None = Field(default=None, pattern=r"^[a-z0-9_]{1,60}$")
    query: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _one(self):
        if not (self.topic or self.query):
            raise ValueError("topic or query required")
        return self


@action("faq_lookup", In=FaqIn, router=router)
async def faq_lookup(inp: FaqIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    intents = load_faq()
    iid = inp.topic if inp.topic in intents else (match(intents, inp.query, lang) if inp.query else None)
    if iid is None:
        return ActionResponse(ok=False, speak=t("faq_not_found", lang), error_code="FAQ_NOT_FOUND", next="handover")
    it = intents[iid]
    speak = it["answer"].get(lang) or it["answer"]["en"]
    sms = False
    if it.get("sms"):
        if session.tier >= 1 and session.customer_id:
            c = await db.get(Customer, session.customer_id)
            body = it.get("sms_text", {}).get(lang) or it.get("sms_text", {}).get("en") or speak
            bg.add_task(send_sms, c, "Sahyadri Finance Bank: " + body, inp.call_id)  # to the registered mobile from the DB
            speak += " " + t("faq_sms_sent", lang, v=ending(c.registered_mobile[-4:], lang))
            sms = True
        else:
            speak += " " + t("faq_sms_offer", lang)
    return ActionResponse(ok=True, speak=speak, data={"topic": iid, "sms_sent": sms})
