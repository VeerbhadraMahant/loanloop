from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import events, logging as ll_logging
from app.config import check_settings
from app.db.session import create_all
from app.routes import dashboard, phone
from app.routes.actions import approvals, calls, details, handover, loans, requests, verify


@asynccontextmanager
async def lifespan(app: FastAPI):
    ll_logging.install()
    check_settings()
    await create_all()
    yield


app = FastAPI(title="LoanLoop gateway", lifespan=lifespan)  # CORS deliberately not enabled

for m in (calls, verify, details, approvals, loans, requests, handover, phone, dashboard, events):
    app.include_router(m.router)


@app.get("/health")
async def health():
    return {"ok": True}
