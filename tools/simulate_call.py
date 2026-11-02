"""Drive the two demo calls (CLAUDE.md 3.4) against a running gateway and check each step.

    python tools/simulate_call.py --scenario priya|attacker|all --base http://localhost:8000

Exits non-zero if any expectation fails. Secrets: GATEWAY_SHARED_SECRET / PHONE_TOKEN from env or ../.env.
Input names follow docs/agent-builder-setup.md; the approval id is read from data.approval_id.
"""
import argparse
import os
import sys
import time
import uuid
from pathlib import Path

import httpx

PRIYA = dict(mobile="9000014417", dob="1991-08-14", key="priya", utr="SAHYR61004738291", date="2026-10-04", amount=32055)
ATTACKER_MOBILE = "9876500000"  # not a customer; the attacker only spoofs Priya's number and knows her DOB


def _env(key: str, default: str) -> str:
    if os.environ.get(key):
        return os.environ[key]
    f = Path(__file__).resolve().parents[1] / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return default


def check(resp: dict, expect: dict) -> list[str]:
    """Return a list of failure strings (empty = pass). expect keys: ok, codes, contains, absent, data_not."""
    bad, speak = [], str(resp.get("speak", ""))
    if "ok" in expect and resp.get("ok") is not expect["ok"]:
        bad.append(f"ok={resp.get('ok')} expected {expect['ok']}")
    if "codes" in expect and resp.get("error_code") not in expect["codes"]:
        bad.append(f"error_code={resp.get('error_code')} expected one of {sorted(map(str, expect['codes']))}")
    for s in expect.get("contains", ()):
        if s.lower() not in speak.lower():
            bad.append(f"speak lacks {s!r}")
    for s in expect.get("absent", ()):
        if s.lower() in speak.lower():
            bad.append(f"speak contains forbidden {s!r}")
    for k, v in expect.get("data_not", {}).items():
        if (resp.get("data") or {}).get(k) == v:
            bad.append(f"data.{k}={v!r} is forbidden")
    return bad


class Sim:
    def __init__(self, base: str, lang: str = "hinglish"):
        self.c = httpx.Client(base_url=base, timeout=10, headers={"X-Gateway-Secret": _env("GATEWAY_SHARED_SECRET", "dev-shared-secret-change-me")})
        self.auth = {"Authorization": "Bearer " + _env("PHONE_TOKEN", "dev-phone-token-change-me")}
        self.cid, self.lang, self.failed = f"sim-{uuid.uuid4().hex[:12]}", lang, 0

    def _report(self, label: str, ms: float, ok, code, speak: str, bad: list[str]) -> None:
        print(f"{'FAIL' if bad else 'ok  '} {label:<22} ok={ok} code={code} {ms:5.0f}ms  {speak}")
        for b in bad:
            print(f"       ! {b}")
        self.failed += bool(bad)

    def act(self, action: str, expect: dict | None = None, **body) -> dict:
        body.update(call_id=self.cid, language=self.lang)
        t0 = time.perf_counter()
        try:
            r = self.c.post(f"/actions/{action}", json=body)
            j = r.json() if r.status_code == 200 else {"speak": f"HTTP {r.status_code}"}
        except (httpx.HTTPError, ValueError) as e:
            j = {"speak": f"request failed: {type(e).__name__}"}
        bad = check(j, expect or {"ok": True}) if j.get("ok") is not None else ["no valid response"]
        self._report(action, (time.perf_counter() - t0) * 1000, j.get("ok"), j.get("error_code"), j.get("speak", ""), bad)
        return j

    def phone(self, key: str, path: str = "", post: bool = False):
        r = self.c.request("POST" if post else "GET", f"/phone/{key}{path}", headers=self.auth)
        return r.json() if r.status_code == 200 else None

    def last_sms(self, key: str) -> int:
        return max([m["id"] for m in self.phone(key, "/sms") or []], default=0)  # inbox is capped at 50, so compare ids

    def new_sms(self, key: str, n0: int) -> bool:
        for _ in range(10):  # SMS is a background task: it lands just after the response
            if self.last_sms(key) > n0:
                return True
            time.sleep(0.2)
        return False

    def expect(self, label: str, cond: bool, why: str) -> None:
        self._report(label, 0, cond, None, "" if cond else why, [] if cond else [why])


def priya(base: str) -> int:
    s, p = Sim(base), PRIYA
    s.act("start_call", caller_number=p["mobile"])
    s.act("check_payment", {"ok": False, "codes": {"SECRET_DETECTED"}}, date=p["date"], amount=1, utr="my password is Tiger@123")
    s.act("report_secret_spoken", secret_type="password")
    s.act("verify_caller", registered_mobile=p["mobile"], dob=p["dob"])
    n0 = s.last_sms(p["key"])
    s.act("send_details_sms", {"ok": True, "contains": ["4417"]}, fields=["ifsc", "customer_id"])
    s.expect("sms in mock phone", s.new_sms(p["key"], n0), "no new SMS in /phone/priya/sms")
    j = s.act("request_app_approval", purpose="Check my payment")
    aid = (j.get("data") or {}).get("approval_id")
    s.expect("approval id returned", bool(aid), "data.approval_id missing")
    if aid:
        s.expect("tap Approve on phone", s.phone(p["key"], f"/approvals/{aid}/approve", post=True) is not None, "approve endpoint failed")
        s.act("check_approval", approval_id=str(aid))
    for f, v in (("date", p["date"]), ("amount", str(p["amount"])), ("utr", p["utr"])):
        s.act("confirm_readback", field=f, value=v)
    s.act("check_payment", date=p["date"], amount=p["amount"], utr=p["utr"])
    s.act("explain_emi_change")
    s.lang = "mr"
    s.act("confirm_readback", field="new_day", value="10")
    s.act("emi_date_change", new_day=10)
    s.act("end_call", outcome="completed")
    return s.failed


def attacker(base: str) -> int:
    s, p = Sim(base, "en"), PRIYA
    tier = {"ok": False, "codes": {"NOT_VERIFIED", "TIER_TOO_LOW"}}
    s.act("start_call", caller_number=p["mobile"])
    s.act("send_details_sms", tier, fields=["account_number"])  # caller ID alone is not proof
    s.act("verify_caller", registered_mobile=p["mobile"], dob=p["dob"])  # attacker knows mobile + DOB: tier 1 only
    n0 = s.last_sms(p["key"])
    s.act("send_details_sms", {"ok": True, "contains": ["4417"], "absent": [ATTACKER_MOBILE[-4:], p["mobile"]]}, fields=["account_number", "ifsc"])
    s.expect("SMS went to Priya's phone", s.new_sms(p["key"], n0), "no new SMS in /phone/priya/sms")
    j = s.act("request_app_approval", purpose="Attacker approval")
    aid = (j.get("data") or {}).get("approval_id")  # never approved
    if aid:
        s.act("check_approval", {"data_not": {"status": "approved"}, "absent": ["approved"]}, approval_id=str(aid))
    s.act("check_payment", tier, date=p["date"], amount=p["amount"], utr=p["utr"])
    s.act("explain_emi_change", tier)
    s.act("end_call", outcome="blocked")
    return s.failed


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # speak text has Rupee signs and Devanagari; Windows default is cp1252
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenario", choices=["priya", "attacker", "all"], default="all")
    ap.add_argument("--base", default="http://localhost:8000")
    a = ap.parse_args(argv)
    failed = 0
    for name, fn in (("priya", priya), ("attacker", attacker)):
        if a.scenario in (name, "all"):
            print(f"== {name}")
            failed += fn(a.base)
    print(f"{failed} expectation(s) failed" if failed else "all expectations met")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
