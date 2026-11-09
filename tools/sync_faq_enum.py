"""Rewrite the faq_lookup.topic enum in agent/actions.json from gateway/app/data/faq.json.

Run after faq.json changes:  python tools/sync_faq_enum.py   (stdlib only)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAQ = ROOT / "gateway" / "app" / "data" / "faq.json"
ACTIONS = ROOT / "agent" / "actions.json"


def main() -> None:
    ids = [i["id"] for i in json.loads(FAQ.read_text(encoding="utf-8"))["intents"]]
    raw = ACTIONS.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    d = json.loads(raw)
    act = next(a for a in d["actions"] if a["name"] == "faq_lookup")
    topic = next(x for x in act["variables"] if x["name"] == "topic")
    topic["enum"] = ids
    ACTIONS.write_text(json.dumps(d, indent=2, ensure_ascii=False).replace("\n", nl), encoding="utf-8", newline="")
    print(f"faq_lookup.topic enum: {len(ids)} intents")


if __name__ == "__main__":
    main()
