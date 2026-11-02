from stt_benchmark import aggregate, entity_match
from stt_corpus import build_corpus, indian_group


def test_ifsc_utr():
    assert entity_match("ifsc", "SAHY0123456", "the code is S A H Y 0 1 2 3 4 5 6")
    assert entity_match("ifsc", "SAHY0123456", "sahy0123456.")
    assert not entity_match("ifsc", "SAHY0123456", "SAHY0123457")
    assert entity_match("utr", "401288731190", "UTR 4012-8873-1190")
    assert entity_match("utr", "401288731190", "यूटीआर ४०१२ ८८७३ ११९०")
    assert not entity_match("utr", "401288731190", "4012 8873 119")


def test_amount():
    assert entity_match("amount", "250000", "I paid ₹2,50,000 last week")
    assert entity_match("amount", "250000", "Rs 250000")
    assert not entity_match("amount", "250000", "2,50,001")
    assert not entity_match("amount", "25", "I paid 250")


def test_date():
    assert entity_match("date", "2026-03-15", "paid on 15/03/2026")
    assert entity_match("date", "2026-03-15", "15 March 2026")
    assert entity_match("date", "2026-03-15", "March 15, 2026")
    assert entity_match("date", "2026-03-15", "१५ मार्च २०२६ रोजी")
    assert not entity_match("date", "2026-03-15", "03/15/2026 nonsense 16 March 2026")


def test_loan_last4():
    assert entity_match("loan_last4", "4417", "last digits 4 4 1 7")
    assert not entity_match("loan_last4", "4417", "4418")


def test_aggregate_shape():
    out = aggregate([{"entity": "ifsc", "with_ok": True, "without_ok": False},
                     {"entity": "ifsc", "with_ok": True, "without_ok": True}])
    assert out == {"rows": [{"entity": "ifsc", "with_keyterms": 1.0, "without_keyterms": 0.5, "n": 2}]}


def test_corpus_deterministic_and_big_enough():
    a, b = build_corpus(), build_corpus()
    assert a == b and len(a) >= 120
    assert {i["language"] for i in a} == {"en", "hinglish", "hi", "mr"}
    assert all(e["value"].startswith("SAHY0") for i in a for e in i["entities"] if e["type"] == "ifsc")
    assert indian_group(250000) == "2,50,000" and indian_group(1234567) == "12,34,567"
