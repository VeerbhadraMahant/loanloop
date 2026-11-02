"""Secret detection. Returns only a secret *type*; values are never logged, stored or raised."""
import re

_KW = re.compile(
    r"pass\s*word|pass\s*code|\bpin\b(?![\s\-]*code)|\bmpin\b|\bupin\b|\botp\b|\bcvv\b|\bcvc\b|one[\s-]*time[\s-]*pass|"
    r"पासवर्ड|ओटीपी|पिन(?!\s*कोड)|सीवीवी|पासकोड|पासवर्ड|एमपिन",
    re.I,
)
_FIELD_KW = re.compile(r"password|passcode|(?<![a-z])[mu]?pin(?![a-z])|otp|cvv|secret", re.I)
_CARD = re.compile(r"(?<![\d])(?:\d[ -]?){16}(?![\d])")
_DIGITS = re.compile(r"(?<!\d)\d{3,6}(?!\d)")


def _luhn(s: str) -> bool:
    d = [int(c) for c in s][::-1]
    return (sum(d[0::2]) + sum(sum(divmod(2 * x, 10)) for x in d[1::2])) % 10 == 0


def find_secret(field_name: str, value: str) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    for m in _CARD.finditer(value):
        digits = re.sub(r"\D", "", m.group())
        if _luhn(digits):
            return "card_number"
    kw = _KW.search(value)
    if kw:
        t = kw.group().lower().replace(" ", "")
        if "cvv" in t or "cvc" in t or "सीवीवी" in t:
            return "cvv"
        if "otp" in t or "ओटीपी" in t or "onetime" in t.replace("-", ""):
            return "otp"
        if "pin" in t or "पिन" in t:
            return "pin"
        return "password"
    if _FIELD_KW.search(field_name) and _DIGITS.search(value):
        return "otp"
    return None


REMOVED = "[secret removed]"
_KW_VALUE = re.compile("(?:" + _KW.pattern + r")(?:\s*(?:is|are|was|:|=|-|है|हा|आहे)?\s*\S+)?", re.I)


def redact_secret(field_name: str, value: str) -> tuple[str, str] | None:
    """For free-text fields only: (value with secret spans replaced, secret_type), or None if clean."""
    stype = find_secret(field_name, value)
    if not stype:
        return None
    # Drop every sentence that carries a secret: removing only the keyword leaves the value
    # behind ("my pin number is 4321" -> "my [secret removed] is 4321").
    parts = re.split(r"(?<=[.!?।\n])\s*", value)
    out = " ".join(REMOVED if find_secret(field_name, p) or _has_card(p) else p for p in parts if p)
    if find_secret(field_name, out) or _has_card(out):
        out = REMOVED
    return out, stype


def _has_card(text: str) -> bool:
    return any(_luhn(re.sub(r"\D", "", m.group())) for m in _CARD.finditer(text))
