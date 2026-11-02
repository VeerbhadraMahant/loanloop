"""Actions: verify_caller (tier 0->1, brute-force limits)."""
import hashlib
from datetime import date

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field, model_validator
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


class VerifyIn(ActionIn):
    registered_mobile: str = Field(pattern=r"^[+\d][\d \-]{5,19}$")
    dob: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    loan_last4: str | None = Field(default=None, pattern=r"^\d{4}$")

    @model_validator(mode="after")
    def _one_of(self):
        if not (self.dob or self.loan_last4):
            raise ValueError("dob or loan_last4 required")
        return self


def _norm(m: str) -> str:
    d = "".join(c for c in m if c.isdigit())
    return d[2:] if len(d) == 12 and d.startswith("91") else d


async def _peek(key: str) -> int:
    return int(await sessions.redis.get(f"ll:rl:{key}") or 0)


@action("verify_caller", In=VerifyIn, router=router)
async def verify_caller(inp: VerifyIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    def limited() -> ActionResponse:
        return ActionResponse(ok=False, speak=t("rate_limited", inp.language), error_code="RATE_LIMITED", next="handover")

    if session.failed_attempts >= MAX_FAILS:
        return limited()

    mobile = _norm(inp.registered_mobile)
    cust = (await db.execute(select(Customer).where(Customer.registered_mobile == mobile))).scalar_one_or_none()
    key = f"verify:c{cust.id}" if cust else "verify:m" + hashlib.sha256(mobile.encode()).hexdigest()[:16]
    if await _peek(key) >= MAX_FAILS:
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
        await sessions.incr(key, HOUR)
        await events.publish({"type": "security", "call_id": inp.call_id, "event": "VERIFY_FAILED"})
        return ActionResponse(ok=False, speak=t("verify_failed", inp.language), error_code="NOT_VERIFIED",
                              next="handover" if session.failed_attempts >= MAX_FAILS else None)

    mismatch = session.prefetched_customer_id is not None and session.prefetched_customer_id != cust.id
    if session.customer_id != cust.id:
        session.tier, session.approval_id = 1, None  # switching identity never keeps an old tier-2
    session.customer_id, session.tier = cust.id, max(session.tier, 1)
    if mismatch:
        await events.publish({"type": "security", "call_id": inp.call_id, "event": "CALLER_ID_MISMATCH"})
    return ActionResponse(ok=True, speak=t("verify_ok", inp.language, name=cust.name.split()[0]),
                          data={"tier": 1, "caller_id_mismatch": mismatch})
