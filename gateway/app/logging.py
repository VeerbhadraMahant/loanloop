"""Global redaction filter: no mobiles, long digit runs, emails or card numbers in logs."""
import logging
import re

_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"),
    (re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)"), "[card]"),
    (re.compile(r"(?<!\d)\d{9,18}(?!\d)"), "[num]"),
    (re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"), "[mobile]"),
]


def redact(text: str) -> str:
    for rx, rep in _PATTERNS:
        text = rx.sub(rep, text)
    return text


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = ()
        if record.exc_info:  # tracebacks may embed values
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


def install() -> None:
    for h in logging.getLogger().handlers:
        h.addFilter(RedactFilter())
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.addFilter(RedactFilter())
        for h in lg.handlers:
            h.addFilter(RedactFilter())
