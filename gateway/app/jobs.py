"""Cron-style collections jobs: mark_overdue -> settle_ptps -> build_queue.

Run from the FastAPI lifespan loop (JOBS_INTERVAL_S, 0 = off) or on demand via POST /dashboard/jobs/run.
Each job writes a job_runs row. Time comes from app.clock so tests can control it.
shortcut: no cross-worker lock; with several gateway workers every worker runs the loop (jobs are idempotent), add pg advisory lock to scale.
"""
import asyncio
import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import clock
from app.db.models import Charge, CollectionCase, EmiSchedule, JobRun, Loan, Payment, PromiseToPay, now
from app.db.session import SessionLocal

log = logging.getLogger("jobs")
UNPAID = ("due", "bounced", "overdue")
WINDOW = (time(8, 0), time(19, 0))  # RBI fair-practice call window, IST
SLOT_MIN = 2  # spacing between queued calls


def bucket_of(dpd: int) -> str:
    return "0" if dpd <= 0 else "1-30" if dpd <= 30 else "31-60" if dpd <= 60 else "61-90" if dpd <= 90 else "90+"


async def compute_dues(db: AsyncSession, loan_id: int, today: date) -> dict | None:
    """Live overdue figures for one loan from emi_schedule + charges (None when nothing is past due)."""
    rows = (await db.execute(select(EmiSchedule).where(
        EmiSchedule.loan_id == loan_id, EmiSchedule.status.in_(UNPAID), EmiSchedule.due_date < today))).scalars().all()
    if not rows:
        return None
    oldest = min(r.due_date for r in rows)
    charges = (await db.execute(select(Charge).where(
        Charge.loan_id == loan_id, Charge.date >= oldest, Charge.type.in_(("bounce", "penal"))))).scalars().all()
    dpd = (today - oldest).days
    return {"amount": sum(r.amount for r in rows), "missed": len(rows), "dpd": dpd, "bucket": bucket_of(dpd),
            "charges": sum(c.amount for c in charges), "oldest": oldest}


def priority_of(dpd: int, missed: int) -> int:
    return dpd + 10 * missed


def apply_dues(db: AsyncSession, ln: Loan, case: CollectionCase | None, dues: dict) -> CollectionCase:
    """Create or refresh a case from live dues (a resolved case re-opens; ptp/rtp status is kept)."""
    if case is None:
        case = CollectionCase(loan_id=ln.id, customer_id=ln.customer_id, status="open", attempts=0, priority=0)
        db.add(case)
    elif case.status == "resolved":
        case.status = "open"
    case.overdue_amount, case.missed_emis, case.dpd, case.bucket = dues["amount"], dues["missed"], dues["dpd"], dues["bucket"]
    case.priority = max(case.priority or 0, priority_of(dues["dpd"], dues["missed"]))
    case.updated_at = now()
    return case


async def mark_overdue(db: AsyncSession) -> dict:
    today = clock.today_ist()
    loans = (await db.execute(select(Loan).where(Loan.status != "closed"))).scalars().all()
    cases = {c.loan_id: c for c in (await db.execute(select(CollectionCase))).scalars()}
    marked = upserted = resolved = 0
    for ln in loans:
        dues = await compute_dues(db, ln.id, today)
        case = cases.get(ln.id)
        if dues is None:
            if case is not None and case.status != "resolved":
                case.status, case.overdue_amount, case.missed_emis, case.dpd, case.bucket = "resolved", 0, 0, 0, "0"
                case.updated_at = now()
                resolved += 1
            continue
        rows = (await db.execute(select(EmiSchedule).where(  # bounced rows stay bounced (compute_dues counts them as unpaid)
            EmiSchedule.loan_id == ln.id, EmiSchedule.status == "due", EmiSchedule.due_date < today))).scalars().all()
        for r in rows:
            r.status = "overdue"
        marked += len(rows)
        apply_dues(db, ln, case, dues)
        upserted += 1
    await db.flush()
    return {"marked_emis": marked, "cases_upserted": upserted, "cases_resolved": resolved}


async def settle_ptps(db: AsyncSession) -> dict:
    today = clock.today_ist()
    ptps = (await db.execute(select(PromiseToPay).where(
        PromiseToPay.status == "open", PromiseToPay.promised_date < today))).scalars().all()
    kept = broken = partial = 0
    for p in ptps:
        paid = sum((await db.execute(select(Payment.amount).where(
            Payment.loan_id == p.loan_id, Payment.status == "matched", Payment.date >= p.created_at.astimezone(clock.IST).date()))).scalars().all())
        p.paid_amount, p.resolved_at = paid, now()
        case = await db.get(CollectionCase, p.case_id)
        if paid >= p.amount:
            p.status, kept = "kept", kept + 1
        else:
            p.status, broken = "broken", broken + 1
            partial += paid > 0
            if case is not None:
                case.priority += 20
        if case is not None and case.status == "ptp":
            case.status, case.updated_at = "open", now()
    await db.flush()
    return {"kept": kept, "broken": broken, "partial_paid": partial}


def clamp_to_window(t: datetime) -> datetime:
    """Move an IST datetime into the 08:00-19:00 call window (later, never earlier)."""
    if t.time() < WINDOW[0]:
        return t.replace(hour=8, minute=0, second=0, microsecond=0)
    if t.time() >= WINDOW[1]:
        return (t + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    return t


async def build_queue(db: AsyncSession) -> dict:
    n = clock.now_ist()
    cutoff = n - timedelta(hours=24)
    cases = (await db.execute(select(CollectionCase).where(CollectionCase.status.in_(("open", "rtp"))))).scalars().all()
    open_ptp = {p.case_id for p in (await db.execute(select(PromiseToPay).where(
        PromiseToPay.status == "open", PromiseToPay.promised_date >= n.date()))).scalars()}
    elig = []
    for c in cases:
        if c.status == "open":
            c.next_action_at = None  # rebuilt below for the cases that are due
        if c.id in open_ptp or (c.last_call_at and c.last_call_at > cutoff):
            continue
        if c.status == "rtp":  # follow-up date reached: back into the queue
            if c.next_action_at is None or c.next_action_at > n:
                continue
            c.status = "open"
        elig.append(c)
    elig.sort(key=lambda c: (-c.priority, -c.dpd, c.id))
    slot = clamp_to_window(n)
    for c in elig:
        c.next_action_at = slot = clamp_to_window(slot)
        slot += timedelta(minutes=SLOT_MIN)
    await db.flush()
    return {"queued": len(elig)}


async def queue(db: AsyncSession) -> list[CollectionCase]:
    """Cases to call, in call order (next_action_at set by build_queue)."""
    return list((await db.execute(select(CollectionCase).where(
        CollectionCase.status == "open", CollectionCase.next_action_at.is_not(None))
        .order_by(CollectionCase.next_action_at, CollectionCase.id))).scalars())


JOBS = {"mark_overdue": mark_overdue, "settle_ptps": settle_ptps, "build_queue": build_queue}


async def run_all(session_factory=SessionLocal) -> list[dict]:
    out = []
    for name, fn in JOBS.items():
        async with session_factory() as db:
            run = JobRun(job=name, started_at=now(), stats={})
            db.add(run)
            try:
                run.stats = await fn(db)
            except Exception as e:
                await db.rollback()
                log.error("job %s failed: %s", name, type(e).__name__)
                run = JobRun(job=name, started_at=now(), stats={"error": type(e).__name__})
                db.add(run)
            run.finished_at = now()
            await db.commit()
            out.append({"job": name, "stats": run.stats})
    return out


async def loop(interval_s: int) -> None:
    while True:
        try:
            await run_all()
        except Exception as e:  # never let the loop die
            log.error("jobs loop: %s", type(e).__name__)
        await asyncio.sleep(interval_s)
