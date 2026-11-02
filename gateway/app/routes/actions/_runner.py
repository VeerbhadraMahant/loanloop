"""The single action runner. Every gateway action is registered with @action.

    router = APIRouter(prefix="/actions")

    class EmiIn(ActionIn):
        ...

    @action("emi_info", In=EmiIn, router=router)
    async def emi_info(inp: EmiIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
        ...

Registers `POST /actions/<name>`. The runner does auth, JSON parse, secret scan, validation, session load,
tier check, timing, audit, live event. Handlers just do the work and return an ActionResponse.
`session` is mutated in place; the runner saves it. For start_call (needs_session=False) `session` is None. ends_session=True deletes the session after the handler (end_call).
scan_exempt: field names skipped by the secret scan (e.g. report_secret_spoken.secret_type).
"""
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app import events, sessions
from app.audit import write_audit
from app.contract import ActionIn, ActionResponse
from app.db.session import get_db
from app.security.auth import require_agent
from app.security.scrub import find_secret
from app.security.tiers import TIER_FOR_ACTION
from app.speak import t

log = logging.getLogger("actions")
LANGS = {"en", "hi", "hinglish", "mr"}

Handler = Callable[[Any, "sessions.Session | None", AsyncSession, BackgroundTasks], Awaitable[ActionResponse]]


def _scan(body: Any, exempt: set[str]) -> tuple[str, str] | None:
    """Return (field_name, secret_type) for the first secret-looking string value, else None."""
    items = body.items() if isinstance(body, dict) else enumerate(body) if isinstance(body, list) else ()
    for k, v in items:
        if k in exempt:
            continue
        if isinstance(v, str):
            st = find_secret(str(k), v)
            if st:
                return str(k), st
        elif isinstance(v, (dict, list)):
            hit = _scan(v, exempt)
            if hit:
                return hit
    return None


def action(name: str, In: type[ActionIn], router: APIRouter, needs_session: bool = True, ends_session: bool = False, scan_exempt: tuple[str, ...] = ()):
    exempt = set(scan_exempt)

    def deco(fn: Handler) -> Handler:
        @router.post(f"/{name}", name=name, dependencies=[Depends(require_agent)], response_model=ActionResponse)
        async def endpoint(request: Request, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)) -> ActionResponse:
            t0 = time.perf_counter()
            tier = 0
            call_id, lang, sess = "unknown", "en", None

            def ms() -> int:
                return int((time.perf_counter() - t0) * 1000)

            async def finish(resp: ActionResponse, flags: dict | None = None, commit: bool = True) -> ActionResponse:
                outcome = "ok" if resp.ok else "error"
                write_audit(db, call_id=call_id, action=name, tier=tier, outcome=outcome,
                            error_code=resp.error_code, latency_ms=ms(), flags=flags)
                if commit:
                    await db.commit()
                try:
                    await events.publish({
                        "type": "action", "call_id": call_id, "action": name, "tier": tier, "language": lang,
                        "outcome": outcome, "latency_ms": ms(), "error_code": resp.error_code,
                        "data": resp.data if resp.ok else {},
                    })
                except Exception:  # live feed must never break an action
                    log.warning("event publish failed")
                return resp

            def err(code: str | None, key: str, nxt: str | None = None) -> ActionResponse:
                return ActionResponse(ok=False, speak=t(key, lang), error_code=code, next=nxt)

            # 1. parse
            try:
                body = json.loads(await request.body())
                if not isinstance(body, dict):
                    raise ValueError
            except Exception:
                return await finish(err("INVALID_INPUT", "invalid_input"))
            if isinstance(body.get("call_id"), str) and 0 < len(body["call_id"]) <= 64:
                call_id = "".join(c for c in body["call_id"] if c.isalnum() or c in "_-") or "unknown"
            if body.get("language") in LANGS:
                lang = body["language"]

            # 2. secret scan (before validation, so nothing secret is ever kept or echoed)
            hit = _scan(body, exempt)
            if hit:
                field, stype = hit
                await events.publish({"type": "security", "call_id": call_id, "action": name,
                                      "event": "SECRET_DETECTED", "field": field, "secret_type": stype})
                return await finish(err("SECRET_DETECTED", "secret_warning"),
                                    flags={"security": "SECRET_DETECTED", "field": field, "secret_type": stype})

            # 3. validate (errors never echo input values)
            try:
                inp = In.model_validate(body)
            except ValidationError as e:
                bad = sorted({str(x["loc"][0]) for x in e.errors() if x["loc"]})
                return await finish(err("INVALID_INPUT", "invalid_input"), flags={"fields": bad})

            # 4. session + tier
            if needs_session:
                sess = await sessions.get(inp.call_id)
                if sess is None:
                    return await finish(err("NOT_VERIFIED", "not_verified", "need_tier_1"))
                sess.language = inp.language
                tier = sess.tier
                need = TIER_FOR_ACTION.get(name, 2)
                if tier < need:
                    if tier == 0:
                        return await finish(err("NOT_VERIFIED", "not_verified", "need_tier_1"))
                    return await finish(err("TIER_TOO_LOW", "tier_too_low", "need_tier_2"))

            # 5. handler
            try:
                resp = await fn(inp, sess, db, bg)
            except Exception as e:
                await db.rollback()
                log.error("handler %s failed: %s", name, type(e).__name__)  # never log the message
                return await finish(err(None, "generic_error", "handover"),
                                    flags={"exception": type(e).__name__})
            if sess is not None:
                tier = sess.tier
                await (sessions.delete(sess.call_id) if ends_session else sessions.save(sess))
            return await finish(resp)

        return fn

    return deco
