from app.config import normalise_db_url
from app.db.seed_if_empty import needs_seed
from app.db.session import engine


def test_normalise_db_url():
    asyncpg = "postgresql+asyncpg://u:p@h:5432/db"
    assert normalise_db_url("postgres://u:p@h:5432/db") == asyncpg
    assert normalise_db_url("postgresql://u:p@h:5432/db") == asyncpg
    assert normalise_db_url(asyncpg) == asyncpg
    assert normalise_db_url("postgres://u:p@h/db?sslmode=disable&application_name=x") == "postgresql+asyncpg://u:p@h/db?application_name=x"
    assert normalise_db_url("postgres://u:p@h/db?sslmode=require") == "postgresql+asyncpg://u:p@h/db?ssl=require"


async def test_populated_db_is_not_reseeded():  # read-only: the decision only, the test DB is already seeded
    async with engine.connect() as c:
        assert await needs_seed(c) is False


def test_railway_env_refuses_dev_secrets(monkeypatch):
    import pytest
    from app.config import DEV_DEFAULTS, Settings, check_settings

    s = Settings(encryption_key="x", **DEV_DEFAULTS, public_gateway_url="http://localhost:8000")
    for v in ("RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PUBLIC_DOMAIN"):
        monkeypatch.delenv(v, raising=False)
    check_settings(s)  # local: only warns
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="dev default"):
        check_settings(s)
