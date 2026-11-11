"""Seed only a fresh database. Never drops a populated one (seed() does). Always exits 0.

Run (Railway pre-deploy):  python -m app.db.seed_if_empty
"""
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db.seed import seed
from app.db.session import engine


async def needs_seed(c: AsyncConnection) -> bool:
    if not (await c.execute(text("SELECT to_regclass('public.customers')"))).scalar():
        return True
    return not (await c.execute(text("SELECT EXISTS (SELECT 1 FROM customers)"))).scalar()


async def main() -> None:
    async with engine.connect() as c:
        empty = await needs_seed(c)
    if empty:
        print("seed_if_empty: database empty, seeded customers:", await seed(engine))
    else:
        print("seed_if_empty: customers present, skipping seed")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
