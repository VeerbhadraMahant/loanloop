"""Call lifecycle actions: start_call, confirm_readback, report_secret_spoken, end_call."""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import authsess, events, sessions
from app.contract import ActionIn, ActionResponse
from app.db.models import Call, CollectionCase, Customer, now
from app.routes.actions._runner import action
from app.speak import t

router = APIRouter(prefix="/actions")


class StartCallIn(ActionIn):
    caller_number: str | None = Field(default=None, max_length=20, pattern=r"^[+\d][\d \-]{5,19}$")
    direction: Literal["inbound", "outbound"] = "inbound"
    case_id: int | None = Field(default=None, ge=1, le=2_000_000_000)  # outbound only
    app_session: str | None = Field(default=None, max_length=200, pattern=r"^[A-Za-z0-9_\-]{1,200}$")  # inbound: web customer login id


# scan_exempt: a random token must not trip the PIN/card scan. Not in redact_fields: that would mangle the token and audit it.
@action("start_call", In=StartCallIn, router=router, needs_session=False, scan_exempt=("app_session",))
async def start_call(inp: StartCallIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    cust_id, case_id = None, None
    app_cust, first_name = None, None
    if inp.app_session and inp.direction == "inbound":  # the gateway validates the login itself; invalid/staff/expired: silently tier 0
        a = await authsess.get(inp.app_session)
        if a and a.get("kind") == "customer" and a.get("customer_id"):
            app_cust = await db.get(Customer, a["customer_id"])
            first_name = app_cust.name.split()[0] if app_cust and app_cust.name.split() else None
    if await sessions.get(inp.call_id) is not None:  # never reset a live session (tier, direction, case)
        return ActionResponse(ok=False, speak=t("generic_error", inp.language), error_code="INVALID_INPUT")
    if inp.direction == "outbound" and inp.case_id:
        case = await db.get(CollectionCase, inp.case_id)
        if case is None or case.status == "resolved":
            return ActionResponse(ok=False, speak=t("not_found", inp.language), error_code="NOT_FOUND")
        case_id, case.attempts, case.last_call_at = case.id, case.attempts + 1, now()
    if inp.caller_number:
        mobile = "".join(c for c in inp.caller_number if c.isdigit())[-10:]
        cust_id = (await db.execute(select(Customer.id).where(Customer.registered_mobile == mobile))).scalar()
    # caller-ID is only a claim: tier stays 0, customer_id stays unset until verify_caller
    s = await sessions.create(inp.call_id, inp.language, prefetched_customer_id=cust_id, direction=inp.direction, case_id=case_id)
    if app_cust is not None:
        s.customer_id, s.tier = app_cust.id, 1
        await sessions.save(s)
    existing = await db.get(Call, inp.call_id)
    if existing is None:
        db.add(Call(call_id=inp.call_id, language=inp.language, direction=inp.direction))
    bg.add_task(events.publish, {"type": "call_start", "call_id": inp.call_id, "language": inp.language, "tier": s.tier})
    key = "call_started_out" if inp.direction == "outbound" else "call_started"
    data = {"matched_caller": cust_id is not None, "direction": inp.direction, "app_verified": app_cust is not None}
    if app_cust is not None:
        data["first_name"] = first_name
    return ActionResponse(ok=True, speak=t(key, inp.language), data=data)


class ReadbackIn(ActionIn):
    field: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    value: str = Field(max_length=200)


@action("confirm_readback", In=ReadbackIn, router=router)
async def confirm_readback(inp: ReadbackIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    session.confirm_readback(inp.field, inp.value)
    return ActionResponse(ok=True, speak=t("readback_ok", inp.language), data={"field": inp.field})


class SecretSpokenIn(ActionIn):
    secret_type: Literal["password", "pin", "otp", "cvv", "card", "card_number", "other"] = "other"


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
