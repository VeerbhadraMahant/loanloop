"""t(key, lang, **kw): template registry merged from app/speak/templates/*.py (each exports T)
plus the `gateway` and `months` sections of each present i18n/<code>.json (see app/i18n.py)."""
import importlib
import logging
import pkgutil
from string import Formatter

from app import i18n
from app.security import scrub
from app.speak import templates as _pkg
from app.speak.format import MONTHS, digits, fmt_date, rupees  # noqa: F401

log = logging.getLogger("speak")
_REG: dict[str, dict[str, str]] = {}
_warned: set[tuple[str, str]] = set()


def _fields(s: str) -> set[str]:
    return {f for _, f, _, _ in Formatter().parse(s) if f is not None}


def _merge_files() -> None:
    for c in [c for c in MONTHS if c not in i18n.BUILTIN]:
        del MONTHS[c]
    secret: dict[str, list] = {}
    for code, d in i18n.load_lang_files().items():
        for typ, ws in ((d.get("words") or {}).get("secret_words") or {}).items():
            if isinstance(ws, list):
                secret.setdefault(typ, []).extend(ws)
        months = d.get("months")
        if isinstance(months, list) and len(months) == 12 and all(isinstance(m, str) and m for m in months):
            MONTHS[code] = months
        else:
            log.warning("i18n/%s.json: 'months' must be 12 names; dates fall back to English", code)
        for key, text in (d.get("gateway") or {}).items():
            en = _REG.get(key, {}).get("en")
            if en is None or not isinstance(text, str) or not text.strip():
                continue
            try:
                same = _fields(text) == _fields(en)
            except ValueError:
                same = False
            if same:
                _REG[key][code] = text
            else:
                log.warning("i18n/%s.json: template %r has different placeholders from English; skipped", code, key)
    scrub.set_extra_secret_words(secret)  # beta-script OTP/PIN/CVV/password words: the secret scan only ever gains words


def reload() -> None:
    """Re-merge templates and language files (tests / hot reload)."""
    _REG.clear()
    _warned.clear()
    for m in pkgutil.iter_modules(_pkg.__path__):
        _REG.update(importlib.reload(importlib.import_module(f"{_pkg.__name__}.{m.name}")).T)
    _merge_files()


for _m in pkgutil.iter_modules(_pkg.__path__):
    _REG.update(importlib.import_module(f"{_pkg.__name__}.{_m.name}").T)
_merge_files()


def t(key: str, lang: str = "en", **kw) -> str:
    entry = _REG.get(key)
    if entry is None:
        entry = _REG["generic_error"]
    text = entry.get(lang)
    if not text:
        if lang != "en" and (key, lang) not in _warned:
            _warned.add((key, lang))
            log.debug("template %r has no %r text; using English", key, lang)
        text = entry["en"]
    try:
        return text.format(**kw)
    except (KeyError, IndexError, ValueError):  # a bad translation must never break a call
        return entry["en"].format(**kw)
