from loadtest.run import duration_s, parse_stats
from simulate_call import check

CSV = """Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%
POST,emi_info,10,1,5,6,1,20,100,4.0,0.4,5,6,7,8,9,12,15,20,20,20,20
,Aggregated,20,1,5,6,1,20,100,8.5,0.4,6,7,8,9,10,14,18,25,25,25,25
"""


def test_check_pass_and_fail():
    r = {"ok": False, "error_code": "TIER_TOO_LOW", "speak": "Sent to your number ending 4417", "data": {"status": "pending"}}
    assert check(r, {"ok": False, "codes": {"TIER_TOO_LOW"}, "contains": ["ending 4417"]}) == []
    bad = check(r, {"ok": True, "codes": {"NOT_VERIFIED"}, "contains": ["nope"], "absent": ["4417"], "data_not": {"status": "pending"}})
    assert len(bad) == 5


def test_parse_stats(tmp_path):
    f = tmp_path / "lt_stats.csv"
    f.write_text(CSV)
    s = parse_stats(f)
    assert s["per_action"] == [{"action": "emi_info", "p50": 5.0, "p95": 12.0, "p99": 20.0, "count": 10, "failures": 1}]
    assert s["overall"] == {"p50": 6.0, "p95": 14.0, "p99": 25.0, "error_rate": 0.05, "rps": 8.5}


def test_duration():
    assert duration_s("3m") == 180 and duration_s("1h30m") == 5400 and duration_s("90s") == 90
