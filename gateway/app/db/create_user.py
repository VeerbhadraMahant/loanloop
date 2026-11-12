"""Create or update logins. Run: cd gateway && uv run python -m app.db.create_user staff|customer ...

The secret is prompted (twice, not echoed) or read from env LL_NEW_PASSWORD. It is never taken from the command line or printed.
"""
import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import select

from app.db import models as m
from app.db.session import SessionLocal
from app.security.passwords import hash_secret

ROLES = ("bank_manager", "engineer", "admin")


def read_secret(label: str) -> str:
    pw = os.environ.get("LL_NEW_PASSWORD")
    if pw is None:
        pw = getpass.getpass(f"{label}: ")
        if pw != getpass.getpass(f"{label} again: "):
            sys.exit("The two entries do not match.")
    return pw


async def staff(email: str, name: str, role: str, disable: bool = False, enable: bool = False, password: str | None = None) -> str:
    email = email.strip().lower()
    async with SessionLocal() as db:
        u = (await db.execute(select(m.StaffUser).where(m.StaffUser.email == email))).scalar_one_or_none()
        if (disable or enable) and not u:
            raise ValueError("no such staff account")
        if disable or enable:
            u.disabled = disable
        else:
            if role not in ROLES:
                raise ValueError("role must be one of: " + ", ".join(ROLES))
            if password is None or len(password) < 12:
                raise ValueError("password must be at least 12 characters")
            if not u:
                u = m.StaffUser(email=email)
                db.add(u)
            u.name, u.role, u.password_hash, u.disabled = name, role, hash_secret(password), False
        await db.commit()
    return "disabled" if disable else "enabled" if enable else "saved"


async def customer(mobile: str, passcode: str) -> str:
    mobile = "".join(ch for ch in mobile if ch.isdigit())[-10:]
    if not (len(passcode) == 6 and passcode.isdigit()):
        raise ValueError("passcode must be exactly 6 digits")
    async with SessionLocal() as db:
        c = (await db.execute(select(m.Customer).where(m.Customer.registered_mobile == mobile))).scalar_one_or_none()
        if not c:
            raise ValueError("no customer with that registered mobile")
        cl = await db.get(m.CustomerLogin, c.id)
        if cl:
            cl.passcode_hash = hash_secret(passcode)
        else:
            db.add(m.CustomerLogin(customer_id=c.id, passcode_hash=hash_secret(passcode)))
        await db.commit()
    return "saved"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="kind", required=True)
    s = sub.add_parser("staff")
    s.add_argument("--email", required=True)
    s.add_argument("--name", default="")
    s.add_argument("--role", choices=ROLES)
    g = s.add_mutually_exclusive_group()
    g.add_argument("--disable", action="store_true")
    g.add_argument("--enable", action="store_true")
    sub.add_parser("customer").add_argument("--mobile", required=True)
    a = ap.parse_args()
    try:
        if a.kind == "staff":
            flip = a.disable or a.enable
            if not flip and not (a.role and a.name):
                sys.exit("--name and --role are required unless you use --disable or --enable.")
            pw = None if flip else read_secret("Password (12+ characters)")
            print(asyncio.run(staff(a.email, a.name, a.role, a.disable, a.enable, pw)))
        else:
            print(asyncio.run(customer(a.mobile, read_secret("Passcode (6 digits)"))))
    except ValueError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
