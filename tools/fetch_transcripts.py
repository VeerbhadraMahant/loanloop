"""Fetch Agent Builder conversation logs and store them REDACTED only (CLAUDE.md 6.10).

  uv run --project gateway python tools/fetch_transcripts.py --dry-run
  INYA_PLATFORM_API_KEY=... uv run --project gateway python tools/fetch_transcripts.py [--bot-id ID] [--pages N]

POST /v1/conversations/logs?environment=development {pageNo, botId} (docs/gnani-facts.md). The response shape is not
documented in detail, so every string anywhere in it goes through the gateway's redact() before tools/out/transcripts.json.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "gateway"))
from app.logging import redact  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).parent / "out" / "transcripts.json"
BASE = "https://api.inya.ai/platform"


def redact_all(x):
    """Recursively redact every string (values and keys) in a JSON-like structure."""
    if isinstance(x, str):
        return redact(x)
    if isinstance(x, list):
        return [redact_all(i) for i in x]
    if isinstance(x, dict):
        return {redact(str(k)): redact_all(v) for k, v in x.items()}
    return x


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print the request, no network, no key needed")
    ap.add_argument("--bot-id")
    ap.add_argument("--pages", type=int, default=1)
    a = ap.parse_args(argv)
    f = ROOT / "agent" / ".bot_id"
    bot = a.bot_id or (f.read_text().strip() if f.exists() else "<botId>")
    url = f"{BASE}/v1/conversations/logs?environment=development"
    if a.dry_run:
        print(f"POST {url} x-api-key: <INYA_PLATFORM_API_KEY> pages 1..{a.pages} body " + json.dumps({"pageNo": 1, "botId": bot}))
        print(f"would write redacted JSON to {OUT}")
        return 0
    key = os.environ.get("INYA_PLATFORM_API_KEY")
    if not key or bot == "<botId>":
        print("need INYA_PLATFORM_API_KEY and a bot id (--bot-id or agent/.bot_id)", file=sys.stderr)
        return 2
    import httpx

    pages = []
    for n in range(1, a.pages + 1):
        r = httpx.post(url, headers={"x-api-key": key}, json={"pageNo": n, "botId": bot}, timeout=30)
        r.raise_for_status()
        pages.append(redact_all(r.json()))  # redact before anything touches disk
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pages, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(pages)} redacted page(s) to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
