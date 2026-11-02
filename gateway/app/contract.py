from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Lang = Literal["en", "hi", "hinglish", "mr"]
ErrorCode = Literal["NOT_VERIFIED", "TIER_TOO_LOW", "NOT_FOUND", "INVALID_INPUT", "SECRET_DETECTED", "RATE_LIMITED"]


class ActionResponse(BaseModel):
    ok: bool
    speak: str
    data: dict[str, Any] = Field(default_factory=dict)
    next: str | None = None  # need_tier_1 | need_tier_2 | confirm_readback | handover
    error_code: ErrorCode | None = None


class ActionIn(BaseModel):
    """Base for every action input. Subclass and add fields (give every str a max_length)."""

    model_config = ConfigDict(extra="forbid", str_max_length=500)
    call_id: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,64}$", max_length=64)
    language: Lang = "en"
