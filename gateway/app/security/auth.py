import hmac

from fastapi import Header, HTTPException, Request

from app import authsess
from app.config import settings


def _eq(a: str | None, b: str) -> bool:
    return a is not None and hmac.compare_digest(a.encode(), b.encode())


async def require_agent(x_gateway_secret: str | None = Header(default=None)) -> None:
    if not _eq(x_gateway_secret, settings.gateway_shared_secret):
        raise HTTPException(401, "unauthorized")


def _bearer(authorization: str | None) -> str | None:
    return authorization[7:] if authorization and authorization.startswith("Bearer ") else None


async def _check(authorization, token, header_sid, kind, roles, other_sid) -> dict | None:
    """Service bearer (-> None) OR a session of `kind` with an allowed role. 401 = nothing valid, 403 = valid but not allowed."""
    if _eq(_bearer(authorization), token):  # header only: no ?token= (URLs get logged)
        return None
    s = await authsess.get(header_sid)
    if s is not None and s["kind"] == kind:
        if s["role"] in roles:
            return s
        raise HTTPException(403, "forbidden")
    if await authsess.get(other_sid) is not None:  # signed in at the other door only
        raise HTTPException(403, "forbidden")
    raise HTTPException(401, "unauthorized")


async def require_dashboard(request: Request, authorization: str | None = Header(default=None),
                            x_ll_staff_session: str | None = Header(default=None),
                            x_ll_customer_session: str | None = Header(default=None)) -> None:
    roles = ("engineer", "admin") if request.scope["path"] == "/dashboard/metrics" else ("bank_manager", "admin")
    await _check(authorization, settings.dashboard_token, x_ll_staff_session, "staff", roles, x_ll_customer_session)


async def require_phone(request: Request, key: str, authorization: str | None = Header(default=None),
                        x_ll_staff_session: str | None = Header(default=None),
                        x_ll_customer_session: str | None = Header(default=None)) -> None:
    s = await _check(authorization, settings.phone_token, x_ll_customer_session, "customer", ("customer",), x_ll_staff_session)
    if s is None:
        return
    if key.lower() not in ("me", s["customer_key"], f"c{s['customer_id']}"):
        raise HTTPException(403, "forbidden")
    request.scope["path_params"]["key"] = f"c{s['customer_id']}"  # always the primary-key form: a persona slug could name a same-named customer
