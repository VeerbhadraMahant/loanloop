import os
import secrets

# Must be set before any `app` import: isolated Postgres DB + Redis db 15.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://loanloop:loanloop@localhost:55432/loanloop_test"
os.environ["REDIS_URL"] = "redis://localhost:56379/15"
os.environ["GATEWAY_SHARED_SECRET"] = "test-secret"
os.environ["DASHBOARD_TOKEN"] = "test-dash"
os.environ["PHONE_TOKEN"] = "test-phone"
# Demo logins for the tests are random per run, so a private gateway/.env never matters and no password sits in the repo.
os.environ["DEMO_STAFF_PASSWORD"] = "t-" + secrets.token_urlsafe(16)
os.environ["DEMO_CUSTOMER_PASSCODE"] = str(secrets.randbelow(900000) + 100000)

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import sessions  # noqa: E402
from app.db.models import Customer  # noqa: E402
from app.db.seed import seed  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

SECRET = {"X-Gateway-Secret": "test-secret"}


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _db():
    c = await asyncpg.connect("postgresql://loanloop:loanloop@localhost:55432/postgres")
    if not await c.fetchval("select 1 from pg_database where datname='loanloop_test'"):
        await c.execute("create database loanloop_test")
    await c.close()
    await seed(engine)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _redis_clean():
    await sessions.redis.flushdb()
    yield


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def call(client: httpx.AsyncClient, action: str, call_id: str = "call1", language: str = "en", headers=SECRET, **body):
    """POST /actions/<action> with auth; returns the parsed ActionResponse dict (asserts HTTP 200)."""
    r = await client.post(f"/actions/{action}", json={"call_id": call_id, "language": language, **body}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


@pytest_asyncio.fixture
async def priya():
    async with SessionLocal() as db:
        return (await db.execute(select(Customer).where(Customer.name == "Priya Deshmukh"))).scalar_one()


@pytest_asyncio.fixture
def make_session(priya):
    """await make_session(call_id='c1', tier=1) -> Session stored in Redis for Priya (skips verify_caller)."""
    async def _make(call_id="call1", tier=1, language="en", customer=None):
        cust = customer or priya
        s = await sessions.create(call_id, language)
        s.customer_id, s.tier = cust.id, tier
        await sessions.save(s)
        return s
    return _make


@pytest_asyncio.fixture
async def fresh():
    """Reseed (drops and recreates all tables) for tests that change collections state."""
    await seed(engine)
    await sessions.redis.flushdb()


@pytest_asyncio.fixture
def mk_session():
    """await mk_session(customer_id, call_id=..., tier=1, direction='inbound', case_id=None, language='en')."""
    async def _make(customer_id, call_id="call1", tier=1, direction="inbound", case_id=None, language="en"):
        s = await sessions.create(call_id, language, direction=direction, case_id=case_id)
        s.customer_id, s.tier = customer_id, tier
        await sessions.save(s)
        return s
    return _make
