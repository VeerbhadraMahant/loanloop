"""Deterministic synthetic seed for the fictional "Sahyadri Finance Bank". Drops and recreates all tables.

Run:  cd gateway && uv run python ../tools/seed_data.py
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.clock import today_ist
from app.db import models as m
from app.db.crypto import encrypt

HOURS = "Mon-Fri 10:00-16:00, Sat 10:00-14:00"
OUT_ID = 201  # outbound demo persona (Vikram Sawant): customer, loan and collection case all use this id

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
    REF = today_ist()  # every date is relative to today (IST); amounts, UTRs and rates stay fixed
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
        OUT_ID: dict(name="Vikram Sawant", dob=date(1988, 6, 17), mobile="9000200201", lang="hinglish", product="personal",
                     principal=400_000, rate_type="fixed", rate=13.0, tenure=48, acct="50010377200201",
                     loan="410050339172", branch=2, emi_day=10),  # outbound collections demo persona (overdue, see add_bank_data)
    }
    N = OUT_ID
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
        elapsed = rnd.randint(6, p["tenure"] // 2) if i > 3 and i != OUT_ID else 14
        outstanding = round(p["principal"] * (1 - elapsed / p["tenure"] * 0.8)) if i > 3 and i != OUT_ID else {1: 3_286_450, 2: 391_800, 3: 612_300, OUT_ID: 331_500}[i]
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
    non_persona = [i for i in range(4, OUT_ID)]
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
            out.append(m.Charge(loan_id=1, date=REF - timedelta(days=56), type="bounce", amount=590, reason="EMI auto-debit returned for insufficient balance"))
            out.append(m.Charge(loan_id=1, date=REF - timedelta(days=42), type="penal", amount=354, reason="Penal interest for delayed EMI"))
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
        d = REF - timedelta(days=28) if i == 1 else REF - timedelta(days=rnd.randint(2, 20))
        utr = "SAHYR61004738291" if i == 1 else f"SAHYR{rnd.randint(10**10, 10**11 - 1)}"
        out.append(m.Payment(loan_id=i, date=d, amount=ln.emi_amount, utr=utr, channel="upi", status="unmatched"))
    # hardship
    for i in [3] + rnd.sample([n for n in non_persona if n not in unmatched], 4):
        loans[i].status = "hardship"
    for i in loans:
        out.append(m.Reminder(loan_id=i, sent_at=datetime.combine(REF - timedelta(days=rnd.randint(1, 10)), time(10, 0), timezone.utc),
                              channel=rnd.choice(["sms", "call"]), paused_until=None))
    add_bank_data(out, loans, set(unmatched), REF)
    return out


MERCHANTS = ["Swiggy", "Zomato", "BigBasket", "D-Mart", "Reliance Smart", "Amazon", "Flipkart", "IRCTC", "Uber", "Ola",
             "Jio Recharge", "Airtel", "Tata Power", "MSEDCL", "Apollo Pharmacy", "Cafe Coffee Day", "Croma", "Myntra"]
EMPLOYERS = ["Infosys Ltd", "Persistent Systems", "TCS", "Bajaj Auto", "Kirloskar Pvt Ltd", "Wipro", "Cognizant", "Tech Mahindra"]
SENDERS = ["Rohan Kulkarni", "Anita Joshi", "Sandeep Pawar", "Mukta Rao", "Prakash Shinde", "Rent refund", "Insurance claim"]
AREAS = ["Karve Road", "FC Road", "Station Road", "Nagar Road", "Market Yard", "MG Road"]


def _txns(rnd: random.Random, loan: m.Loan, acct_id: int, REF: date, low: bool) -> tuple[list[m.AccountTransaction], int]:
    """~10 transactions over the last 30 days with a consistent running balance; returns (rows, final balance)."""
    d = lambda: REF - timedelta(days=rnd.randint(1, 29))  # noqa: E731
    n12 = lambda: str(rnd.randint(10**11, 10**12 - 1))  # noqa: E731
    scale = 0.25 if low else 1.0
    items = []  # (date, dir, amount, narration, ref)
    for _ in range(4):
        mer = rnd.choice(MERCHANTS)
        items.append((d(), "dr", round(rnd.randint(80, 4500) * scale), f"UPI payment - {mer}", f"UPI/DR/{n12()}"))
    items.append((d(), "dr", round(rnd.randint(2, 20) * 500 * scale) or 500, f"ATM withdrawal - {rnd.choice(AREAS)}", f"ATM/{rnd.randint(10**7, 10**8 - 1)}"))
    items.append((d(), "dr", round(rnd.randint(300, 6000) * scale), f"POS purchase - {rnd.choice(MERCHANTS)}", f"POS/{n12()}"))
    items.append((d(), "cr", rnd.randint(2000, 40000) if not low else rnd.randint(500, 3000), f"NEFT credit - {rnd.choice(SENDERS)}", f"NEFT/CR/SAHYN{rnd.randint(10**10, 10**11 - 1)}"))
    if not low:
        items.append((REF - timedelta(days=rnd.randint(1, 12)), "cr", rnd.randrange(28_000, 95_000, 500), f"Salary credit - {rnd.choice(EMPLOYERS)}", f"NEFT/CR/SAHYN{rnd.randint(10**10, 10**11 - 1)}"))
    items.append((REF - timedelta(days=rnd.randint(3, 27)), "dr", loan.emi_amount, f"EMI auto-debit - loan ending {loan.loan_last4}", f"NACH/{rnd.randint(10**10, 10**11 - 1)}"))
    items.append((d(), "dr", round(rnd.randint(100, 1500) * scale), f"UPI payment - {rnd.choice(MERCHANTS)}", f"UPI/DR/{n12()}"))
    items.sort(key=lambda x: x[0])
    start, run, lo = rnd.randrange(1_500, 9_000, 250) if low else rnd.randrange(20_000, 180_000, 250), 0, 0
    for _, dr, amt, *_ in items:
        run += amt if dr == "cr" else -amt
        lo = min(lo, run)
    start += -lo + rnd.randrange(300, 3_000, 50) if lo < 0 else 0  # never overdrawn
    rows, bal = [], start
    for dt, dr, amt, narr, ref in items:
        bal += amt if dr == "cr" else -amt
        rows.append(m.AccountTransaction(account_id=acct_id, date=dt, direction=dr, amount=amt, narration=narr, ref=ref, balance_after=bal))
    return rows, bal


def add_bank_data(out: list, loans: dict[int, m.Loan], unmatched: set[int], REF: date) -> None:
    """Savings balances + transactions, overdue loans across buckets (bounced EMIs, charges), collection cases and
    a few PTPs/RTPs. Uses its own RNG so the base seed stays unchanged. Deterministic."""
    rnd = random.Random(2026)
    sched: dict[int, list[m.EmiSchedule]] = {}
    for r in out:
        if isinstance(r, m.EmiSchedule):
            sched.setdefault(r.loan_id, []).append(r)
    pool = [i for i, ln in loans.items() if 4 <= i < OUT_ID and i not in unmatched and ln.status != "hardship"]
    pick = rnd.sample(pool, 32)
    plan = {i: rnd.randint(lo, hi) for ids, lo, hi in ((pick[:16], 3, 26), (pick[16:24], 33, 56), (pick[24:29], 62, 86), (pick[29:], 92, 140)) for i in ids}
    plan[OUT_ID] = 38

    # 1. re-time the schedule: bounced EMIs from `oldest` up to yesterday
    from app.jobs import bucket_of, priority_of

    info: dict[int, dict] = {}
    for i, dpd in plan.items():
        ln, oldest = loans[i], REF - timedelta(days=dpd)
        while oldest.day > 28:  # emi_day <= 28 so every month has the date
            oldest -= timedelta(days=1)
        ln.emi_day = oldest.day
        this = date(REF.year, REF.month, ln.emi_day)
        first_due = this if this > REF else add_months(this, 1)
        bounced = []
        for k, r in zip(range(-6, 2), sched[i]):
            r.due_date = add_months(first_due, k)
            r.status = "paid" if r.due_date < oldest else "bounced" if r.due_date < REF else "due"
            if r.status == "bounced":
                bounced.append(r.due_date)
                out.append(m.Charge(loan_id=i, date=r.due_date, type="bounce", amount=590, reason="EMI auto-debit returned for insufficient balance"))
        out.append(m.Charge(loan_id=i, date=min(oldest + timedelta(days=7), REF - timedelta(days=1)), type="penal",
                            amount=rnd.choice([250, 354, 480]), reason="Penal interest for delayed EMI"))
        d = (REF - oldest).days
        info[i] = dict(missed=len(bounced), dpd=d, amount=len(bounced) * ln.emi_amount)
    out[:] = [r for r in out if not (isinstance(r, m.Payment) and r.loan_id in plan and r.status == "matched")]

    # 2. cases (id = loan id), then PTP / RTP history
    def at(days: int, hour: int = 11) -> datetime:
        return datetime.combine(REF - timedelta(days=days), time(hour, 0), timezone.utc)

    cases = {}
    for i, x in info.items():
        cases[i] = m.CollectionCase(id=i, loan_id=i, customer_id=i, overdue_amount=x["amount"], missed_emis=x["missed"], dpd=x["dpd"],
                                    bucket=bucket_of(x["dpd"]), status="open", priority=priority_of(x["dpd"], x["missed"]),
                                    attempts=0 if i == OUT_ID else rnd.randint(0, 3), updated_at=at(0))
        if cases[i].attempts:
            cases[i].last_call_at = at(rnd.randint(2, 6))
    out.extend(cases.values())

    def ptp(i, amount, days_ahead, status, paid, created_days_ago, direction="outbound"):
        tag = "full" if amount >= info[i]["amount"] else "partial"
        out.append(m.PromiseToPay(case_id=i, loan_id=i, customer_id=i, call_id=f"seed-ptp-{i}", direction=direction, amount=amount,
                                  promised_date=REF + timedelta(days=days_ahead), amount_tag=tag, status=status, paid_amount=paid,
                                  created_at=at(created_days_ago), resolved_at=None if status == "open" else at(max(created_days_ago - 7, 0))))

    for i, ahead in ((pick[0], 3), (pick[1], 6), (pick[17], 9)):  # open, still in date
        ptp(i, loans[i].emi_amount * info[i]["missed"], ahead, "open", 0, 1)
        cases[i].status = "ptp"
    for i in (pick[2], pick[18]):  # kept: paid on time (matched payment on file)
        ptp(i, loans[i].emi_amount, -3, "kept", loans[i].emi_amount, 9)
        out.append(m.Payment(loan_id=i, date=REF - timedelta(days=4), amount=loans[i].emi_amount, utr=f"SAHYM{rnd.randint(10**10, 10**11 - 1)}",
                             channel="upi", status="matched"))
    for i in (pick[3], pick[24]):  # broken: nothing arrived
        ptp(i, loans[i].emi_amount, -5, "broken", 0, 12)
        cases[i].priority += 20
    for i, code, note, hrs in ((pick[4], "job_loss", "lost job last month", 14 * 24), (pick[19], "medical", "hospital admission", 14 * 24),
                               (pick[25], "dispute", "says EMI was debited twice", 3 * 24), (pick[29], "unwilling", None, 7 * 24)):
        out.append(m.RefusalToPay(case_id=i, loan_id=i, customer_id=i, call_id=f"seed-rtp-{i}", direction="outbound", reason_code=code,
                                  note=note, overdue_amount=info[i]["amount"], created_at=at(2),
                                  follow_up_at=at(2) + timedelta(hours=hrs)))
        cases[i].status, cases[i].next_action_at = "rtp", at(2) + timedelta(hours=hrs)

    # 3. savings balances and transactions
    accts = {r.id: r for r in out if isinstance(r, m.Account)}
    for i, ln in loans.items():
        rows, bal = _txns(rnd, ln, i, REF, low=i in plan)
        out.extend(rows)
        a = accts[i]
        a.balance = bal
        a.hold_amount = min(5_000, bal // 2) if i % 7 == 0 else 0


async def seed(engine: AsyncEngine, n_only: bool = False) -> int:
    from sqlalchemy.ext.asyncio import AsyncSession

    async with engine.begin() as c:
        await c.run_sync(m.Base.metadata.drop_all)
        await c.run_sync(m.Base.metadata.create_all)
    rows = build()
    async with AsyncSession(engine, expire_on_commit=False) as s:
        done: tuple = ()
        for stage in ((m.Branch,), (m.Customer,), (m.Account, m.Loan), (m.CollectionCase,)):  # FK order (no ORM relationships)
            s.add_all([r for r in rows if isinstance(r, stage)])
            await s.flush()
            done += stage
        s.add_all([r for r in rows if not isinstance(r, done)])
        await s.flush()
        for tbl in ("customers", "accounts", "loans", "collection_cases"):  # explicit ids were used
            await s.execute(text(f"SELECT setval(pg_get_serial_sequence('{tbl}','id'), (SELECT max(id) FROM {tbl}))"))
        await s.commit()
    from app import sessions  # reseed must fully reset: sessions, rate-limit counters, cref cache

    keys = [k async for k in sessions.redis.scan_iter("ll:*")]
    if keys:
        await sessions.redis.delete(*keys)
    return sum(isinstance(r, m.Customer) for r in rows)
