"""Run the Locust load test headless and write tools/out/loadtest.json.

    uv run --project tools python tools/loadtest/run.py [-u 1000] [-r 50] [-t 3m] [--host http://localhost:8000]
"""
import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out" / "loadtest.json"
NOTE = "single dev box: load generator and gateway share CPU, so latencies are pessimistic"


def duration_s(t: str) -> int:
    """'3m', '90s', '1h30m' -> seconds."""
    parts = re.findall(r"(\d+)([hms])", t)
    if not parts or "".join(n + u for n, u in parts) != t:
        raise ValueError(f"bad duration {t!r}")
    return sum(int(n) * {"h": 3600, "m": 60, "s": 1}[u] for n, u in parts)


def parse_stats(path: Path) -> dict:
    """Parse locust *_stats.csv into the loadtest.json fields (ms, error_rate 0..1)."""
    per_action, overall = [], {}
    with Path(path).open(newline="") as f:
        for r in csv.DictReader(f):
            n, fails = int(r["Request Count"]), int(r["Failure Count"])
            row = {"p50": float(r["50%"]), "p95": float(r["95%"]), "p99": float(r["99%"]), "count": n, "failures": fails}
            if r["Name"] == "Aggregated":
                overall = {"p50": row["p50"], "p95": row["p95"], "p99": row["p99"],
                           "error_rate": fails / n if n else 0.0, "rps": float(r["Requests/s"])}
            else:
                per_action.append({"action": r["Name"], **row})
    return {"per_action": per_action, "overall": overall}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-u", "--users", type=int, default=1000, help="concurrent simulated calls")
    ap.add_argument("-r", "--spawn-rate", type=int, default=50)
    ap.add_argument("-t", "--run-time", default="3m", help="e.g. 90s, 3m, 1h")
    ap.add_argument("--host", default="http://localhost:8000")
    ap.add_argument("--note", default="", help="free text for host_note, e.g. gateway worker count")
    a = ap.parse_args(argv)
    secs = duration_s(a.run_time)
    with tempfile.TemporaryDirectory() as d:
        prefix = Path(d) / "lt"
        cmd = [sys.executable, "-m", "locust", "-f", str(HERE / "locustfile.py"), "--headless", "-u", str(a.users),
               "-r", str(a.spawn_rate), "-t", a.run_time, "--host", a.host, "--csv", str(prefix), "--only-summary", "--reset-stats"]  # stats start once all users are spawned
        rc = subprocess.run(cmd, cwd=HERE).returncode
        stats = Path(f"{prefix}_stats.csv")
        if not stats.exists():
            print("locust produced no stats", file=sys.stderr)
            return rc or 1
        s = parse_stats(stats)
    overall = s["overall"]
    result = {"users": a.users, "duration_s": secs, "rps": overall.pop("rps"), "per_action": s["per_action"],
              "overall": overall, "measured_at": datetime.now(timezone.utc).isoformat(), "host_note": f"{NOTE}; {a.note}" if a.note else NOTE}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2))
    print(f"wrote {OUT}: {result['rps']:.1f} rps, p95 {overall['p95']} ms, error rate {overall['error_rate']:.2%}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
