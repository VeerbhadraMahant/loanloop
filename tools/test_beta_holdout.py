"""Sanity checks for the held-out beta FAQ set: cd gateway && uv run pytest ../tools/test_beta_holdout.py -q"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BETA = ["bn", "gu", "kn", "ml", "pa", "ta", "te"]


def test_holdout_set():
    rows = [json.loads(x) for x in (ROOT / "tools" / "faq_route_set_beta_holdout.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    intents = set(json.loads((ROOT / "i18n" / "source" / "faq.json").read_text(encoding="utf-8")))
    assert len({r["id"] for r in rows}) == len(rows)
    assert {r["lang"] for r in rows} == set(BETA)
    for lg in BETA:
        mine = [r for r in rows if r["lang"] == lg]
        assert len(mine) == 40 and all(r["id"].endswith("@" + lg) for r in mine)
        pos = [r for r in mine if r["expect"] != "none"]
        assert len(pos) == 30 and len({r["expect"] for r in pos}) >= 25
        assert sum(r["id"].startswith("ho_neg_") for r in mine) == 10
    assert all(r["expect"] == "none" or r["expect"] in intents for r in rows)
    assert all(r["text"].strip() and r["id"].startswith("ho_") for r in rows)
