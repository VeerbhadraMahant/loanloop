"""Live event stream for the ops dashboard. Events must contain only masked data."""
import asyncio
import json
import time

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from app.logging import redact
from app.security.auth import require_dashboard
from app.sessions import redis

STREAM = "ll:events"
router = APIRouter()


def _clean(o):
    """Redact every string value (defence in depth); numbers/keys untouched so JSON stays valid."""
    if isinstance(o, str):
        return redact(o)
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


async def publish(event: dict) -> None:
    event = {"ts": time.time(), **event}
    payload = json.dumps(_clean(event), default=str, ensure_ascii=False)
    await redis.xadd(STREAM, {"e": payload}, maxlen=10000, approximate=True)


@router.get("/events/stream", dependencies=[Depends(require_dashboard)])
async def stream(since: str | None = Query(default=None), last_event_id: str | None = Header(default=None)):
    start = last_event_id or since or "$"

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
