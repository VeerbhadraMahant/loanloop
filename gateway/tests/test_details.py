import json

import pytest
from sqlalchemy import select

from app import sessions
from app.db.crypto import decrypt
from app.db.models import Account, AuditLog, SmsOutbox
from app.db.session import SessionLocal
from app.security.mask import assert_no_leak
from tests.conftest import call


async def test_branch_lookup_fuzzy_tier0(client):
    await call(client, "start_call")
    r = await call(client, "branch_lookup", query="kothrud")
    assert r["ok"] and r["data"]["ifsc"].startswith("SAHY0") and "S A H Y zero" in r["speak"] and "MICR" in r["speak"]
    r = await call(client, "branch_lookup", query="Kothrod")  # typo
    assert r["ok"] and "Kothrud" in r["speak"]
    r = await call(client, "branch_lookup", query="zzzzqqq")
    assert r["error_code"] == "NOT_FOUND"


async def test_validate_ifsc(client):
    await call(client, "start_call")
    r = await call(client, "validate_ifsc", ifsc="sahy0000101")
    assert r["ok"] and r["data"]["sahyadri"] and "Kothrud" in r["speak"]
    r = await call(client, "validate_ifsc", ifsc="HDFC0001234")
    assert r["ok"] and not r["data"]["sahyadri"] and "not a Sahyadri branch" in r["speak"]
    assert (await call(client, "validate_ifsc", ifsc="BAD123"))["error_code"] == "INVALID_INPUT"
    assert (await call(client, "validate_ifsc", ifsc="SAHY0999999"))["error_code"] == "NOT_FOUND"


async def test_password_reset_help(client):
    await call(client, "start_call")
    for ch in ("app", "netbanking"):
        r = await call(client, "password_reset_help", channel=ch, language="hinglish")
        assert r["ok"] and "OTP" in r["speak"]
    assert (await call(client, "password_reset_help", channel="sms"))["error_code"] == "INVALID_INPUT"


@pytest.mark.parametrize("lang", ["en", "hi", "hinglish", "mr"])
async def test_masked_profile_all_langs(client, make_session, priya, lang):
    await make_session(language=lang)
    r = await call(client, "get_masked_profile", language=lang,
                   fields=["mobile", "email", "account", "loan", "customer_id", "ifsc", "branch"])
    assert r["ok"]
    sp = r["speak"].replace(" ", "")
    assert "4417" in sp and "0417" in sp and "7391" in sp and "p***@example.com" in r["speak"]
    assert_no_leak(r["speak"] + json.dumps(r["data"]), priya)


async def test_tier_enforcement(client):
    await call(client, "start_call")
    for a, kw in (("get_masked_profile", {"fields": ["mobile"]}), ("send_details_sms", {"fields": ["ifsc"]})):
        r = await call(client, a, **kw)
        assert r["error_code"] == "NOT_VERIFIED"


async def test_send_details_sms(client, make_session, priya):
    await make_session()
    async with SessionLocal() as db:
        n0 = len((await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == priya.id))).all())
        acct = (await db.execute(select(Account).where(Account.customer_id == priya.id))).scalars().first()
        full = decrypt(acct.account_number)
    r = await call(client, "send_details_sms", fields=["account_number", "ifsc", "customer_id", "branch_address"])
    assert r["ok"] and "ending 44 17" in r["speak"]
    blob = json.dumps(r) + str(await sessions.redis.xrange("ll:events"))
    assert full not in blob and priya.customer_id not in blob and priya.registered_mobile not in blob
    assert_no_leak(json.dumps(r), priya)
    async with SessionLocal() as db:
        rows = (await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == priya.id).order_by(SmsOutbox.id))).scalars().all()
        assert len(rows) == n0 + 1
        last = rows[-1]
        assert last.to_mobile == priya.registered_mobile
        assert full in last.body and priya.customer_id in last.body and "SAHY0" in last.body
        audit = json.dumps([[str(a.action), str(a.flags), str(a.error_code)] for a in
                            (await db.execute(select(AuditLog).where(AuditLog.call_id == "call1"))).scalars()])
        assert full not in audit and priya.customer_id not in audit


async def test_send_details_sms_invalid_input(client, make_session):
    await make_session()
    assert (await call(client, "send_details_sms", fields=["bogus"]))["error_code"] == "INVALID_INPUT"
    assert (await call(client, "send_details_sms", fields=[]))["error_code"] == "INVALID_INPUT"
    assert (await call(client, "send_details_sms", fields=["ifsc"], to_mobile="9999999999"))["error_code"] == "INVALID_INPUT"
