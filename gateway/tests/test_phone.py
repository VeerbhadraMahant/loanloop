from app.db.models import SmsOutbox
from app.db.session import SessionLocal

H = {"Authorization": "Bearer test-dash"}


async def test_phone_auth_required(client):
    assert (await client.get("/phone/priya")).status_code == 401
    assert (await client.get("/phone/priya/sms", headers={"Authorization": "Bearer nope"})).status_code == 401
    assert (await client.post("/phone/priya/approvals/1/approve")).status_code == 401


async def test_profile_and_keys(client):
    r = await client.get("/phone/priya", headers=H)
    assert r.json() == {"name": "Priya Deshmukh", "mobile_masked": "ending 4417"}
    assert (await client.get("/phone/c2", headers=H)).json()["name"] == "Ramesh Patil"
    assert (await client.get("/phone/nobody", headers=H)).status_code == 404
    assert (await client.get("/phone/c999999", headers=H)).status_code == 404


async def test_sms_inbox(client, priya):
    async with SessionLocal() as db:
        db.add(SmsOutbox(customer_id=priya.id, to_mobile=priya.registered_mobile, body="hello-inbox"))
        await db.commit()
    r = (await client.get("/phone/priya/sms", headers=H)).json()
    assert r[0]["body"] == "hello-inbox" and {"id", "body", "created_at"} <= set(r[0])
