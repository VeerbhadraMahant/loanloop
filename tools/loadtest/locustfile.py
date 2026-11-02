"""Each simulated user loops through whole phone calls (one call at a time), so -u N ~ N concurrent calls.

Business errors that the call flow expects (wrong DOB, spoken secret) count as successes; only HTTP errors, bad JSON
or an unexpected ok/not-ok count as Locust failures. Requests are named by action so stats are per action.
"""
import os
import random
import uuid
from pathlib import Path

import gevent
from locust import HttpUser, between, task

import fixtures

ENV = Path(__file__).resolve().parents[2] / ".env"


def _env(key: str, default: str) -> str:
    if os.environ.get(key):
        return os.environ[key]
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return default


SECRET = _env("GATEWAY_SHARED_SECRET", "dev-shared-secret-change-me")
TOKEN = _env("PHONE_TOKEN", "dev-phone-token-change-me")  # phone endpoints only
ROWS = fixtures.load()
# 1-3 s think time at 1,000 users is ~500 rps (a stress run); the spec target of 50-125 rps needs LL_THINK=8,16
THINK_LO, THINK_HI = (float(x) for x in os.environ.get("LL_THINK", "1,3").split(","))
LANGS = ["en", "hi", "hinglish", "mr"]
IFSCS = ["SAHY0000101", "SAHY0000105", "SAHY0000112", "SAHY0000199"]  # last one does not exist
BRANCHES = ["Kothrud", "Baner", "Nashik Road", "Sitabuldi", "Hadapsar"]


class Caller(HttpUser):
    wait_time = between(0.5, 1.5)  # gap between calls; in-call pacing is think()

    def on_start(self):
        self.client.headers["X-Gateway-Secret"] = SECRET

    def think(self):
        gevent.sleep(random.uniform(THINK_LO, THINK_HI))  # caller speaking + agent turn

    def act(self, action: str, ok: bool | None = True, **body) -> dict:
        body.update(call_id=self.cid, language=self.lang)
        with self.client.post(f"/actions/{action}", json=body, name=action, catch_response=True) as r:
            try:
                j = r.json()
            except ValueError:
                r.failure("non-JSON response")
                return {}
            if r.status_code != 200:
                r.failure(f"HTTP {r.status_code}")
            elif ok is not None and j.get("ok") is not ok:
                r.failure(f"expected ok={ok}, got {j.get('error_code')}")
            else:
                r.success()
        self.think()
        return j

    def begin(self, c: dict | None = None):
        self.cid, self.lang = f"lt-{uuid.uuid4().hex[:16]}", random.choice(LANGS)
        self.act("start_call", caller_number=c["mobile"] if c else None)

    def verify(self, c: dict):
        self.act("verify_caller", registered_mobile=c["mobile"], dob=c["dob"])

    @task(30)
    def lookup_call(self):
        self.begin()
        self.act("branch_lookup", query=random.choice(BRANCHES))
        self.act("validate_ifsc", ok=None, ifsc=random.choice(IFSCS))
        self.act("end_call", outcome="completed")

    @task(35)
    def full_call(self):
        c = fixtures.pick(ROWS, need_payment=True)
        self.begin(c)
        self.verify(c)
        self.act("emi_info")
        if c["pay_utr"]:
            for f, v in (("date", c["pay_date"]), ("amount", c["pay_amount"]), ("utr", c["pay_utr"])):
                self.act("confirm_readback", field=f, value=v)
            j = self.act("request_app_approval", purpose="Confirm payment check")
            aid = (j.get("data") or {}).get("approval_id")
            if aid:  # the customer taps Approve on the mock phone
                with self.client.post(f"/phone/{fixtures.phone_key(int(c['id']))}/approvals/{aid}/approve", name="phone_approve",
                                      headers={"Authorization": f"Bearer {TOKEN}"}, catch_response=True) as r:
                    r.success() if r.status_code == 200 else r.failure(f"HTTP {r.status_code}")
                self.act("check_approval", approval_id=str(aid))
            self.act("check_payment", date=c["pay_date"], amount=float(c["pay_amount"]), utr=c["pay_utr"])
        self.act("end_call", outcome="completed")

    @task(15)
    def secret_call(self):
        c = fixtures.pick(ROWS)
        self.begin(c)
        self.act("check_payment", ok=False, date="2026-10-04", amount=1, utr="my password is Tiger@123")  # SECRET_DETECTED
        self.act("report_secret_spoken", secret_type="password")
        self.verify(c)
        self.act("end_call", outcome="completed")

    @task(20)
    def wrong_verify_call(self):
        # a guesser with a fresh unregistered number each call: using real customers would trip their 3/hour lockout
        # (correct behaviour, CLAUDE.md 6.5) and fail the legitimate calls of the same customers
        c = fixtures.pick(ROWS)
        self.begin(c)
        mobile = "91" + "".join(random.choices("0123456789", k=8))
        for _ in range(2):
            self.act("verify_caller", ok=False, registered_mobile=mobile, dob=fixtures.wrong_dob(c["dob"]))
        self.act("end_call", outcome="blocked")
