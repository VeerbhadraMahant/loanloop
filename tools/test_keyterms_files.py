import re
from pathlib import Path

import pytest

D = Path(__file__).resolve().parent.parent / "agent" / "keyterms"
BLOCKS = {
    "bn": (0x0980, 0x09FF), "pa": (0x0A00, 0x0A7F), "gu": (0x0A80, 0x0AFF),
    "ta": (0x0B80, 0x0BFF), "te": (0x0C00, 0x0C7F), "kn": (0x0C80, 0x0CFF),
    "ml": (0x0D00, 0x0D7F),
}


@pytest.mark.parametrize("lang", sorted(BLOCKS))
def test_keyterms_file(lang):
    raw = (D / f"{lang}.txt").read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf")
    lines = raw.decode("utf-8").replace("\r\n", "\n").split("\n")  # git autocrlf may check out CRLF; the loader strips lines
    assert lines[-1] == ""
    lines = lines[:-1]
    assert 40 <= len(lines) <= 100
    assert all(l and l.strip() == l for l in lines)
    assert len(set(lines)) == len(lines)
    lo, hi = BLOCKS[lang]
    for l in lines:
        if re.fullmatch(r"[A-Z]{2,6}", l):  # Latin acronym (IFSC, UPI, ...)
            continue
        chars = [c for c in l if c.isalpha() or lo <= ord(c) <= hi]
        inblock = [c for c in chars if lo <= ord(c) <= hi]
        assert inblock and len(inblock) >= 0.8 * len(chars), l
