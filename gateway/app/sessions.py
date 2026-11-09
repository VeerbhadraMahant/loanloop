"""Redis call-session store (TTL 30 min) + tiny rate-limit counters."""
import redis.asyncio as aioredis
from pydantic import BaseModel, Field

from app.config import settings

redis: aioredis.Redis = aioredis.from_url(settings.redis_url, decode_responses=True, max_connections=200)


_YES = {"yes", "y", "haan", "han", "ha", "haa", "ho", "hoy", "हाँ", "हां", "हा", "हो", "होय"}


def norm_readback(field: str, value: str) -> str:
    """Case/whitespace-insensitive compare form; amounts compare numerically; closure yes-words collapse to 'yes'."""
    v = "".join(value.split()).lower()
    if field == "amount":
        try:
            f = float(v.replace(",", "").replace("₹", ""))
            return str(int(f)) if f == int(f) else str(f)
        except ValueError:
            return v
    if field == "closure" and v in _YES:
        return "yes"
    return v


class Session(BaseModel):
    call_id: str
    customer_id: int | None = None
    tier: int = 0
    language: str = "en"
    tasks: list[str] = Field(default_factory=list)
    readbacks: dict[str, str] = Field(default_factory=dict)
    failed_attempts: int = 0
    approval_id: int | None = None
    prefetched_customer_id: int | None = None  # caller-ID claim only; tier stays 0
    direction: str = "inbound"  # inbound|outbound
    case_id: int | None = None  # outbound only

    def confirm_readback(self, field: str, value: str) -> None:
        self.readbacks[field] = norm_readback(field, value)

    def has_readback(self, field: str, value: str | None = None) -> bool:
        return field in self.readbacks and (value is None or self.readbacks[field] == norm_readback(field, value))

    def consume_readback(self, field: str) -> str | None:
        """Pop a confirmed read-back (one-shot: a change needs a fresh confirmation)."""
        return self.readbacks.pop(field, None)


def _key(call_id: str) -> str:
    return f"ll:sess:{call_id}"


async def create(call_id: str, language: str = "en", prefetched_customer_id: int | None = None,
                 direction: str = "inbound", case_id: int | None = None) -> Session:
    s = Session(call_id=call_id, language=language, prefetched_customer_id=prefetched_customer_id,
                direction=direction, case_id=case_id)
    await save(s)
    return s


async def get(call_id: str) -> Session | None:
    raw = await redis.get(_key(call_id))
    return Session.model_validate_json(raw) if raw else None


async def save(s: Session) -> None:
    await redis.set(_key(s.call_id), s.model_dump_json(), ex=settings.session_ttl_s)


async def delete(call_id: str) -> None:
    await redis.delete(_key(call_id))


async def incr(key: str, ttl_s: int) -> int:
    """Rate-limit counter: increments and (re)arms TTL on first hit."""
    k = f"ll:rl:{key}"
    n = await redis.incr(k)
    if n == 1:
        await redis.expire(k, ttl_s)
    return n
