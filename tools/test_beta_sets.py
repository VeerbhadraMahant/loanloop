"""Sanity checks for the beta-language eval sets: cd gateway && uv run pytest ../tools/test_beta_sets.py -q"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import eval_agent  # noqa: E402

BETA = ["bn", "gu", "kn", "ml", "pa", "ta", "te"]


def load(p):
    return [json.loads(x) for x in (ROOT / "tools" / p).read_text(encoding="utf-8").splitlines() if x.strip()]


def test_faq_beta_set():
    rows = load("faq_route_set_beta.jsonl")
    intents = set(json.loads((ROOT / "i18n" / "source" / "faq.json").read_text(encoding="utf-8")))
    assert len({r["id"] for r in rows}) == len(rows)
    for lg in BETA:
        mine = [r for r in rows if r["lang"] == lg]
        assert len(mine) == 40 and all(r["id"].endswith("@" + lg) for r in mine)
        pos = [r for r in mine if r["expect"] != "none"]
        assert len(pos) == 30 and len({r["expect"] for r in pos}) >= 25
        assert sum(r["id"].startswith("neg_") for r in mine) == 10
    assert {r["lang"] for r in rows} == set(BETA)
    assert all(r["expect"] == "none" or r["expect"] in intents for r in rows)
    assert all(r["text"].strip() for r in rows)


def test_eval_cases_beta():
    cases = load("eval_cases_beta.jsonl")
    assert eval_agent.validate(cases) == []
    assert len({c["id"] for c in cases}) == len(cases)
    for lg in BETA:
        mine = [c for c in cases if c["expect"]["language"] == lg]
        assert len(mine) == 20 and all(c["id"].endswith("@" + lg) for c in mine)
    orig = {c["id"]: c for c in load("eval_cases.jsonl")}
    for c in cases:
        o = orig[c["id"].rpartition("@")[0]]
        assert (c["persona"], c["direction"], c.get("case_id")) == (o["persona"], o["direction"], o.get("case_id"))
        assert c["expect"].get("actions_any") == o["expect"].get("actions_any") and c["expect"].get("actions_none") == o["expect"].get("actions_none")
    base = lambda lg: Counter(c["id"].rpartition("@")[0] for c in cases if c["expect"]["language"] == lg)  # noqa: E731
    assert all(base(lg) == base("ta") for lg in BETA)
