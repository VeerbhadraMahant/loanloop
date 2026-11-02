from datetime import timedelta

from app import sessions
from app.db.models import Approval, now
from app.db.session import SessionLocal
from tests.conftest import call

H = {"Authorization": "Bearer test-dash"}


async def _req(client, make_session, cid="call1", tier=1):
    await make_session(call_id=cid, tier=tier)
    r = await call(client, "request_app_approval", call_id=cid, purpose="change EMI date")
    return r["data"]["approval_id"]


async def _backdate(aid):
    async with SessionLocal() as db:
        a = await db.get(Approval, aid)
        a.created_at = now() - timedelta(minutes=3)
        await db.commit()


async def test_request_requires_tier1(client):
    await call(client, "start_call")
    r = await call(client, "request_app_approval", purpose="x")
    assert r["error_code"] == "NOT_VERIFIED"


async def test_end_to_end_approve(client, make_session):
    aid = await _req(client, make_session)
    assert (await sessions.get("call1")).approval_id == aid
    r = await call(client, "check_approval", approval_id=str(aid))
    assert r["ok"] and r["next"] == "need_tier_2" and r["data"]["status"] == "pending"
    lst = (await client.get("/phone/priya/approvals", headers=H)).json()
    assert lst[0]["id"] == aid and lst[0]["status"] == "pending" and lst[0]["expires_at"] > lst[0]["created_at"]
    assert (await client.post(f"/phone/priya/approvals/{aid}/approve", headers=H)).json() == {"ok": True}
    r = await call(client, "check_approval", approval_id=str(aid))
    assert r["ok"] and (await sessions.get("call1")).tier == 2
    assert '"type": "approval"' in str(await sessions.redis.xrange("ll:events")).replace("\\", "")


async def test_denied(client, make_session):
    aid = await _req(client, make_session)
    await client.post(f"/phone/priya/approvals/{aid}/deny", headers=H)
    r = await call(client, "check_approval", approval_id=str(aid))
    assert not r["ok"] and r["data"]["status"] == "denied" and (await sessions.get("call1")).tier == 1


async def test_expired_via_check(client, make_session):
    aid = await _req(client, make_session)
    await _backdate(aid)
    r = await call(client, "check_approval", approval_id=str(aid))
    assert not r["ok"] and r["data"]["status"] == "expired" and (await sessions.get("call1")).tier == 1
    assert (await client.post(f"/phone/priya/approvals/{aid}/approve", headers=H)).status_code == 409


async def test_expired_marked_on_phone_read_and_cannot_approve(client, make_session):
    aid = await _req(client, make_session)
    await _backdate(aid)
    lst = (await client.get("/phone/priya/approvals", headers=H)).json()
    assert next(a for a in lst if a["id"] == aid)["status"] == "expired"
    assert (await client.post(f"/phone/priya/approvals/{aid}/approve", headers=H)).status_code == 409


async def test_cannot_approve_someone_elses(client, make_session):
    aid = await _req(client, make_session)
    r = await client.post(f"/phone/ramesh/approvals/{aid}/approve", headers=H)
    assert r.status_code == 404
    async with SessionLocal() as db:
        assert (await db.get(Approval, aid)).status == "pending"


async def test_check_wrong_or_foreign_approval(client, make_session):
    aid = await _req(client, make_session)
    await make_session(call_id="other", tier=1)
    r = await call(client, "check_approval", call_id="other", approval_id=str(aid))  # not this session's
    assert r["error_code"] == "NOT_FOUND"
    r = await call(client, "check_approval", approval_id="999999")
    assert r["error_code"] == "NOT_FOUND"


def _ensure_tier2_route():
    """foreclosure_quote lives in another module; register a stub only if it is not wired yet."""
    from fastapi import APIRouter

    from app.contract import ActionIn, ActionResponse
    from app.main import app
    from app.routes.actions._runner import action

    if any(getattr(r, "path", "") == "/actions/foreclosure_quote" for r in app.routes):
        return
    stub = APIRouter(prefix="/actions")

    @action("foreclosure_quote", In=ActionIn, router=stub)
    async def _stub(inp, session, db, bg):
        return ActionResponse(ok=True, speak="stub")

    app.include_router(stub)


async def test_attacker_tier1_never_approves_is_tier_too_low(client):
    _ensure_tier2_route()
    await call(client, "start_call", caller_number="9000014417")
    assert (await call(client, "verify_caller", registered_mobile="9000014417", dob="1991-08-14"))["ok"]
    assert (await call(client, "request_app_approval", purpose="see account"))["ok"]
    r = await call(client, "foreclosure_quote")
    assert r["error_code"] == "TIER_TOO_LOW" and not r["ok"]
    aid = (await sessions.get("call1")).approval_id
    r = await call(client, "check_approval", approval_id=str(aid))
    assert r["data"]["status"] == "pending" and (await sessions.get("call1")).tier == 1
