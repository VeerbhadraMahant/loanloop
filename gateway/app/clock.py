"""IST 'today' (the bank's calendar day), independent of the server timezone."""
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    return datetime.now(IST)  # tests patch this; everything else derives from it


def today_ist() -> date:
    return now_ist().date()
