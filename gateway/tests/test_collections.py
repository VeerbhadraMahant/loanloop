import re
from datetime import timedelta

import pytest
from sqlalchemy import select

from app import sessions
from app.clock import today_ist
from app.db.models import Account, AccountTransaction, Call, CollectionCase, Customer, EmiSchedule, Loan, PromiseToPay, RefusalToPay
from app.db.session import SessionLocal
from app.jobs import compute_dues
from app.security.mask import assert_no_leak
from app.speak import rupees
from tests.conftest import call

OUT = 201  # Vikram Sawant: outbound demo persona (customer, loan and case id)
NEW = ["account_balance", "last_transactions", "dues_info", "record_ptp", "record_rtp"]
BODY = {"record_ptp": dict(amount=1000, promised_date=(today_ist() + timedelta(days=3)).isoformat()), "record_rtp": dict(reason_code="other")}


async def dues(loan_id=OUT):
    async with SessionLocal() as db:
        return await compute_dues(db, loan_id, today_ist())


@pytest.mark.parametrize("action", NEW)
async def test_tier_enforced(client, mk_session, action):
    r = await call(client, action, **BODY.get(action, {}))  # no session at all
    assert r["error_code"] == "NOT_VERIFIED" and r["next"] == "need_tier_1"
    await mk_session(OUT, tier=0)
    r = await call(client, action, **BODY.get(action, {}))
    assert r["error_code"] == "NOT_VERIFIED"


async def test_dues_info_matches_seed(client, fresh, mk_session):
    await mk_session(OUT)
    d = await dues()
    async with SessionLocal() as db:
        rows = (await db.execute(select(EmiSchedule).where(EmiSchedule.loan_id == OUT, EmiSchedule.status == "bounced"))).scalars().all()
    assert d["missed"] == len(rows) >= 1 and d["amount"] == sum(r.amount for r in rows) and d["bucket"] == "31-60"
    r = await call(client, "dues_info")
    assert r["ok"] and r["data"]["overdue_amount"] == d["amount"] and r["data"]["missed_emis"] == d["missed"]
    assert rupees(d["amount"]) in r["speak"] and rupees(d["charges"]) in r["speak"] and f"{d['dpd']} days" in r["speak"]
    assert "ending 91 72" in r["speak"] and "Please tell me how much" not in r["speak"]  # inbound: no ask


async def test_dues_info_none_for_regular_customer(client, mk_session):
    await mk_session(1)
    r = await call(client, "dues_info")
    assert r["ok"] and r["data"]["dues"] is False and "no overdue" in r["speak"]


async def test_seed_overdue_distribution(fresh):
    async with SessionLocal() as db:
        cases = (await db.execute(select(CollectionCase))).scalars().all()
        assert OUT in {c.id for c in cases}
        by = {b: sum(c.bucket == b for c in cases) for b in ("1-30", "31-60", "61-90", "90+")}
        assert by["1-30"] >= 15 and by["31-60"] >= 8 and by["61-90"] >= 5 and by["90+"] >= 3
        for c in cases:  # stored case == live computation from the schedule
            d = await compute_dues(db, c.loan_id, today_ist())
            assert (d["amount"], d["missed"], d["dpd"], d["bucket"]) == (c.overdue_amount, c.missed_emis, c.dpd, c.bucket)
        ptps = (await db.execute(select(PromiseToPay.status))).scalars().all()
        assert {"open", "kept", "broken"} <= set(ptps)
        assert (await db.execute(select(RefusalToPay.id))).first()


async def test_ptp_validation_and_tag(client, fresh, mk_session):
    await mk_session(OUT, direction="outbound", case_id=OUT)
    d, today = await dues(), today_ist()
    total = d["amount"] + d["charges"]
    ok_date = (today + timedelta(days=5)).isoformat()
    for amount in (0, -5, 331_501):  # outstanding is 3,31,500
        r = await call(client, "record_ptp", amount=amount, promised_date=ok_date)
        assert not r["ok"] and r["error_code"] == "INVALID_INPUT" and "amount" in r["speak"]
    for when in ((today - timedelta(days=1)).isoformat(), (today + timedelta(days=31)).isoformat(), "2026-02-30"):
        r = await call(client, "record_ptp", amount=1000, promised_date=when)
        assert not r["ok"] and r["error_code"] == "INVALID_INPUT" and "date" in r["speak"]
    assert (await call(client, "record_ptp", amount=1000, promised_date="tomorrow"))["error_code"] == "INVALID_INPUT"
    r = await call(client, "record_ptp", amount=total - 1, promised_date=today.isoformat())  # today is allowed
    assert r["ok"] and r["data"]["tag"] == "partial" and "1 rupee" not in r["speak"] and rupees(total) in r["speak"]
    r = await call(client, "record_ptp", amount=total, promised_date=(today + timedelta(days=30)).isoformat())  # day 30 allowed
    assert r["ok"] and r["data"]["tag"] == "full"


async def test_ptp_replaces_open_one(client, fresh, mk_session):
    await mk_session(OUT, direction="outbound", case_id=OUT)
    when = (today_ist() + timedelta(days=4)).isoformat()
    await call(client, "record_ptp", amount=5000, promised_date=when)
    await call(client, "record_ptp", amount=7000, promised_date=when)
    async with SessionLocal() as db:
        rows = (await db.execute(select(PromiseToPay).where(PromiseToPay.case_id == OUT).order_by(PromiseToPay.id))).scalars().all()
        assert [(p.amount, p.status) for p in rows] == [(5000, "cancelled"), (7000, "open")]
        assert rows[-1].direction == "outbound" and rows[-1].call_id == "call1"
        assert (await db.get(CollectionCase, OUT)).status == "ptp"


@pytest.mark.parametrize("code,key", [("job_loss", "report_hardship"), ("medical", "report_hardship"), ("income_reduced", "report_hardship"),
                                      ("already_paid", "check_payment"), ("dispute", "handover"), ("unwilling", None), ("other", None)])
async def test_rtp_reason_codes(client, fresh, mk_session, code, key):
    await mk_session(OUT, direction="outbound", case_id=OUT)
    await call(client, "record_ptp", amount=2000, promised_date=today_ist().isoformat())
    r = await call(client, "record_rtp", reason_code=code, note="cannot pay now")
    assert r["ok"] and r["data"]["suggest"] == key
    assert (r["next"] == "handover") == (code == "dispute")
    if key == "report_hardship":
        assert "hardship" in r["speak"]
    if code == "already_paid":
        assert "UTR" in r["speak"]
    async with SessionLocal() as db:
        rtp = (await db.execute(select(RefusalToPay).where(RefusalToPay.case_id == OUT).order_by(RefusalToPay.id.desc()))).scalars().first()
        assert rtp.reason_code == code and rtp.note == "cannot pay now" and rtp.overdue_amount > 0 and rtp.follow_up_at
        assert (await db.get(CollectionCase, OUT)).status == "rtp"
        assert (await db.execute(select(PromiseToPay.status).where(PromiseToPay.case_id == OUT))).scalars().all() == ["cancelled"]


async def test_rtp_input_rules(client, fresh, mk_session):
    await mk_session(OUT)
    assert (await call(client, "record_rtp", reason_code="bored"))["error_code"] == "INVALID_INPUT"
    assert (await call(client, "record_rtp", reason_code="other", note="x" * 121))["error_code"] == "INVALID_INPUT"
    r = await call(client, "record_rtp", reason_code="other", note="my pin is 4821")
    assert r["error_code"] == "SECRET_DETECTED"
    async with SessionLocal() as db:
        assert (await db.execute(select(RefusalToPay.id).where(RefusalToPay.note.ilike("%4821%")))).first() is None


async def test_balance_and_transactions_masked(client, mk_session, priya):
    await mk_session(1)
    async with SessionLocal() as db:
        acct = (await db.execute(select(Account).where(Account.customer_id == 1))).scalar_one()
        n = len((await db.execute(select(AccountTransaction).where(AccountTransaction.account_id == 1))).scalars().all())
    assert n >= 9
    r = await call(client, "account_balance")
    assert r["ok"] and rupees(acct.balance) in r["speak"] and "ending 04 17" in r["speak"]
    assert_no_leak(r["speak"], priya)
    r = await call(client, "last_transactions", count=5)
    assert r["ok"] and len(r["data"]["transactions"]) == 5
    assert_no_leak(r["speak"], priya)
    assert all("ref" not in x for x in r["data"]["transactions"]) and not re.search(r"\d{6,}", r["speak"])
    assert len(call_default := (await call(client, "last_transactions"))["data"]["transactions"]) == 3 and call_default
    assert (await call(client, "last_transactions", count=6))["error_code"] == "INVALID_INPUT"


async def test_hold_amount_spoken(client, fresh, mk_session):
    await mk_session(7)  # seed puts a hold on every 7th account
    async with SessionLocal() as db:
        a = await db.get(Account, 7)
    assert a.hold_amount > 0
    r = await call(client, "account_balance")
    assert rupees(a.hold_amount) in r["speak"] and rupees(a.balance - a.hold_amount) in r["speak"]


@pytest.mark.parametrize("lang", ["en", "hi", "hinglish", "mr"])
async def test_all_languages(client, fresh, mk_session, lang):
    await mk_session(OUT, language=lang)
    when = (today_ist() + timedelta(days=2)).isoformat()
    for action, body in (("account_balance", {}), ("last_transactions", {}), ("dues_info", {}), ("record_ptp", dict(amount=3000, promised_date=when)),
                         ("record_ptp", dict(amount=3000, promised_date="2001-01-01")), ("record_ptp", dict(amount=0, promised_date=when)),
                         ("record_rtp", dict(reason_code="job_loss")), ("record_rtp", dict(reason_code="dispute")),
                         ("record_rtp", dict(reason_code="already_paid")), ("record_rtp", dict(reason_code="other"))):
        r = await call(client, action, language=lang, **body)
        assert r["speak"] and "{" not in r["speak"], (action, lang)
    assert (await call(client, "start_call", call_id="x1", language=lang))["speak"]
    assert (await call(client, "start_call", call_id="x2", language=lang, direction="outbound", case_id=OUT))["speak"]


async def test_start_call_directions(client, fresh):
    r = await call(client, "start_call", call_id="in1")
    assert "Which language" in r["speak"] and "Hinglish" in r["speak"] and r["data"]["direction"] == "inbound"
    s = await sessions.get("in1")
    assert s.direction == "inbound" and s.case_id is None
    r = await call(client, "start_call", call_id="in2", case_id=OUT)  # case_id ignored on inbound
    assert (await sessions.get("in2")).case_id is None
    r = await call(client, "start_call", call_id="out1", direction="outbound", case_id=OUT)
    assert r["ok"] and "date of birth" in r["speak"] and "calling from Sahyadri Bank" in r["speak"]
    s = await sessions.get("out1")
    assert (s.direction, s.case_id, s.tier) == ("outbound", OUT, 0)
    async with SessionLocal() as db:
        assert (await db.get(Call, "out1")).direction == "outbound" and (await db.get(Call, "in1")).direction == "inbound"
        c = await db.get(CollectionCase, OUT)
        assert c.attempts == 1 and c.last_call_at is not None
    r = await call(client, "start_call", call_id="out2", direction="outbound", case_id=999999)
    assert r["error_code"] == "NOT_FOUND" and await sessions.get("out2") is None


async def test_outbound_dob_only_verification(client, fresh):
    await call(client, "start_call", call_id="o1", direction="outbound", case_id=OUT)
    r = await call(client, "verify_caller", call_id="o1", dob="17/06/1988")
    assert r["ok"] and "Vikram" in r["speak"]
    s = await sessions.get("o1")
    assert (s.tier, s.customer_id) == (1, OUT)
    r = await call(client, "dues_info", call_id="o1")
    assert r["ok"] and "Please tell me how much" in r["speak"]  # outbound asks for amount and date


async def test_inbound_dob_only_rejected(client, fresh):
    await call(client, "start_call", call_id="i1")
    r = await call(client, "verify_caller", call_id="i1", dob="1988-06-17")
    assert r["error_code"] == "INVALID_INPUT" and (await sessions.get("i1")).tier == 0


async def test_outbound_brute_force(client, fresh):
    await call(client, "start_call", call_id="o1", direction="outbound", case_id=OUT)
    for _ in range(3):
        r = await call(client, "verify_caller", call_id="o1", dob="1990-01-01")
        assert r["error_code"] == "NOT_VERIFIED"
    assert r["next"] == "handover"
    r = await call(client, "verify_caller", call_id="o1", dob="1988-06-17")  # even the right DOB is refused now
    assert r["error_code"] == "RATE_LIMITED" and (await sessions.get("o1")).tier == 0
    await call(client, "start_call", call_id="o2", direction="outbound", case_id=OUT)  # per-customer limit survives a new call
    assert (await call(client, "verify_caller", call_id="o2", dob="1988-06-17"))["error_code"] == "RATE_LIMITED"


async def test_outbound_case_other_customers_mobile_never_verifies(client, fresh):
    await call(client, "start_call", call_id="o1", direction="outbound", case_id=OUT)
    r = await call(client, "verify_caller", call_id="o1", registered_mobile="9000014417", dob="1991-08-14")  # Priya's real details
    assert r["error_code"] == "NOT_VERIFIED" and (await sessions.get("o1")).tier == 0
    r = await call(client, "verify_caller", call_id="o1", registered_mobile="9000200201", dob="1988-06-17")  # the case customer: fine
    assert r["ok"]


async def test_outbound_ptp_end_to_end(client, fresh):
    await call(client, "start_call", call_id="o1", direction="outbound", case_id=OUT)
    await call(client, "verify_caller", call_id="o1", dob="1988-06-17")
    when = (today_ist() + timedelta(days=6)).isoformat()
    r = await call(client, "record_ptp", call_id="o1", amount=20000, promised_date=when)
    assert r["ok"] and r["data"]["tag"] == "partial"
    for w in ("waive", "settle", "discount", "legal"):
        assert w not in r["speak"].lower()
    async with SessionLocal() as db:
        p = (await db.execute(select(PromiseToPay).where(PromiseToPay.call_id == "o1"))).scalar_one()
        assert (p.case_id, p.direction, p.status) == (OUT, "outbound", "open")
        assert (await db.get(Customer, OUT)).name == "Vikram Sawant" and (await db.get(Loan, OUT)).loan_last4 == "9172"


async def test_start_call_cannot_reset_live_session(client, fresh):
    assert (await call(client, "start_call", call_id="rs1"))["ok"]
    r = await call(client, "start_call", call_id="rs1", direction="outbound", case_id=OUT)  # e.g. a model-issued call mid-call
    assert not r["ok"] and r["error_code"] == "INVALID_INPUT"
    s = await sessions.get("rs1")
    assert s.direction == "inbound" and s.case_id is None
