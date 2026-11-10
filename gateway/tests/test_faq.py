import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.db.models import SmsOutbox
from app.db.session import SessionLocal
from app.routes.actions import faq
from tests.conftest import call

FAQ = {"version": 1, "intents": [
    {"id": "open_account", "sms": True,
     "keywords": {"en": ["open account", "new account"], "hi": ["खाता खोल"], "hinglish": ["account kholna"], "mr": ["खाते उघड"]},
     "answer": {"en": "Visit a branch with ID proof.", "hi": "शाखा में जाएं।", "hinglish": "Branch mein jaiye.", "mr": "शाखेत जा."},
     "sms_text": {"en": "Steps: ID proof, address proof, photo.", "hi": "चरण: पहचान", "hinglish": "Steps: ID", "mr": "पायऱ्या: ओळख"}},
    {"id": "branch_hours", "sms": False,
     "keywords": {"en": ["branch hours", "timing"], "hi": [], "hinglish": [], "mr": []},
     "answer": {"en": "Ten to four.", "hi": "दस से चार।", "hinglish": "Das se chaar.", "mr": "दहा ते चार."},
     "sms_text": {"en": "", "hi": "", "hinglish": "", "mr": ""}},
]}


@pytest.fixture(autouse=True)
def faq_file(tmp_path, monkeypatch):
    p = tmp_path / "faq.json"
    p.write_text(json.dumps(FAQ, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(faq, "FAQ_PATH", p)
    monkeypatch.setitem(faq._cache, "mtime", None)
    monkeypatch.setitem(faq._cache, "intents", {})  # both restored after the test, so the real file reloads next time
    return p


async def test_topic_tier0_and_languages(client):
    await call(client, "start_call")
    r = await call(client, "faq_lookup", topic="branch_hours")
    assert r["ok"] and r["speak"] == "Ten to four." and r["data"] == {"topic": "branch_hours", "sms_sent": False}
    assert (await call(client, "faq_lookup", topic="branch_hours", language="mr"))["speak"] == "दहा ते चार."


async def test_unknown_topic_and_missing_input(client):
    await call(client, "start_call")
    r = await call(client, "faq_lookup", topic="no_such_intent")
    assert not r["ok"] and r["error_code"] == "FAQ_NOT_FOUND"
    r = await call(client, "faq_lookup", query="completely unrelated words")
    assert r["error_code"] == "FAQ_NOT_FOUND"
    assert (await call(client, "faq_lookup"))["error_code"] == "INVALID_INPUT"
    assert (await call(client, "faq_lookup", topic="Bad Topic!"))["error_code"] == "INVALID_INPUT"


async def test_query_keyword_match_all_languages(client):
    await call(client, "start_call")
    for lang, q in (("en", "I want to open account please"), ("hi", "मुझे खाता खोलना है"), ("hinglish", "account kholna hai"), ("mr", "मला खाते उघडायचे आहे")):
        r = await call(client, "faq_lookup", query=q, language=lang)
        assert r["ok"] and r["data"]["topic"] == "open_account", lang
    assert (await call(client, "faq_lookup", query="what are your branch hours"))["data"]["topic"] == "branch_hours"


async def test_sms_offer_when_unverified(client):
    await call(client, "start_call")
    r = await call(client, "faq_lookup", topic="open_account")
    assert r["ok"] and r["speak"].endswith("Once you verify, I can send this by SMS.") and not r["data"]["sms_sent"]


async def test_sms_sent_when_verified(client, mk_session, priya):
    await mk_session(priya.id)
    async with SessionLocal() as db:
        before = len((await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == priya.id))).scalars().all())
    r = await call(client, "faq_lookup", topic="open_account")
    assert r["data"]["sms_sent"] and "I have also sent this to your number ending 44 17" in r["speak"]
    async with SessionLocal() as db:
        rows = (await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == priya.id).order_by(SmsOutbox.id))).scalars().all()
    assert len(rows) == before + 1 and rows[-1].to_mobile == priya.registered_mobile and "ID proof, address proof" in rows[-1].body
    r = await call(client, "faq_lookup", topic="branch_hours")  # sms: false -> nothing queued
    async with SessionLocal() as db:
        assert len((await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == priya.id))).scalars().all()) == before + 1


async def test_reloads_when_file_changes(client, faq_file):
    await call(client, "start_call")
    assert (await call(client, "faq_lookup", topic="branch_hours"))["speak"] == "Ten to four."
    FAQ2 = json.loads(json.dumps(FAQ))
    FAQ2["intents"][1]["answer"]["en"] = "Nine to five."
    faq_file.write_text(json.dumps(FAQ2), encoding="utf-8")
    import os
    os.utime(faq_file, (1, faq_file.stat().st_mtime + 5))
    assert (await call(client, "faq_lookup", topic="branch_hours"))["speak"] == "Nine to five."


async def test_missing_language_answer_falls_back_to_english(client, faq_file):
    only_en = {"version": 1, "intents": [{"id": "x_topic", "sms": False, "keywords": {"en": ["xtopic"]}, "answer": {"en": "English only."}}]}
    faq_file.write_text(json.dumps(only_en), encoding="utf-8")
    await call(client, "start_call")
    r = await call(client, "faq_lookup", topic="x_topic", language="mr")
    assert r["ok"] and r["speak"] == "English only."


def test_shipped_faq_has_all_core_languages_and_sms_text():
    real = json.loads((Path(__file__).resolve().parents[1] / "app" / "data" / "faq.json").read_text(encoding="utf-8"))
    ids = [i["id"] for i in real["intents"]]
    assert len(ids) == len(set(ids))
    for it in real["intents"]:
        for lang in ("en", "hi", "hinglish", "mr"):
            assert it["answer"].get(lang, "").strip(), (it["id"], "answer", lang)
            assert it["keywords"].get(lang), (it["id"], "keywords", lang)
            if it["sms"]:
                assert it.get("sms_text", {}).get(lang, "").strip(), (it["id"], "sms_text", lang)
