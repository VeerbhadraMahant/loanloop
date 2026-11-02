"""Actions: request_document, update_nominee, update_address."""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.contract import ActionIn, ActionResponse
from app.db.models import Customer
from app.routes.actions._runner import action
from app.routes.actions.loans import missing_readback, new_request, readback_needed
from app.sessions import Session
from app.sms import send_sms
from app.speak import t
from app.speak.format import digits

router = APIRouter(prefix="/actions")


class DocumentIn(ActionIn):
    type: Literal["statement", "interest_cert"]


@action("request_document", In=DocumentIn, router=router)
async def request_document(inp: DocumentIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    lang = inp.language
    sr = await new_request(db, session, inp.type, {"channel": "registered_email"})
    customer = await db.get(Customer, session.customer_id)
    bg.add_task(send_sms, customer, t("sms_document", "en", doc=t(f"doc_{inp.type}", "en"), ticket=sr.id), inp.call_id)
    return ActionResponse(ok=True, speak=t("document_raised", lang, ticket=sr.id, doc=t(f"doc_{inp.type}", lang)),
                          data={"ticket": sr.id, "type": inp.type})


class NomineeIn(ActionIn):
    name: str = Field(min_length=2, max_length=100)
    relation: str = Field(min_length=2, max_length=30)


@action("update_nominee", In=NomineeIn, router=router)
async def update_nominee(inp: NomineeIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    pairs = {"name": inp.name, "relation": inp.relation}
    miss = missing_readback(session, pairs)
    if miss:
        return readback_needed(inp.language, "readback_nominee", miss, **pairs)
    for f in pairs:
        session.consume_readback(f)
    sr = await new_request(db, session, "nominee", pairs)
    return ActionResponse(ok=True, speak=t("nominee_raised", inp.language, ticket=sr.id, **pairs), data={"ticket": sr.id})


class AddressIn(ActionIn):
    line1: str = Field(min_length=3, max_length=120)
    city: str = Field(min_length=2, max_length=60)
    pincode: str = Field(pattern=r"^\d{6}$")


@action("update_address", In=AddressIn, router=router)
async def update_address(inp: AddressIn, session: Session, db: AsyncSession, bg: BackgroundTasks) -> ActionResponse:
    pairs = {"line1": inp.line1, "city": inp.city, "pincode": inp.pincode}
    miss = missing_readback(session, pairs)
    spoken = {**pairs, "pincode": digits(inp.pincode, 3)}
    if miss:
        return readback_needed(inp.language, "readback_address", miss, **spoken)
    for f in pairs:
        session.consume_readback(f)
    sr = await new_request(db, session, "address", pairs)
    return ActionResponse(ok=True, speak=t("address_raised", inp.language, ticket=sr.id, **spoken), data={"ticket": sr.id})
