"""A year of believable voice-desk activity for the staff consoles (calls, audit trail, requests, handovers, SMS, collections).

Own RNG, so every other seeded row stays identical. All timestamps are within [today-364d, now-20min] (IST based, stored UTC).
Texts hold masked values only (last 4 digits); no raw secret or full identifier ever appears here.
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from app.clock import IST, now_ist
from app.db import models as m

OUT_ID = 201  # outbound persona, left untouched
PERSONAS = {1, 2, 3}  # appear a few times, read-only conversations only
DIWALI = {2025: date(2025, 10, 20), 2026: date(2026, 11, 8), 2027: date(2027, 10, 29)}
GANESH = {2025: date(2025, 8, 27), 2026: date(2026, 9, 14), 2027: date(2027, 9, 4)}
FIXED_HOLIDAYS = {(1, 26), (5, 1), (8, 15), (10, 2), (12, 25)}
LANGS = (["hinglish"] * 38 + ["mr"] * 28 + ["hi"] * 24 + ["en"] * 10)
BETA_LANGS = ["gu"] * 5 + ["ta"] * 3 + ["te"] * 3 + ["kn"] * 2 + ["bn"] * 2 + ["pa"]
H_IN = {8: 2, 9: 6, 10: 12, 11: 13, 12: 9, 13: 7, 14: 9, 15: 11, 16: 10, 17: 7, 18: 4, 19: 2, 20: 1}
H_OUT = {9: 5, 10: 10, 11: 10, 12: 6, 13: 4, 14: 7, 15: 8, 16: 10, 17: 11, 18: 5}

HARDSHIP = [
    "Borrower lost the job two months back and is asking for relief on loan ending {l4}. Cannot manage the next EMI of Rs {emi}. Wants a call from the collections desk about restructuring. No waiver was discussed.",
    "Medical emergency in the family, savings going into hospital bills. Worried the auto-debit will bounce on the {day}th. Asked about a moratorium. No payment promised.",
    "Shop was shut for renovation and income is down. Asking whether the EMI date can be moved and penal charges waived. Passed to the hardship team.",
    "Employer has delayed salary for six weeks. Will pay as soon as it is credited and asked for no reminder calls until then. Needs a decision on reminders.",
    "Contract ended, currently between jobs and about Rs {emi} short this month. Wants a part-payment option explained by a person.",
    "Crop income hit by unseasonal rain, asking for relief on the loan. Calm and cooperative, prefers a call back in Marathi.",
    "Working reduced hours, take-home down by about a third. Asked about a longer tenure to bring the EMI down. Raised for review.",
    "Husband is in hospital, customer asking for a few weeks of grace. Amount due is not disputed. Callback after 5 pm please.",
    "Pay cut at work. The next EMI of Rs {emi} will be about ten days late. Asked what charges apply; agent gave no figures and handed over.",
    "Lost the job last month and has two months of savings. Wants to know about part prepayment versus restructuring.",
]
DISPUTE = [
    "Says the EMI was debited twice in {mon}; customer has both bank alerts. Could not confirm in the ledger, so no ticket raised. Needs a person to check the duplicate debit.",
    "Disputes the bounce charge of Rs 590, says the balance was enough on the due date. Wants it reversed. Needs review of the statement.",
    "Objects to the rate reset on the floating loan and says no intimation was received. Asked for the reset letter and revised schedule.",
    "Foreclosure quote looks higher than the customer's own working by roughly Rs {amt}. Wants a breakup of the figure.",
    "Insists a penal charge was applied although the payment was made on the due date. Payment reference was read back but is not yet visible in the ledger.",
    "Processing fee was taken at disbursal; customer says the sanction letter promised a waiver. Wants a copy of the sanction terms.",
    "Says the loan was closed last year but the account still shows an outstanding amount. NOC copy to be checked.",
    "Complaint about the timing of a collection call last week. Wants the call log checked. Logged for the manager.",
]
UNCLEAR = [
    "Could not capture the request after two tries; the line was noisy and the customer kept switching between Marathi and Hindi. Asked for a call back on the registered number.",
    "Customer described a problem with a card transaction, which is outside loan servicing. Passed to the cards team.",
    "Request unclear after two attempts. Mentions a letter received at home but could not say what it was about. Please call and clarify.",
    "Asked about a joint loan with a brother; details did not match the loan on record. Needs a person to check.",
    "Spoke fast with heavy background noise, no clear ask after two repeats. Verified at tier 1 only.",
    "Wants some change in the loan agreement but could not say which one. Please contact.",
]
HUMAN = [
    "Prefers to talk to a person about closing the loan and asked for the branch by name.",
    "Elderly customer, not comfortable with the automated service. Wants to discuss a nominee change. Nothing was changed.",
    "Asked for a human twice at the start. Question is about a top-up on the loan, which the desk does not handle.",
    "Wants to discuss an EMI date change with a person because salary dates vary. Verified at tier 1, no approval raised.",
    "Plans to visit the branch with documents and asked what to carry. Branch hours and IFSC shared; needs an appointment.",
    "Asked for the relationship manager by name. Passed over with loan ending {l4}.",
]
BRUTE = [
    "Three failed verification attempts in this call; mobile and date of birth did not match the record. Nothing was disclosed. Routed to a person for an identity check.",
    "Caller could not give a date of birth or the loan last four digits; verification stopped after the third try. No information given.",
    "Repeated verification failures from the same caller within the hour. Flagged for review, nothing disclosed.",
]
OUTSCOPE = [
    "Asked about an insurance claim linked to the loan. Not handled by the voice desk; sent to the insurance partner team.",
    "Wants a lien marked on a fixed deposit. Outside the agent's scope.",
    "Asked for help correcting the credit score at the bureau. Handed to customer care.",
]
OUT_NOTES = [
    "Outbound call. Borrower picked up and mentioned a job loss and asked for relief; no promise recorded. Collections lead to call back.",
    "Outbound reminder. Customer disputes the missed EMI and says it was paid from a relative's UPI. Needs a ledger check before the next call.",
    "Borrower asked the agent for a person to discuss restructuring. Verified, overdue amount was read out.",
    "Customer upset about repeated calls and asked to stop them for a week. Handed to the team lead; no outbound until reviewed.",
]
RTP_NOTES = ["lost job last month", "hospital admission in family", "says EMI was debited twice", "salary delayed by employer",
             "will pay after harvest", "says already paid, UTR shared", "business slow this quarter", None, None, "asked to call after the 10th"]
NOM = [("Anita", "wife"), ("Sanjay", "husband"), ("Rohit", "son"), ("Sneha", "daughter"), ("Meena", "mother"), ("Prakash", "father"), ("Kavya", "sister")]
CITIES = [("Pune", "411038"), ("Pune", "411057"), ("Pune", "411014"), ("Mumbai", "400069"), ("Nashik", "422101"), ("Nagpur", "440010"),
          ("Thane", "400602"), ("Kolhapur", "416008"), ("Satara", "415001")]
SECRETS = [("faq_lookup", "query", "password"), ("verify_caller", "dob", "otp"), ("request_app_approval", "purpose", "pin"),
           ("faq_lookup", "query", "card_number"), ("verify_caller", "dob", "pin"), ("request_document", "reason", "password")]
SLA = {"statement": 2, "interest_cert": 3, "nominee": 7, "address": 5, "emi_date_change": 4, "closure": 12, "reconciliation": 5}


def inr(n: int) -> str:
    s = str(int(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts + [tail])


class _Call:
    def __init__(self, cust, direction="inbound"):
        self.cust, self.dir = cust, direction
        self.steps, self.ev, self.done = [], [], []
        self.outcome, self.tier, self.approved = "completed", 0, False

    def st(self, action, code=None, flags=None, out=None, tier=None):
        self.steps.append(dict(a=action, t=self.tier if tier is None else tier, code=code, f=flags or {},
                               out=out or ("error" if code else "ok")))
        return len(self.steps) - 1


def add_history(out: list, REF: date) -> None:
    rnd = random.Random(1411)
    cutoff = now_ist() - timedelta(minutes=20)
    custs = {r.id: r for r in out if isinstance(r, m.Customer)}
    accts = {r.customer_id: r for r in out if isinstance(r, m.Account)}
    branches = {r.ifsc: r for r in out if isinstance(r, m.Branch)}
    loans: dict[int, list] = {}
    for r in sorted((r for r in out if isinstance(r, m.Loan)), key=lambda r: r.id):
        loans.setdefault(r.customer_id, []).append(r)
    cases = {r.loan_id: r for r in out if isinstance(r, m.CollectionCase)}
    hard = {c for c, ls in loans.items() if ls[0].status == "hardship" and c not in PERSONAS}

    def info(cid):
        c, a, ln = custs[cid], accts[cid], loans[cid][0]
        return dict(id=cid, mobile=c.registered_mobile, lang=c.preferred_language, a4=a.account_last4, ifsc=a.branch_ifsc,
                    bn=branches[a.branch_ifsc].name.replace("Sahyadri Finance Bank ", ""), l4=ln.loan_last4, emi=ln.emi_amount,
                    day=ln.emi_day, prod=ln.product, loan_id=ln.id, cid4=f"{cid:04d}")

    # ---- day weights: weekdays, quieter Sat, few Sundays, dip around Diwali/festivals, ramp up toward today
    days = [REF - timedelta(days=k) for k in range(364, -1, -1)]

    def dayw(d):
        age = (REF - d).days
        w = (0.6 + 0.9 * (1 - age / 365)) * (1.0, 1.0, 1.0, 1.0, 1.0, 0.55, 0.1)[d.weekday()]
        dw = DIWALI.get(d.year)
        if dw and -2 <= (d - dw).days <= 3:
            w *= 0.2
        gn = GANESH.get(d.year)
        if gn and 0 <= (d - gn).days <= 1:
            w *= 0.4
        if (d.month, d.day) in FIXED_HOLIDAYS:
            w *= 0.15
        return w
    DW = [dayw(d) for d in days]

    def when(d, direction, dur):
        wd = d.weekday()
        if direction == "outbound" and wd == 6:
            return None
        hrs = H_OUT if direction == "outbound" else H_IN
        for _ in range(30):
            h = rnd.choices(list(hrs), list(hrs.values()))[0]
            t = datetime(d.year, d.month, d.day, h, rnd.randint(0, 59), rnd.randint(0, 59), tzinfo=IST)
            if direction == "outbound":
                lim = datetime(d.year, d.month, d.day, 18, 55, tzinfo=IST)
                if t + dur > lim:
                    t = lim - dur - timedelta(seconds=rnd.randint(0, 120))
            if t + dur <= cutoff:
                return t
        return None

    audits, calls, smss, reqs, hos, apps, ptps, rtps, new_cases = [], [], [], [], [], [], [], [], []
    seen = {}

    def lat(action, code):
        # rare slow rows only on high-volume actions: one outlier among a dozen samples would wreck a low-volume action's p95
        if action in ("start_call", "end_call", "verify_caller", "check_approval", "request_app_approval", "emi_info") and rnd.random() < 0.012:
            return rnd.randint(90, 260)
        base = 7 if code else {"verify_caller": 17, "check_payment": 20, "emi_date_change": 19, "send_details_sms": 15, "handover": 14,
                               "request_document": 16, "emi_info": 14, "foreclosure_quote": 18}.get(action, 12)
        return max(3, min(48, int(rnd.lognormvariate(0, 0.42) * base)))

    def utc(t):
        return t.astimezone(timezone.utc)

    def render(c, started, dur, lang):
        c.st("end_call", tier=c.tier)
        n = len(c.steps)
        offs = sorted(rnd.uniform(3, max(5, dur.total_seconds() - 6)) for _ in range(n - 2))
        stamps = [started] + [started + timedelta(seconds=o + i) for i, o in enumerate(offs)] + [started + dur - timedelta(milliseconds=rnd.randint(40, 120))]
        # same shape as live voice-service ids; every group keeps a letter so no digit run looks like a card number to the redactor
        grp = lambda: next(g for g in iter(lambda: f"{rnd.getrandbits(32):08x}", None) if not g.isdigit())  # noqa: E731
        cid = f"v-{grp()}-{grp()}-{grp()}-{grp()}"
        while cid in seen:
            cid += "x"
        seen[cid] = 1
        for s, ts in zip(c.steps, stamps):
            audits.append(m.AuditLog(ts=utc(ts), call_id=cid, session_id=cid, action=s["a"], tier=s["t"], outcome=s["out"], error_code=s["code"],
                                     latency_ms=lat(s["a"], s["code"]), flags=s["f"]))
        cust_id = c.cust["id"] if c.tier >= 1 or c.dir == "outbound" and c.outcome != "caller_hung_up" else None
        calls.append(m.Call(call_id=cid, customer_id=cust_id, language=lang, started_at=utc(started), ended_at=utc(started + dur),
                            outcome=c.outcome, direction=c.dir))
        for i, kind, p in c.ev:
            ts = utc(stamps[i])
            if kind == "sms":
                smss.append(m.SmsOutbox(customer_id=c.cust["id"], to_mobile=c.cust["mobile"], body=p, created_at=ts + timedelta(seconds=1)))
            elif kind == "approval":
                apps.append(m.Approval(session_id=cid, customer_id=c.cust["id"], purpose=p[0], status=p[1], created_at=ts))
            elif kind == "req":
                reqs.append((ts + timedelta(seconds=1), c.cust["id"], p[0], p[1]))
            elif kind == "handover" and ts >= datetime.now(timezone.utc) - timedelta(days=10):
                # the handover queue has no resolved state: older ones were worked by the team, so only recent ones stay queued
                hos.append(m.Handover(call_id=cid, customer_id=cust_id, reason=p[0], summary=p[1], requests_done=list(p[2]),
                                      requests_pending=list(p[3]), created_at=ts + timedelta(seconds=1)))
            elif kind == "ptp":
                ptps.append((cid, ts, p))
            elif kind == "rtp":
                rtps.append((cid, ts, p))
        return cid, stamps

    def dur_of(mu, sd, lo=45, hi=420):
        return timedelta(seconds=max(lo, min(hi, rnd.gauss(mu, sd))))

    # ---- scenario building blocks
    def verify(c, fail=0.06):
        if rnd.random() < fail:
            c.st("verify_caller", "NOT_VERIFIED")
        c.tier = 1
        c.st("verify_caller")

    def approve(c, purpose):
        if c.approved:
            return
        if c.tier == 1 and rnd.random() < 0.06:
            c.st(rnd.choice(["check_payment", "foreclosure_quote", "explain_emi_change"]), "TIER_TOO_LOW")
        i = c.st("request_app_approval")
        if rnd.random() < 0.07:  # customer was slow to tap, first approval lapsed
            c.st("check_approval")
            c.ev.append((i, "approval", (purpose, "expired")))
            i = c.st("request_app_approval")
        elif rnd.random() < 0.3:
            c.st("check_approval")
        c.tier = 2
        c.st("check_approval")
        c.approved = True
        c.ev.append((i, "approval", (purpose, "approved")))

    def req(c, typ, payload):
        c.done.append(typ)
        c.ev.append((len(c.steps) - 1, "req", (typ, payload)))

    def sms(c, body):
        c.ev.append((len(c.steps) - 1, "sms", body))

    def handover(c, reason, pool, pending=None):
        L = c.cust
        txt = rnd.choice(pool).format(l4=L["l4"], emi=inr(L["emi"]), mon=(REF - timedelta(days=rnd.randint(20, 80))).strftime("%B"),
                                      amt=inr(rnd.choice([1200, 1800, 2500, 3400, 4200])), day=L["day"])
        if c.done:
            txt += f" Done in this call: {', '.join(c.done)}."
        c.st("handover", tier=0)
        c.ev.append((len(c.steps) - 1, "handover", (reason, txt, c.done, pending or [reason])))
        c.outcome = "handover"

    def mday(d):
        return d.strftime("%d %b")

    def sc_emi(c):
        verify(c); c.st("emi_info")
        if rnd.random() < 0.3: c.st("dues_info")
        if rnd.random() < 0.25: c.st("get_masked_profile")

    def sc_balance(c):
        verify(c); c.st("account_balance")
        if rnd.random() < 0.6: c.st("last_transactions")

    def sc_sms(c):
        verify(c); c.st("get_masked_profile"); c.st("send_details_sms")
        L = c.cust
        sms(c, rnd.choice([
            f"Sahyadri Finance Bank: As requested, A/c ending {L['a4']}; IFSC {L['ifsc']}; Branch {L['bn']}. We never ask for passwords, PINs or OTPs.",
            f"Sahyadri Finance Bank: A/c ending {L['a4']}, IFSC {L['ifsc']}, Customer ID ending {L['cid4']}. Do not share this message. We never ask for passwords, PINs or OTPs.",
            f"Sahyadri Finance Bank: Your branch is {L['bn']} (IFSC {L['ifsc']}), A/c ending {L['a4']}. We never ask for passwords, PINs or OTPs."]))

    def sc_tier0(c):
        k = rnd.choice(["branch_lookup", "validate_ifsc", "faq_lookup", "faq_lookup", "branch_lookup"])
        c.st(k)
        if rnd.random() < 0.3: c.st(rnd.choice(["faq_lookup", "branch_lookup"]))

    def sc_pwreset(c):
        c.st("password_reset_help")
        if rnd.random() < 0.3: c.st("faq_lookup")

    def sc_pay(c):
        verify(c); approve(c, "Payment status check"); c.st("check_payment")
        L = c.cust
        if rnd.random() < 0.5:
            c.done.append("check_payment")
        else:
            c.st("confirm_readback", tier=2)
            d = (c.started_day - timedelta(days=rnd.randint(1, 3)))
            u4 = f"{rnd.randint(0, 9999):04d}"
            req(c, "reconciliation", {"utr_last4": u4, "amount": L["emi"], "date": d.isoformat()})
            sms(c, f"Sahyadri Finance Bank: We are checking your payment of Rs {inr(L['emi'])} made on {mday(d)} (UTR ending {u4}). Reminders for loan ending {L['l4']} are paused for 7 days.")

    def sc_date(c):
        verify(c); c.st("emi_info"); approve(c, "EMI date change"); c.st("confirm_readback", tier=2); c.st("emi_date_change")
        L = c.cust
        old = rnd.choice([d for d in (1, 5, 7, 10, 15, 20, 25) if d != L["day"]])
        req(c, "emi_date_change", {"old_day": old, "new_day": L["day"]})
        sms(c, f"Sahyadri Finance Bank: Your request to move the EMI date of loan ending {L['l4']} from {old} to {L['day']} has been received. We will confirm once it is processed.")

    def sc_explain(c):
        verify(c); approve(c, "Explain EMI change"); c.st("explain_emi_change")
        if rnd.random() < 0.3: c.st("emi_info")

    def sc_doc(c):
        verify(c); typ = rnd.choice(["statement", "statement", "interest_cert"])
        approve(c, "Document request"); c.st("request_document")
        req(c, typ, {"channel": "registered_email"})
        sms(c, f"Sahyadri Finance Bank: Your {'loan statement' if typ == 'statement' else 'interest certificate'} for loan ending {c.cust['l4']} will be sent to your registered email.")

    def sc_nominee(c):
        verify(c); approve(c, "Nominee update")
        c.st("confirm_readback", tier=2); c.st("confirm_readback", tier=2); c.st("update_nominee")
        n, r = rnd.choice(NOM)
        req(c, "nominee", {"name": n, "relation": r})

    def sc_address(c):
        verify(c); approve(c, "Address update")
        for _ in range(3): c.st("confirm_readback", tier=2)
        c.st("update_address")
        city, pin = rnd.choice(CITIES)
        req(c, "address", {"city": city, "pincode": pin})

    def sc_closure(c):
        verify(c); approve(c, "Loan closure"); c.st("foreclosure_quote")
        if rnd.random() < 0.6:
            c.st("confirm_readback", tier=2); c.st("raise_closure")
            req(c, "closure", {"loan": f"ending {c.cust['l4']}"})
            sms(c, f"Sahyadri Finance Bank: Closure request for loan ending {c.cust['l4']} received. NOC follows within 7 working days of closure.")

    def sc_hardship(c):
        verify(c)
        if rnd.random() < 0.15:
            c.st("report_hardship", out="redacted", code="SECRET_DETECTED", flags={"security": "SECRET_DETECTED", "field": "reason"})
        c.st("emi_info") if rnd.random() < 0.5 else None
        c.st("report_hardship"); c.done.append("hardship")
        c.ev.append((len(c.steps) - 1, "handover", ("hardship", rnd.choice(HARDSHIP).format(
            l4=c.cust["l4"], emi=inr(c.cust["emi"]), day=c.cust["day"]) + " Done in this call: hardship.", ["hardship"], ["hardship_support"])))
        c.outcome = "handover"

    def sc_handover(c):
        r = rnd.choices(["dispute", "unclear", "caller_request", "out_of_scope"], [30, 30, 28, 12])[0]
        pool = dict(dispute=DISPUTE, unclear=UNCLEAR, caller_request=HUMAN, out_of_scope=OUTSCOPE)[r]
        if r != "unclear" and r != "caller_request" or rnd.random() < 0.5: verify(c)
        if r == "dispute" and c.tier: c.st("emi_info")
        if r == "unclear":
            c.st("faq_lookup"); c.st("faq_lookup", "NOT_FOUND")
        handover(c, r, pool)

    def sc_multi(c):
        verify(c); c.st("emi_info")
        for sub in rnd.sample([sc_doc_, sc_pay_, sc_date_, sc_sms_, sc_explain_], rnd.randint(2, 3)):
            sub(c)

    def sc_doc_(c):
        approve(c, "Document request"); c.st("request_document")
        req(c, "statement", {"channel": "registered_email"})

    def sc_pay_(c):
        approve(c, "Payment status check"); c.st("check_payment"); c.done.append("check_payment")

    def sc_date_(c):
        approve(c, "EMI date change"); c.st("confirm_readback", tier=2); c.st("emi_date_change")
        req(c, "emi_date_change", {"old_day": rnd.choice([d for d in (1, 5, 10, 15, 20, 25) if d != c.cust["day"]]), "new_day": c.cust["day"]})

    def sc_sms_(c):
        c.st("send_details_sms")
        sms(c, f"Sahyadri Finance Bank: As requested, A/c ending {c.cust['a4']}; IFSC {c.cust['ifsc']}. We never ask for passwords, PINs or OTPs.")

    def sc_explain_(c):
        approve(c, "Explain EMI change"); c.st("explain_emi_change")

    def sc_noverify(c):
        c.st(rnd.choice(["emi_info", "account_balance", "get_masked_profile"]), "NOT_VERIFIED")
        verify(c); c.st("emi_info")

    def sc_ratelimit(c):
        for _ in range(3): c.st("verify_caller", "NOT_VERIFIED")
        c.st("verify_caller", "RATE_LIMITED")
        handover(c, "brute_force", BRUTE)

    def sc_secret(c):
        a, field, typ = rnd.choice(SECRETS)
        if a in ("faq_lookup",):
            c.st(a, "SECRET_DETECTED", {"security": "SECRET_DETECTED", "field": field, "secret_type": typ})
            c.st("report_secret_spoken"); c.st("faq_lookup")
            verify(c); c.st("emi_info")
        elif a == "verify_caller":
            c.st(a, "SECRET_DETECTED", {"security": "SECRET_DETECTED", "field": field, "secret_type": typ})
            c.st("report_secret_spoken"); verify(c, 0); c.st("emi_info")
        else:
            verify(c, 0)
            c.st("emi_info")
            if a == "request_document":
                c.st(a, "SECRET_DETECTED", {"security": "SECRET_DETECTED", "field": field, "secret_type": typ}, tier=1)
            else:
                c.st(a, "SECRET_DETECTED", {"security": "SECRET_DETECTED", "field": field, "secret_type": typ})
            c.st("report_secret_spoken")

    def sc_hungup(c):
        if rnd.random() < 0.5: c.st("verify_caller", "NOT_VERIFIED")
        c.outcome = "caller_hung_up"

    INBOUND = [(sc_emi, 20), (sc_balance, 5), (sc_sms, 11), (sc_tier0, 10), (sc_pwreset, 3), (sc_pay, 10), (sc_date, 7), (sc_explain, 6),
               (sc_doc, 8), (sc_nominee, 3), (sc_address, 3), (sc_closure, 3), (sc_hardship, 4), (sc_handover, 7), (sc_multi, 5),
               (sc_noverify, 3), (sc_ratelimit, 1.2), (sc_secret, 2.5), (sc_hungup, 4)]
    DUR = {sc_tier0: (80, 20), sc_pwreset: (85, 20), sc_hungup: (45, 20), sc_multi: (330, 55), sc_hardship: (260, 50), sc_handover: (230, 60),
           sc_ratelimit: (110, 30), sc_closure: (270, 50), sc_nominee: (270, 50), sc_address: (285, 50), sc_emi: (140, 40), sc_balance: (150, 40)}
    READ_ONLY = {sc_emi, sc_balance, sc_tier0, sc_pwreset, sc_explain}

    pool_ids = [i for i in range(4, OUT_ID) if i in custs]
    wts = [0.5 + rnd.paretovariate(2.6) for _ in pool_ids]
    state = {}

    def mklang(cust):
        if rnd.random() < 0.035: return rnd.choice(BETA_LANGS)
        return cust["lang"] if rnd.random() < 0.35 else rnd.choice(LANGS)

    def run_inbound(cid, fn, day, tier2_ok=True):
        cust = info(cid)
        c = _Call(cust)
        c.started_day = day
        c.st("start_call", tier=0)
        fn(c)
        mu, sd = DUR.get(fn, (225, 55))
        dur = dur_of(mu, sd, 20 if fn is sc_hungup else 45, 420)
        t = when(day, "inbound", dur)
        if t is None:
            return False
        render(c, t, dur, mklang(cust))
        return True

    def pick_day():
        return rnd.choices(days, DW)[0]

    # ---- outbound: reminders on the live collection cases (count follows each case's own `attempts`)
    for loan_id, cs in cases.items():
        if cs.customer_id == OUT_ID or not cs.attempts or cs.last_call_at is None:
            continue
        cust = info(cs.customer_id)
        # the base seed puts every case's last call at the same clock time; spread it over calling hours (09:30-18:30 IST)
        lt = cs.last_call_at.astimezone(IST)
        lt = lt.replace(hour=9, minute=30, second=rnd.randint(0, 59)) + timedelta(minutes=rnd.randint(0, 540))
        cs.last_call_at = lt.astimezone(timezone.utc)
        last = lt
        floor = REF - timedelta(days=cs.dpd)
        t_end = last
        for k in range(cs.attempts):
            dur = dur_of(140, 45, 40, 300)
            if k == 0:
                t = last  # the case's own last_call_at is the start of its latest call
            else:
                day = last.date() - timedelta(days=2 * k + rnd.randint(0, 1))
                while day.weekday() == 6: day -= timedelta(days=1)
                if day < floor: continue
                t = when(day, "outbound", dur)
                if t is None: continue
            c = _Call(cust, "outbound"); c.started_day = t.date()
            c.st("start_call", tier=0)
            r = rnd.random()
            if r < 0.22:  # borrower hung up before the identity check: not a security event
                c.outcome = "caller_hung_up"; dur = dur_of(40, 15, 20, 80)
            else:
                verify(c, 0.04); c.st("dues_info")
                if r > 0.9:
                    handover(c, "hardship", OUT_NOTES[:1] + OUT_NOTES[2:3])
            render(c, t, dur, cust["lang"] if rnd.random() < 0.85 else rnd.choice(LANGS))

    # ---- resolved delinquency episodes on loans with no live case (kept / broken promises, refusals)
    live = set(cases)
    cand = [i for i in pool_ids if loans[i][0].id not in live and i not in hard]
    rnd.shuffle(cand)
    ep_days = [d for d in days if d <= REF - timedelta(days=40) and d.weekday() != 6]
    ep_w = [dayw(d) for d in ep_days]
    for cid in cand[:26]:
        cust, ln = info(cid), loans[cid][0]
        d0 = rnd.choices(ep_days, ep_w)[0]
        miss = rnd.choice([1, 1, 1, 2, 2, 3])
        amount = ln.emi_amount * miss
        pat = rnd.choices("ABCD", [55, 20, 15, 10])[0]
        eps = []  # (day_offset, direction, kind)
        if pat == "A": eps = [(3, "outbound", "ptp_kept")]
        elif pat == "B": eps = [(3, "outbound", "ptp_broken"), (14, "outbound", "ptp_kept")]
        elif pat == "C": eps = [(3, "outbound", "hung"), (8, "outbound", "ptp_kept")]
        else: eps = [(3, "outbound", "rtp"), (rnd.randint(10, 17), "inbound", "ptp_kept")]
        last_resolved = None
        for off, direction, kind in eps:
            day = d0 + timedelta(days=off)
            while day.weekday() == 6: day += timedelta(days=1)
            c = _Call(cust, direction); c.started_day = day
            c.st("start_call", tier=0)
            if kind == "hung":
                c.outcome = "caller_hung_up"; dur = dur_of(40, 15, 20, 80)
            else:
                verify(c, 0.04); c.st("dues_info"); dur = dur_of(170, 50, 70, 330)
                if kind.startswith("ptp"):
                    c.st("record_ptp")
                    ahead = rnd.randint(2, 6)
                    prom = day + timedelta(days=ahead)
                    status = "broken" if kind == "ptp_broken" else "kept"
                    c.ev.append((len(c.steps) - 1, "ptp", dict(amount=amount, prom=prom, status=status, direction=direction, ln=ln, cid=cid)))
                    sms(c, f"Sahyadri Finance Bank: Thank you for speaking with us. We have noted your promise to pay Rs {inr(amount)} on {mday(prom)} for loan ending {ln.loan_last4}. Pay in the Sahyadri app or by UPI.")
                    last_resolved = prom + timedelta(days=1)
                else:
                    c.st("record_rtp")
                    c.ev.append((len(c.steps) - 1, "rtp", dict(amount=amount, ln=ln, cid=cid, code=rnd.choice(["job_loss", "medical", "dispute", "income_reduced", "unwilling", "already_paid"]))))
                    if rnd.random() < 0.5:
                        handover(c, "hardship", OUT_NOTES[:1] + OUT_NOTES[2:3])
            t = when(day, direction, dur)
            if t is None:
                continue
            render(c, t, dur, cust["lang"] if rnd.random() < 0.85 else rnd.choice(LANGS))
        state[cid] = (ln, amount, last_resolved)

    # ---- inbound servicing: fill to roughly 330 calls in total, personas only a few times each
    target = 335
    for pid, n in ((1, 4), (2, 3), (3, 3)):
        for _ in range(n):
            fn = rnd.choice([sc_emi, sc_emi, sc_balance, sc_tier0, sc_pwreset, sc_explain])
            while not run_inbound(pid, fn, pick_day()): pass
    attackers = 0
    while len(calls) < target:
        cid = rnd.choices(pool_ids, wts)[0]
        fn = rnd.choices([f for f, _ in INBOUND], [w for _, w in INBOUND])[0]
        if fn is sc_hardship and cid not in hard and rnd.random() < 0.6 and hard:
            cid = rnd.choice(sorted(hard))
        run_inbound(cid, fn, pick_day())

    # attacker-like attempts: right mobile and DOB, details only go to the owner's phone, approval never tapped
    for k in range(5):
        cid = rnd.choice(pool_ids)
        cust = info(cid)
        c = _Call(cust)
        day = pick_day()
        c.started_day = day
        c.st("start_call", tier=0); c.tier = 1; c.st("verify_caller"); c.st("get_masked_profile"); c.st("send_details_sms")
        sms(c, f"Sahyadri Finance Bank: As requested, A/c ending {cust['a4']}; IFSC {cust['ifsc']}. We never ask for passwords, PINs or OTPs.")
        i = c.st("request_app_approval")
        c.ev.append((i, "approval", ("Outstanding amount and payment details", "denied" if k == 3 else "expired")))
        c.st("check_approval"); c.st("check_approval")
        c.st(rnd.choice(["foreclosure_quote", "check_payment", "explain_emi_change"]), "TIER_TOO_LOW")
        c.st("request_app_approval") if k == 2 else None
        c.outcome = "blocked"
        dur = dur_of(150, 35, 90, 260)
        for _ in range(40):
            if k in (1, 4):  # two of them ring late in the evening
                t = datetime(day.year, day.month, day.day, rnd.randint(20, 22), rnd.randint(0, 59), tzinfo=IST)
                t = t if t + dur <= cutoff else None
            else:
                t = when(day, "inbound", dur)
            if t: break
            day = pick_day()
        if t:
            render(c, t, dur, mklang(cust))
            if k == 2:
                apps.append(m.Approval(session_id=calls[-1].call_id, customer_id=cid, purpose="Outstanding amount and payment details",
                                       status="expired", created_at=audits[-2].ts))

    # ---- finalise: chronological ids so timelines and "latest" lists read naturally
    audits.sort(key=lambda a: a.ts)
    out.extend(calls)
    out.extend(audits)
    out.extend(sorted(smss, key=lambda r: r.created_at))
    out.extend(sorted(apps, key=lambda r: r.created_at))
    out.extend(sorted(hos, key=lambda r: r.created_at))

    for ts, cid, typ, payload in sorted(reqs, key=lambda r: r[0]):
        age = (cutoff.astimezone(timezone.utc) - ts).total_seconds() / 86400
        sla = SLA[typ]
        if age < sla * 0.3: status = "open"
        elif age < sla * 1.6: status = "in_progress" if rnd.random() < 0.7 else "open"
        else:
            r = rnd.random()
            status = "rejected" if r < (0.08 if typ == "reconciliation" else 0.03) else "done"
        out.append(m.ServiceRequest(customer_id=cid, type=typ, payload=payload, status=status, created_at=ts))

    # collections history: resolved cases for loans that were once delinquent; ids line up with loan ids like the live cases
    first = next(i for i, r in enumerate(out) if isinstance(r, m.PromiseToPay))  # keep older rows at lower ids
    hist_ptp, hist_rtp, made = [], [], set()
    for cid, ts, p in sorted(ptps, key=lambda x: x[1]):
        ln = p["ln"]
        if ln.id not in made:
            made.add(ln.id)
            new_cases.append(m.CollectionCase(id=ln.id, loan_id=ln.id, customer_id=p["cid"], overdue_amount=0, missed_emis=0, dpd=0, bucket="0",
                                              status="resolved", priority=0, attempts=2, last_call_at=ts, next_action_at=None,
                                              updated_at=ts + timedelta(days=rnd.randint(4, 9))))
        res = datetime.combine(p["prom"] + timedelta(days=1), time(2, 15), tzinfo=IST).astimezone(timezone.utc)
        paid = p["amount"] if p["status"] == "kept" else 0
        tag = "full" if p["amount"] >= ln.emi_amount * 2 or rnd.random() < 0.7 else "partial"
        hist_ptp.append(m.PromiseToPay(case_id=ln.id, loan_id=ln.id, customer_id=p["cid"], call_id=cid, direction=p["direction"], amount=p["amount"],
                                       promised_date=p["prom"], amount_tag=tag, status=p["status"], paid_amount=paid, created_at=ts, resolved_at=res))
    for cid, ts, p in sorted(rtps, key=lambda x: x[1]):
        ln = p["ln"]
        if ln.id not in made:
            made.add(ln.id)
            new_cases.append(m.CollectionCase(id=ln.id, loan_id=ln.id, customer_id=p["cid"], overdue_amount=0, missed_emis=0, dpd=0, bucket="0",
                                              status="resolved", priority=0, attempts=2, last_call_at=ts, next_action_at=None,
                                              updated_at=ts + timedelta(days=rnd.randint(10, 20))))
        follow = {"job_loss": 14, "medical": 14, "income_reduced": 14, "dispute": 3, "already_paid": 2}.get(p["code"], 7)
        hist_rtp.append(m.RefusalToPay(case_id=ln.id, loan_id=ln.id, customer_id=p["cid"], call_id=cid, direction="outbound", reason_code=p["code"],
                                       note=rnd.choice(RTP_NOTES), overdue_amount=p["amount"], created_at=ts, follow_up_at=ts + timedelta(days=follow)))
    # a resolved case must exist before its PTP/RTP (FK): cases go in the stage seed() flushes first
    out[:0] = new_cases
    first += len(new_cases)
    out[first:first] = hist_ptp
    first = next(i for i, r in enumerate(out) if isinstance(r, m.RefusalToPay))
    out[first:first] = hist_rtp
