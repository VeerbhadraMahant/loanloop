"""Mock phone / bank-app endpoints (SMS inbox, approval tap). Dashboard-token auth. Serves the customer's own device."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import events
from app.db.models import Approval, Customer, SmsOutbox
from app.db.session import get_db
from app.routes.actions.approvals import APPROVAL_TTL, expire_if_stale
from app.security.auth import require_dashboard
from app.security.mask import mask_mobile
from app.sms import PERSONAS

router = APIRouter(prefix="/phone", dependencies=[Depends(require_dashboard)])


async def _customer(key: str, db: AsyncSession) -> Customer:
    key = key.lower()
    if key.startswith("c") and key[1:].isdigit():
        c = await db.get(Customer, int(key[1:]))
    elif key in PERSONAS:
        c = (await db.execute(select(Customer).where(Customer.name == PERSONAS[key]).order_by(Customer.id))).scalars().first()
    else:
        c = None
    if c is None:
        raise HTTPException(404, "not found")
    return c


@router.get("/{key}")
async def profile(key: str, db: AsyncSession = Depends(get_db)):
    c = await _customer(key, db)
    return {"name": c.name, "mobile_masked": mask_mobile(c.registered_mobile)}


@router.get("/{key}/sms")
async def sms(key: str, db: AsyncSession = Depends(get_db)):
    c = await _customer(key, db)
    rows = (await db.execute(select(SmsOutbox).where(SmsOutbox.customer_id == c.id).order_by(SmsOutbox.id.desc()).limit(50))).scalars()
    return [{"id": r.id, "body": r.body, "created_at": r.created_at} for r in rows]


@router.get("/{key}/approvals")
async def approvals(key: str, db: AsyncSession = Depends(get_db)):
    c = await _customer(key, db)
    rows = (await db.execute(select(Approval).where(Approval.customer_id == c.id).order_by(Approval.id.desc()).limit(20))).scalars().all()
    if any([expire_if_stale(a) for a in rows]):
        await db.commit()
    return [{"id": a.id, "purpose": a.purpose, "status": a.status, "created_at": a.created_at,
             "expires_at": a.created_at + APPROVAL_TTL} for a in rows]


async def _decide(key: str, aid: int, status: str, db: AsyncSession) -> dict:
    c = await _customer(key, db)
    a = await db.get(Approval, aid)
    if a is None or a.customer_id != c.id:
        raise HTTPException(404, "not found")  # someone else's approval looks the same as a missing one
    expired = expire_if_stale(a)
    if a.status != "pending":
        if expired:
            await db.commit()
            await events.publish({"type": "security", "call_id": a.session_id, "customer_key": key, "event": "APPROVAL_EXPIRED"})
        raise HTTPException(409, "approval is not pending")
    a.status = status
    await db.commit()
    await events.publish({"type": "approval", "call_id": a.session_id, "customer_key": key, "detail": f"approval {status}",
                          "approval_id": a.id})
    return {"ok": True}


@router.post("/{key}/approvals/{aid}/approve")
async def approve(key: str, aid: int, db: AsyncSession = Depends(get_db)):
    return await _decide(key, aid, "approved", db)


@router.post("/{key}/approvals/{aid}/deny")
async def deny(key: str, aid: int, db: AsyncSession = Depends(get_db)):
    return await _decide(key, aid, "denied", db)
