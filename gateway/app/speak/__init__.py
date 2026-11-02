"""t(key, lang, **kw): template registry merged from app/speak/templates/*.py (each exports T)."""
import importlib
import pkgutil

from app.speak import templates as _pkg
from app.speak.format import digits, fmt_date, rupees  # noqa: F401

_REG: dict[str, dict[str, str]] = {}
for _m in pkgutil.iter_modules(_pkg.__path__):
    _REG.update(importlib.import_module(f"{_pkg.__name__}.{_m.name}").T)


def reload() -> None:
    """Re-merge templates (tests / hot reload)."""
    _REG.clear()
    for m in pkgutil.iter_modules(_pkg.__path__):
        _REG.update(importlib.reload(importlib.import_module(f"{_pkg.__name__}.{m.name}")).T)


def t(key: str, lang: str = "en", **kw) -> str:
    entry = _REG.get(key)
    if entry is None:
        entry = _REG["generic_error"]
    return (entry.get(lang) or entry["en"]).format(**kw)
