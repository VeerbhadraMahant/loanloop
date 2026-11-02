"""Live event stream for the ops dashboard. Events must contain only masked data."""
import asyncio
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from app.logging import redact
from app.security.auth import require_dashboard
from app.sessions import redis

STREAM = "ll:events"
router = APIRouter()
_CIF = re.compile(r"\b[A-Z]{2,5}\d{6,}\b")  # CIF / loan-number style ids that logging.redact misses


def _clean(o):
    """Redact every string value (defence in depth); numbers/keys untouched so JSON stays valid."""
    if isinstance(o, str):
        return _CIF.sub("[id]", redact(o))
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


BLOCKED_CODES = {"SECRET_DETECTED", "TIER_TOO_LOW", "NOT_VERIFIED", "RATE_LIMITED"}


async def publish(event: dict) -> None:
    event = {"ts": datetime.now(timezone.utc).isoformat(), **event}
    payload = json.dumps(_clean(event), default=str, ensure_ascii=False)
    await redis.xadd(STREAM, {"e": payload}, maxlen=10000, approximate=True)


async def customer_info(db, customer_id: int | None) -> tuple[str | None, str | None]:
    """(customer_ref, customer_key), masked. One DB hit per customer, then cached in Redis."""
    if customer_id is None:
        return None, None
    k = f"ll:cref:{customer_id}"
    raw = await redis.get(k)
    if raw:
        d = json.loads(raw)
        return d["ref"], d["key"]
    from app.db.models import Customer  # lazy: app.sms imports this module
    from app.sms import customer_key
    c = await db.get(Customer, customer_id)
    if c is None:
        return None, None
    parts = c.name.split()
    who = parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")
    ref, key = f"{who} (…{c.registered_mobile[-4:]})", customer_key(c)
    await redis.set(k, json.dumps({"ref": ref, "key": key}), ex=86400)
    return ref, key


def with_id(eid: str, payload: str) -> str:
    return json.dumps({**json.loads(payload), "id": eid}, ensure_ascii=False)


@router.get("/events/stream", dependencies=[Depends(require_dashboard)])
async def stream(since: str | None = Query(default=None), last_event_id: str | None = Header(default=None)):
    start = last_event_id or since or "$"
    if start == "$":  # pin "$" to a concrete id so events between blocking reads are not lost
        tail = await redis.xrevrange(STREAM, count=1)
        start = tail[0][0] if tail else "0-0"

    async def gen():
        last = start
        while True:
            res = await redis.xread({STREAM: last}, block=15000, count=100)
            if not res:
                yield ": keepalive\n\n"
                continue
            for _, entries in res:
                for eid, fields in entries:
                    last = eid
                    yield f"id: {eid}\ndata: {fields['e']}\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
