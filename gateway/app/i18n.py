"""Language registry and per-language files (format: i18n/README.md).

The 4 original modes (en, hi, hinglish, mr) stay in code. Every other code in i18n/languages.json may ship an
i18n/<code>.json; a missing or unreadable file is skipped with a warning, never an error.
"""
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("i18n")
BUILTIN = ("en", "hi", "hinglish", "mr")
I18N_DIR = Path(os.environ.get("I18N_DIR") or Path(__file__).resolve().parents[2] / "i18n")  # tests monkeypatch this


def modes() -> list[dict]:
    try:
        return json.loads((I18N_DIR / "languages.json").read_text(encoding="utf-8"))["modes"]
    except Exception:  # noqa: BLE001 - registry missing/broken: run with the built-in modes
        log.warning("i18n/languages.json unreadable; using built-in languages only")
        return [{"code": c} for c in BUILTIN]


def codes() -> list[str]:
    return [m["code"] for m in modes()]


def present() -> dict[str, Path]:
    """Registry languages (beyond the built-in 4) that have a file."""
    out = {}
    for c in codes():
        p = I18N_DIR / f"{c}.json"
        if c not in BUILTIN and p.is_file():
            out[c] = p
    return out


def load_lang_files() -> dict[str, dict]:
    out = {}
    for c, p in present().items():
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(d, dict) or d.get("lang") != c:
                raise ValueError("not an object or 'lang' does not match the file name")
            out[c] = d
        except Exception as e:  # noqa: BLE001
            log.warning("skipping i18n/%s.json: %s", c, e)
    return out


LANGS = frozenset(codes())
