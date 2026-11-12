"""Per-user login: staff (email + password) and customer (mobile + 6-digit passcode). Sessions live in Redis (authsess)."""
import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import authsess
from app.audit import write_audit
from app.db.models import Customer, CustomerLogin, StaffUser
from app.db.session import get_db
from app.security.passwords import verify_secret
from app.sms import customer_key

router = APIRouter(prefix="/auth")
LANDING = {"bank_manager": "/bank", "admin": "/bank", "engineer": "/dev"}


class StaffLogin(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class CustomerLoginBody(BaseModel):
    mobile: str = Field(max_length=30)
    passcode: str = Field(pattern=r"^\d{6}$")


async def _audit(db: AsyncSession, action: str, kind: str, outcome: str = "ok", role: str | None = None, code: str | None = None):
    write_audit(db, call_id="auth", action=action, outcome=outcome, error_code=code,
                flags={"kind": kind, **({"role": role} if role else {})})  # never the identifier, secret or session id
    await db.commit()


async def _attempt(db: AsyncSession, kind: str, ident: str, secret: str, stored: str | None) -> None:
    """Lockout gate + secret check (a miss costs one scrypt either way). Returns on success; raises 429/401 otherwise.
    The attempt is counted atomically BEFORE scrypt, so a burst of parallel guesses cannot all slip under the limit."""
    if await authsess.bump_fails(kind, ident) > authsess.LOCK_AFTER:
        await _audit(db, "auth.locked", kind, "denied", code="LOCKED")
        raise HTTPException(429, "too many attempts")
    if await asyncio.to_thread(verify_secret, secret, stored):  # scrypt is ~50 ms of CPU: keep it off the event loop
        await authsess.clear_fails(kind, ident)
        return
    await _audit(db, "auth.login_failed", kind, "denied", code="BAD_CREDENTIALS")
    raise HTTPException(401, "invalid credentials")


@router.post("/staff/login")
async def staff_login(body: StaffLogin, db: AsyncSession = Depends(get_db)):
    email = body.email.strip().lower()
    u = (await db.execute(select(StaffUser).where(StaffUser.email == email))).scalar_one_or_none()
    if u is not None and u.disabled:
        u = None
    await _attempt(db, "staff", email, body.password, u.password_hash if u else None)
    sid = await authsess.create({"kind": "staff", "role": u.role, "name": u.name, "user_id": u.id})
    await _audit(db, "auth.login", "staff", role=u.role)
    return {"session_id": sid, "kind": "staff", "role": u.role, "name": u.name, "landing": LANDING[u.role]}


@router.post("/customer/login")
async def customer_login(body: CustomerLoginBody, db: AsyncSession = Depends(get_db)):
    mobile = "".join(ch for ch in body.mobile if ch.isdigit())[-10:]
    rows = (await db.execute(select(Customer).where(Customer.registered_mobile == mobile).limit(2))).scalars().all() if mobile else []
    c = rows[0] if len(rows) == 1 else None  # a mobile shared by two customers is ambiguous: invalid credentials, not a 500
    cl = await db.get(CustomerLogin, c.id) if c else None
    await _attempt(db, "customer", mobile, body.passcode, cl.passcode_hash if cl else None)
    key = customer_key(c)
    sid = await authsess.create({"kind": "customer", "role": "customer", "name": c.name, "customer_id": c.id, "customer_key": key})
    await _audit(db, "auth.login", "customer", role="customer")
    return {"session_id": sid, "kind": "customer", "role": "customer", "name": c.name, "customer_key": key, "landing": "/phone"}


@router.get("/session")
async def session(x_ll_session: str | None = Header(default=None)):
    s = await authsess.get(x_ll_session, touch=True)
    if s is None:
        raise HTTPException(401, "unauthorized")
    return {k: s[k] for k in ("kind", "role", "name", "customer_id", "customer_key") if k in s}


@router.post("/logout", status_code=204)
async def logout(x_ll_session: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    s = await authsess.get(x_ll_session)
    await authsess.delete(x_ll_session)
    if s:
        await _audit(db, "auth.logout", s["kind"], role=s["role"])
    return Response(status_code=204)
