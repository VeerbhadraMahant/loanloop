"""Actions: report_hardship, handover."""
from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import events, sessions
from app.contract import ActionIn, ActionResponse
from app.db.models import Handover
from app.routes.actions._runner import action
from app.sessions import Session
from app.speak import t

router = APIRouter(prefix="/actions")


async def _packet(db: AsyncSession, call_id: str, session: Session | None, reason: str, summary: str,
                  extra_pending: list[str]) -> Handover:
    tasks = session.tasks if session else []
    done = [x.removesuffix(":done") for x in tasks if x.endswith(":done")]
    pending = [x.removesuffix(":pending") for x in tasks if x.endswith(":pending")] + extra_pending
    if done:
        summary = f"{summary} Done in this call: {', '.join(done)}."
    h = Handover(call_id=call_id, customer_id=session.customer_id if session else None, reason=reason,
                 summary=summary, requests_done=done, requests_pending=pending)
    db.add(h)
    await db.flush()
    await events.publish({"type": "handover", "call_id": call_id, "reason": reason, "handover_id": h.id})
    return h


class HardshipIn(ActionIn):
    reason: str = Field(min_length=2, max_length=300)


@action("report_hardship", In=HardshipIn, router=router)
async def report_hardship(inp: HardshipIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    h = await _packet(db, inp.call_id, session, "hardship", f"Customer reports financial hardship: {inp.reason}.", ["hardship_support"])
    session.tasks.append("hardship:done")
    return ActionResponse(ok=True, speak=t("hardship_ack", inp.language), data={"handover_id": h.id}, next="handover")


class HandoverIn(ActionIn):
    reason: str = Field(min_length=2, max_length=200)
    summary: str = Field(min_length=2, max_length=1000)


@action("handover", In=HandoverIn, router=router, needs_session=False)
async def handover(inp: HandoverIn, session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    sess = await sessions.get(inp.call_id)  # may be None or tier 0: handover is always allowed
    h = await _packet(db, inp.call_id, sess, inp.reason, inp.summary, [inp.reason])
    return ActionResponse(ok=True, speak=t("handover_ack", inp.language), data={"handover_id": h.id}, next="handover")
