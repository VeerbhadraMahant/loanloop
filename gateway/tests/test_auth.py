import os
import time

import pytest
from sqlalchemy import select

from app import authsess
from app.config import Settings
from app.db.models import AuditLog
from app.db.session import SessionLocal
from app.security.passwords import hash_secret, verify_secret

BEARER_D = {"Authorization": "Bearer test-dash"}
BEARER_P = {"Authorization": "Bearer test-phone"}
STAFF_PW = os.environ["DEMO_STAFF_PASSWORD"]  # random per test run (conftest)
PASSCODE = os.environ["DEMO_CUSTOMER_PASSCODE"]
WRONG_PW = "x" + STAFF_PW[::-1]
WRONG_CODE = ("1" if PASSCODE[0] != "1" else "2") + PASSCODE[1:]
PRIYA = {"mobile": "9000014417", "passcode": PASSCODE}


async def staff(client, who="manager"):
    r = await client.post("/auth/staff/login", json={"email": f"{who}@loanloop.demo", "password": STAFF_PW})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


async def cust(client, body=PRIYA):
    r = await client.post("/auth/customer/login", json=body)
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


def sh(sid):
    return {"X-LL-Staff-Session": sid}


def ch(sid):
    return {"X-LL-Customer-Session": sid}


def test_hash_roundtrip():
    h = hash_secret("s3cret")
    assert h.startswith("scrypt$16384$8$1$") and "s3cret" not in h
    assert verify_secret("s3cret", h) and not verify_secret("nope", h)
    assert not verify_secret("s3cret", None) and not verify_secret("s3cret", "garbage")


def test_no_demo_credentials_ship_in_the_code():
    for name in ("demo_staff_password", "demo_customer_passcode"):
        assert Settings.model_fields[name].default == ""  # logins exist only when the owner sets a secret



@pytest.mark.parametrize("who,role,landing", [("manager", "bank_manager", "/bank"), ("engineer", "engineer", "/dev"), ("admin", "admin", "/bank")])
async def test_staff_login(client, who, role, landing):
    r = await client.post("/auth/staff/login", json={"email": f" {who.upper()}@loanloop.demo ", "password": STAFF_PW})
    assert r.status_code == 200
    j = r.json()
    assert (j["kind"], j["role"], j["landing"]) == ("staff", role, landing) and j["session_id"] and j["name"]


async def test_customer_login(client):
    r = await client.post("/auth/customer/login", json={"mobile": "+91 90000 14417", "passcode": PASSCODE})
    assert r.status_code == 200
    j = r.json()
    assert j["customer_key"] == "priya" and j["landing"] == "/phone" and j["role"] == "customer" and j["kind"] == "customer"


async def test_identical_401(client):
    a = await client.post("/auth/staff/login", json={"email": "manager@loanloop.demo", "password": WRONG_PW})
    b = await client.post("/auth/staff/login", json={"email": "nobody@loanloop.demo", "password": WRONG_PW})
    assert a.status_code == b.status_code == 401 and a.json() == b.json() == {"detail": "invalid credentials"}
    c = await client.post("/auth/customer/login", json={"mobile": "9000014417", "passcode": WRONG_CODE})
    d = await client.post("/auth/customer/login", json={"mobile": "9111111111", "passcode": WRONG_CODE})
    assert c.status_code == d.status_code == 401 and c.json() == d.json()


async def test_lockout_and_reset(client):
    bad = {"email": "manager@loanloop.demo", "password": WRONG_PW}
    for _ in range(5):
        assert (await client.post("/auth/staff/login", json=bad)).status_code == 401
    r = await client.post("/auth/staff/login", json={"email": "manager@loanloop.demo", "password": STAFF_PW})
    assert r.status_code == 429 and r.json() == {"detail": "too many attempts"}
    # success resets the counter
    await authsess.redis.flushdb()
    for _ in range(4):
        await client.post("/auth/staff/login", json=bad)
    await staff(client)
    for _ in range(4):
        assert (await client.post("/auth/staff/login", json=bad)).status_code == 401
    assert await staff(client)


async def test_lockout_unknown_identifier(client):
    for _ in range(5):
        await client.post("/auth/staff/login", json={"email": "ghost@x.demo", "password": WRONG_PW})
    assert (await client.post("/auth/staff/login", json={"email": "ghost@x.demo", "password": WRONG_PW})).status_code == 429


async def test_session_lifecycle(client):
    sid = await staff(client, "engineer")
    r = await client.get("/auth/session", headers={"X-LL-Session": sid})
    assert r.json() == {"kind": "staff", "role": "engineer", "name": "Eshan Engineer"}
    assert (await client.get("/auth/session", headers={"X-LL-Session": "nope"})).status_code == 401
    assert (await client.get("/auth/session")).status_code == 401
    cs = await cust(client)
    j = (await client.get("/auth/session", headers={"X-LL-Session": cs})).json()
    assert j["customer_key"] == "priya" and j["customer_id"] == 1 and "session_id" not in j
    assert (await client.post("/auth/logout", headers={"X-LL-Session": sid})).status_code == 204
    assert (await client.get("/auth/session", headers={"X-LL-Session": sid})).status_code == 401
    assert (await client.post("/auth/logout", headers={"X-LL-Session": "unknown"})).status_code == 204


async def test_absolute_expiry_and_idle_refresh(client):
    sid = await staff(client)
    key = authsess._key(sid)
    await authsess.redis.expire(key, 100)
    assert (await client.get("/auth/session", headers={"X-LL-Session": sid})).status_code == 200
    assert 1700 < await authsess.redis.ttl(key) <= 1800
    cs = await cust(client)
    assert 800 < await authsess.redis.ttl(authsess._key(cs)) <= 900
    import json
    d = json.loads(await authsess.redis.get(key))
    d["created"] = time.time() - 8 * 3600 - 5
    await authsess.redis.set(key, json.dumps(d), ex=1000)
    assert (await client.get("/auth/session", headers={"X-LL-Session": sid})).status_code == 401
    assert await authsess.redis.get(key) is None


MGR_ROUTES = ["/dashboard/calls", "/dashboard/handovers", "/dashboard/requests", "/dashboard/security", "/dashboard/collections",
              "/dashboard/calls/x/timeline"]


async def test_dashboard_matrix(client):
    m, e, a, c = await staff(client), await staff(client, "engineer"), await staff(client, "admin"), await cust(client)
    for path in MGR_ROUTES:
        got = [(await client.get(path, headers=h)).status_code for h in (sh(m), sh(a), sh(e), ch(c), {})]
        assert [x == 200 for x in got] == [True, True, False, False, False], (path, got)
        assert got[2:] == [403, 403, 401], (path, got)
        assert (await client.get(path, headers=BEARER_D)).status_code == 200
    got = [(await client.get("/dashboard/metrics", headers=h)).status_code for h in (sh(e), sh(a), sh(m), ch(c), {})]
    assert got == [200, 200, 403, 403, 401]
    assert (await client.get("/dashboard/metrics", headers=BEARER_D)).status_code == 200
    assert (await client.post("/dashboard/jobs/run", headers=sh(e))).status_code == 403
    assert (await client.post("/dashboard/jobs/run", headers=sh(m))).status_code == 200


async def test_events_stream_rejects_engineer_customer(client):
    e, c = await staff(client, "engineer"), await cust(client)
    assert (await client.get("/events/stream", headers=sh(e))).status_code == 403
    assert (await client.get("/events/stream", headers=ch(c))).status_code == 403
    assert (await client.get("/events/stream")).status_code == 401


async def test_phone_scoping(client):
    p, r = await cust(client), await cust(client, {"mobile": "9000023158", "passcode": PASSCODE})
    assert (await client.get("/phone/me", headers=ch(p))).json()["name"] == "Priya Deshmukh"
    assert (await client.get("/phone/me/sms", headers=ch(r))).status_code == 200
    assert (await client.get("/phone/priya", headers=ch(p))).status_code == 200
    assert (await client.get("/phone/c1", headers=ch(p))).status_code == 200
    assert (await client.get("/phone/me", headers=ch(r))).json()["name"] == "Ramesh Patil"
    for path in ("/phone/ramesh", "/phone/ramesh/sms", "/phone/ramesh/approvals", "/phone/c2"):
        assert (await client.get(path, headers=ch(p))).status_code == 403
    for act in ("approve", "deny"):
        assert (await client.post(f"/phone/ramesh/approvals/1/{act}", headers=ch(p))).status_code == 403
    assert (await client.get("/phone/me", headers=sh(await staff(client)))).status_code == 403
    assert (await client.get("/phone/me")).status_code == 401
    assert (await client.get("/phone/me", headers=ch("bad"))).status_code == 401
    assert (await client.get("/phone/me", headers=BEARER_D)).status_code == 401


async def test_bearers_still_work(client):
    assert (await client.get("/phone/ramesh", headers=BEARER_P)).status_code == 200
    assert (await client.get("/dashboard/calls", headers={"Authorization": "Bearer wrong"})).status_code == 401
    assert (await client.get("/health")).status_code == 200


async def test_audit_rows_no_secrets(client):
    await client.post("/auth/staff/login", json={"email": "manager@loanloop.demo", "password": WRONG_PW})
    sid = await staff(client)
    await client.post("/auth/logout", headers={"X-LL-Session": sid})
    for _ in range(5):
        await client.post("/auth/staff/login", json={"email": "manager@loanloop.demo", "password": WRONG_PW})
    async with SessionLocal() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.call_id == "auth"))).scalars().all()
    actions = {r.action for r in rows}
    assert {"auth.login", "auth.login_failed", "auth.logout", "auth.locked"} <= actions
    blob = repr([(r.session_id, r.error_code, r.flags) for r in rows])
    assert sid not in blob and "wrong-pw-xyz" not in blob and STAFF_PW not in blob and "manager@" not in blob


async def test_concurrent_wrong_logins_lock_atomically(client):
    import asyncio
    rs = await asyncio.gather(*[client.post("/auth/staff/login", json={"email": "burst@x.demo", "password": WRONG_PW}) for _ in range(20)])
    codes = [r.status_code for r in rs]
    assert codes.count(401) <= 5 and codes.count(401) + codes.count(429) == 20, codes
    assert 0 < await authsess.redis.ttl(authsess._fail_key("staff", "burst@x.demo")) <= authsess.LOCK_S


def test_verify_never_raises_on_malformed_hash():
    for bad in ("scrypt$x$8$1$AA==$AA==", "scrypt$0$8$1$AA==$AA==", "scrypt$3$8$1$AA==$AA==", "scrypt$99999999$8$1$AA==$AA==", "scrypt$16384$8$1$!!$!!", "a$b", ""):
        assert verify_secret("x", bad) is False


async def test_disabled_or_demoted_staff_session_dies(client):
    from app.db.models import StaffUser
    sid = await staff(client, "manager")
    assert (await client.get("/dashboard/calls", headers=sh(sid))).status_code == 200
    async with SessionLocal() as db:
        u = (await db.execute(select(StaffUser).where(StaffUser.email == "manager@loanloop.demo"))).scalar_one()
        u.role = "engineer"
        await db.commit()
    try:
        assert (await client.get("/dashboard/calls", headers=sh(sid))).status_code == 403  # DB role applies, not the copy in the session
        assert (await client.get("/dashboard/metrics", headers=sh(sid))).status_code == 200
        async with SessionLocal() as db:
            (await db.get(StaffUser, u.id)).disabled = True
            await db.commit()
        assert (await client.get("/dashboard/metrics", headers=sh(sid))).status_code == 401
        assert (await client.get("/auth/session", headers={"X-LL-Session": sid})).status_code == 401
    finally:
        async with SessionLocal() as db:
            x = await db.get(StaffUser, u.id)
            x.role, x.disabled = "bank_manager", False
            await db.commit()


async def test_phone_key_variants(client):
    p = await cust(client)
    for path in ("/phone/ME", "/phone/PRIYA", "/phone/C1", "/phone/me/sms"):
        assert (await client.get(path, headers=ch(p))).status_code == 200, path
    for path in ("/phone/c01", "/phone/c1%20", "/phone/me%20", "/phone/ramesh", "/phone/RAMESH", "/phone/c2", "/phone/c02"):
        assert (await client.get(path, headers=ch(p))).status_code == 403, path


async def test_only_auth_session_extends_idle_ttl(client):
    sid, cs = await staff(client), await cust(client)
    await authsess.redis.expire(authsess._key(sid), 100)
    await authsess.redis.expire(authsess._key(cs), 100)
    await client.get("/dashboard/calls", headers=sh(sid))
    await client.get("/phone/me", headers=ch(cs))
    assert await authsess.redis.ttl(authsess._key(sid)) <= 100 and await authsess.redis.ttl(authsess._key(cs)) <= 100
    await client.get("/auth/session", headers={"X-LL-Session": sid})
    await client.get("/auth/session", headers={"X-LL-Session": cs})
    assert await authsess.redis.ttl(authsess._key(sid)) > 1700 and await authsess.redis.ttl(authsess._key(cs)) > 800
