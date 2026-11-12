"""Login sessions (staff / customer) in Redis: sliding idle TTL, 8 h absolute cap, lockout counters."""
import json
import secrets
import time

from app.db.models import StaffUser
from app.db.session import SessionLocal
from app.sessions import redis

IDLE_S = {"staff": 1800, "customer": 900}
ABSOLUTE_S = 8 * 3600
LOCK_AFTER, LOCK_S = 5, 900


def _key(sid: str) -> str:
    return f"ll:auth:sess:{sid}"


async def create(data: dict) -> str:
    sid = secrets.token_urlsafe(32)
    await redis.set(_key(sid), json.dumps({**data, "created": time.time()}), ex=IDLE_S[data["kind"]])
    return sid


async def get(sid: str | None, touch: bool = False) -> dict | None:
    """Valid session dict or None. Only touch=True (a real user action: GET /auth/session) refreshes the idle TTL, so
    background polling cannot keep a session alive. Staff sessions are re-checked against the staff_users row every time
    (disabled or deleted -> invalid) and carry the DB's current role."""
    if not sid:
        return None
    raw = await redis.get(_key(sid))
    if not raw:
        return None
    d = json.loads(raw)
    if time.time() - d["created"] > ABSOLUTE_S:
        await redis.delete(_key(sid))
        return None
    if d["kind"] == "staff":
        async with SessionLocal() as db:
            u = await db.get(StaffUser, d.get("user_id"))
        if u is None or u.disabled:
            await redis.delete(_key(sid))
            return None
        d["role"] = u.role
    if touch:
        await redis.expire(_key(sid), IDLE_S[d["kind"]])
    return d


async def delete(sid: str | None) -> None:
    if sid:
        await redis.delete(_key(sid))


def _fail_key(kind: str, ident: str) -> str:
    return f"ll:auth:fail:{kind}:{ident}"


async def bump_fails(kind: str, ident: str) -> int:
    """Count this attempt before it is checked (atomic: expiry set only when the key is new). > LOCK_AFTER means locked."""
    k = _fail_key(kind, ident)
    async with redis.pipeline(transaction=True) as p:
        p.set(k, 0, nx=True, ex=LOCK_S)
        p.incr(k)
        return (await p.execute())[1]


async def clear_fails(kind: str, ident: str) -> None:
    await redis.delete(_fail_key(kind, ident))
