"""Ops dashboard read endpoints (require_dashboard). Everything leaves through events._clean (redact)."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import sessions
from app.db.models import Approval, AuditLog, Call, Handover
from app.db.session import get_db
from app.routes.actions.approvals import expire_if_stale
from app.events import BLOCKED_CODES, _clean, customer_info
from app.security.auth import require_dashboard

router = APIRouter(prefix="/dashboard", dependencies=[Depends(require_dashboard)])
OUT = Path(__file__).resolve().parents[3] / "tools" / "out"  # <repo root>/tools/out
SECURITY_ACTIONS = {"report_secret_spoken"}


def _iso(d):
    return d.isoformat() if d else None


def _event(a: AuditLog, ref=None, key=None, lang=None) -> dict:
    f = a.flags or {}
    sec = a.error_code in BLOCKED_CODES or a.action in SECURITY_ACTIONS
    detail = a.error_code
    if "field" in f:
        detail = f"{a.error_code}: field {f['field']} ({f.get('secret_type')})"
    elif a.action == "report_secret_spoken":
        detail = "Caller spoke a secret; not stored"
    typ = {"start_call": "call_start", "end_call": "call_end"}.get(a.action, "security" if sec else "action")
    return {"id": f"a{a.id}", "ts": _iso(a.ts), "type": typ, "call_id": a.call_id, "action": a.action,
            "tier": a.tier, "outcome": "blocked" if sec else a.outcome, "latency_ms": a.latency_ms,
            "error_code": a.error_code, "language": lang, "customer_ref": ref, "customer_key": key, "detail": detail}


async def _refs(db: AsyncSession, call_ids: set[str]) -> dict[str, tuple]:
    """call_id -> (customer_ref, customer_key, language) from the calls table (customer_id is set at end_call)."""
    if not call_ids:
        return {}
    rows = (await db.execute(select(Call.call_id, Call.customer_id, Call.language).where(Call.call_id.in_(call_ids)))).all()
    out = {}
    for cid, cust, lang in rows:
        ref, key = await customer_info(db, cust)
        out[cid] = (ref, key, lang)
    return out


@router.get("/calls")
async def calls(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Call).order_by(Call.started_at.desc()).limit(100))).scalars().all()
    ids = [c.call_id for c in rows]
    latest = {r.call_id: r for r in (await db.execute(
        select(AuditLog).where(AuditLog.call_id.in_(ids)).order_by(AuditLog.call_id, AuditLog.id.desc())
        .distinct(AuditLog.call_id))).scalars()}
    agg = {r[0]: (r[1], r[2]) for r in (await db.execute(
        select(AuditLog.call_id, func.max(AuditLog.tier),
               func.count().filter(AuditLog.error_code.in_(BLOCKED_CODES)))
        .where(AuditLog.call_id.in_(ids)).group_by(AuditLog.call_id))).all()}
    live = await sessions.redis.mget([sessions._key(i) for i in ids]) if ids else []
    out = []
    for c, raw in zip(rows, live):
        sess = sessions.Session.model_validate_json(raw) if raw else None
        ref, _ = await customer_info(db, c.customer_id or (sess.customer_id if sess else None))
        mx, blocked = agg.get(c.call_id, (0, 0))
        out.append({"call_id": c.call_id, "customer_ref": ref, "language": c.language,
                    "tier": sess.tier if sess else mx,
                    "current_action": latest[c.call_id].action if c.ended_at is None and c.call_id in latest else None,
                    "started_at": _iso(c.started_at), "ended_at": _iso(c.ended_at), "outcome": c.outcome,
                    "blocked_count": blocked})
    return _clean(out)


@router.get("/calls/{call_id}/timeline")
async def timeline(call_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AuditLog).where(AuditLog.call_id == call_id).order_by(AuditLog.id))).scalars().all()
    ref, key, lang = (await _refs(db, {call_id})).get(call_id, (None, None, None))
    return _clean([_event(a, ref, key, lang) for a in rows])


@router.get("/handovers")
async def handovers(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Handover).order_by(Handover.id.desc()).limit(100))).scalars().all()
    out = []
    for h in rows:
        ref, _ = await customer_info(db, h.customer_id)
        out.append({"id": h.id, "call_id": h.call_id, "customer_ref": ref, "reason": h.reason, "summary": h.summary,
                    "requests_done": [str(x) for x in h.requests_done or []],
                    "requests_pending": [str(x) for x in h.requests_pending or []],
                    "created_at": _iso(h.created_at)})
    return _clean(out)


@router.get("/security")
async def security(db: AsyncSession = Depends(get_db)):
    audits = (await db.execute(
        select(AuditLog).where(AuditLog.error_code.in_(BLOCKED_CODES) | AuditLog.action.in_(SECURITY_ACTIONS))
        .order_by(AuditLog.id.desc()).limit(200))).scalars().all()
    refs = await _refs(db, {a.call_id for a in audits})
    ev = [_event(a, *refs.get(a.call_id, (None, None, None))) for a in audits]
    aps = (await db.execute(select(Approval).where(Approval.status.in_(("denied", "expired", "pending")))
                            .order_by(Approval.id.desc()).limit(50))).scalars().all()
    if any([expire_if_stale(a) for a in aps]):  # untapped approvals past the TTL are expired for good
        await db.commit()
    for ap in (a for a in aps if a.status != "pending"):
        ref, key = await customer_info(db, ap.customer_id)
        ev.append({"id": f"p{ap.id}", "ts": _iso(ap.created_at), "type": "approval", "call_id": ap.session_id,
                   "outcome": "blocked", "customer_ref": ref, "customer_key": key,
                   "detail": f"approval {ap.status}: {ap.purpose}"})
    ev.sort(key=lambda e: e["ts"], reverse=True)
    return _clean(ev)


def _read(name: str):
    try:
        return json.loads((OUT / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db)):
    lat = AuditLog.latency_ms
    pa = (await db.execute(
        select(AuditLog.action, func.count(),
               func.percentile_cont(0.5).within_group(lat), func.percentile_cont(0.95).within_group(lat),
               func.percentile_cont(0.99).within_group(lat), func.count().filter(AuditLog.outcome == "error"))
        .group_by(AuditLog.action).order_by(AuditLog.action))).all()
    n_calls = await db.scalar(select(func.count()).select_from(Call))
    ended = await db.scalar(select(func.count()).select_from(Call).where(Call.ended_at.is_not(None)))
    done = await db.scalar(select(func.count()).select_from(Call).where(Call.outcome.in_(("completed", "resolved"))))
    n_ho = await db.scalar(select(func.count(func.distinct(Handover.call_id))))
    secrets = await db.scalar(select(func.count()).select_from(AuditLog).where(
        (AuditLog.error_code == "SECRET_DETECTED") | AuditLog.action.in_(SECURITY_ACTIONS)))
    blocked = await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.error_code.in_(BLOCKED_CODES)))
    return _clean({
        "per_action": [{"action": a, "count": c, "p50": round(p50, 1), "p95": round(p95, 1), "p99": round(p99, 1),
                        "errors": e} for a, c, p50, p95, p99, e in pa],
        "totals": {"calls": n_calls, "task_completion_rate": done / ended if ended else 0.0,
                   "handover_rate": n_ho / n_calls if n_calls else 0.0, "secrets_detected": secrets, "blocked": blocked},
        "loadtest": _read("loadtest.json"), "stt_benchmark": _read("stt_benchmark.json"),
        "e2e_latency": _read("e2e_latency.json"),
    })


def _who(c) -> str:
    parts = c.name.split()
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")


@router.post("/jobs/run")
async def run_jobs():
    from app import jobs
    return {"runs": await jobs.run_all()}


@router.get("/collections")
async def collections(db: AsyncSession = Depends(get_db)):
    from app import jobs
    from app.db.models import CollectionCase, Customer, JobRun, Loan, PromiseToPay, RefusalToPay

    cust = {c.id: _who(c) for c in (await db.execute(select(Customer))).scalars()}
    last4 = dict((await db.execute(select(Loan.id, Loan.loan_last4))).all())

    def head(x):
        return {"customer": cust.get(x.customer_id), "loan": f"ending {last4.get(x.loan_id)}"}

    def case(c):
        return {"id": c.id, **head(c), "overdue_amount": c.overdue_amount, "missed_emis": c.missed_emis, "dpd": c.dpd,
                "bucket": c.bucket, "status": c.status, "priority": c.priority, "attempts": c.attempts,
                "last_call_at": _iso(c.last_call_at), "next_action_at": _iso(c.next_action_at)}

    cases = (await db.execute(select(CollectionCase).where(CollectionCase.status != "resolved")
                              .order_by(CollectionCase.priority.desc(), CollectionCase.id))).scalars().all()
    ptps = (await db.execute(select(PromiseToPay).order_by(PromiseToPay.id.desc()).limit(100))).scalars().all()
    rtps = (await db.execute(select(RefusalToPay).order_by(RefusalToPay.id.desc()).limit(100))).scalars().all()
    runs = (await db.execute(select(JobRun).order_by(JobRun.id.desc()).limit(10))).scalars().all()
    return _clean({
        "cases": [case(c) for c in cases],
        "ptps": [{"id": p.id, "case_id": p.case_id, **head(p), "direction": p.direction, "amount": p.amount,
                  "promised_date": _iso(p.promised_date), "amount_tag": p.amount_tag, "status": p.status,
                  "paid_amount": p.paid_amount, "created_at": _iso(p.created_at), "resolved_at": _iso(p.resolved_at)} for p in ptps],
        "rtps": [{"id": r.id, "case_id": r.case_id, **head(r), "direction": r.direction, "reason_code": r.reason_code,
                  "note": r.note, "overdue_amount": r.overdue_amount, "created_at": _iso(r.created_at),
                  "follow_up_at": _iso(r.follow_up_at)} for r in rtps],
        "queue": [case(c) for c in await jobs.queue(db)],
        "last_runs": [{"id": r.id, "job": r.job, "started_at": _iso(r.started_at), "finished_at": _iso(r.finished_at),
                       "stats": r.stats} for r in runs],
    })
