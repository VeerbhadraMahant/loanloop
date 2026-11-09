"""Offline check: every faq_* eval case's first caller turn must hit its intended FAQ intent via the gateway's keyword matcher.

    cd gateway && uv run python ../tools/faq_match_check.py      (exit 1 on any mismatch)

Checks both the full turn and the turn without its leading language word ("English. ..."), since the model usually sends a bare query.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "gateway"))
from app.routes.actions.faq import load_faq, match  # noqa: E402

WANT = {
    "faq_en_open_account": "open_account", "faq_en_min_balance": "min_balance", "faq_en_upi_collect": "upi_fraud_collect",
    "faq_en_failed_atm": "failed_atm_withdrawal", "faq_en_card_block": "debit_card_block", "faq_en_neft_rtgs": "neft_rtgs_imps",
    "faq_en_prepayment": "loan_prepayment", "faq_en_fraud": "fraud_report", "faq_en_complaint": "complaint_escalation",
    "faq_en_deceased": "deceased_claim", "faq_hi_open_account": "open_account", "faq_hi_upi_pin": "upi_pin_reset",
    "faq_hi_emi_missed": "emi_missed", "faq_hi_complaint": "complaint_escalation", "faq_hi_cheque_book": "cheque_book",
    "faq_hi_fd_premature": "fd_premature", "faq_hinglish_upi_failed": "upi_failed", "faq_hinglish_fd_break": "fd_premature",
    "faq_hinglish_kyc": "kyc_update", "faq_hinglish_dormant": "dormant_account", "faq_hinglish_codes": "statement_codes",
    "faq_hinglish_bank_asks_otp": "bank_never_asks", "faq_hinglish_nominee": "nominee_info", "faq_mr_open_account": "open_account",
    "faq_mr_failed_atm": "failed_atm_withdrawal", "faq_mr_min_balance": "min_balance", "faq_mr_deceased": "deceased_claim",
    "faq_mr_card_controls": "card_controls", "faq_mr_emi_missed": "emi_missed", "faq_en_cheque_stop": "cheque_stop_payment",
    "faq_en_tds": "tds_15g_15h", "faq_en_nri": "nri_accounts", "faq_en_upi_wrong": "upi_wrong_transfer",
    "safety_reverse_upi": "upi_wrong_transfer",
}
LANG_WORD = re.compile(r"^(english|hinglish|hindi|marathi|हिंदी में बात कीजिए|हिंदी|मराठीत बोला|मराठी)[\s.,!]*(please)?[\s.,!]*", re.I)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    intents, bad, n = load_faq(), 0, 0
    for line in (ROOT / "tools" / "eval_cases.jsonl").read_text(encoding="utf-8").splitlines():
        c = json.loads(line)
        if c["id"].startswith("faq_") or c["id"] in WANT:
            n += 1
            want = WANT.get(c["id"])
            lang = c["expect"].get("language", "en")
            text = c["turns"][0]
            for q in dict.fromkeys([text, LANG_WORD.sub("", text)]):
                got = match(intents, q, lang)
                if want not in intents or got != want:
                    bad += 1
                    print(f"MISMATCH {c['id']}: want {want}, got {got}  [{q}]")
    print(f"{n} cases checked, {bad} mismatches")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
