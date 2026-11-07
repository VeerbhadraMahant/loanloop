"""Actions: verify_caller (tier 0->1, brute-force limits)."""
import hashlib
import re
from datetime import date

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events, sessions
from app.contract import ActionIn, ActionResponse
from app.db.models import Customer, Loan
from app.routes.actions._runner import action
from app.speak import t

router = APIRouter(prefix="/actions")
MAX_FAILS = 3
HOUR = 3600

MONTHS_MAP = {
    "jan": 1, "january": 1, "जनवरी": 1, "जानेवारी": 1,
    "feb": 2, "february": 2, "फ़रवरी": 2, "फेब्रुवारी": 2, "फरवरी": 2,
    "mar": 3, "march": 3, "मार्च": 3,
    "apr": 4, "april": 4, "अप्रैल": 4, "एप्रिल": 4,
    "may": 5, "मई": 5, "मे": 5,
    "jun": 6, "june": 6, "जून": 6,
    "jul": 7, "july": 7, "जुलाई": 7, "जुलै": 7,
    "aug": 8, "august": 8, "अगस्त": 8, "ऑगस्ट": 8,
    "sep": 9, "september": 9, "सितंबर": 9, "सप्टेंबर": 9, "सितम्बर": 9,
    "oct": 10, "october": 10, "अक्टूबर": 10, "ऑक्टोबर": 10,
    "nov": 11, "november": 11, "नवंबर": 11, "नोव्हेंबर": 11,
    "dec": 12, "december": 12, "दिसंबर": 12, "डिसेंबर": 12,
}


def parse_dob(v: str) -> str | None:
    if not v or not isinstance(v, str):
        return None
    v = v.strip().lower()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return v
    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$", v)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$", v)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z\u0900-\u097f]+)[,\s]+(\d{4})", v)
    if m and m.group(2).lower() in MONTHS_MAP:
        return f"{m.group(3)}-{MONTHS_MAP[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"([a-zA-Z\u0900-\u097f]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})", v)
    if m and m.group(1).lower() in MONTHS_MAP:
        return f"{m.group(3)}-{MONTHS_MAP[m.group(1).lower()]:02d}-{int(m.group(2)):02d}"
    return v


class VerifyIn(ActionIn):
    registered_mobile: str = Field(pattern=r"^[+\d][\d \-]{5,19}$")
    dob: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    loan_last4: str | None = Field(default=None, pattern=r"^\d{4}$")

    @field_validator("registered_mobile", mode="before")
    @classmethod
    def _norm_mob(cls, v):
        if isinstance(v, str):
            d = "".join(c for c in v if c.isdigit())
            if len(d) >= 10:
                return d[-10:]
        return v

    @field_validator("dob", mode="before")
    @classmethod
    def _norm_dob(cls, v):
        if isinstance(v, str):
            p = parse_dob(v)
            if p:
                return p
        return v

    @model_validator(mode="after")
    def _one_of(self):
        if not (self.dob or self.loan_last4):
            raise ValueError("dob or loan_last4 required")
        return self


def _norm(m: str) -> str:
    d = "".join(c for c in m if c.isdigit())
    return d[-10:] if len(d) >= 10 else d


@action("verify_caller", In=VerifyIn, router=router)
async def verify_caller(inp: VerifyIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    def limited() -> ActionResponse:
        return ActionResponse(ok=False, speak=t("rate_limited", inp.language), error_code="RATE_LIMITED", next="handover")

    if session.failed_attempts >= MAX_FAILS:
        return limited()

    mobile = _norm(inp.registered_mobile)
    cust = (await db.execute(select(Customer).where(Customer.registered_mobile == mobile))).scalar_one_or_none()
    key = f"verify:c{cust.id}" if cust else "verify:m" + hashlib.sha256(mobile.encode()).hexdigest()[:16]
    if await sessions.incr(key, HOUR) > MAX_FAILS:  # atomic: INCR first, then compare
        return limited()

    ok = False
    if cust:
        if inp.dob:
            try:
                ok = date.fromisoformat(inp.dob) == cust.dob
            except ValueError:
                ok = False
        if not ok and inp.loan_last4:
            ok = (await db.execute(select(Loan.id).where(Loan.customer_id == cust.id, Loan.loan_last4 == inp.loan_last4))).first() is not None

    if not ok:  # generic: never reveals which part was wrong
        session.failed_attempts += 1
        await events.publish({"type": "security", "call_id": inp.call_id, "event": "VERIFY_FAILED"})
        return ActionResponse(ok=False, speak=t("verify_failed", inp.language), error_code="NOT_VERIFIED",
                              next="handover" if session.failed_attempts >= MAX_FAILS else None)

    await sessions.redis.decr(f"ll:rl:{key}")  # a success is not a failed attempt
    mismatch = session.prefetched_customer_id is not None and session.prefetched_customer_id != cust.id
    if session.customer_id != cust.id:
        session.tier, session.approval_id = 1, None  # switching identity never keeps an old tier-2
    session.customer_id, session.tier = cust.id, max(session.tier, 1)
    if mismatch:
        await events.publish({"type": "security", "call_id": inp.call_id, "event": "CALLER_ID_MISMATCH"})
    return ActionResponse(ok=True, speak=t("verify_ok", inp.language, name=cust.name.split()[0]),
                          data={"tier": 1, "caller_id_mismatch": mismatch})
