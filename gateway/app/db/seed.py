"""Deterministic synthetic seed for the fictional "Sahyadri Finance Bank". Drops and recreates all tables.

Run:  cd gateway && uv run python ../tools/seed_data.py
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db import models as m
from app.db.crypto import encrypt

REF = date(2026, 11, 1)  # fixed "today" so the seed is reproducible
HOURS = "Mon-Fri 10:00-16:00, Sat 10:00-14:00"

BRANCHES = [  # (name, city, area)
    ("Kothrud", "Pune", "Karve Road, Kothrud"), ("Shivajinagar", "Pune", "FC Road, Shivajinagar"),
    ("Hinjewadi", "Pune", "Phase 1, Hinjewadi"), ("Viman Nagar", "Pune", "Nagar Road, Viman Nagar"),
    ("Hadapsar", "Pune", "Solapur Road, Hadapsar"), ("Baner", "Pune", "Baner Road, Baner"),
    ("Andheri East", "Mumbai", "MIDC, Andheri East"), ("Dadar", "Mumbai", "Tilak Road, Dadar"),
    ("Borivali", "Mumbai", "SV Road, Borivali West"), ("Thane Naupada", "Thane", "Naupada, Thane West"),
    ("Vashi", "Navi Mumbai", "Sector 17, Vashi"), ("Nashik Road", "Nashik", "Station Road, Nashik Road"),
    ("College Road", "Nashik", "College Road, Nashik"), ("Sitabuldi", "Nagpur", "Sitabuldi Main Road, Nagpur"),
    ("Dharampeth", "Nagpur", "Dharampeth, Nagpur"), ("Aurangabad CIDCO", "Aurangabad", "N-3 CIDCO, Aurangabad"),
    ("Kolhapur Rajarampuri", "Kolhapur", "Rajarampuri, Kolhapur"), ("Solapur Market", "Solapur", "Navi Peth, Solapur"),
    ("Satara Powai Naka", "Satara", "Powai Naka, Satara"), ("Sangli Maruti Road", "Sangli", "Maruti Road, Sangli"),
    ("Amravati Camp", "Amravati", "Camp Road, Amravati"), ("Latur Gandhi Chowk", "Latur", "Gandhi Chowk, Latur"),
    ("Ahmednagar Savedi", "Ahmednagar", "Savedi, Ahmednagar"), ("Jalgaon Navi Peth", "Jalgaon", "Navi Peth, Jalgaon"),
    ("Pimpri Chinchwad", "Pune", "Pimpri Station Road"),
]
FIRST = "Aarav Aditi Akash Ananya Arjun Bhavna Chetan Deepa Dhruv Gauri Harsh Isha Jayesh Kavita Kiran Lata Mahesh Meera Nikhil Neha Omkar Pooja Rahul Rohini Sagar Shruti Tanmay Uma Vijay Vaishali Yash Zoya".split()
LAST = "Joshi Kale Jadhav Pawar Shinde More Gaikwad Bhosale Chavan Kulkarni Patil Deshpande Sawant Naik Mane Thakur Gokhale Phadke Kadam Wagh".split()
PRODUCTS = {"home": (1_500_000, 6_000_000, 120, 300, (8.4, 9.6)), "personal": (100_000, 800_000, 24, 60, (11.5, 16.0)),
            "vehicle": (300_000, 1_500_000, 36, 84, (9.0, 12.0))}


def emi(principal: int, rate: float, months: int) -> int:
    r = rate / 1200
    return round(principal * r * (1 + r) ** months / ((1 + r) ** months - 1))


def add_months(d: date, n: int) -> date:
    y, mo = divmod(d.month - 1 + n, 12)
    return date(d.year + y, mo + 1, min(d.day, 28))


def build() -> list:
    rnd = random.Random(42)
    out: list = []
    branches = []
    for i, (name, city, area) in enumerate(BRANCHES):
        ifsc = f"SAHY0{101 + i:06d}"
        branches.append(ifsc)
        out.append(m.Branch(ifsc=ifsc, micr=f"411{rnd.randint(0, 999999):06d}", name=f"Sahyadri Finance Bank {name}",
                            city=city, address=f"{area}, {city}, Maharashtra", hours=HOURS))

    # persona overrides: (name, dob, mobile, lang, product, principal, rate_type, rate, tenure, acct, loan, status)
    personas = {
        1: dict(name="Priya Deshmukh", dob=date(1991, 8, 14), mobile="9000014417", lang="hinglish", product="home",
                principal=3_500_000, rate_type="floating", rate=9.25, tenure=240, acct="50010344120417",
                loan="410020487391", branch=0, emi_day=5),
        2: dict(name="Ramesh Patil", dob=date(1984, 3, 22), mobile="9000023158", lang="hi", product="personal",
                principal=500_000, rate_type="fixed", rate=13.5, tenure=48, acct="50010355823158",
                loan="410030115520", branch=11, emi_day=10),
        3: dict(name="Sunita Kulkarni", dob=date(1979, 11, 5), mobile="9000030912", lang="mr", product="vehicle",
                principal=800_000, rate_type="fixed", rate=10.5, tenure=60, acct="50010366630912",
                loan="410040228864", branch=18, emi_day=15),
    }
    N = 200
    loans: dict[int, m.Loan] = {}
    for i in range(1, N + 1):
        p = personas.get(i)
        if p is None:
            first, last = rnd.choice(FIRST), rnd.choice(LAST)
            prod = rnd.choice(list(PRODUCTS))
            lo, hi, tmin, tmax, (rlo, rhi) = PRODUCTS[prod]
            p = dict(name=f"{first} {last}", dob=date(rnd.randint(1962, 2000), rnd.randint(1, 12), rnd.randint(1, 28)),
                     mobile=f"9000{100000 + i:06d}", lang=rnd.choice(["en", "hi", "hinglish", "mr"]), product=prod,
                     principal=rnd.randrange(lo, hi, 50_000), rate_type="floating" if prod == "home" or rnd.random() < .3 else "fixed",
                     rate=round(rnd.uniform(rlo, rhi), 2), tenure=rnd.randrange(tmin, tmax + 1, 12),
                     acct=f"5001{rnd.randint(10**9, 10**10 - 1)}", loan=f"4100{rnd.randint(10**7, 10**8 - 1)}",
                     branch=rnd.randrange(len(branches)), emi_day=rnd.randint(1, 28))
            p["email"] = f"{first.lower()}.{last.lower()}{i}@example.com"
        else:
            p["email"] = p["name"].lower().replace(" ", ".") + "@example.com"
        out.append(m.Customer(id=i, name=p["name"], dob=p["dob"], registered_mobile=p["mobile"], email=p["email"],
                              preferred_language=p["lang"], customer_id=f"SFB{i:08d}", app_device_id=f"dev-{i:05d}"))
        out.append(m.Account(id=i, customer_id=i, account_number=encrypt(p["acct"]), account_last4=p["acct"][-4:],
                             branch_ifsc=branches[p["branch"]], type="savings", status="active"))
        e = emi(p["principal"], p["rate"], p["tenure"])
        elapsed = rnd.randint(6, p["tenure"] // 2) if i > 3 else 14
        outstanding = round(p["principal"] * (1 - elapsed / p["tenure"] * 0.8)) if i > 3 else {1: 3_286_450, 2: 391_800, 3: 612_300}[i]
        ln = m.Loan(id=i, customer_id=i, loan_number=encrypt(p["loan"]), loan_last4=p["loan"][-4:], product=p["product"],
                    principal=p["principal"], rate_type=p["rate_type"], current_rate=p["rate"], emi_amount=e,
                    emi_day=p["emi_day"], tenure_months=p["tenure"], outstanding=outstanding, status="active")
        loans[i] = ln
        out.append(ln)

    # scheduled instalments: 6 paid + next 2 due
    for i, ln in loans.items():
        this = date(REF.year, REF.month, ln.emi_day)
        first_due = this if this > REF else add_months(this, 1)
        for k in range(-6, 2):
            d = add_months(first_due, k)
            out.append(m.EmiSchedule(loan_id=i, due_date=d, amount=ln.emi_amount, status="paid" if d <= REF else "due"))

    floating = [i for i, l in loans.items() if l.rate_type == "floating"]
    non_persona = [i for i in range(4, N + 1)]
    resets = [1] + [i for i in floating if i > 3][:34]
    for i in resets:
        ln = loans[i]
        new_rate = float(ln.current_rate)
        old_rate = round(new_rate - 0.5, 2) if i != 1 else 8.75
        old_emi = emi(ln.principal, old_rate, ln.tenure_months)
        out.append(m.RateReset(loan_id=i, effective_date=REF - timedelta(days=rnd.randint(20, 80) if i != 1 else 41),
                               old_rate=old_rate, new_rate=new_rate, old_emi=old_emi, new_emi=ln.emi_amount,
                               reason="Repo-linked lending rate revised"))
    charge_ids = [1] + rnd.sample(non_persona, 39)
    for i in charge_ids:
        if i == 1:
            out.append(m.Charge(loan_id=1, date=date(2026, 9, 6), type="bounce", amount=590, reason="EMI auto-debit returned for insufficient balance"))
            out.append(m.Charge(loan_id=1, date=date(2026, 9, 20), type="penal", amount=354, reason="Penal interest for delayed EMI"))
        else:
            t_ = rnd.choice(["bounce", "penal"])
            out.append(m.Charge(loan_id=i, date=REF - timedelta(days=rnd.randint(5, 60)), type=t_,
                                amount=590 if t_ == "bounce" else rnd.choice([250, 354, 480]),
                                reason="EMI auto-debit returned" if t_ == "bounce" else "Penal interest for delayed EMI"))
    # payments: every loan has last EMI matched; unmatched "already paid" ones for >=25 loans
    unmatched = [1] + rnd.sample(non_persona, 24)
    for i, ln in loans.items():
        d = add_months(date(REF.year, REF.month, ln.emi_day), -1)
        out.append(m.Payment(loan_id=i, date=d, amount=ln.emi_amount, utr=f"SAHYM{rnd.randint(10**10, 10**11 - 1)}",
                             channel=rnd.choice(["upi", "netbanking", "nach"]), status="matched"))
    for i in unmatched:
        ln = loans[i]
        d = date(2026, 10, 4) if i == 1 else REF - timedelta(days=rnd.randint(2, 20))
        utr = "SAHYR61004738291" if i == 1 else f"SAHYR{rnd.randint(10**10, 10**11 - 1)}"
        out.append(m.Payment(loan_id=i, date=d, amount=ln.emi_amount, utr=utr, channel="upi", status="unmatched"))
    # hardship
    for i in [3] + rnd.sample([n for n in non_persona if n not in unmatched], 4):
        loans[i].status = "hardship"
    for i in loans:
        out.append(m.Reminder(loan_id=i, sent_at=datetime.combine(REF - timedelta(days=rnd.randint(1, 10)), time(10, 0), timezone.utc),
                              channel=rnd.choice(["sms", "call"]), paused_until=None))
    return out


async def seed(engine: AsyncEngine, n_only: bool = False) -> int:
    from sqlalchemy.ext.asyncio import AsyncSession

    async with engine.begin() as c:
        await c.run_sync(m.Base.metadata.drop_all)
        await c.run_sync(m.Base.metadata.create_all)
    rows = build()
    async with AsyncSession(engine, expire_on_commit=False) as s:
        done: tuple = ()
        for stage in ((m.Branch,), (m.Customer,), (m.Account, m.Loan)):  # FK order (no ORM relationships)
            s.add_all([r for r in rows if isinstance(r, stage)])
            await s.flush()
            done += stage
        s.add_all([r for r in rows if not isinstance(r, done)])
        await s.flush()
        for tbl in ("customers", "accounts", "loans"):  # explicit ids were used
            await s.execute(text(f"SELECT setval(pg_get_serial_sequence('{tbl}','id'), (SELECT max(id) FROM {tbl}))"))
        await s.commit()
    return sum(isinstance(r, m.Customer) for r in rows)
