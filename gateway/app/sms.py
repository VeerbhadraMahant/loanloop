"""Mock SMS outbox. The destination is always the customer's registered mobile from the DB, never caller input."""
from app import events
from app.db.models import Customer, SmsOutbox
from app.db.session import SessionLocal
from app.security.mask import mask_mobile


async def send_sms(customer: Customer, body: str, call_id: str | None = None) -> None:
    """Run as a BackgroundTask after the response: uses its own DB session."""
    async with SessionLocal() as db:
        db.add(SmsOutbox(customer_id=customer.id, to_mobile=customer.registered_mobile, body=body))
        await db.commit()
    # body may hold full details (it's the customer's own phone); the event never does.
    await events.publish({"type": "sms", "call_id": call_id, "customer_key": customer_key(customer),
                          "detail": f"SMS sent to {mask_mobile(customer.registered_mobile)}"})


def customer_key(customer: Customer) -> str:
    """Phone-app key: persona first name for demo personas, else 'c<id>'."""
    first = customer.name.split()[0].lower()
    return first if first in {"priya", "ramesh", "sunita"} else f"c{customer.id}"
