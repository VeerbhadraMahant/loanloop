import pytest

from app.db.models import ServiceRequest
from app.db.session import SessionLocal

DASH = {"Authorization": "Bearer test-dash"}


async def _seed_requests(cust_id):
    async with SessionLocal() as db:
        db.add_all([
            ServiceRequest(customer_id=cust_id, type="address", payload={
                "line1": "Flat 402 Zephyr Heights Baner Road", "city": "Pune", "pincode": "411045"}),
            ServiceRequest(customer_id=cust_id, type="nominee", payload={"name": "Qwertyuiop Zxcvbnm", "relation": "spouse"}),
            ServiceRequest(customer_id=cust_id, type="reconciliation", status="done", payload={
                "utr_last4": "9876", "utr": "SBIN123456789012", "amount": 12345, "date": "2026-10-01"}),
            ServiceRequest(customer_id=cust_id, type="emi_date_change", payload={"old_day": 5, "new_day": 15}),
        ])
        await db.commit()


async def test_requests_auth(client):
    assert (await client.get("/dashboard/requests")).status_code == 401
    assert (await client.get("/dashboard/requests", headers={"Authorization": "Bearer nope"})).status_code == 401


async def test_requests_shape_filters_and_masking(client, priya):
    await _seed_requests(priya.id)
    r = await client.get("/dashboard/requests", headers=DASH)
    assert r.status_code == 200
    body = r.json()
    assert {"by_status", "by_type"} == set(body["counts"])
    assert body["counts"]["by_type"]["address"] >= 1 and body["counts"]["by_status"]["done"] >= 1
    assert {"id", "created_at", "type", "status", "customer_ref", "summary"} == set(body["requests"][0])
    assert len(body["requests"]) <= 100
    raw = r.text
    for leak in ("Zephyr", "Baner", "Flat 402", "411045", "Qwertyuiop", "Zxcvbnm", "SBIN123456789012", "123456789012",
                 priya.registered_mobile, priya.email):
        assert leak not in raw
    assert "Address updated" in raw and "UTR ending 9876" in raw and "spouse (Q.)" in raw
    f = (await client.get("/dashboard/requests?status=done&type=reconciliation", headers=DASH)).json()
    assert f["requests"] and all(x["status"] == "done" and x["type"] == "reconciliation" for x in f["requests"])


@pytest.mark.parametrize("qs", ["status=bogus", "type=bogus"])
async def test_requests_bad_filter_422(client, qs):
    assert (await client.get(f"/dashboard/requests?{qs}", headers=DASH)).status_code == 422
