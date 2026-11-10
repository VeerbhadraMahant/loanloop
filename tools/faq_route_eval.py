"""Offline eval of FAQ routing: OLD keyword scorer (main's faq.py, any hit answers directly) vs NEW weighted scorer (HIGH answers directly).

    cd gateway && uv run python ../tools/faq_route_eval.py [--tune]      (exit 1 if the NEW HIGH precision targets are missed)

Labelled set: tools/faq_route_set.jsonl (id, text, lang, expect = intent id or "none"). Ids starting `neg_` are the hijack negatives.
Both sides get the same voice guards (OLD without the new tool-owned guard), so the table shows what the scorer itself changes.
"""
import importlib
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "gateway"))
sys.path.insert(0, str(ROOT))
import os  # noqa: E402

os.environ.setdefault("WARMUP", "false")
from app.routes.actions import faq as new_faq  # noqa: E402
from voice import app as vapp  # noqa: E402


def load_old():
    """main's faq.py up to the request model (load_faq/_norm/match only), exec'd with the real file's path so faq.json resolves."""
    src = subprocess.run(["git", "show", "main:gateway/app/routes/actions/faq.py"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    ns = {"__file__": str(new_faq.__file__), "__name__": "old_faq"}
    exec(compile(src.split("class FaqIn")[0], "old_faq.py", "exec"), ns)
    return ns


def evaluate(cases, intents, old_match, high_min=None, margin=None, med_min=None, cover=None):
    st = {k: v for k, v in (("faq_direct_min", high_min), ("faq_direct_margin", margin), ("faq_ref_min", med_min), ("faq_direct_cover", cover)) if v is not None}
    rows, t_new, t_old = [], [], []
    for c in cases:
        text, lang, want = c["text"], c["lang"], c["expect"]
        ok_old = vapp.faq_text_ok(text, tool_guard=False)
        t0 = time.perf_counter()
        o = old_match(intents, text, lang) if ok_old else None
        t_old.append((time.perf_counter() - t0) * 1000)
        t0 = time.perf_counter()
        level, iid = vapp.faq_route(text, lang, st)
        t_new.append((time.perf_counter() - t0) * 1000)
        rows.append({"c": c, "old": o, "level": level, "iid": iid})
    return rows, t_old, t_new


def summarize(rows, t_old, t_new):
    pos = [r for r in rows if r["c"]["expect"] != "none"]
    neg = [r for r in rows if r["c"]["id"].startswith("neg_")]  # incl. the @p variants
    old_d = [r for r in rows if r["old"]]
    new_d = [r for r in rows if r["level"] == "high"]
    ok_old = [r for r in old_d if r["old"] == r["c"]["expect"]]
    ok_new = [r for r in new_d if r["iid"] == r["c"]["expect"]]
    pct = lambda a, b: 100.0 * a / b if b else 100.0  # noqa: E731
    return {
        "n": len(rows),
        "old": {"direct": len(old_d), "precision": pct(len(ok_old), len(old_d)), "neg_direct": sum(1 for r in neg if r["old"]),
                "recall": pct(len(ok_old), len(pos)), "ms": statistics.mean(t_old)},
        "new": {"direct": len(new_d), "precision": pct(len(ok_new), len(new_d)), "neg_direct": sum(1 for r in neg if r["level"] == "high"),
                "recall": pct(len(ok_new), len(pos)), "ms": statistics.mean(t_new),
                "medium": pct(sum(r["level"] == "medium" for r in rows), len(rows)), "low": pct(sum(r["level"] == "low" for r in rows), len(rows)),
                "correct": len(ok_new)},
        "old_correct": len(ok_old), "n_neg": len(neg), "n_pos": len(pos),
        "wrong_new": [(r["c"]["id"], r["c"]["text"], r["c"]["expect"], r["iid"]) for r in new_d if r["iid"] != r["c"]["expect"]],
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    cases = [json.loads(line) for line in (ROOT / "tools" / "faq_route_set.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    # the live path sees what the caller says first: every row also runs behind its language-choice prefix ("English. ...")
    pre = {"en": "English.", "hinglish": "Hinglish.", "hi": "हिंदी में बताइए.", "mr": "मराठी."}
    cases += [{**c, "id": c["id"] + "@p", "text": f"{pre[c['lang']]} {c['text']}"} for c in cases]
    intents = new_faq.load_faq()
    old = load_old()
    rows, t_old, t_new = evaluate(cases, intents, lambda i, q, lg: old["match"](i, q, lg))
    s = summarize(rows, t_old, t_new)
    o, n = s["old"], s["new"]
    print(f"{s['n']} cases ({s['n_pos']} with an FAQ intent, {s['n_neg']} hijack negatives); thresholds high>={vapp.faq_score.HIGH_MIN} margin>={vapp.faq_score.HIGH_MARGIN} med>={vapp.faq_score.MED_MIN}")
    print(f"{'':28}{'OLD':>10}{'NEW':>10}")
    print(f"{'turns answered directly':28}{o['direct']:>10}{n['direct']:>10}")
    print(f"{'  of which correct':28}{s['old_correct']:>10}{n['correct']:>10}")
    print(f"{'HIGH precision %':28}{o['precision']:>10.1f}{n['precision']:>10.1f}")
    print(f"{'hijack negatives answered':28}{o['neg_direct']:>10}{n['neg_direct']:>10}")
    print(f"{'HIGH recall %':28}{o['recall']:>10.1f}{n['recall']:>10.1f}")
    print(f"{'MEDIUM % (LLM + FAQ block)':28}{'-':>10}{n['medium']:>10.1f}")
    print(f"{'LOW % (plain LLM)':28}{'-':>10}{n['low']:>10.1f}")
    print(f"{'mean match ms':28}{o['ms']:>10.2f}{n['ms']:>10.2f}")
    for w in s["wrong_new"]:
        print("NEW WRONG DIRECT:", w)
    if "--show" in sys.argv:
        for r in rows:
            if r["c"]["expect"] != "none" and r["level"] != "high":
                print(f"  not high [{r['level']}] want {r['c']['expect']} got {r['iid']}: {r['c']['text']}")
    return 0 if n["precision"] >= 98 and n["neg_direct"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
