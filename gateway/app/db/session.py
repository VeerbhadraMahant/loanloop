from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.db.models import Base

engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=5)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as s:
        yield s


# v2 columns on tables that exist in v1 databases (create_all never alters existing tables)
V2_COLUMNS = (
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hold_amount INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'inbound'",
)


async def create_all() -> None:
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
        if c.dialect.name == "postgresql":
            for stmt in V2_COLUMNS:
                await c.execute(text(stmt))
