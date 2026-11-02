import json
import uuid

import pytest

from app import events
from app.audit import write_audit
from app.db.models import Approval, Call, Handover
from app.db.session import SessionLocal
from tests.conftest import call

DASH = {"Authorization": "Bearer test-dash"}
ENDPOINTS = ["/dashboard/calls", "/dashboard/calls/x/timeline", "/dashboard/handovers",
             "/dashboard/security", "/dashboard/metrics"]


def uid() -> str:
    return "t" + uuid.uuid4().hex[:10]


@pytest.mark.parametrize("path", ENDPOINTS)
async def test_requires_token(client, path):
    assert (await client.get(path)).status_code == 401
    assert (await client.get(path, headers={"Authorization": "Bearer nope"})).status_code == 401
    assert (await client.get(path, headers=DASH)).status_code == 200


async def test_timeline_and_security_never_leak(client, make_session, priya):
    cid = uid()
    await make_session(call_id=cid, tier=1)
    async with SessionLocal() as db:
        db.add(Call(call_id=cid, language="en"))
        await db.commit()
    # secret attempt + end call so customer_id lands on the call row
    await call(client, "confirm_readback", call_id=cid, field="x", value=f"my pin is 1234 {priya.registered_mobile}")
    await call(client, "end_call", call_id=cid, outcome="completed")
    async with SessionLocal() as db:
        db.add(Handover(call_id=cid, customer_id=priya.id, reason=f"call {priya.registered_mobile}",
                        summary=f"cif {priya.customer_id} mail {priya.email}", requests_done=["a"], requests_pending=["b"]))
        db.add(Approval(session_id=cid, customer_id=priya.id, purpose="x", status="denied"))
        await db.commit()
    blob = ""
    for p in (f"/dashboard/calls/{cid}/timeline", "/dashboard/security", "/dashboard/calls", "/dashboard/handovers"):
        blob += (await client.get(p, headers=DASH)).text
    for v in (priya.registered_mobile, priya.customer_id, priya.email):
        assert v not in blob
    tl = (await client.get(f"/dashboard/calls/{cid}/timeline", headers=DASH)).json()
    assert tl and {"id", "ts", "type", "call_id", "outcome"} <= tl[0].keys()
    assert any(e["type"] == "call_end" for e in tl)
    sec = (await client.get("/dashboard/security", headers=DASH)).json()
    assert any(e["call_id"] == cid and e.get("error_code") == "SECRET_DETECTED" for e in sec)
    assert any(e["type"] == "approval" and e["call_id"] == cid for e in sec)
    calls = (await client.get("/dashboard/calls", headers=DASH)).json()
    row = next(c for c in calls if c["call_id"] == cid)
    assert row["blocked_count"] >= 1 and row["customer_ref"].startswith("Priya D. (…")
    ho = (await client.get("/dashboard/handovers", headers=DASH)).json()
    assert any(h["call_id"] == cid and h["requests_done"] == ["a"] for h in ho)


async def test_metrics_percentiles(client):
    act = "synth_" + uid()
    async with SessionLocal() as db:
        for i in range(1, 101):
            write_audit(db, call_id=uid(), action=act, latency_ms=i, outcome="error" if i <= 3 else "ok")
        db.add(Call(call_id=uid(), language="en", outcome="completed", ended_at=events.datetime.now(events.timezone.utc)))
        await db.commit()
    m = (await client.get("/dashboard/metrics", headers=DASH)).json()
    row = next(x for x in m["per_action"] if x["action"] == act)
    assert row["count"] == 100 and row["errors"] == 3
    assert (row["p50"], row["p95"], row["p99"]) == (50.5, 95.0, 99.0)
    assert 0 <= m["totals"]["task_completion_rate"] <= 1
    assert {"loadtest", "stt_benchmark", "e2e_latency"} <= m.keys()


async def test_live_calls_use_session(client, make_session):
    cid = uid()
    await call(client, "start_call", call_id=cid)
    await make_session(call_id=cid, tier=2)
    row = next(c for c in (await client.get("/dashboard/calls", headers=DASH)).json() if c["call_id"] == cid)
    assert row["tier"] == 2 and row["current_action"] == "start_call" and row["ended_at"] is None
    assert json.dumps(row)
