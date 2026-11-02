"""Seed the dev DB. Run from gateway/:  uv run python ../tools/seed_data.py"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "gateway"))

from app.db.seed import seed  # noqa: E402
from app.db.session import engine  # noqa: E402


async def main() -> None:
    print("seeded customers:", await seed(engine))
    await engine.dispose()


asyncio.run(main())
