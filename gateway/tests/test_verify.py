import json

from app import sessions
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
