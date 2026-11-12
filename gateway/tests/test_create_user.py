import os
import secrets

import pytest
from sqlalchemy import select

from app.db import create_user as cu
from app.db import models as m
from app.db.session import SessionLocal
from app.security.passwords import verify_secret

PW = "p-" + secrets.token_urlsafe(14)  # random per run
NEW_CODE = str(secrets.randbelow(900000) + 100000)


async def staff_row(email):
    async with SessionLocal() as db:
        return (await db.execute(select(m.StaffUser).where(m.StaffUser.email == email))).scalar_one_or_none()


async def test_create_update_disable_staff(client):
    assert await cu.staff(" New@Loanloop.Demo ", "New One", "engineer", password=PW) == "saved"
    u = await staff_row("new@loanloop.demo")
    assert (u.role, u.name, u.disabled) == ("engineer", "New One", False) and verify_secret(PW, u.password_hash)
    r = await client.post("/auth/staff/login", json={"email": "new@loanloop.demo", "password": PW})
    assert r.status_code == 200 and r.json()["landing"] == "/dev"
    await cu.staff("new@loanloop.demo", "New Two", "admin", password=PW + "x")  # update, not duplicate
    u = await staff_row("new@loanloop.demo")
    assert (u.role, u.name) == ("admin", "New Two") and verify_secret(PW + "x", u.password_hash)
    await cu.staff("new@loanloop.demo", "", "", disable=True)
    assert (await staff_row("new@loanloop.demo")).disabled
    await cu.staff("new@loanloop.demo", "", "", enable=True)
    assert not (await staff_row("new@loanloop.demo")).disabled


async def test_staff_rejects_bad_input():
    with pytest.raises(ValueError, match="role"):
        await cu.staff("x@loanloop.demo", "X", "root", password=PW)
    with pytest.raises(ValueError, match="12"):
        await cu.staff("x@loanloop.demo", "X", "admin", password="short")
    with pytest.raises(ValueError, match="no such"):
        await cu.staff("ghost@loanloop.demo", "", "", disable=True)
    assert await staff_row("x@loanloop.demo") is None


async def test_customer_passcode(client):
    assert await cu.customer("+91 90000 14417", NEW_CODE) == "saved"
    ok = await client.post("/auth/customer/login", json={"mobile": "9000014417", "passcode": NEW_CODE})
    assert ok.status_code == 200
    for bad in ("12345", "1234567", "12345a"):
        with pytest.raises(ValueError, match="6 digits"):
            await cu.customer("9000014417", bad)
    with pytest.raises(ValueError, match="no customer"):
        await cu.customer("1111111111", NEW_CODE)
    await cu.customer("9000014417", os.environ["DEMO_CUSTOMER_PASSCODE"])  # restore the demo passcode for other tests
