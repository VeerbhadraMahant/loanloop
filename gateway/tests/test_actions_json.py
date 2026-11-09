"""agent/actions.json must match the gateway: every action has a route and an explicit tier (unlisted default to 2)."""
import json
from pathlib import Path

from app.main import app
from app.routes.actions.faq import load_faq
from app.security.tiers import TIER_FOR_ACTION

ACTIONS = json.loads((Path(__file__).resolve().parents[2] / "agent" / "actions.json").read_text(encoding="utf-8"))["actions"]


def test_every_action_has_route_and_tier():
    routes = set(app.openapi()["paths"])
    for a in ACTIONS:
        assert f"/actions/{a['name']}" in routes, a["name"]
        assert a["name"] in TIER_FOR_ACTION, a["name"]
    names = {a["name"] for a in ACTIONS}
    assert {"faq_lookup", "account_balance", "last_transactions", "dues_info", "record_ptp", "record_rtp"} <= names


def test_every_gateway_action_is_listed():
    registered = {p.rsplit("/", 1)[1] for p in app.openapi()["paths"] if p.startswith("/actions/")}
    assert registered == {a["name"] for a in ACTIONS} == set(TIER_FOR_ACTION)


def test_faq_topic_enum_matches_faq_json():
    """Fails when faq.json changed without re-running `python tools/sync_faq_enum.py`."""
    topic = next(v for a in ACTIONS if a["name"] == "faq_lookup" for v in a["variables"] if v["name"] == "topic")
    assert topic["enum"] == list(load_faq())


def test_start_call_has_direction_and_case_id():
    sc = next(a for a in ACTIONS if a["name"] == "start_call")
    assert {"direction", "case_id"} <= set(sc["body"]) and {v["name"] for v in sc["variables"]} >= {"direction", "case_id"}
