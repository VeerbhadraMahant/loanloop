from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog


def write_audit(
    db: AsyncSession,
    *,
    call_id: str,
    action: str,
    tier: int = 0,
    outcome: str = "ok",
    error_code: str | None = None,
    latency_ms: int = 0,
    flags: dict | None = None,
) -> None:
    """Append-only insert (added to the caller's transaction; the caller commits). Never pass raw values."""
    db.add(
        AuditLog(
            call_id=call_id, session_id=call_id, action=action, tier=tier, outcome=outcome,
            error_code=error_code, latency_ms=latency_ms, flags=flags or {},
        )
    )
