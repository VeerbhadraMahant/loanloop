import hmac

from fastapi import Header, HTTPException

from app.config import settings


def _eq(a: str | None, b: str) -> bool:
    return a is not None and hmac.compare_digest(a.encode(), b.encode())


async def require_agent(x_gateway_secret: str | None = Header(default=None)) -> None:
    if not _eq(x_gateway_secret, settings.gateway_shared_secret):
        raise HTTPException(401, "unauthorized")


def _bearer(authorization: str | None) -> str | None:
    return authorization[7:] if authorization and authorization.startswith("Bearer ") else None


async def require_dashboard(authorization: str | None = Header(default=None)) -> None:
    if not _eq(_bearer(authorization), settings.dashboard_token):  # header only: no ?token= (URLs get logged)
        raise HTTPException(401, "unauthorized")


async def require_phone(authorization: str | None = Header(default=None)) -> None:
    if not _eq(_bearer(authorization), settings.phone_token):
        raise HTTPException(401, "unauthorized")
