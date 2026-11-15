import json

from app import sessions
from app.routes.actions.verify import parse_dob
from tests.conftest import call

PRIYA = dict(registered_mobile="9000014417", dob="1991-08-14")


async def _start(client, cid="call1", **kw):
    await call(client, "start_call", call_id=cid, **kw)


async def test_verify_ok_dob_and_plus91(client):
    await _start(client)
    r = await call(client, "verify_caller", registered_mobile="+91 90000 14417", dob="1991-08-14")
    assert r["ok"] and "Priya" in r["speak"]
    s = await sessions.get("call1")
    assert s.tier == 1 and s.customer_id == 1


async def test_verify_ok_loan_last4(client):
    await _start(client)
    r = await call(client, "verify_caller", registered_mobile="9000014417", loan_last4="7391")
    assert r["ok"]


async def test_verify_needs_dob_or_loan(client):
    await _start(client)
    r = await call(client, "verify_caller", registered_mobile="9000014417")
    assert r["error_code"] == "INVALID_INPUT"


async def test_wrong_part_not_revealed(client):
    await _start(client)
    a = await call(client, "verify_caller", registered_mobile="9000014417", dob="1990-01-01")
    b = await call(client, "verify_caller", registered_mobile="9111111111", dob="1991-08-14")
    assert not a["ok"] and not b["ok"] and a["speak"] == b["speak"] and a["error_code"] == b["error_code"]
    assert (await sessions.get("call1")).tier == 0


async def test_brute_force_per_call(client):
    await _start(client)
    for _ in range(3):
        r = await call(client, "verify_caller", registered_mobile="9000014417", dob="1990-01-01")
        assert r["error_code"] == "NOT_VERIFIED"
    r = await call(client, "verify_caller", **PRIYA)  # correct creds now refused
    assert r["error_code"] == "RATE_LIMITED" and r["next"] == "handover" and not r["ok"]
    assert (await sessions.get("call1")).tier == 0


async def test_brute_force_per_customer_hourly_across_calls(client):
    await _start(client, "a")
    for _ in range(3):
        await call(client, "verify_caller", call_id="a", registered_mobile="9000014417", dob="1990-01-01")
    await _start(client, "b")
    r = await call(client, "verify_caller", call_id="b", **PRIYA)
    assert r["error_code"] == "RATE_LIMITED"


async def test_brute_force_unknown_mobile_hashed(client):
    await _start(client, "a")
    for _ in range(3):
        await call(client, "verify_caller", call_id="a", registered_mobile="9222222222", dob="1990-01-01")
    keys = await sessions.redis.keys("ll:rl:*")
    assert keys and not any("9222222222" in k for k in keys)
    await _start(client, "b")
    assert (await call(client, "verify_caller", call_id="b", registered_mobile="9222222222", dob="1990-01-01"))["error_code"] == "RATE_LIMITED"


async def test_caller_id_mismatch_flagged(client):
    await _start(client, caller_number="9000023158")  # Ramesh's number
    r = await call(client, "verify_caller", **PRIYA)
    assert r["ok"] and r["data"]["caller_id_mismatch"]
    ev = json.dumps(await sessions.redis.xrange("ll:events"))
    assert "CALLER_ID_MISMATCH" in ev


async def test_tier2_not_kept_when_switching_customer(client, make_session):
    await make_session(tier=2)
    r = await call(client, "verify_caller", registered_mobile="9000023158", dob="1984-03-22")
    s = await sessions.get("call1")
    assert r["ok"] and s.customer_id == 2 and s.tier == 1


async def test_verify_flexible_date_and_mobile_formats(client):
    # Test DD-MM-YYYY, DD/MM/YYYY, spoken month names, and leading zero mobile
    await _start(client, cid="flex1")
    r1 = await call(client, "verify_caller", call_id="flex1", registered_mobile="09000014417", dob="14-08-1991")
    assert r1["ok"] and "Priya" in r1["speak"]

    await _start(client, cid="flex2")
    r2 = await call(client, "verify_caller", call_id="flex2", registered_mobile="+91 90000 14417", dob="14/08/1991")
    assert r2["ok"] and "Priya" in r2["speak"]

    await _start(client, cid="flex3")
    r3 = await call(client, "verify_caller", call_id="flex3", registered_mobile="9000014417", dob="14 August 1991")
    assert r3["ok"] and "Priya" in r3["speak"]

    await _start(client, cid="flex4")  # beta-language month names (from i18n/<code>.json words.month_words) and Indic digits
    r4 = await call(client, "verify_caller", call_id="flex4", registered_mobile="9000014417", dob="14 ஆகஸ்ட் 1991")
    assert r4["ok"] and "Priya" in r4["speak"]
    assert parse_dob("১৪ আগস্ট ১৯৯১") == "1991-08-14" and parse_dob("௧௪ ஆகஸ்ட் ௧௯௯௧") == "1991-08-14"


async def _app_start(client, sid, cid="appcall", **kw):
    return await call(client, "start_call", call_id=cid, app_session=sid, **kw)


async def test_app_session_starts_call_at_tier1(client, priya):
    from app import authsess
    sid = await authsess.create({"kind": "customer", "role": "customer", "name": priya.name, "customer_id": priya.id})
    r = await _app_start(client, sid)
    assert r["ok"] and r["data"]["app_verified"] is True and r["data"]["first_name"] == priya.name.split()[0]
    s = await sessions.get("appcall")
    assert s.tier == 1 and s.customer_id == priya.id
    assert (await call(client, "emi_info", call_id="appcall"))["ok"]  # no verify_caller needed
    assert sid not in json.dumps(r)


async def test_bad_or_staff_app_session_is_tier0(client):
    from app import authsess
    staff = await authsess.create({"kind": "staff", "role": "admin", "name": "x", "user_id": 0})
    for i, sid in enumerate(("bogus-token", staff)):
        r = await _app_start(client, sid, cid=f"bad{i}")
        assert r["ok"] and r["data"]["app_verified"] is False and "first_name" not in r["data"]
        assert (await sessions.get(f"bad{i}")).tier == 0
        assert (await call(client, "emi_info", call_id=f"bad{i}"))["error_code"] in ("NOT_VERIFIED", "TIER_TOO_LOW")


async def test_app_session_ignored_outbound_and_never_audited(client, priya):
    from sqlalchemy import select
    from app import authsess
    from app.db.models import AuditLog
    from app.db.session import SessionLocal
    sid = await authsess.create({"kind": "customer", "role": "customer", "name": priya.name, "customer_id": priya.id})
    r = await _app_start(client, sid, cid="outc", direction="outbound")
    assert r["data"]["app_verified"] is False and (await sessions.get("outc")).tier == 0
    await _app_start(client, sid, cid="inc")
    async with SessionLocal() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.call_id.in_(["outc", "inc"])))).scalars().all()
    assert rows and sid not in "".join(str(vars(x)) for x in rows)
