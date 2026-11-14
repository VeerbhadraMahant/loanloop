from datetime import timedelta

from sqlalchemy import select

from app import sessions
from app.clock import today_ist
from app.db.models import EmiSchedule, Payment, RateReset
from app.db.seed import seed
from app.db.session import SessionLocal, engine


async def test_seed_dates_relative_to_today():
    today = today_ist()
    async with SessionLocal() as db:
        nxt = (await db.execute(select(EmiSchedule.due_date).where(EmiSchedule.loan_id == 1, EmiSchedule.status != "paid")
                                .order_by(EmiSchedule.due_date))).scalars().all()
        assert nxt and all(d > today for d in nxt)
        overdue = (await db.execute(select(EmiSchedule.id).where(EmiSchedule.due_date < today, EmiSchedule.status == "due"))).first()
        assert overdue is None
        rr = (await db.execute(select(RateReset.effective_date).where(RateReset.loan_id == 1))).scalar_one()
        assert rr == today - timedelta(days=41)
        pd = (await db.execute(select(Payment.date).where(Payment.utr == "SAHYR61004738291"))).scalar_one()
        assert pd == today - timedelta(days=28)


async def test_reseed_flushes_redis_ll_keys():
    await sessions.redis.set("ll:rl:verify:c1", "3")
    await sessions.redis.set("other", "x")
    await seed(engine)
    assert await sessions.redis.get("ll:rl:verify:c1") is None
    assert await sessions.redis.get("other") == "x"


async def test_history_is_bounded_ended_and_masked():
    import json
    import re
    from datetime import datetime, timezone

    from app.db.models import Approval, AuditLog, Call, Handover, ServiceRequest, SmsOutbox

    now_, lo = datetime.now(timezone.utc), datetime.now(timezone.utc) - timedelta(days=366)
    async with SessionLocal() as db:
        for model, col in ((Call, Call.started_at), (Call, Call.ended_at), (AuditLog, AuditLog.ts), (Handover, Handover.created_at),
                           (ServiceRequest, ServiceRequest.created_at), (SmsOutbox, SmsOutbox.created_at), (Approval, Approval.created_at)):
            rows = (await db.execute(select(col))).scalars().all()
            assert rows and all(lo <= t <= now_ for t in rows), (model.__name__, col.key)
        assert (await db.execute(select(Call.call_id).where(Call.ended_at.is_(None)))).first() is None
        long_run = re.compile(r"\d{10,}")
        for a in (await db.execute(select(AuditLog))).scalars():
            assert not long_run.search(f"{a.call_id} {a.action} {a.error_code} {json.dumps(a.flags)}")
        for s in (await db.execute(select(SmsOutbox.body))).scalars():
            assert not long_run.search(s)
