from contextlib import asynccontextmanager

from fastapi import FastAPI

import asyncio

from app import events, jobs, logging as ll_logging
from app.config import check_settings, is_public, settings
from app.db.session import create_all
from app.routes import auth, dashboard, phone
from app.routes.actions import approvals, calls, collections, details, faq, handover, loans, requests, verify


@asynccontextmanager
async def lifespan(app: FastAPI):
    ll_logging.install()
    check_settings()
    await create_all()
    task = asyncio.create_task(jobs.loop(settings.jobs_interval_s)) if settings.jobs_interval_s > 0 else None
    yield
    if task:
        task.cancel()


_NO_DOCS = {"docs_url": None, "redoc_url": None, "openapi_url": None} if is_public() else {}  # no API map on a public deployment
app = FastAPI(title="LoanLoop gateway", lifespan=lifespan, **_NO_DOCS)  # CORS deliberately not enabled

for m in (calls, verify, details, approvals, loans, requests, handover, collections, faq, phone, dashboard, events, auth):
    app.include_router(m.router)


@app.get("/health")
async def health():
    return {"ok": True}
