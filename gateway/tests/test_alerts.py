"""Bank SMS alerts in the demo inbox, and the SMS a raised request sends."""
from sqlalchemy import func, select

from app.db.alerts import add_bank_alerts
from app.db.models import SmsOutbox
from app.db.session import SessionLocal
from tests.conftest import call
from tests.test_loans import rb


async def _sms(cid):
    async with SessionLocal() as db:
        return (await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == cid).order_by(SmsOutbox.id))).scalars().all()


async def test_seed_fills_priya_inbox_with_masked_alerts(priya):
    bodies = [s.body for s in await _sms(priya.id)]
    assert any("is due on" in b for b in bodies) and any("never asks for your OTP" in b for b in bodies)
    assert all(priya.registered_mobile not in b for b in bodies)  # no full identifiers in alerts


async def test_alerts_are_idempotent(priya):
    async with SessionLocal() as db:
        before = (await db.execute(select(func.count()).select_from(SmsOutbox))).scalar()
        assert await add_bank_alerts(db) == 0
        await db.commit()
        assert (await db.execute(select(func.count()).select_from(SmsOutbox))).scalar() == before


async def test_raised_request_sends_confirmation_sms(client, make_session, priya):
    await make_session(tier=2)
    await rb(client, "new_day", "12")
    r = await call(client, "emi_date_change", new_day=12)
    assert r["ok"]
    last = (await _sms(priya.id))[-1]
    assert "EMI date change request is registered" in last.body and str(r["data"]["ticket"]) in last.body
