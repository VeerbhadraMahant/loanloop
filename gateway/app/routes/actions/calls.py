"""Call lifecycle actions: start_call, confirm_readback, report_secret_spoken, end_call."""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events, sessions
from app.contract import ActionIn, ActionResponse
from app.db.models import Call, Customer, now
from app.routes.actions._runner import action
from app.speak import t

router = APIRouter(prefix="/actions")


class StartCallIn(ActionIn):
    caller_number: str | None = Field(default=None, max_length=20, pattern=r"^[+\d][\d \-]{5,19}$")


@action("start_call", In=StartCallIn, router=router, needs_session=False)
async def start_call(inp: StartCallIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    cust_id = None
    if inp.caller_number:
        mobile = "".join(c for c in inp.caller_number if c.isdigit())[-10:]
        cust_id = (await db.execute(select(Customer.id).where(Customer.registered_mobile == mobile))).scalar()
    # caller-ID is only a claim: tier stays 0, customer_id stays unset until verify_caller
    await sessions.create(inp.call_id, inp.language, prefetched_customer_id=cust_id)
    existing = await db.get(Call, inp.call_id)
    if existing is None:
        db.add(Call(call_id=inp.call_id, language=inp.language))
    bg.add_task(events.publish, {"type": "call_start", "call_id": inp.call_id, "language": inp.language, "tier": 0})
    return ActionResponse(ok=True, speak=t("call_started", inp.language), data={"matched_caller": cust_id is not None})


class ReadbackIn(ActionIn):
    field: str = Field(pattern=r"^[a-z_]{1,40}$")
    value: str = Field(max_length=200)


@action("confirm_readback", In=ReadbackIn, router=router)
async def confirm_readback(inp: ReadbackIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    session.confirm_readback(inp.field, inp.value)
    return ActionResponse(ok=True, speak=t("readback_ok", inp.language), data={"field": inp.field})


class SecretSpokenIn(ActionIn):
    secret_type: Literal["password", "pin", "otp", "cvv", "card_number", "other"] = "other"


@action("report_secret_spoken", In=SecretSpokenIn, router=router, scan_exempt=("secret_type",))
async def report_secret_spoken(inp: SecretSpokenIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    cref, ckey = await events.customer_info(db, session.customer_id)
    await events.publish({"type": "security", "call_id": inp.call_id, "action": "report_secret_spoken",
                          "tier": session.tier, "outcome": "blocked", "language": inp.language,
                          "customer_ref": cref, "customer_key": ckey,
                          "detail": f"Caller spoke a secret ({inp.secret_type}); not stored"})
    return ActionResponse(ok=True, speak=t("secret_reassure", inp.language), data={"secret_type": inp.secret_type})


class EndCallIn(ActionIn):
    outcome: str = Field(default="completed", pattern=r"^[A-Za-z0-9_\- ]{1,40}$")


@action("end_call", In=EndCallIn, router=router, ends_session=True)
async def end_call(inp: EndCallIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    call = await db.get(Call, inp.call_id)
    if call is not None:
        call.ended_at, call.outcome, call.customer_id = now(), inp.outcome, session.customer_id
    cref, ckey = await events.customer_info(db, session.customer_id)
    bg.add_task(events.publish, {"type": "call_end", "call_id": inp.call_id, "language": inp.language,
                                 "tier": session.tier, "customer_ref": cref, "customer_key": ckey,
                                 "detail": inp.outcome})
    return ActionResponse(ok=True, speak=t("call_ended", inp.language), data={"outcome": inp.outcome})
