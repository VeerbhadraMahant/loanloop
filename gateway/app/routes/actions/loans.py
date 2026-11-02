"""Actions: emi_info, explain_emi_change, check_payment, emi_date_change, foreclosure_quote, raise_closure.

Also shared helpers for requests.py / handover.py. session.tasks is list[str]: entries are "<action>:done".
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.contract import ActionIn, ActionResponse
from app.db.models import Charge, EmiSchedule, Loan, Payment, RateReset, Reminder, ServiceRequest, now
from app.routes.actions._runner import action
from app.security.mask import mask_loan
from app.sessions import Session
from app.speak import t
from app.speak.format import digits, fmt_date, rupees

router = APIRouter(prefix="/actions")


# ---- shared helpers ----
async def get_loan(db: AsyncSession, session: Session) -> Loan | None:
    q = select(Loan).where(Loan.customer_id == session.customer_id, Loan.status != "closed").order_by(Loan.id).limit(1)
    return (await db.execute(q)).scalar_one_or_none()


def no_loan(lang: str) -> ActionResponse:
    return ActionResponse(ok=False, speak=t("loan_not_found", lang), error_code="NOT_FOUND", next="handover")


def missing_readback(session: Session, pairs: dict[str, str]) -> list[str]:
    return [f for f, v in pairs.items() if not session.has_readback(f, v)]


def readback_needed(lang: str, key: str, missing: list[str], **kw) -> ActionResponse:
    return ActionResponse(ok=False, speak=t(key, lang, **kw), data={"fields": missing}, next="confirm_readback")


async def new_request(db: AsyncSession, session: Session, rtype: str, payload: dict) -> ServiceRequest:
    """Insert a service request and record it as a done task. Payloads hold no full identifiers."""
    sr = ServiceRequest(customer_id=session.customer_id, type=rtype, payload=payload)
    db.add(sr)
    await db.flush()
    session.tasks.append(f"{rtype}:done")
    return sr


# ---- emi_info ----
class NoInput(ActionIn):
    pass


@action("emi_info", In=NoInput, router=router)
async def emi_info(inp: NoInput, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(inp.language)
    nxt = (await db.execute(
        select(EmiSchedule.due_date).where(EmiSchedule.loan_id == loan.id, EmiSchedule.status != "paid",
                                           EmiSchedule.due_date >= date.today()).order_by(EmiSchedule.due_date).limit(1)
    )).scalar_one_or_none()
    kw = dict(loan=mask_loan(loan.loan_last4), amount=rupees(loan.emi_amount))
    data = {"emi": loan.emi_amount, "loan": kw["loan"], "next_due": nxt.isoformat() if nxt else None}
    if nxt is None:
        return ActionResponse(ok=True, speak=t("emi_no_due", inp.language, **kw), data=data)
    return ActionResponse(ok=True, speak=t("emi_info", inp.language, date=fmt_date(nxt, inp.language), **kw), data=data)


# ---- explain_emi_change ----
def _pct(x) -> str:
    return f"{float(x):g}"


@action("explain_emi_change", In=NoInput, router=router)
async def explain_emi_change(inp: NoInput, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(lang)
    rr = (await db.execute(select(RateReset).where(RateReset.loan_id == loan.id)
                           .order_by(RateReset.effective_date.desc()).limit(1))).scalar_one_or_none()
    charges = (await db.execute(
        select(Charge).where(Charge.loan_id == loan.id, Charge.date >= date.today() - timedelta(days=180))
        .order_by(Charge.date.desc()).limit(5))).scalars().all()
    parts, data = [], {"reset": None, "charges": []}
    if rr:
        parts.append(t("explain_reset", lang, old_rate=_pct(rr.old_rate), new_rate=_pct(rr.new_rate),
                       date=fmt_date(rr.effective_date, lang), reason=rr.reason,
                       old_emi=rupees(rr.old_emi), new_emi=rupees(rr.new_emi)))
        data["reset"] = {"old_rate": float(rr.old_rate), "new_rate": float(rr.new_rate), "old_emi": rr.old_emi,
                         "new_emi": rr.new_emi, "date": rr.effective_date.isoformat()}
    if charges:
        items = ", ".join(t("charge_item", lang, type=t(f"ctype_{c.type}", lang), amount=rupees(c.amount),
                            date=fmt_date(c.date, lang), reason=c.reason) for c in charges)
        parts.append(t("explain_charges", lang, items=items))
        data["charges"] = [{"type": c.type, "amount": c.amount, "date": c.date.isoformat()} for c in charges]
    if not parts:
        parts.append(t("explain_none", lang))
    session.tasks.append("explain_emi_change:done")
    return ActionResponse(ok=True, speak=" ".join(parts), data=data)


# ---- check_payment ----
class CheckPaymentIn(ActionIn):
    date: date
    amount: float = Field(gt=0, le=10_000_000)
    utr: str = Field(pattern=r"^[A-Za-z0-9]{8,22}$")


@action("check_payment", In=CheckPaymentIn, router=router)
async def check_payment(inp: CheckPaymentIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    if not session.has_readback("utr", inp.utr):
        return readback_needed(lang, "readback_utr", ["utr"], utr=digits(inp.utr.upper(), 4))
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(lang)
    session.consume_readback("utr")
    amount = round(inp.amount)
    pay = (await db.execute(select(Payment).where(Payment.loan_id == loan.id, Payment.utr == inp.utr.upper())
                            .limit(1))).scalar_one_or_none()
    kw = dict(amount=rupees(amount), date=fmt_date(inp.date, lang))
    if pay and pay.status == "matched" and pay.amount == amount and pay.date == inp.date:
        session.tasks.append("check_payment:done")
        return ActionResponse(ok=True, speak=t("payment_matched", lang, **kw), data={"matched": True})
    if pay:
        pay.status = "unmatched"
    sr = await new_request(db, session, "reconciliation",
                           {"utr_last4": inp.utr[-4:], "amount": amount, "date": inp.date.isoformat()})
    until = now() + timedelta(days=7)
    res = await db.execute(update(Reminder).where(Reminder.loan_id == loan.id).values(paused_until=until))
    if res.rowcount == 0:
        db.add(Reminder(loan_id=loan.id, sent_at=now(), channel="sms", paused_until=until))
    return ActionResponse(ok=True, speak=t("payment_unmatched", lang, ticket=sr.id, until=fmt_date(until.date(), lang), **kw),
                          data={"matched": False, "ticket": sr.id, "reminders_paused_until": until.date().isoformat()})


# ---- emi_date_change ----
class EmiDateIn(ActionIn):
    new_day: int = Field(ge=1, le=28)


@action("emi_date_change", In=EmiDateIn, router=router)
async def emi_date_change(inp: EmiDateIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(lang)

    def no(key: str, **kw) -> ActionResponse:
        return ActionResponse(ok=False, speak=t(key, lang, **kw), data={"reason": key})

    if loan.status != "active":
        return no("ineligible_status")
    overdue = (await db.execute(select(EmiSchedule.id).where(
        EmiSchedule.loan_id == loan.id, EmiSchedule.due_date < date.today(), EmiSchedule.status != "paid").limit(1))).first()
    if overdue:
        return no("ineligible_overdue")
    cutoff = datetime.now(timezone.utc) - timedelta(days=183)
    recent = (await db.execute(select(ServiceRequest.id).where(
        ServiceRequest.customer_id == session.customer_id, ServiceRequest.type == "emi_date_change",
        ServiceRequest.created_at >= cutoff).limit(1))).first()
    if recent:
        return no("ineligible_recent")
    if inp.new_day == loan.emi_day:
        return no("ineligible_same", day=inp.new_day)
    if not session.has_readback("new_day", str(inp.new_day)):
        return readback_needed(lang, "readback_new_day", ["new_day"], day=inp.new_day)
    session.consume_readback("new_day")
    sr = await new_request(db, session, "emi_date_change", {"old_day": loan.emi_day, "new_day": inp.new_day})
    return ActionResponse(ok=True, speak=t("emi_date_changed", lang, ticket=sr.id, day=inp.new_day),
                          data={"ticket": sr.id, "new_day": inp.new_day})


# ---- foreclosure_quote ----
@action("foreclosure_quote", In=NoInput, router=router)
async def foreclosure_quote(inp: NoInput, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(inp.language)
    charges = sum((await db.execute(select(Charge.amount).where(Charge.loan_id == loan.id))).scalars().all())
    # RBI: no foreclosure charge on floating-rate loans to individuals; fixed-rate 2% (policy assumption)
    fee = 0 if loan.rate_type == "floating" else round(loan.outstanding * 0.02)
    total = loan.outstanding + charges + fee
    kw = dict(loan=mask_loan(loan.loan_last4), total=rupees(total), outstanding=rupees(loan.outstanding),
              charges=rupees(charges))
    key = "foreclosure_quote_nofee" if fee == 0 else "foreclosure_quote"
    if fee:
        kw["fee"] = rupees(fee)
    return ActionResponse(ok=True, speak=t(key, inp.language, **kw),
                          data={"total": total, "outstanding": loan.outstanding, "charges": charges, "fee": fee,
                                "as_of": date.today().isoformat()})


# ---- raise_closure ----
class ClosureIn(ActionIn):
    pass


@action("raise_closure", In=ClosureIn, router=router)
async def raise_closure(inp: ClosureIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    loan = await get_loan(db, session)
    if loan is None:
        return no_loan(inp.language)
    loan_m = mask_loan(loan.loan_last4)
    if not session.has_readback("closure", "yes"):
        return readback_needed(inp.language, "readback_closure", ["closure"], loan=loan_m)
    session.consume_readback("closure")
    sr = await new_request(db, session, "closure", {"loan": loan_m})
    return ActionResponse(ok=True, speak=t("closure_raised", inp.language, ticket=sr.id, loan=loan_m),
                          data={"ticket": sr.id, "noc_days": 30})
