"""Secret detection. Returns only a secret *type*; values are never logged, stored or raised."""
import re

_KW = re.compile(
    r"pass\s*word|pass\s*code|\bpin\b(?![\s\-]*code)|\bmpin\b|\bupin\b|\botp\b|\bcvv\b|\bcvc\b|one[\s-]*time[\s-]*pass|"
    r"पासवर्ड|ओटीपी|पिन(?!\s*कोड)|सीवीवी|पासकोड|पासवर्ड|एमपिन",
    re.I,
)
SECRET_TYPES = ("otp", "pin", "cvv", "password")
_NOT_PIN_CODE = r"(?![\s\-]*(?:code|कोड|কোড|ਕੋਡ|કોડ|கோட்|కోడ్|ಕೋಡ್|കോഡ്))"
_EXTRA: list[tuple[re.Pattern, str]] = []  # words.secret_words of the language files: (pattern, secret type)


def set_extra_secret_words(words: dict | None) -> None:
    """Secret words in other scripts (i18n `words.secret_words`: {type: [word, ...]}), matched as substrings. They are checked only
    after the built-in keywords and can only ADD detections. Called by the gateway's i18n loader and the voice service."""
    global _EXTRA
    out = []
    for t, ws in (words or {}).items():
        ws = sorted({w.strip().lower() for w in ws if isinstance(w, str) and w.strip() and (not w.isascii() or len(w.strip()) >= 4)}, key=lambda w: -len(w)) if isinstance(ws, list) else []
        if t in SECRET_TYPES and ws:
            not_code = _NOT_PIN_CODE if t == "pin" else ""  # "PIN code" is a postal code, like the built-in \bpin\b(?!code)
            out.append((re.compile("(?:" + "|".join(map(re.escape, ws)) + ")" + not_code, re.I), t))
    _EXTRA = out


_FIELD_KW = re.compile(r"password|passcode|(?<![a-z])[mu]?pin(?![a-z])|otp|cvv|secret", re.I)
_CARD = re.compile(r"(?<![\d])(?:\d[ -]?){16}(?![\d])")
_DIGITS = re.compile(r"(?<!\d)\d{3,6}(?!\d)")
# Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam digits -> ASCII
INDIC_DIGITS = {z + i: 48 + i for z in (0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66) for i in range(10)}


def _luhn(s: str) -> bool:
    d = [int(c) for c in s][::-1]
    return (sum(d[0::2]) + sum(sum(divmod(2 * x, 10)) for x in d[1::2])) % 10 == 0


def find_secret(field_name: str, value: str) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    value = value.translate(INDIC_DIGITS)
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
    for rx, t in _EXTRA:
        if rx.search(value):
            return t
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
