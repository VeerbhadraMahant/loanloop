"""The ONLY place identifiers are masked. Everything spoken/logged/published goes through here."""
import re


def mask_mobile(m: str) -> str:
    return f"ending {m[-4:]}"


def mask_email(e: str) -> str:
    local, _, dom = e.partition("@")
    return f"{local[:1]}***@{dom}"


def mask_account(last4: str) -> str:
    return f"ending {last4}"


def mask_loan(last4: str) -> str:
    return f"ending {last4}"


def mask_customer_id(cid: str) -> str:
    return f"ending {cid[-4:]}"


def assert_no_leak(text: str, customer) -> None:
    """Test helper: raise if text contains the customer's full mobile, email, CIF or any 9+ digit run of theirs."""
    full = [customer.registered_mobile, customer.email, customer.customer_id]
    for v in full:
        assert v not in text, "full identifier leaked"
    assert not re.search(r"\d{9,}", text), "long digit run leaked"
