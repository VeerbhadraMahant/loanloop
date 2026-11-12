"""Per-identity access control (contract sections 4 and 6). The gateway's GET /auth/session is mocked."""
import httpx
import pytest
from fastapi.testclient import TestClient

from voice.app import Settings, create_app
from voice.tests.test_voice import BASE, KEY, Fake

NO_DEFAULT_AUTH = True  # conftest would otherwise send the service bearer on every request
SERVICE = {"Authorization": "Bearer dev-dashboard-token-change-me"}
SESSIONS = {  # sid -> gateway reply
    "cust-a": {"kind": "customer", "role": "customer", "name": "A", "customer_id": 1, "customer_key": "priya"},
    "cust-b": {"kind": "customer", "role": "customer", "name": "B", "customer_id": 2, "customer_key": "ramesh"},
    "mgr": {"kind": "staff", "role": "bank_manager", "name": "M"},
    "eng": {"kind": "staff", "role": "engineer", "name": "E"},
    "adm": {"kind": "staff", "role": "admin", "name": "Ad"},
}
CUST_A, CUST_B = {"X-LL-Customer-Session": "cust-a"}, {"X-LL-Customer-Session": "cust-b"}
MGR, ENG, ADM = ({"X-LL-Staff-Session": s} for s in ("mgr", "eng", "adm"))
OUT = {"direction": "outbound", "case_id": 7}


@pytest.fixture
def env():
    fake, state = Fake(), {"down": False, "lookups": []}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/auth/session":
            sid = req.headers["x-ll-session"]
            state["lookups"].append(sid)
            if state["down"]:
                return httpx.Response(503)
            return httpx.Response(200, json=SESSIONS[sid]) if sid in SESSIONS else httpx.Response(401, json={"detail": "unauthorized"})
        return fake.handler(req)

    cl = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with TestClient(create_app(Settings(gnani_speech_api_key=KEY, VOICE_DEV=True), cl), base_url=BASE) as c:
        yield c, state


def start(c, h, body=None, q="?tts=false"):
    return c.post(f"/calls{q}", json=body or {}, headers=h)


def turn(c, cid, h):
    return c.post(f"/calls/{cid}/turn?tts=false", json={"text": "hello"}, headers=h)


def test_no_credentials_is_401_everywhere_but_health(env):
    c, _ = env
    assert c.get("/health").status_code == 200
    assert start(c, {}).status_code == 401
    assert c.post("/start", json={}).status_code == 401
    assert c.post("/calls/x/turn", json={"text": "hi"}).status_code == 401
    assert c.get("/calls/x/audio/y").status_code == 401
    assert c.get("/dev/config").status_code == 401
    assert c.post("/dev/warmup", json={}).status_code == 401
    assert c.post("/dev/bench", json={}).status_code == 401
    assert c.get("/dev/bench/x").status_code == 401
    assert start(c, {"Authorization": "Bearer wrong"}).status_code == 401


def test_invalid_session_is_401_and_gateway_down_is_502(env):
    c, state = env
    assert start(c, {"X-LL-Customer-Session": "nope"}).status_code == 401
    assert start(c, {"X-LL-Staff-Session": "nope"}).status_code == 401
    state["down"] = True
    assert start(c, CUST_A).status_code == 502


def test_customer_owns_their_call(env):
    c, _ = env
    r = start(c, CUST_A)
    assert r.status_code == 200
    cid = r.json()["call_id"]
    assert turn(c, cid, CUST_A).status_code == 200
    for other in (CUST_B, ENG, ADM, MGR):  # another customer, or any staff session, is not the owner
        assert turn(c, cid, other).status_code == 403
    assert turn(c, cid, SERVICE).status_code == 200  # service may continue any call
    assert "cust-a" not in str(c.app.state.calls[cid]["owner"])  # only a hash is kept


def test_audio_is_owner_only(env):
    c, _ = env
    url = start(c, CUST_A, q="?stream=true").json()["audio_url"]
    assert c.get(url, headers=CUST_B).status_code == 403
    assert c.get(url, headers=MGR).status_code == 403
    assert c.get(url).status_code == 401
    assert c.get(url, headers=CUST_A).status_code not in (401, 403)  # the token survived the refused attempts


def test_service_call_only_continued_by_service(env):
    c, _ = env
    cid = start(c, SERVICE).json()["call_id"]
    assert turn(c, cid, CUST_A).status_code == 403
    assert turn(c, cid, ADM).status_code == 403
    assert turn(c, cid, SERVICE).status_code == 200


def test_customer_cannot_use_dev_overrides_or_dev_routes(env):
    c, _ = env
    for body in ({"settings": {"temperature": 0.1}}, {"model": "x"}, {"llm": "gemini"}):
        assert start(c, CUST_A, body).status_code == 403
    assert c.get("/dev/config", headers=CUST_A).status_code == 403
    assert c.post("/dev/warmup", json={}, headers=CUST_A).status_code == 403
    assert c.post("/dev/bench", json={}, headers=CUST_A).status_code == 403
    assert c.get("/dev/bench/x", headers=CUST_A).status_code == 403


def test_bank_manager_outbound_yes_dev_no(env):
    c, _ = env
    assert start(c, MGR, OUT).status_code == 200
    assert start(c, MGR).status_code == 403  # a manager has no inbound test console
    assert start(c, MGR, {"settings": {}, "model": "x"}).status_code == 403
    assert c.get("/dev/config", headers=MGR).status_code == 403
    assert start(c, CUST_A, OUT).status_code == 403


def test_engineer_dev_yes_outbound_no(env):
    c, _ = env
    assert c.get("/dev/config", headers=ENG).status_code == 200
    assert start(c, ENG).status_code == 200
    assert start(c, ENG, {"settings": {"temperature": 0.2}}).status_code == 200
    assert start(c, ENG, OUT).status_code == 403


def test_admin_and_service_can_do_everything(env):
    c, _ = env
    for h in (ADM, SERVICE):
        assert c.get("/dev/config", headers=h).status_code == 200
        assert start(c, h).status_code == 200
        assert start(c, h, OUT).status_code == 200
        assert start(c, h, {"settings": {"temperature": 0.2}}).status_code == 200


def test_both_headers_pass_if_either_identity_is_allowed(env):
    c, _ = env
    assert start(c, {**CUST_A, **MGR}, OUT).status_code == 200  # the manager session satisfies outbound
    cid = start(c, {**CUST_A, **MGR}).json()["call_id"]  # plain inbound: customer session is the owner
    assert turn(c, cid, CUST_A).status_code == 200
    assert turn(c, cid, MGR).status_code == 403
