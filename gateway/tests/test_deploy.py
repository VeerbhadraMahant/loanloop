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
