import json

from app import events
from app.sessions import redis
from tests.conftest import call


async def last_events(n=10):
    return [(i, json.loads(f["e"])) for i, f in await redis.xrange(events.STREAM)][-n:]


async def test_blocked_secret_event_shape(client):
    r = await call(client, "confirm_readback", call_id="ev1", field="x", value="my password is hunter2")
    assert r["error_code"] == "SECRET_DETECTED"
    evs = [e for _, e in await last_events() if e["call_id"] == "ev1"]
    assert len(evs) == 1
    e = evs[0]
    assert e["type"] == "security" and e["outcome"] == "blocked" and e["error_code"] == "SECRET_DETECTED"
    assert e["action"] == "confirm_readback" and isinstance(e["latency_ms"], int) and "T" in e["ts"]
    assert "hunter2" not in json.dumps(e) and "data" not in e


async def test_action_event_has_masked_customer(client, make_session, priya):
    await make_session(call_id="ev2", tier=1)
    await call(client, "confirm_readback", call_id="ev2", field="x", value="y")
    e = [e for _, e in await last_events() if e["call_id"] == "ev2"][-1]
    assert e["type"] == "action" and e["outcome"] == "ok" and e["tier"] == 1
    assert e["customer_ref"] == f"Priya D. (…{priya.registered_mobile[-4:]})" and e["customer_key"] == "priya"
    assert priya.registered_mobile not in json.dumps(e)


async def test_not_verified_blocked_and_sse_id(client):
    await call(client, "confirm_readback", call_id="ev3", field="x", value="y")  # no session
    eid, e = (await last_events())[-1]
    assert e["type"] == "security" and e["error_code"] == "NOT_VERIFIED" and e["outcome"] == "blocked"
    assert events.with_id(eid, json.dumps(e)).count(f'"id": "{eid}"') == 1


async def test_sse_requires_token_and_unknown_start(client):
    assert (await client.get("/events/stream")).status_code == 401
