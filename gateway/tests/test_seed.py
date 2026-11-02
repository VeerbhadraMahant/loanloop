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
        overdue = (await db.execute(select(EmiSchedule.id).where(EmiSchedule.due_date < today, EmiSchedule.status != "paid"))).first()
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
