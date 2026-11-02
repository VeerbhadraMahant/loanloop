import json
import logging

import pytest
from sqlalchemy import select, text

from app import sessions
from app.contract import ActionResponse
from app.db.crypto import decrypt, encrypt
from app.db.models import AuditLog, Call
from app.db.session import SessionLocal
from app.logging import RedactFilter, redact
from app.security import mask
from app.security.scrub import find_secret
from app.security.tiers import TIER_FOR_ACTION
from app.speak import t
from app.speak.format import fmt_date, rupees
from tests.conftest import call


# ---- auth / contract ----
async def test_auth_missing_and_wrong_secret(client):
    r = await client.post("/actions/start_call", json={"call_id": "a"})
    assert r.status_code == 401
    r = await client.post("/actions/start_call", json={"call_id": "a"}, headers={"X-Gateway-Secret": "nope"})
    assert r.status_code == 401


async def test_dashboard_auth(client):
    assert (await client.get("/events/stream")).status_code == 401
    assert (await client.get("/events/stream", headers={"Authorization": "Bearer x"})).status_code == 401


async def test_contract_shape(client):
    r = await call(client, "start_call")
    ActionResponse.model_validate(r)
    assert set(r) == {"ok", "speak", "data", "next", "error_code"} and r["ok"]


@pytest.mark.parametrize("body", [
    {"call_id": "c1", "bogus": 1},
    {"call_id": "c1; DROP TABLE x"},
    {"call_id": "x" * 65},
    {"call_id": "c1", "caller_number": "9" * 5000},
    {"call_id": "c1", "language": "klingon"},
])
async def test_invalid_input(client, body):
    r = await client.post("/actions/start_call", json=body, headers={"X-Gateway-Secret": "test-secret"})
    assert r.status_code == 200 and r.json()["error_code"] == "INVALID_INPUT" and not r.json()["ok"]


async def test_invalid_json_body(client):
    r = await client.post("/actions/start_call", content=b"{nope", headers={"X-Gateway-Secret": "test-secret"})
    assert r.json()["error_code"] == "INVALID_INPUT"


# ---- scrub ----
@pytest.mark.parametrize("name,val", [
    ("x", "my password is hunter2"), ("x", "mera password abc123 hai"), ("x", "मेरा पासवर्ड 4821 है"),
    ("x", "ओटीपी 483921"), ("x", "माझा पिन 1234"), ("x", "my mpin is 4321"), ("x", "the OTP is 123456"),
    ("x", "one time password 991122"), ("x", "cvv 123"), ("x", "4111 1111 1111 1111"),
    ("x", "card 5500-0000-0000-0004"), ("otp", "483921"), ("pin", "1234"),
])
def test_scrub_positive(name, val):
    assert find_secret(name, val)


@pytest.mark.parametrize("name,val", [
    ("registered_mobile", "9000014417"), ("dob", "1991-08-14"), ("dob", "14 August 1991"),
    ("loan_last4", "7391"), ("utr", "SAHYR61004738291"), ("utr", "308812345671"), ("amount", "32055"),
    ("ifsc", "SAHY0000101"), ("branch", "Kothrud"), ("value", "4111 1111 1111 1112"),  # Luhn-invalid
    ("new_day", "12"), ("date", "2026-10-04"),
])
def test_scrub_negative(name, val):
    assert find_secret(name, val) is None


# ---- mask ----
def test_mask_and_no_leak(priya):
    assert mask.mask_mobile(priya.registered_mobile) == "ending 4417"
    assert mask.mask_email("priya@example.com") == "p***@example.com"
    assert mask.mask_account("0417") == "ending 0417" and mask.mask_loan("7391") == "ending 7391"
    assert priya.customer_id not in mask.mask_customer_id(priya.customer_id)
    mask.assert_no_leak("Your number ending 4417 and p***@example.com", priya)
    with pytest.raises(AssertionError):
        mask.assert_no_leak(f"call {priya.registered_mobile}", priya)


# ---- logging filter ----
def test_logging_filter(caplog):
    s = redact("mobile 9000014417 acct 50010344120417 mail a.b@example.com card 4111 1111 1111 1111")
    for bad in ("9000014417", "50010344120417", "a.b@example.com", "4111"):
        assert bad not in s
    rec = logging.LogRecord("x", logging.INFO, "f", 1, "m %s", ("9000014417",), None)
    RedactFilter().filter(rec)
    assert "9000014417" not in rec.getMessage()


# ---- crypto / speak ----
def test_crypto_roundtrip():
    assert decrypt(encrypt("123456789012")) == "123456789012" and "1234" not in encrypt("1234")


def test_speak():
    assert rupees(250000) == "₹2,50,000" and rupees(4312.5) == "₹4,312.50" and rupees(999) == "₹999"
    from datetime import date
    assert fmt_date(date(2026, 11, 5)) == "5 November 2026"
    assert "पासवर्ड" in t("secret_warning", "hi") and "password" in t("secret_warning", "hinglish")
    assert t("secret_warning", "xx") == t("secret_warning", "en")
    assert t("nonexistent_key", "en") == t("generic_error", "en")


def test_tiers_cover_spec_actions():
    for a in "start_call verify_caller request_app_approval check_approval branch_lookup validate_ifsc get_masked_profile "\
             "send_details_sms password_reset_help report_secret_spoken emi_info explain_emi_change check_payment confirm_readback "\
             "emi_date_change foreclosure_quote raise_closure request_document update_nominee update_address report_hardship handover end_call".split():
        assert a in TIER_FOR_ACTION


# ---- call lifecycle ----
async def test_start_call_matching_number_keeps_tier0(client, priya):
    r = await call(client, "start_call", caller_number="+91 9000014417")
    assert r["ok"] and r["data"]["matched_caller"]
    s = await sessions.get("call1")
    assert s.tier == 0 and s.customer_id is None and s.prefetched_customer_id == priya.id
    async with SessionLocal() as db:
        assert (await db.get(Call, "call1")).ended_at is None


async def test_runner_language_updates_each_call(client):
    await call(client, "start_call", language="hinglish")
    await call(client, "confirm_readback", language="mr", field="new_day", value="12")
    assert (await sessions.get("call1")).language == "mr"


async def test_confirm_readback_and_helpers(client):
    await call(client, "start_call")
    r = await call(client, "confirm_readback", field="utr", value="SAHYR61004738291")
    assert r["ok"]
    s = await sessions.get("call1")
    assert s.has_readback("utr") and s.has_readback("utr", "SAHYR61004738291") and not s.has_readback("amount")
    assert s.consume_readback("utr") == "SAHYR61004738291" and not s.has_readback("utr")


async def test_report_secret_spoken(client):
    await call(client, "start_call")
    r = await call(client, "report_secret_spoken", secret_type="password")
    assert r["ok"] and r["error_code"] is None  # keyword value in secret_type must not self-trigger


async def test_end_call(client):
    await call(client, "start_call")
    r = await call(client, "end_call", outcome="completed")
    assert r["ok"] and await sessions.get("call1") is None
    async with SessionLocal() as db:
        c = await db.get(Call, "call1")
        assert c.ended_at and c.outcome == "completed"


# ---- secrets never stored ----
@pytest.mark.parametrize("field,val", [("value", "my password is Zx9qLmN7"), ("outcome", "otp 482913")])
async def test_secret_never_stored(client, field, val):
    await call(client, "start_call")
    if field == "value":
        r = await call(client, "confirm_readback", field="x_field", value=val)
    else:
        r = await call(client, "end_call", outcome=val)
    assert r["error_code"] == "SECRET_DETECTED" and not r["ok"]
    needle = val.split()[-1]
    async with SessionLocal() as db:
        dump = json.dumps([[str(v) for v in row] for row in (await db.execute(text("select * from audit_log"))).all()])
        assert needle not in dump
        ev = await sessions.redis.xrange("ll:events")
        assert needle not in json.dumps(ev)
        rows = (await db.execute(select(AuditLog).where(AuditLog.error_code == "SECRET_DETECTED"))).scalars().all()
        assert rows and rows[-1].flags["field"] in ("value", "outcome")
    keys = await sessions.redis.keys("*")
    for k in keys:
        if k.startswith("ll:events"):
            continue
        assert needle not in str(await sessions.redis.get(k))
    s = await sessions.get("call1")
    assert s is not None and needle not in s.model_dump_json()  # SECRET_DETECTED must not end the session


async def test_secret_in_unknown_extra_field(client):
    r = await client.post("/actions/start_call", json={"call_id": "c9", "note": "OTP 123456"}, headers={"X-Gateway-Secret": "test-secret"})
    assert r.json()["error_code"] == "SECRET_DETECTED"


# ---- tiers ----
async def test_tier0_blocked_for_tier1_action_via_stub(client, make_session):
    # stubs register no routes yet; exercise the runner with a dummy action registered at test time
    from fastapi import APIRouter
    from app.contract import ActionIn
    from app.main import app
    from app.routes.actions._runner import action
    r = APIRouter(prefix="/actions")

    @action("dummy_tier1", In=ActionIn, router=r)
    async def dummy_tier1(inp, session, db, bg):
        return ActionResponse(ok=True, speak="x")

    app.include_router(r)
    from app.security.tiers import TIER_FOR_ACTION as T
    T["dummy_tier1"] = 1
    await call(client, "start_call", call_id="tt")
    resp = await call(client, "dummy_tier1", call_id="tt")
    assert resp["error_code"] == "NOT_VERIFIED" and resp["next"] == "need_tier_1"
    await make_session(call_id="t1", tier=1)
    assert (await call(client, "dummy_tier1", call_id="t1"))["ok"]
    T["dummy_tier1"] = 2
    try:
        resp = await call(client, "dummy_tier1", call_id="t1")
        assert resp["error_code"] == "TIER_TOO_LOW" and resp["next"] == "need_tier_2"
    finally:
        T.pop("dummy_tier1")


async def test_missing_session_not_verified(client):
    r = await call(client, "confirm_readback", call_id="ghost", field="a", value="b")
    assert r["error_code"] == "NOT_VERIFIED"


async def test_audit_written_for_actions(client):
    await call(client, "start_call", call_id="aud1")
    async with SessionLocal() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.call_id == "aud1"))).scalars().all()
        assert rows and rows[0].action == "start_call" and rows[0].latency_ms >= 0
