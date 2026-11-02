"""Customer fixtures for the load test.

Without tools/out/customers.csv only the 3 personas are available. Export all 200 (same deterministic seed,
no DB needed) with:
    uv run --project gateway python tools/loadtest/fixtures.py --export
"""
import csv
import random
import sys
from pathlib import Path

CSV = Path(__file__).resolve().parents[1] / "out" / "customers.csv"
COLS = ["id", "mobile", "dob", "loan_last4", "pay_date", "pay_amount", "pay_utr"]
PERSONAS = [  # Priya's row carries her unmatched payment (docs/personas.md)
    dict(id=1, mobile="9000014417", dob="1991-08-14", loan_last4="7391", pay_date="2026-10-04", pay_amount="32055", pay_utr="SAHYR61004738291"),
    dict(id=2, mobile="9000023158", dob="1984-03-22", loan_last4="5520", pay_date="", pay_amount="", pay_utr=""),
    dict(id=3, mobile="9000030912", dob="1979-11-05", loan_last4="8864", pay_date="", pay_amount="", pay_utr=""),
]


def phone_key(cid: int) -> str:
    return {1: "priya", 2: "ramesh", 3: "sunita"}.get(cid, f"c{cid}")


def load() -> list[dict]:
    if CSV.exists():
        with CSV.open(newline="") as f:
            return [{**r, "id": int(r["id"])} for r in csv.DictReader(f)]
    return PERSONAS


def wrong_dob(dob: str) -> str:
    y, m, d = dob.split("-")
    return f"{y}-{m}-{(int(d) % 28) + 1:02d}"


def pick(rows: list[dict], need_payment: bool = False) -> dict:
    pool = [r for r in rows if r["pay_utr"]] if need_payment else rows
    return random.choice(pool or rows)


def export() -> None:  # needs the gateway env (sqlalchemy, app.*)
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "gateway"))
    from app.db import models as m
    from app.db.seed import build

    rows = build()
    cust = {r.id: r for r in rows if isinstance(r, m.Customer)}
    loan = {r.customer_id: r for r in rows if isinstance(r, m.Loan)}  # seed uses loan.id == customer.id
    pay = {r.loan_id: r for r in rows if isinstance(r, m.Payment) and r.status == "unmatched"}
    CSV.parent.mkdir(parents=True, exist_ok=True)
    with CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, COLS)
        w.writeheader()
        for i, c in cust.items():
            p = pay.get(loan[i].id)
            w.writerow(dict(id=i, mobile=c.registered_mobile, dob=c.dob.isoformat(), loan_last4=loan[i].loan_last4,
                            pay_date=p.date.isoformat() if p else "", pay_amount=p.amount if p else "", pay_utr=p.utr if p else ""))
    print(f"wrote {len(cust)} customers to {CSV}")


if __name__ == "__main__":
    if "--export" in sys.argv:
        export()
    else:
        print(f"{len(load())} customers available")
