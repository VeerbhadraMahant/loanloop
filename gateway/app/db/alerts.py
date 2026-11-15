"""Routine bank SMS alerts for the demo customers' phone inbox, built from their own loan rows (synthetic data).

Idempotent: a customer who already has any SMS is skipped. Run on a populated DB:  python -m app.db.alerts
"""
import asyncio
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import today_ist
from app.db import models as m
from app.speak.format import rupees as inr

BANK = "Sahyadri Finance Bank"
LOGIN_IDS = (1, 2, 3)  # Priya, Ramesh, Sunita: the customers with app logins


def _at(d: date, hh: int) -> datetime:
    return datetime.combine(d, time(hh, 0), timezone.utc)


def _day(d: date) -> str:
    return f"{d.day} {d:%b %Y}"


async def add_bank_alerts(s: AsyncSession, customer_ids=LOGIN_IDS, today: date | None = None) -> int:
    """Insert alerts for each customer with an empty inbox; returns rows added. Caller commits."""
    today, added = today or today_ist(), 0
    for cid in customer_ids:
        c = await s.get(m.Customer, cid)
        if c is None or (await s.execute(select(m.SmsOutbox.id).where(m.SmsOutbox.customer_id == cid).limit(1))).first():
            continue
        msgs: list[tuple[datetime, str]] = [(_at(today - timedelta(days=20), 9),
                                             f"{BANK} never asks for your OTP, PIN, password or CVV by call, SMS or email. Do not share them with anyone.")]
        loans = (await s.execute(select(m.Loan).where(m.Loan.customer_id == cid, m.Loan.status != "closed").order_by(m.Loan.id))).scalars().all()
        for ln in loans:
            sched = (await s.execute(select(m.EmiSchedule).where(m.EmiSchedule.loan_id == ln.id).order_by(m.EmiSchedule.due_date))).scalars().all()
            paid = [e for e in sched if e.status == "paid" and e.due_date <= today]
            nxt = next((e for e in sched if e.status == "due" and e.due_date >= today), None)
            if paid:
                e = paid[-1]
                msgs.append((_at(e.due_date, 8), f"{BANK}: EMI of {inr(e.amount)} for loan a/c ending {ln.loan_last4} received on {_day(e.due_date)}. Thank you."))
            if nxt:
                msgs.append((_at(max(today - timedelta(days=1), nxt.due_date - timedelta(days=5)), 10),
                             f"{BANK}: EMI of {inr(nxt.amount)} for loan a/c ending {ln.loan_last4} is due on {_day(nxt.due_date)}. "
                             "Please keep sufficient balance to avoid bounce charges."))
            rr = (await s.execute(select(m.RateReset).where(m.RateReset.loan_id == ln.id).order_by(m.RateReset.effective_date.desc()).limit(1))).scalars().first()
            if rr and rr.effective_date <= today:
                msgs.append((_at(rr.effective_date, 11), f"{BANK}: Interest rate on loan a/c ending {ln.loan_last4} revised from {rr.old_rate}% to "
                                                        f"{rr.new_rate}% from {_day(rr.effective_date)}. New EMI {inr(rr.new_emi)}."))
        for ts, body in sorted(msgs):  # ids in time order: the inbox lists newest id first
            s.add(m.SmsOutbox(customer_id=cid, to_mobile=c.registered_mobile, body=body, created_at=min(ts, datetime.now(timezone.utc))))
            added += 1
    return added


async def main() -> None:
    from app.db.session import SessionLocal, engine

    async with SessionLocal() as s:
        n = await add_bank_alerts(s)
        await s.commit()
    print("bank alerts added:", n)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
