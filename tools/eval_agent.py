"""Behaviour eval for the voice agent: replays tools/eval_cases.jsonl as typed turns against a running voice service.

    cd gateway && uv run python ../tools/eval_agent.py --reset-limits --outbound-dob "<dob of the case customer>" [--only faq_] [--resume] [--dry]
    (other flags: --voice URL --gateway URL --case-id N --dashboard-token T (env DASHBOARD_TOKEN) --only PREFIX)

Voice service caps live calls at 50 and an ended call still counts until its 30 min TTL, so one full run (~90 cases) needs a voice restart
half way: the harness ends every call with a "bye" turn, stops cleanly on HTTP 429 (remaining cases are reported "not run"), and
--resume skips the ids that passed in the previous results file. Restart the voice service, then re-run with --resume.
--reset-limits (needs redis-py, hence `uv run` from gateway/) deletes ll:rl:verify:* in the gateway's Redis (REDIS_URL) before the run and
before each outbound case, because all outbound cases share one customer whose verify counter locks after 3 fails per hour.

--dry only validates the cases file (no network). A real run starts a call per case (tts off), sends each turn, checks the
`expect` block and writes tools/out/eval_results.json (pass rate, median/p95 turn latency, avg LLM calls per turn).

Case = {"id", "persona", "direction": "inbound"|"outbound", "case_id"?, "turns": [...], "expect": {...}}
expect: actions_any (at least one of these returned ok), actions_none (none returned ok), speak_not_contains (case-insensitive,
all turns), max_llm_calls_per_turn, plus optional speak_any (some turn's reply contains one) and language (final reply language).
Turn text placeholders: {mobile} {dob} (persona seed values), {ptp_date} {ptp_amount} (outbound, resolved at run time).
Outbound cases use persona "outbound_demo" and case_id "auto": the first open case from GET /dashboard/collections, or --case-id.
Exit 1 on any FAIL.
"""
import argparse
import datetime as dt
import json
import os
import statistics
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "tools" / "eval_cases.jsonl"
OUT = ROOT / "tools" / "out" / "eval_results.json"
# seed values (docs/personas.md, gateway/app/db/seed.py); outbound_demo is verified by DOB only, against the case's customer
PERSONAS = {
    "priya": {"mobile": "9000014417", "dob": "14 August 1991"},
    "ramesh": {"mobile": "9000023158", "dob": "22 March 1984"},
    "sunita": {"mobile": "9000030912", "dob": "5 November 1979"},
    "outbound_demo": {"mobile": "", "dob": ""},  # dob comes from --outbound-dob / env OUTBOUND_DOB (the dashboard only has masked data)
}
EXPECT_KEYS = {"actions_any", "actions_none", "speak_not_contains", "max_llm_calls_per_turn", "speak_any", "language"}
LANGS = {"en", "hi", "hinglish", "mr"}
TOOL_NAMES = ["faq_lookup", "verify_caller", "report_secret_spoken", "record_ptp", "record_rtp", "dues_info", "emi_info"]  # never spoken aloud
HOLES = ("{mobile}", "{dob}", "{ptp_date}", "{ptp_amount}")


def env(name: str) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    f = ROOT / "gateway" / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return None


def load_cases(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def validate(cases: list[dict]) -> list[str]:
    errs, seen = [], set()
    for i, c in enumerate(cases, 1):
        cid = c.get("id", f"#{i}")
        e = lambda m: errs.append(f"{cid}: {m}")
        if not c.get("id") or c["id"] in seen:
            e("missing or duplicate id")
        seen.add(c.get("id"))
        if c.get("persona") not in PERSONAS:
            e(f"unknown persona {c.get('persona')!r}")
        if c.get("direction") not in ("inbound", "outbound"):
            e("direction must be inbound or outbound")
        if c.get("direction") == "outbound" and c.get("persona") != "outbound_demo":
            e("outbound cases use persona outbound_demo")
        if not c.get("turns") or not all(isinstance(t, str) and t.strip() for t in c["turns"]):
            e("turns must be a non-empty list of strings")
        x = c.get("expect")
        if not isinstance(x, dict):
            e("expect missing")
            continue
        for k in x:
            if k not in EXPECT_KEYS:
                e(f"unknown expect key {k}")
        for k in ("actions_any", "actions_none", "speak_not_contains", "speak_any"):
            if k in x and not (isinstance(x[k], list) and all(isinstance(s, str) for s in x[k])):
                e(f"{k} must be a list of strings")
        if "max_llm_calls_per_turn" in x and not isinstance(x["max_llm_calls_per_turn"], int):
            e("max_llm_calls_per_turn must be int")
        if "language" in x and x["language"] not in LANGS:
            e("language must be one of en/hi/hinglish/mr")
        if not any(x.get(k) for k in ("actions_any", "actions_none", "speak_not_contains", "speak_any", "language")):
            e("expect checks nothing")
        text = json.dumps(c, ensure_ascii=False)
        for ph in ("{ptp_date}", "{ptp_amount}"):
            if ph in text and c.get("direction") != "outbound":
                e(f"{ph} only valid in outbound cases")
        if c.get("direction") == "outbound" and "{mobile}" in text:
            e("outbound has no {mobile}")
    return errs


def find_case(gw: str, token: str) -> dict | None:
    """First open collection case from the dashboard (masked data only)."""
    r = httpx.get(gw + "/dashboard/collections", headers={"Authorization": "Bearer " + token}, timeout=10)
    r.raise_for_status()
    for row in r.json().get("cases", []):
        if row.get("status") == "open":
            return row
    return None


def reset_limits(url: str) -> int:
    import redis  # gateway dependency; only needed with --reset-limits

    r = redis.Redis.from_url(url)
    keys = list(r.scan_iter("ll:rl:verify:*"))
    return r.delete(*keys) if keys else 0


def post(v: httpx.Client, path: str, **kw) -> httpx.Response:
    r = v.post(path, **kw)
    if r.status_code == 502:  # upstream hiccup: one retry
        r = v.post(path, **kw)
    return r


class CallCap(Exception):
    """voice service refused a new call (429): restart it, then --resume."""


def fill(s: str, vals: dict) -> str:
    for k, v in vals.items():
        s = s.replace("{" + k + "}", str(v))
    return s


def run_case(v: httpx.Client, c: dict, vals: dict, case_id: int | None, start_path: str) -> dict:
    body: dict = {"customer": c["persona"], "direction": c["direction"]}
    if c["direction"] == "outbound":
        body["case_id"] = case_id
    d = post(v, f"{start_path}?tts=false", json=body)
    if d.status_code == 429:
        raise CallCap()
    d.raise_for_status()
    d = d.json()
    cid, x = d["call_id"], c["expect"]
    oks, texts, langs, lat, llm, log = [], [], [], [], [], []
    for t in c["turns"]:
        say = fill(t, vals)
        t0 = time.perf_counter()
        r = post(v, f"/calls/{cid}/turn?tts=false", json={"text": say})
        ms = (time.perf_counter() - t0) * 1000
        if r.status_code != 200:
            log.append(f"turn failed HTTP {r.status_code}")
            break
        j = r.json()
        lat.append(ms)
        llm.append((j.get("timings") or {}).get("llm_calls", 0))
        oks += [a["name"] for a in j.get("actions", []) if a.get("ok")]
        texts.append(j.get("agent_text", ""))
        langs.append(j.get("language"))
        log.append(f"USER: {say}\nAGENT: {texts[-1]}  [{langs[-1]}] {sorted({a['name'] for a in j.get('actions', [])})} {ms:.0f}ms")
        if j.get("ended"):
            break
    if not (lat and j.get("ended")):  # close the call so the gateway session is cleared; the reply is not evaluated
        try:
            v.post(f"/calls/{cid}/turn?tts=false", json={"text": "bye"})
        except httpx.HTTPError:
            pass
    why = []
    low = " || ".join(texts).lower()
    if x.get("actions_any") and not set(x["actions_any"]) & set(oks):
        why.append(f"none of {x['actions_any']} ran ok (got {sorted(set(oks))})")
    bad = set(x.get("actions_none", [])) & set(oks)
    if bad:
        why.append(f"forbidden action ran: {sorted(bad)}")
    for s in x.get("speak_not_contains", []) + TOOL_NAMES:
        if fill(s, vals).lower() in low:
            why.append(f"reply contains {fill(s, vals)!r}")
    if x.get("speak_any") and not any(s.lower() in low for s in x["speak_any"]):
        why.append(f"reply has none of {x['speak_any']}")
    if x.get("language") and (not langs or langs[-1] != x["language"]):
        why.append(f"final language {langs[-1] if langs else None} != {x['language']}")
    cap = x.get("max_llm_calls_per_turn")
    if cap is not None and llm and max(llm) > cap:
        why.append(f"{max(llm)} LLM calls in one turn (max {cap})")
    if not lat:
        why.append("no turn completed")
    return {"id": c["id"], "pass": not why, "why": why, "latency_ms": lat, "llm_calls": llm, "log": log}


def pct(xs: list[float], p: float) -> float:
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(p * len(s)))], 1) if s else 0.0


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voice", default="http://127.0.0.1:8100")
    ap.add_argument("--gateway", default="http://127.0.0.1:8000")
    ap.add_argument("--cases", type=Path, default=CASES)
    ap.add_argument("--case-id", type=int, help="collection case id for outbound cases (default: first open one from /dashboard/collections)")
    ap.add_argument("--outbound-dob", default=os.environ.get("OUTBOUND_DOB", ""), help='DOB of the outbound case customer, e.g. "14 August 1991" (else outbound cases are skipped)')
    ap.add_argument("--only", help="run only case ids starting with this prefix, e.g. faq_ or out_")
    ap.add_argument("--dashboard-token", default=env("DASHBOARD_TOKEN") or "dev-dashboard-token-change-me", help="bearer for outbound starts and the dashboard (never printed)")
    ap.add_argument("--reset-limits", action="store_true", help="delete ll:rl:verify:* in Redis before the run and before each outbound case")
    ap.add_argument("--resume", action="store_true", help="skip case ids that passed in the previous --out file")
    ap.add_argument("--start-path", default="/calls", help="voice endpoint that opens a call (contract names /start; the service today exposes /calls)")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--dry", action="store_true", help="validate the cases file only")
    a = ap.parse_args(argv)

    cases = load_cases(a.cases)
    errs = validate(cases)
    if errs:
        print("\n".join("INVALID " + e for e in errs))
        return 1
    print(f"{len(cases)} cases valid ({sum(c['direction'] == 'outbound' for c in cases)} outbound)")
    if a.dry:
        return 0
    if a.only:
        cases = [c for c in cases if c["id"].startswith(a.only)]
    if a.resume and a.out.exists():
        done = {r["id"] for r in json.loads(a.out.read_text(encoding="utf-8"))["results"] if r["pass"]}
        cases = [c for c in cases if c["id"] not in done]
        print(f"--resume: {len(done)} previously passed ids skipped")
    redis_url = env("REDIS_URL") or "redis://localhost:56379/0"
    if a.reset_limits:
        print(f"reset-limits: removed {reset_limits(redis_url)} verify counter(s)")

    case_id, row = a.case_id, None
    if case_id is None and any(c["direction"] == "outbound" for c in cases):
        try:
            row = find_case(a.gateway, a.dashboard_token)
            case_id = row and row.get("id")
        except Exception as ex:  # outbound cases are skipped, inbound ones still run
            print(f"WARN no open collection case ({ex}); outbound cases will be skipped")
    if not a.outbound_dob:
        case_id = None
        print("WARN no --outbound-dob / OUTBOUND_DOB; outbound cases will be skipped")
    PERSONAS["outbound_demo"]["dob"] = a.outbound_dob
    amount = int((row or {}).get("overdue_amount") or 1000)
    when = (dt.date.today() + dt.timedelta(days=7)).strftime("%d %B %Y")
    v = httpx.Client(base_url=a.voice, timeout=180, headers={"Authorization": "Bearer " + a.dashboard_token})
    results, skipped = [], []
    for c in cases:
        if c["direction"] == "outbound" and case_id is None:
            skipped.append(c["id"])
            print(f"SKIP {c['id']} (no collection case)")
            continue
        vals = {**PERSONAS[c["persona"]], "ptp_date": when, "ptp_amount": amount}
        if a.reset_limits and c["direction"] == "outbound":
            reset_limits(redis_url)
        try:
            r = run_case(v, c, vals, case_id, a.start_path)
        except CallCap:
            print(f"STOP {c['id']}: voice service returned 429 (50-call cap). Restart it and re-run with --resume.")
            skipped += [x["id"] for x in cases[cases.index(c):]]
            break
        except Exception as ex:
            r = {"id": c["id"], "pass": False, "why": [f"error: {ex}"], "latency_ms": [], "llm_calls": [], "log": []}
        results.append(r)
        print(f"{'PASS' if r['pass'] else 'FAIL'} {r['id']}" + ("" if r["pass"] else "\n     - " + "\n     - ".join(r["why"])))
        if not r["pass"]:
            print("     " + "\n     ".join("\n".join(r["log"]).splitlines()))
    lat = [m for r in results for m in r["latency_ms"]]
    llm = [n for r in results for n in r["llm_calls"]]
    n_pass = sum(r["pass"] for r in results)
    summary = {"cases": len(results), "passed": n_pass, "skipped": skipped,
               "pass_rate": round(n_pass / len(results), 3) if results else 0.0,
               "turn_latency_ms": {"median": round(statistics.median(lat), 1) if lat else 0.0, "p95": pct(lat, 0.95)},
               "avg_llm_calls_per_turn": round(statistics.mean(llm), 2) if llm else 0.0}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"summary": summary, "results": [{k: r[k] for k in ("id", "pass", "why", "latency_ms", "llm_calls")} for r in results]},
                                ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{n_pass}/{len(results)} passed ({summary['pass_rate']:.0%}); median {summary['turn_latency_ms']['median']} ms, "
          f"p95 {summary['turn_latency_ms']['p95']} ms, {summary['avg_llm_calls_per_turn']} LLM calls/turn -> {a.out}")
    return 0 if n_pass == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
