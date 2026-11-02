"""Actions: request_app_approval, check_approval (tier 1->2)."""
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.contract import ActionIn, ActionResponse
from app.db.models import Approval, Customer, now
from app.routes.actions._runner import action
from app.sms import customer_key
from app.speak import t

router = APIRouter(prefix="/actions")
APPROVAL_TTL = timedelta(minutes=2)


def expire_if_stale(a: Approval) -> bool:
    """Mark a stale pending approval expired (caller commits). True if it was just expired."""
    if a.status == "pending" and now() - a.created_at > APPROVAL_TTL:
        a.status = "expired"
        return True
    return False


class RequestApprovalIn(ActionIn):
    purpose: str = Field(min_length=1, max_length=100)


@action("request_app_approval", In=RequestApprovalIn, router=router)
async def request_app_approval(inp: RequestApprovalIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    cust = await db.get(Customer, session.customer_id)
    a = Approval(session_id=session.call_id, customer_id=cust.id, purpose=inp.purpose, status="pending")
    db.add(a)
    await db.flush()
    session.approval_id = a.id
    # background task runs after the runner commits, so the phone UI sees the row when it refetches
    bg.add_task(events.publish, {"type": "approval", "call_id": inp.call_id, "customer_key": customer_key(cust),
                                 "detail": "approval requested", "approval_id": a.id})
    return ActionResponse(ok=True, speak=t("approval_sent", inp.language), data={"approval_id": a.id}, next="need_tier_2")


class CheckApprovalIn(ActionIn):
    approval_id: str = Field(pattern=r"^\d{1,12}$")


@action("check_approval", In=CheckApprovalIn, router=router)
async def check_approval(inp: CheckApprovalIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    aid = int(inp.approval_id)
    a = await db.get(Approval, aid) if session.approval_id == aid else None
    if a is None or a.customer_id != session.customer_id:
        return ActionResponse(ok=False, speak=t("not_found", inp.language), error_code="NOT_FOUND")
    if expire_if_stale(a):
        bg.add_task(events.publish, {"type": "security", "call_id": inp.call_id, "event": "APPROVAL_EXPIRED"})
    if a.status == "approved":
        session.tier = max(session.tier, 2)
        return ActionResponse(ok=True, speak=t("approval_ok", inp.language), data={"status": "approved", "tier": 2})
    if a.status == "pending":
        return ActionResponse(ok=True, speak=t("approval_pending", inp.language), data={"status": "pending"}, next="need_tier_2")
    if a.status == "denied":
        bg.add_task(events.publish, {"type": "security", "call_id": inp.call_id, "event": "APPROVAL_DENIED"})
    return ActionResponse(ok=False, speak=t(f"approval_{a.status}", inp.language), data={"status": a.status},
                          error_code="TIER_TOO_LOW")
