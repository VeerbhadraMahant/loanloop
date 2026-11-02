from datetime import date, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, update

from app.clock import today_ist
from app.db.crypto import decrypt
from app.db.models import Customer, Loan, Payment, Reminder, ServiceRequest
from app.db.session import SessionLocal
from app.speak.format import fmt_date, rupees
from tests.conftest import call

UTR = "SAHYR61004738291"
PAY_DATE = (today_ist() - timedelta(days=28)).isoformat()


@pytest_asyncio.fixture(autouse=True)
async def _clean():
    async with SessionLocal() as db:
        await db.execute(delete(ServiceRequest))
        await db.execute(update(Reminder).values(paused_until=None))
        await db.commit()


@pytest_asyncio.fixture
async def ramesh():
    async with SessionLocal() as db:
        return (await db.execute(select(Customer).where(Customer.name.like("Ramesh%")))).scalar_one()


async def loan_of(cust):
    async with SessionLocal() as db:
        return (await db.execute(select(Loan).where(Loan.customer_id == cust.id))).scalar_one()


async def rb(client, field, value, cid="call1"):
    return await call(client, "confirm_readback", call_id=cid, field=field, value=value)


async def test_emi_info(client, make_session, priya):
    await make_session(tier=1)
    r = await call(client, "emi_info")
    ln = await loan_of(priya)
    assert r["ok"] and rupees(ln.emi_amount) in r["speak"] and "ending 73 91" in r["speak"]
    async with SessionLocal() as db:
        full = decrypt(ln.loan_number)
    assert full not in r["speak"] and full not in str(r["data"])
    assert fmt_date(date.fromisoformat(r["data"]["next_due"]), "en") in r["speak"]


@pytest.mark.parametrize("lang", ["hi", "hinglish", "mr"])
async def test_emi_info_languages(client, make_session, lang):
    await make_session(tier=1, language=lang)
    r = await call(client, "emi_info", language=lang)
    assert r["ok"] and "₹32,055" in r["speak"]


@pytest.mark.parametrize("act,body", [
    ("explain_emi_change", {}), ("foreclosure_quote", {}), ("raise_closure", {}),
    ("check_payment", {"date": PAY_DATE, "amount": 32055, "utr": UTR}),
    ("emi_date_change", {"new_day": 12}), ("request_document", {"type": "statement"}),
])
async def test_tier1_blocked_on_tier2(client, make_session, act, body):
    await make_session(tier=1)
    r = await call(client, act, **body)
    assert not r["ok"] and r["error_code"] == "TIER_TOO_LOW"


async def test_explain_emi_change(client, make_session):
    await make_session(tier=2)
    r = await call(client, "explain_emi_change")
    s = r["speak"]
    assert r["ok"]
    for x in ("8.75", "9.25", rupees(30930), rupees(32055), rupees(590), rupees(354)):
        assert x in s
    assert "bounce" in s and "penal" in s


async def test_check_payment_unmatched_flow(client, make_session, priya):
    await make_session(tier=2)
    body = dict(date=PAY_DATE, amount=32055, utr=UTR)
    r = await call(client, "check_payment", **body)
    assert not r["ok"] and r["next"] == "confirm_readback"
    assert UTR not in r["speak"] and "SAHY R610 0473 8291" in r["speak"]
    await rb(client, "utr", "SAHYR61004738290")  # different value
    assert (await call(client, "check_payment", **body))["next"] == "confirm_readback"
    await rb(client, "utr", UTR)
    r = await call(client, "check_payment", **body)  # amount not confirmed yet
    assert r["next"] == "confirm_readback" and r["data"]["fields"] == ["amount"]
    await rb(client, "amount", "32,055")
    r = await call(client, "check_payment", **body)
    assert r["ok"] and r["data"]["matched"] is False
    tid = r["data"]["ticket"]
    assert str(tid) in r["speak"] and "paused" in r["speak"] and rupees(32055) in r["speak"]
    async with SessionLocal() as db:
        sr = await db.get(ServiceRequest, tid)
        assert sr.type == "reconciliation" and sr.customer_id == priya.id
        assert sr.payload["utr_last4"] == "8291" and UTR not in str(sr.payload)
        ln = (await db.execute(select(Loan).where(Loan.customer_id == priya.id))).scalar_one()
        rem = (await db.execute(select(Reminder).where(Reminder.loan_id == ln.id))).scalars().all()
        assert rem and all(x.paused_until is not None for x in rem)
        assert (await db.execute(select(Payment.status).where(Payment.utr == UTR))).scalar_one() == "unmatched"
    # read-back is one-shot
    assert (await call(client, "check_payment", **body))["next"] == "confirm_readback"


async def test_check_payment_matched(client, make_session, priya):
    await make_session(tier=2)
    async with SessionLocal() as db:
        p = (await db.execute(select(Payment).where(Payment.loan_id == 1, Payment.status == "matched"))).scalars().first()
    await rb(client, "utr", p.utr.lower())  # case-insensitive
    await rb(client, "amount", str(p.amount))
    r = await call(client, "check_payment", date=p.date.isoformat(), amount=p.amount, utr=p.utr)
    assert r["ok"] and r["data"]["matched"] is True and rupees(p.amount) in r["speak"]
    async with SessionLocal() as db:
        assert (await db.execute(select(ServiceRequest))).first() is None


async def test_emi_date_change(client, make_session):
    await make_session(tier=2)
    assert (await call(client, "emi_date_change", new_day=12))["next"] == "confirm_readback"
    await rb(client, "new_day", "13")
    assert (await call(client, "emi_date_change", new_day=12))["next"] == "confirm_readback"
    await rb(client, "new_day", "12")
    r = await call(client, "emi_date_change", new_day=12)
    assert r["ok"] and "12" in r["speak"]
    async with SessionLocal() as db:
        sr = await db.get(ServiceRequest, r["data"]["ticket"])
        assert sr.type == "emi_date_change" and sr.payload == {"old_day": 5, "new_day": 12}
    # not changeable again within six months
    r = await call(client, "emi_date_change", new_day=20)
    assert not r["ok"] and r["data"]["reason"] == "ineligible_recent"


async def test_emi_date_change_same_day_and_range(client, make_session):
    await make_session(tier=2)
    r = await call(client, "emi_date_change", new_day=5)
    assert not r["ok"] and r["data"]["reason"] == "ineligible_same"
    assert (await call(client, "emi_date_change", new_day=29))["error_code"] == "INVALID_INPUT"


async def test_emi_date_change_overdue(client, make_session):
    from app.db.models import EmiSchedule
    await make_session(tier=2)
    async with SessionLocal() as db:
        e = (await db.execute(select(EmiSchedule).where(EmiSchedule.loan_id == 1, EmiSchedule.status == "due")
                              .order_by(EmiSchedule.due_date))).scalars().first()
        old = e.due_date
        e.due_date = date(2026, 1, 5)
        await db.commit()
    try:
        r = await call(client, "emi_date_change", new_day=12)
        assert not r["ok"] and r["data"]["reason"] == "ineligible_overdue"
    finally:
        async with SessionLocal() as db:
            (await db.get(EmiSchedule, e.id)).due_date = old
            await db.commit()


async def test_foreclosure_floating_no_fee(client, make_session, priya):
    await make_session(tier=2)
    r = await call(client, "foreclosure_quote")
    ln = await loan_of(priya)
    d = r["data"]
    assert d["fee"] == 0 and d["charges"] == 590 + 354 and d["total"] == ln.outstanding + 944
    for x in (d["total"], ln.outstanding, 944):
        assert rupees(x) in r["speak"]
    assert "no foreclosure charge" in r["speak"]


async def test_foreclosure_fixed_two_percent(client, make_session, ramesh):
    await make_session(tier=2, customer=ramesh)
    r = await call(client, "foreclosure_quote")
    ln = await loan_of(ramesh)
    d = r["data"]
    assert d["fee"] == round(ln.outstanding * 0.02) and d["total"] == ln.outstanding + d["charges"] + d["fee"]
    assert rupees(d["fee"]) in r["speak"] and rupees(d["total"]) in r["speak"]


async def test_raise_closure(client, make_session):
    await make_session(tier=2)
    assert (await call(client, "raise_closure"))["next"] == "confirm_readback"
    await rb(client, "closure", "no")
    assert (await call(client, "raise_closure"))["next"] == "confirm_readback"
    await rb(client, "closure", "yes")
    r = await call(client, "raise_closure")
    assert r["ok"] and "30 days" in r["speak"] and "ending 73 91" in r["speak"]
    async with SessionLocal() as db:
        assert (await db.get(ServiceRequest, r["data"]["ticket"])).type == "closure"
    assert (await call(client, "raise_closure"))["next"] == "confirm_readback"
