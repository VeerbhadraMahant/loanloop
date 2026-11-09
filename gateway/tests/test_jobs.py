import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app import clock, jobs
from app.clock import IST, today_ist
from app.db.models import CollectionCase, EmiSchedule, JobRun, Loan, Payment, PromiseToPay, now
from app.db.session import SessionLocal

DASH = {"Authorization": "Bearer test-dash"}
OUT = 201


def ist(h, m=0, days=0):
    return datetime.combine(today_ist() + timedelta(days=days), datetime.min.time(), tzinfo=IST).replace(hour=h, minute=m)


async def run(job):
    async with SessionLocal() as db:
        stats = await getattr(jobs, job)(db)
        await db.commit()
    return stats


async def test_mark_overdue_states_and_resolve(fresh):
    async with SessionLocal() as db:
        assert (await db.execute(select(EmiSchedule.id).where(EmiSchedule.status == "overdue"))).first() is None
    stats = await run("mark_overdue")
    assert stats["cases_upserted"] >= 33  # bounced rows are left bounced, so marked_emis may be 0
    async with SessionLocal() as db:
        assert (await db.execute(select(EmiSchedule.id).where(EmiSchedule.loan_id == OUT, EmiSchedule.status == "bounced"))).first()  # stay bounced
        assert (await db.execute(select(EmiSchedule.id).where(EmiSchedule.status == "overdue", EmiSchedule.due_date >= today_ist()))).first() is None
        c = await db.get(CollectionCase, OUT)
        assert (c.status, c.bucket, c.missed_emis) == ("open", "31-60", 2)
        assert c.overdue_amount == 2 * (await db.get(Loan, OUT)).emi_amount
    assert (await run("mark_overdue"))["marked_emis"] == 0  # idempotent
    async with SessionLocal() as db:  # customer pays: schedule paid -> case resolved
        await db.execute(update(EmiSchedule).where(EmiSchedule.loan_id == OUT).values(status="paid"))
        await db.commit()
    assert (await run("mark_overdue"))["cases_resolved"] == 1
    async with SessionLocal() as db:
        c = await db.get(CollectionCase, OUT)
        assert (c.status, c.overdue_amount, c.missed_emis, c.dpd, c.bucket) == ("resolved", 0, 0, 0, "0")


async def test_mark_overdue_creates_new_case_and_buckets(fresh):
    async with SessionLocal() as db:  # Priya's EMI of 5 days ago was never paid
        db.add(EmiSchedule(loan_id=1, due_date=today_ist() - timedelta(days=5), amount=32055, status="due"))
        db.add(EmiSchedule(loan_id=2, due_date=today_ist() - timedelta(days=100), amount=13538, status="due"))
        await db.commit()
    await run("mark_overdue")
    async with SessionLocal() as db:
        c1 = (await db.execute(select(CollectionCase).where(CollectionCase.loan_id == 1))).scalar_one()
        c2 = (await db.execute(select(CollectionCase).where(CollectionCase.loan_id == 2))).scalar_one()
    assert (c1.bucket, c1.dpd, c1.missed_emis, c1.overdue_amount, c1.status) == ("1-30", 5, 1, 32055, "open")
    assert (c2.bucket, c2.dpd) == ("90+", 100) and c2.priority > c1.priority


async def test_resolved_case_reopens_and_ptp_status_kept(fresh):
    await run("mark_overdue")
    async with SessionLocal() as db:
        await db.execute(update(CollectionCase).where(CollectionCase.id == OUT).values(status="ptp"))
        await db.commit()
    await run("mark_overdue")
    async with SessionLocal() as db:
        assert (await db.get(CollectionCase, OUT)).status == "ptp"  # a rerun never undoes a promise


async def _ptp(db, case_id, amount, when_days, status="open", created_days_ago=4):
    p = PromiseToPay(case_id=case_id, loan_id=case_id, customer_id=case_id, direction="outbound", amount=amount,
                     promised_date=today_ist() + timedelta(days=when_days), amount_tag="partial", status=status,
                     created_at=now() - timedelta(days=created_days_ago))
    db.add(p)
    await db.flush()
    return p


async def test_settle_ptps_kept_broken_partial(fresh):
    ids = [OUT, 4, 5, 6]
    async with SessionLocal() as db:
        # clean slate for these cases: drop seeded promises, make sure cases exist and are in ptp state
        await db.execute(update(PromiseToPay).values(status="cancelled"))
        for i in ids:
            if await db.get(CollectionCase, i) is None:
                db.add(CollectionCase(id=i, loan_id=i, customer_id=i, status="ptp", priority=10))
        await db.execute(update(CollectionCase).where(CollectionCase.id.in_(ids)).values(status="ptp", priority=10))
        kept = await _ptp(db, ids[0], 10_000, -1)
        partial = await _ptp(db, ids[1], 10_000, -1)
        none = await _ptp(db, ids[2], 10_000, -1)
        future = await _ptp(db, ids[3], 10_000, 2)
        for loan, amt in ((ids[0], 10_000), (ids[1], 4_000)):
            db.add(Payment(loan_id=loan, date=today_ist(), amount=amt, utr=f"UTRT{loan}", channel="upi", status="matched"))
        db.add(Payment(loan_id=ids[2], date=today_ist(), amount=10_000, utr="UTRT9", channel="upi", status="unmatched"))  # not matched: ignored
        db.add(Payment(loan_id=ids[2], date=today_ist() - timedelta(days=40), amount=10_000, utr="UTRT8", channel="upi", status="matched"))  # before the PTP
        await db.commit()
        pids = [p.id for p in (kept, partial, none, future)]
    assert await run("settle_ptps") == {"kept": 1, "broken": 2, "partial_paid": 1}
    async with SessionLocal() as db:
        k, p, n, f = [await db.get(PromiseToPay, i) for i in pids]
        assert (k.status, k.paid_amount) == ("kept", 10_000) and k.resolved_at
        assert (p.status, p.paid_amount) == ("broken", 4_000)
        assert (n.status, n.paid_amount) == ("broken", 0)
        assert f.status == "open" and f.resolved_at is None
        c = {i: await db.get(CollectionCase, i) for i in ids}
        assert c[ids[0]].status == "open" and c[ids[0]].priority == 10  # kept: back to normal, no bump
        assert c[ids[1]].status == "open" and c[ids[1]].priority == 30 and c[ids[2]].priority == 30  # broken: priority up
        assert c[ids[3]].status == "ptp"
    assert await run("settle_ptps") == {"kept": 0, "broken": 0, "partial_paid": 0}


async def _case(db, cid, priority, dpd, **kw):
    c = await db.get(CollectionCase, cid)
    if c is None:
        c = CollectionCase(id=cid, loan_id=cid, customer_id=cid)
        db.add(c)
    c.status, c.priority, c.dpd, c.last_call_at, c.next_action_at = kw.get("status", "open"), priority, dpd, kw.get("last_call_at"), kw.get("next_action_at")
    return c


async def test_build_queue_order_filters_and_window(fresh, monkeypatch):
    NOW = ist(10, 0)
    monkeypatch.setattr(clock, "now_ist", lambda: NOW)
    ago = lambda **kw: NOW - timedelta(**kw)  # noqa: E731
    async with SessionLocal() as db:
        await db.execute(update(CollectionCase).values(status="resolved"))
        await db.execute(update(PromiseToPay).values(status="cancelled"))
        a = await _case(db, 4, 50, 10)       # same priority as c, newer dpd: goes after it
        b = await _case(db, 5, 90, 10)       # highest priority
        c = await _case(db, 6, 50, 40)       # same priority as a, older dpd: goes before a
        d = await _case(db, 7, 99, 10, last_call_at=ago(hours=3))  # called recently: skipped
        e = await _case(db, 8, 99, 10, status="ptp")
        await db.flush()
        db.add(PromiseToPay(case_id=8, loan_id=8, customer_id=8, amount=1, promised_date=today_ist() + timedelta(days=1), amount_tag="partial", status="open"))
        f = await _case(db, 9, 99, 10, last_call_at=ago(hours=30))  # called yesterday: eligible
        g = await _case(db, 10, 99, 10, status="rtp", next_action_at=NOW + timedelta(days=3))  # follow-up not due
        h = await _case(db, 11, 60, 10, status="rtp", next_action_at=ago(hours=1))  # follow-up due: back in
        await _case(db, 12, 70, 10)
        await db.flush()
        db.add(PromiseToPay(case_id=12, loan_id=12, customer_id=12, amount=1, promised_date=today_ist(), amount_tag="partial", status="open"))  # due today: still in date, not called
        await db.commit()
    assert (await run("build_queue"))["queued"] == 5
    async with SessionLocal() as db:
        q = await jobs.queue(db)
    assert [x.id for x in q] == [9, 5, 11, 6, 4]  # priority desc, then dpd desc
    t = [x.next_action_at for x in q]
    assert t == sorted(t) and t[0] == ist(10, 0) and all(ist(8) <= x < ist(19) for x in t)
    assert (t[1] - t[0]) == timedelta(minutes=jobs.SLOT_MIN)
    async with SessionLocal() as db:
        assert (await db.get(CollectionCase, 11)).status == "open"  # rtp follow-up reached
        assert (await db.get(CollectionCase, 10)).status == "rtp"


async def test_build_queue_call_window_boundaries(fresh, monkeypatch):
    async with SessionLocal() as db:
        await db.execute(update(PromiseToPay).values(status="cancelled"))
        await db.execute(update(CollectionCase).values(last_call_at=None, status="open"))
        await db.commit()
    for now_, first in ((ist(22, 30), ist(8, 0, days=1)), (ist(5, 0), ist(8, 0)), (ist(19, 0), ist(8, 0, days=1)), (ist(18, 58), ist(18, 58))):
        monkeypatch.setattr(clock, "now_ist", lambda n=now_: n)
        await run("build_queue")
        async with SessionLocal() as db:
            q = await jobs.queue(db)
        assert len(q) >= 33 and q[0].next_action_at == first, now_
        for x in q:
            local = x.next_action_at.astimezone(IST)
            assert 8 <= local.hour < 19, (now_, local)
        assert q[-1].next_action_at > q[0].next_action_at


async def test_run_all_writes_job_runs(fresh):
    res = await jobs.run_all()
    assert [r["job"] for r in res] == ["mark_overdue", "settle_ptps", "build_queue"]
    async with SessionLocal() as db:
        runs = (await db.execute(select(JobRun).order_by(JobRun.id))).scalars().all()
    assert [r.job for r in runs] == ["mark_overdue", "settle_ptps", "build_queue"] and all(r.finished_at for r in runs)
    assert runs[0].stats["cases_upserted"] >= 33 and runs[2].stats["queued"] > 0


async def test_dashboard_auth(client):
    for method, path in (("get", "/dashboard/collections"), ("post", "/dashboard/jobs/run")):
        assert (await getattr(client, method)(path)).status_code == 401
        assert (await getattr(client, method)(path, headers={"X-Gateway-Secret": "test-secret"})).status_code == 401
        assert (await getattr(client, method)(path, headers={"Authorization": "Bearer nope"})).status_code == 401


async def test_dashboard_jobs_and_collections_masked(client, fresh):
    r = await client.post("/dashboard/jobs/run", headers=DASH)
    assert r.status_code == 200 and [x["job"] for x in r.json()["runs"]] == ["mark_overdue", "settle_ptps", "build_queue"]
    r = await client.get("/dashboard/collections", headers=DASH)
    d = r.json()
    assert set(d) == {"cases", "ptps", "rtps", "queue", "last_runs"}
    assert len(d["cases"]) >= 33 and d["queue"] and len(d["last_runs"]) == 3 and d["ptps"] and d["rtps"]
    assert {"open", "kept", "broken"} <= {p["status"] for p in d["ptps"]}
    vik = next(c for c in d["cases"] if c["id"] == OUT)
    assert vik["customer"] == "Vikram S." and vik["loan"] == "ending 9172" and vik["bucket"] == "31-60"
    text = json.dumps(d)
    assert not re.search(r"\d{9,}", text) and "SFB" not in text and "@example.com" not in text
    for c in d["cases"]:
        assert re.fullmatch(r"[A-Za-z]+( [A-Z]\.)?", c["customer"]) and re.fullmatch(r"ending \d{4}", c["loan"])


async def test_settle_ptps_uses_ist_date(fresh):
    """A PTP created 00:30 IST is 19:00 UTC of the previous day: payment that IST day must count."""
    created = datetime.combine(today_ist() - timedelta(days=3), datetime.min.time(), tzinfo=IST).replace(minute=30)
    async with SessionLocal() as db:
        db.add(PromiseToPay(case_id=OUT, loan_id=OUT, customer_id=OUT, amount=1000, promised_date=today_ist() - timedelta(days=1),
                            amount_tag="partial", status="open", created_at=created.astimezone(timezone.utc)))
        db.add(Payment(loan_id=OUT, date=created.date(), amount=1000, utr="UTRIST0030X", channel="upi", status="matched"))
        await db.commit()
    assert (await run("settle_ptps"))["kept"] == 1
