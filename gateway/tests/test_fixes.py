"""Reviewer-finding fixes: redaction, input robustness, read-backs, auth split, config, brute force."""
import json
import logging
from datetime import timedelta

import pytest
from sqlalchemy import select

from app import sessions
from app.clock import today_ist
from app.config import DEV_DEFAULTS, Settings, check_settings
from app.db.models import Approval, AuditLog, Handover, Payment, ServiceRequest, now
from app.db.session import SessionLocal
from tests.conftest import SECRET, call

UTR = "SAHYR61004738291"
DASH = {"Authorization": "Bearer test-dash"}
PHONE = {"Authorization": "Bearer test-phone"}


async def rb(client, field, value):
    return await call(client, "confirm_readback", field=field, value=value)


# 2
async def test_report_secret_spoken_card_alias(client, make_session):
    await make_session(tier=1)
    for st in ("card", "card_number"):
        assert (await call(client, "report_secret_spoken", secret_type=st))["ok"]


# 3
async def test_handover_summary_secret_redacted_not_blocked(client, make_session):
    await make_session(tier=1)
    r = await call(client, "handover", reason="unclear", summary="she said her password is Tiger@123 on the call")
    assert r["ok"] and r["next"] == "handover"
    async with SessionLocal() as db:
        h = await db.get(Handover, r["data"]["handover_id"])
        assert "Tiger@123" not in h.summary and "[secret removed]" in h.summary
        logs = (await db.execute(select(AuditLog).where(AuditLog.call_id == "call1", AuditLog.error_code == "SECRET_DETECTED"))).scalars().all()
        assert logs and logs[0].flags == {"security": "SECRET_DETECTED", "field": "summary"}
        assert "Tiger" not in str([x.flags for x in logs])


async def test_hardship_reason_secret_redacted(client, make_session):
    await make_session(tier=1)
    r = await call(client, "report_hardship", reason="lost job, my otp is 482913")
    assert r["ok"]
    async with SessionLocal() as db:
        h = await db.get(Handover, r["data"]["handover_id"])
        assert "482913" not in h.summary


async def test_handover_reason_still_blocks(client, make_session):
    await make_session(tier=1)
    r = await call(client, "handover", reason="my password is abc", summary="fine summary")
    assert r["error_code"] == "SECRET_DETECTED"


# 4
async def test_security_view_includes_untapped_expired_approval(client, make_session):
    await make_session(tier=1)
    aid = (await call(client, "request_app_approval", purpose="attack demo"))["data"]["approval_id"]
    async with SessionLocal() as db:
        (await db.get(Approval, aid)).created_at = now() - timedelta(minutes=5)
        await db.commit()
    sec = (await client.get("/dashboard/security", headers=DASH)).json()
    assert any(e["type"] == "approval" and "expired" in e["detail"] for e in sec)
    async with SessionLocal() as db:
        assert (await db.get(Approval, aid)).status == "expired"


# 5
async def test_empty_and_template_values_are_missing(client, make_session):
    await make_session(tier=1)
    r = await call(client, "emi_date_change", new_day="{{new_day}}")
    assert r["error_code"] == "INVALID_INPUT"
    r = await call(client, "get_masked_profile", fields="")
    assert r["error_code"] == "INVALID_INPUT"
    r = await call(client, "get_masked_profile", fields="mobile, email", unused="")
    assert r["ok"]


async def test_list_field_string_coercion(client, make_session):
    await make_session(tier=1)
    assert (await call(client, "get_masked_profile", fields='["mobile","email"]'))["data"]["fields"] == ["mobile", "email"]
    assert (await call(client, "get_masked_profile", fields="mobile,email"))["data"]["fields"] == ["mobile", "email"]


# 6
async def test_check_payment_needs_amount_readback_and_ci_utr(client, make_session):
    await make_session(tier=2)
    body = dict(date=(today_ist() - timedelta(days=28)).isoformat(), amount=32055, utr=UTR)
    await rb(client, "utr", UTR)
    r = await call(client, "check_payment", **body)
    assert r["next"] == "confirm_readback" and r["data"]["fields"] == ["amount"]
    assert r["data"]["confirm"] == {"amount": "32055"}
    await rb(client, "amount", "₹32055")
    r = await call(client, "check_payment", **{**body, "utr": UTR.lower()})  # utr input case differs from confirmed
    assert r["ok"]


async def test_misstated_amount_keeps_matched_payment(client, make_session):
    await make_session(tier=2)
    async with SessionLocal() as db:
        p = (await db.execute(select(Payment).where(Payment.loan_id == 1, Payment.status == "matched"))).scalars().first()
        utr, d = p.utr, p.date
    await rb(client, "utr", utr)
    await rb(client, "amount", "1000")
    r = await call(client, "check_payment", date=d.isoformat(), amount=1000, utr=utr)
    assert r["ok"] and r["data"]["matched"] is False
    async with SessionLocal() as db:
        assert (await db.execute(select(Payment.status).where(Payment.utr == utr))).scalar_one() == "matched"
        assert (await db.execute(select(ServiceRequest).where(ServiceRequest.type == "reconciliation"))).first()


@pytest.mark.parametrize("word", ["yes", "Haan", "ho", "हाँ", "होय"])
async def test_closure_readback_words(client, make_session, word):
    await make_session(tier=2)
    r = await call(client, "raise_closure")
    assert r["data"]["confirm"] == {"closure": "yes"}
    await rb(client, "closure", word)
    assert (await call(client, "raise_closure"))["ok"]


# 7
def test_config_checks(caplog):
    with pytest.raises(RuntimeError):
        check_settings(Settings(encryption_key="", _env_file=None))
    with caplog.at_level(logging.WARNING, logger="config"):
        check_settings(Settings(encryption_key="k", _env_file=None, **DEV_DEFAULTS))
    assert sum("dev default" in m for m in caplog.messages) == len(DEV_DEFAULTS)
    with pytest.raises(RuntimeError, match="public"):
        check_settings(Settings(encryption_key="k", _env_file=None, public_gateway_url="https://x.trycloudflare.com", **DEV_DEFAULTS))


# 8
async def test_phone_and_dashboard_tokens_are_separate(client):
    assert (await client.get("/phone/priya", headers=DASH)).status_code == 401
    assert (await client.get("/phone/priya", headers=PHONE)).status_code == 200
    assert (await client.get("/dashboard/calls", headers=PHONE)).status_code == 401
    assert (await client.get("/dashboard/calls", headers=DASH)).status_code == 200


async def test_sse_rejects_query_token(client):
    assert (await client.get("/events/stream?token=test-dash")).status_code == 401
    assert (await client.get("/events/stream", headers=PHONE)).status_code == 401


# 9
async def test_foreclosure_does_not_claim_unpaid(client, make_session):
    await make_session(tier=2)
    r = await call(client, "foreclosure_quote")
    assert "unpaid" not in r["speak"] and "on record" in r["speak"]


@pytest.mark.parametrize("lang,word", [("hi", "ending"), ("mr", "ending"), ("hinglish", "ending")])
async def test_no_english_ending_in_local_speak(client, make_session, lang, word):
    await make_session(tier=1, language=lang)
    r = await call(client, "emi_info", language=lang)
    assert word not in r["speak"] and "73 91" in r["speak"]


async def test_handover_event_published_after_commit(client, make_session):
    await make_session(tier=1)
    r = await call(client, "handover", reason="xx", summary="summary ok")
    ev = [json.loads(f["e"]) for _, f in await sessions.redis.xrange("ll:events")]
    assert any(e.get("type") == "handover" and e["handover_id"] == r["data"]["handover_id"] for e in ev)


# 10
async def test_brute_force_atomic_counter(client):
    await call(client, "start_call")
    for _ in range(3):
        r = await call(client, "verify_caller", registered_mobile="9000014417", dob="1990-01-01")
        assert r["error_code"] == "NOT_VERIFIED"
    await call(client, "start_call", call_id="other")  # new call, same customer: per-customer hourly limit
    r = await call(client, "verify_caller", call_id="other", registered_mobile="9000014417", dob="1991-08-14")
    assert r["error_code"] == "RATE_LIMITED"
    assert int(await sessions.redis.get("ll:rl:verify:c1")) >= 4  # incremented before comparing


async def test_successful_verify_does_not_burn_attempts(client):
    for i in range(5):
        await call(client, "start_call", call_id=f"ok{i}")
        assert (await call(client, "verify_caller", call_id=f"ok{i}", registered_mobile="9000014417", dob="1991-08-14"))["ok"]
