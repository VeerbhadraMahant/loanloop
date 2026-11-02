import pytest_asyncio
from sqlalchemy import delete, select

from app import sessions
from app.db.models import Handover, ServiceRequest
from app.db.session import SessionLocal
from tests.conftest import call


@pytest_asyncio.fixture(autouse=True)
async def _clean():
    async with SessionLocal() as db:
        await db.execute(delete(Handover))
        await db.execute(delete(ServiceRequest))
        await db.commit()


async def packets():
    async with SessionLocal() as db:
        return (await db.execute(select(Handover))).scalars().all()


async def test_hardship_creates_packet(client, make_session, priya):
    await make_session(tier=1)
    r = await call(client, "report_hardship", reason="I lost my job and cannot pay")
    assert r["ok"] and r["next"] == "handover"
    assert "cannot discuss payment arrangements" in r["speak"]
    (h,) = await packets()
    assert h.reason == "hardship" and h.customer_id == priya.id and h.call_id == "call1"
    assert "lost my job" in h.summary and h.id == r["data"]["handover_id"]


async def test_hardship_packet_lists_done_tasks(client, make_session):
    await make_session(tier=2)
    await call(client, "confirm_readback", field="type", value="statement")
    await call(client, "request_document", type="statement")
    await call(client, "report_hardship", reason="medical emergency")
    (h,) = await packets()
    assert "statement" in h.requests_done and "statement" in h.summary


async def test_hardship_needs_tier1(client):
    r = await call(client, "report_hardship", reason="job loss")
    assert r["error_code"] == "NOT_VERIFIED" and not await packets()


async def test_handover_tier0_no_session(client):
    r = await call(client, "handover", reason="unclear request", summary="Caller asked something I could not classify.")
    assert r["ok"] and r["next"] == "handover"
    (h,) = await packets()
    assert h.customer_id is None and h.requests_pending == ["unclear request"]


async def test_handover_verified_customer(client, make_session, priya):
    await make_session(tier=2)
    await call(client, "confirm_readback", field="type", value="statement")
    await call(client, "request_document", type="statement")
    r = await call(client, "handover", reason="wants callback", summary="Wants a callback.")
    assert r["ok"]
    (h,) = await packets()
    assert h.customer_id == priya.id and h.requests_done == ["statement"]
    assert (await sessions.get("call1")) is not None  # handover does not end the session


async def test_handover_invalid(client):
    r = await call(client, "handover", reason="x")
    assert r["error_code"] == "INVALID_INPUT"


async def test_no_full_identifiers_anywhere(client, make_session, priya):
    from app.security.mask import assert_no_leak
    await make_session(tier=2)
    for act, body in [("emi_info", {}), ("explain_emi_change", {}), ("foreclosure_quote", {}),
                      ("report_hardship", {"reason": "job loss"})]:
        r = await call(client, act, **body)
        assert_no_leak(r["speak"] + str(r["data"]), priya)
