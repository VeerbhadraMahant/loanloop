"""Actions: branch_lookup, validate_ifsc, get_masked_profile, send_details_sms, password_reset_help."""
import re
from difflib import SequenceMatcher
from typing import Literal

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contract import ActionIn, ActionResponse
from app.db.crypto import decrypt
from app.db.models import Account, Branch, Customer, Loan
from app.routes.actions._runner import action
from app.security import mask
from app.sms import send_sms
from app.speak import digits, t
from app.speak.templates.details import ending, spell_ifsc

router = APIRouter(prefix="/actions")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def _branch_speak(key: str, b: Branch, lang: str) -> str:
    return t(key, lang, name=b.name, address=b.address, ifsc=spell_ifsc(b.ifsc, lang), micr=digits(b.micr, 3), hours=b.hours)


def _score(q: str, b: Branch) -> float:
    best = 0.0
    for f in (b.name, b.city, b.address):
        f = f.lower()
        if q in f:
            return 1.0
        best = max(best, SequenceMatcher(None, q, f).ratio(), *(SequenceMatcher(None, w, x).ratio() for w in q.split() for x in re.split(r"\W+", f) if x))
    return best


_BRANCHES: list[Branch] | None = None  # branches are static: load once per process


async def _branches(db: AsyncSession) -> list[Branch]:
    global _BRANCHES
    if _BRANCHES is None:
        _BRANCHES = list((await db.execute(select(Branch))).scalars())
        for b in _BRANCHES:
            db.expunge(b)  # detached copies are safe to share across requests
    return _BRANCHES


class BranchIn(ActionIn):
    query: str = Field(min_length=2, max_length=80)


@action("branch_lookup", In=BranchIn, router=router)
async def branch_lookup(inp: BranchIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    q = inp.query.lower().strip()
    ranked = sorted(((_score(q, b), b) for b in await _branches(db)), key=lambda x: -x[0])
    if not ranked or ranked[0][0] < 0.7:
        return ActionResponse(ok=False, speak=t("not_found", inp.language), error_code="NOT_FOUND")
    b = ranked[0][1]
    return ActionResponse(ok=True, speak=_branch_speak("branch_found", b, inp.language),
                          data={"ifsc": b.ifsc, "micr": b.micr, "name": b.name, "city": b.city})


class IfscIn(ActionIn):
    ifsc: str = Field(min_length=1, max_length=20)


@action("validate_ifsc", In=IfscIn, router=router)
async def validate_ifsc(inp: IfscIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    code = "".join(inp.ifsc.split()).upper()
    if not IFSC_RE.match(code):
        return ActionResponse(ok=False, speak=t("ifsc_bad_format", inp.language), error_code="INVALID_INPUT")
    if code.startswith("SAHY0"):
        b = await db.get(Branch, code)
        if b is None:
            return ActionResponse(ok=False, speak=t("not_found", inp.language), error_code="NOT_FOUND",
                                  data={"valid_format": True, "sahyadri": False})
        return ActionResponse(ok=True, speak=t("ifsc_sahyadri", inp.language, ifsc=spell_ifsc(code, inp.language), name=b.name, address=b.address),
                              data={"valid_format": True, "sahyadri": True, "name": b.name})
    return ActionResponse(ok=True, speak=t("ifsc_other", inp.language, ifsc=spell_ifsc(code, inp.language)),
                          data={"valid_format": True, "sahyadri": False})


ProfileField = Literal["mobile", "email", "account", "account_number", "loan", "loan_number", "customer_id", "ifsc", "branch"]


class ProfileIn(ActionIn):
    fields: list[ProfileField] = Field(min_length=1, max_length=9)


@action("get_masked_profile", In=ProfileIn, router=router)
async def get_masked_profile(inp: ProfileIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    c = await db.get(Customer, session.customer_id)
    acct = (await db.execute(select(Account).where(Account.customer_id == c.id).order_by(Account.id))).scalars().first()
    loans = (await db.execute(select(Loan).where(Loan.customer_id == c.id).order_by(Loan.id))).scalars().all()
    branch = await db.get(Branch, acct.branch_ifsc) if acct else None

    def end(masked: str) -> str:  # masked is "ending NNNN": speak it localised, digits grouped
        return ending(masked[-4:], lang)

    values: dict[str, str | None] = {
        "mobile": end(mask.mask_mobile(c.registered_mobile)),
        "email": mask.mask_email(c.email),
        "account": end(mask.mask_account(acct.account_last4)) if acct else None,
        "loan": ", ".join(end(mask.mask_loan(ln.loan_last4)) for ln in loans) or None,
        "customer_id": end(mask.mask_customer_id(c.customer_id)),
        "ifsc": end(mask.mask_account(branch.ifsc[-4:])) if branch else None,
        "branch": f"{branch.name}, {branch.city}" if branch else None,
    }
    alias = {"account_number": "account", "loan_number": "loan"}
    parts, shown = [], []
    for f in dict.fromkeys(alias.get(x, x) for x in inp.fields):
        v = values[f]
        parts.append(t("mp_line", lang, label=t(f"label_{f}", lang), v=v) if v else t("mp_none", lang))
        if v:
            shown.append(f)
    return ActionResponse(ok=True, speak=" ".join(parts), data={"fields": shown})


SmsField = Literal["account_number", "ifsc", "customer_id", "branch_address"]


class SmsIn(ActionIn):
    fields: list[SmsField] = Field(min_length=1, max_length=4)


async def _deliver(customer: Customer, parts: dict[str, str], call_id: str) -> None:
    """Background: the only place the account number is decrypted. Full values exist only in the SMS body."""
    if "account_number" in parts:
        parts["account_number"] = decrypt(parts["account_number"])
    labels = {"account_number": "Account no.", "ifsc": "IFSC", "customer_id": "Customer ID", "branch_address": "Branch"}
    body = "Sahyadri Finance Bank: " + "; ".join(f"{labels[k]} {v}" for k, v in parts.items()) + ". We never ask for passwords, PINs or OTPs."
    await send_sms(customer, body, call_id)


@action("send_details_sms", In=SmsIn, router=router)
async def send_details_sms(inp: SmsIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    c = await db.get(Customer, session.customer_id)
    fields = list(dict.fromkeys(inp.fields))
    acct = (await db.execute(select(Account).where(Account.customer_id == c.id).order_by(Account.id))).scalars().first()
    branch = await db.get(Branch, acct.branch_ifsc) if acct else None
    parts: dict[str, str] = {}
    for f in fields:
        if f == "customer_id":
            parts[f] = c.customer_id
        elif f == "account_number" and acct:
            parts[f] = acct.account_number  # still encrypted; decrypted in the background task
        elif f == "ifsc" and branch:
            parts[f] = branch.ifsc
        elif f == "branch_address" and branch:
            parts[f] = f"{branch.name}, {branch.address}"
        else:
            return ActionResponse(ok=False, speak=t("not_found", inp.language), error_code="NOT_FOUND")
    bg.add_task(_deliver, c, parts, inp.call_id)
    return ActionResponse(ok=True, speak=t("sms_sent", inp.language, v=ending(c.registered_mobile[-4:], inp.language)),
                          data={"sent_to": mask.mask_mobile(c.registered_mobile), "fields": fields})


class PwIn(ActionIn):
    channel: Literal["app", "netbanking"]


@action("password_reset_help", In=PwIn, router=router)
async def password_reset_help(inp: PwIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    return ActionResponse(ok=True, speak=t(f"pw_{inp.channel}", inp.language), data={"channel": inp.channel})
