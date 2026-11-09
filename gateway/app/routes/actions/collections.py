"""Savings + collections actions: account_balance, last_transactions, dues_info, record_ptp, record_rtp."""
from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import clock
from app.contract import ActionIn, ActionResponse
from app.db.models import Account, AccountTransaction, CollectionCase, Loan, PromiseToPay, RefusalToPay, now
from app.jobs import apply_dues, compute_dues
from app.routes.actions._runner import action
from app.routes.actions.loans import missing_readback, readback_needed
from app.speak import fmt_date, rupees, t
from app.speak.templates.details import ending

router = APIRouter(prefix="/actions")


async def _account(db: AsyncSession, customer_id: int) -> Account | None:
    return (await db.execute(select(Account).where(Account.customer_id == customer_id, Account.type == "savings")
                             .order_by(Account.id))).scalars().first()


class NoIn(ActionIn):
    pass


@action("account_balance", In=NoIn, router=router)
async def account_balance(inp: NoIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    a = await _account(db, session.customer_id)
    if a is None:
        return ActionResponse(ok=False, speak=t("account_not_found", inp.language), error_code="NOT_FOUND", next="handover")
    avail = a.balance - a.hold_amount
    kw = dict(acct=ending(a.account_last4, inp.language), balance=rupees(a.balance))
    speak = (t("balance_hold", inp.language, hold=rupees(a.hold_amount), avail=rupees(avail), **kw) if a.hold_amount
             else t("balance", inp.language, **kw))
    return ActionResponse(ok=True, speak=speak, data={"account": f"ending {a.account_last4}", "balance": a.balance,
                                                      "hold_amount": a.hold_amount, "available": avail})


class TxnIn(ActionIn):
    count: int = Field(default=3, ge=1, le=5)


@action("last_transactions", In=TxnIn, router=router)
async def last_transactions(inp: TxnIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    a = await _account(db, session.customer_id)
    if a is None:
        return ActionResponse(ok=False, speak=t("account_not_found", inp.language), error_code="NOT_FOUND", next="handover")
    rows = (await db.execute(select(AccountTransaction).where(AccountTransaction.account_id == a.id)
                             .order_by(AccountTransaction.date.desc(), AccountTransaction.id.desc()).limit(inp.count))).scalars().all()
    if not rows:
        return ActionResponse(ok=True, speak=t("txn_none", inp.language), data={"transactions": []})
    lang = inp.language
    items = "; ".join(t("txn_item", lang, date=fmt_date(r.date, lang), dir=t(f"txn_{r.direction}", lang),
                        amount=rupees(r.amount), narr=r.narration) for r in rows)  # ref is never spoken or returned
    return ActionResponse(ok=True, speak=t("txn_list", lang, n=len(rows), items=items),
                          data={"transactions": [{"date": r.date.isoformat(), "direction": r.direction, "amount": r.amount,
                                                  "narration": r.narration} for r in rows]})


async def _ctx(db: AsyncSession, session):
    """(loan, dues, case) for the caller's overdue loan, or None. Outbound calls use the case's loan."""
    today = clock.today_ist()
    if session.direction == "outbound" and session.case_id:
        case = await db.get(CollectionCase, session.case_id)
        if case is None or case.customer_id != session.customer_id:
            return None
        loans = [await db.get(Loan, case.loan_id)]
    else:
        loans = (await db.execute(select(Loan).where(Loan.customer_id == session.customer_id, Loan.status != "closed")
                                  .order_by(Loan.id))).scalars().all()
    best = None
    for ln in loans:
        d = await compute_dues(db, ln.id, today)
        if d and (best is None or d["dpd"] > best[1]["dpd"]):
            best = (ln, d)
    if best is None:
        return None
    ln, dues = best
    case = await db.scalar(select(CollectionCase).where(CollectionCase.loan_id == ln.id))
    if case is None:  # job not run yet: create the case now (loan_id is unique: a concurrent job may win the race)
        try:
            async with db.begin_nested():
                case = apply_dues(db, ln, None, dues)
                await db.flush()
        except IntegrityError:
            case = await db.scalar(select(CollectionCase).where(CollectionCase.loan_id == ln.id))
    return ln, dues, case


@action("dues_info", In=NoIn, router=router)
async def dues_info(inp: NoIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    if session.direction != "outbound" and session.tier < 2:  # amounts are tier 2 (CLAUDE.md 3.2); a bank-initiated call bound to a case is tier 1
        return ActionResponse(ok=False, speak=t("tier_too_low", inp.language), error_code="TIER_TOO_LOW", next="need_tier_2")
    ctx = await _ctx(db, session)
    if ctx is None:
        return ActionResponse(ok=True, speak=t("dues_none", inp.language), data={"dues": False})
    ln, d, _ = ctx
    lang = inp.language
    speak = t("dues_info", lang, loan=ending(ln.loan_last4, lang), amount=rupees(d["amount"]), missed=d["missed"],
              dpd=d["dpd"], charges=rupees(d["charges"]))
    if session.direction == "outbound":
        speak += " " + t("dues_ask", lang)
    return ActionResponse(ok=True, speak=speak, data={"dues": True, "overdue_amount": d["amount"], "missed_emis": d["missed"],
                                                      "dpd": d["dpd"], "charges": d["charges"], "bucket": d["bucket"],
                                                      "loan": f"ending {ln.loan_last4}"})


class PtpIn(ActionIn):
    amount: int = Field(ge=-10**10, le=10**10)  # business bounds checked in the handler (spoken re-ask, not a generic error)
    promised_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


@action("record_ptp", In=PtpIn, router=router)
async def record_ptp(inp: PtpIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    ctx = await _ctx(db, session)
    if ctx is None:
        return ActionResponse(ok=False, speak=t("dues_none", lang), error_code="NOT_FOUND", data={"dues": False})
    ln, d, case = ctx
    if inp.amount <= 0 or inp.amount > ln.outstanding:
        return ActionResponse(ok=False, speak=t("ptp_bad_amount", lang), error_code="INVALID_INPUT")
    today = clock.today_ist()
    try:
        when = date.fromisoformat(inp.promised_date)
    except ValueError:
        when = None
    if when is None or not today <= when <= today + timedelta(days=30):
        return ActionResponse(ok=False, speak=t("ptp_bad_date", lang), error_code="INVALID_INPUT")
    rb = {"amount": str(inp.amount), "promised_date": when.isoformat()}
    miss = missing_readback(session, rb)
    if miss:
        return readback_needed(lang, "readback_ptp", miss, rb, amount=rupees(inp.amount), date=fmt_date(when, lang))
    session.consume_readback("amount")
    session.consume_readback("promised_date")
    total = d["amount"] + d["charges"]
    tag = "full" if inp.amount >= total else "partial"
    for old in (await db.execute(select(PromiseToPay).where(PromiseToPay.case_id == case.id, PromiseToPay.status == "open"))).scalars():
        old.status, old.resolved_at = "cancelled", now()  # one open PTP per case
    db.add(PromiseToPay(case_id=case.id, loan_id=ln.id, customer_id=ln.customer_id, call_id=inp.call_id,
                        direction=session.direction, amount=inp.amount, promised_date=when, amount_tag=tag))
    case.status, case.updated_at = "ptp", now()
    case.next_action_at = datetime.combine(when + timedelta(days=1), time(9, 0), tzinfo=clock.IST)
    speak = t(f"ptp_ok_{tag}", lang, amount=rupees(inp.amount), date=fmt_date(when, lang), total=rupees(total),
              rest=rupees(max(total - inp.amount, 0)))
    return ActionResponse(ok=True, speak=speak, data={"amount": inp.amount, "promised_date": when.isoformat(), "tag": tag})


Reason = Literal["job_loss", "medical", "income_reduced", "dispute", "already_paid", "unwilling", "other"]
FOLLOW_UP_DAYS = {"job_loss": 14, "medical": 14, "income_reduced": 14, "dispute": 3, "already_paid": 2, "unwilling": 7, "other": 7}
HARDSHIP = {"job_loss", "medical", "income_reduced"}


class RtpIn(ActionIn):
    reason_code: Reason
    note: str | None = Field(default=None, max_length=120)  # caller text: the runner's secret scan covers it


@action("record_rtp", In=RtpIn, router=router)
async def record_rtp(inp: RtpIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    ctx = await _ctx(db, session)
    if ctx is None:
        return ActionResponse(ok=False, speak=t("dues_none", lang), error_code="NOT_FOUND", data={"dues": False})
    ln, d, case = ctx
    follow = now() + timedelta(days=FOLLOW_UP_DAYS[inp.reason_code])
    db.add(RefusalToPay(case_id=case.id, loan_id=ln.id, customer_id=ln.customer_id, call_id=inp.call_id,
                        direction=session.direction, reason_code=inp.reason_code, note=inp.note,
                        overdue_amount=d["amount"], follow_up_at=follow))
    for old in (await db.execute(select(PromiseToPay).where(PromiseToPay.case_id == case.id, PromiseToPay.status == "open"))).scalars():
        old.status, old.resolved_at = "cancelled", now()  # a refusal withdraws any open promise
    case.status, case.next_action_at, case.updated_at = "rtp", follow, now()
    key = ("rtp_hardship" if inp.reason_code in HARDSHIP else "rtp_paid" if inp.reason_code == "already_paid"
           else "rtp_dispute" if inp.reason_code == "dispute" else "rtp_ack")
    suggest = {"rtp_hardship": "report_hardship", "rtp_paid": "check_payment", "rtp_dispute": "handover"}.get(key)
    return ActionResponse(ok=True, speak=t(key, lang), data={"reason_code": inp.reason_code, "suggest": suggest},
                          next="handover" if key == "rtp_dispute" else None)
