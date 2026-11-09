from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


TS = DateTime(timezone=True)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    dob: Mapped[date] = mapped_column(Date)
    registered_mobile: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(120))
    preferred_language: Mapped[str] = mapped_column(String(10))  # en|hi|hinglish|mr
    customer_id: Mapped[str] = mapped_column(String(12), unique=True)  # CIF, never spoken in full
    app_device_id: Mapped[str] = mapped_column(String(40))


class Branch(Base):
    __tablename__ = "branches"
    ifsc: Mapped[str] = mapped_column(String(11), primary_key=True)
    micr: Mapped[str] = mapped_column(String(9))
    name: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(40), index=True)
    address: Mapped[str] = mapped_column(String(200))
    hours: Mapped[str] = mapped_column(String(60))


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    account_number: Mapped[str] = mapped_column(Text)  # Fernet token
    account_last4: Mapped[str] = mapped_column(String(4))
    branch_ifsc: Mapped[str] = mapped_column(ForeignKey("branches.ifsc"))
    type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")
    balance: Mapped[int] = mapped_column(Integer, default=0)  # rupees
    hold_amount: Mapped[int] = mapped_column(Integer, default=0)


class Loan(Base):
    __tablename__ = "loans"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    loan_number: Mapped[str] = mapped_column(Text)  # Fernet token
    loan_last4: Mapped[str] = mapped_column(String(4))
    product: Mapped[str] = mapped_column(String(20))  # home|personal|vehicle
    principal: Mapped[int] = mapped_column(Integer)
    rate_type: Mapped[str] = mapped_column(String(10))  # floating|fixed
    current_rate: Mapped[float] = mapped_column(Numeric(5, 2))
    emi_amount: Mapped[int] = mapped_column(Integer)
    emi_day: Mapped[int] = mapped_column(Integer)
    tenure_months: Mapped[int] = mapped_column(Integer)
    outstanding: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|hardship|closed


class RateReset(Base):
    __tablename__ = "rate_resets"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    effective_date: Mapped[date] = mapped_column(Date)
    old_rate: Mapped[float] = mapped_column(Numeric(5, 2))
    new_rate: Mapped[float] = mapped_column(Numeric(5, 2))
    old_emi: Mapped[int] = mapped_column(Integer)
    new_emi: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(120))


class Charge(Base):
    __tablename__ = "charges"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(12))  # penal|bounce|processing
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(120))


class EmiSchedule(Base):
    __tablename__ = "emi_schedule"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    due_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12))  # paid|due|bounced


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[int] = mapped_column(Integer)
    utr: Mapped[str] = mapped_column(String(22), index=True)
    channel: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(12))  # matched|unmatched


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    sent_at: Mapped[datetime] = mapped_column(TS)
    channel: Mapped[str] = mapped_column(String(10))
    paused_until: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    type: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(12), default="open")
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


class Handover(Base):
    __tablename__ = "handovers"
    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[str] = mapped_column(String(64), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    requests_done: Mapped[list[Any]] = mapped_column(JSON, default=list)
    requests_pending: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending|approved|denied|expired
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


class SmsOutbox(Base):
    __tablename__ = "sms_outbox"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    to_mobile: Mapped[str] = mapped_column(String(10))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


class AuditLog(Base):
    """Append-only. No raw secrets or full identifiers; `flags` holds small masked metadata only."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ts: Mapped[datetime] = mapped_column(TS, default=now, index=True)
    call_id: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(40))
    tier: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str] = mapped_column(String(12))  # ok|error
    error_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    flags: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Call(Base):
    __tablename__ = "calls"
    call_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    language: Mapped[str] = mapped_column(String(10))
    started_at: Mapped[datetime] = mapped_column(TS, default=now)
    ended_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), default="inbound")  # inbound|outbound


class AccountTransaction(Base):
    __tablename__ = "account_transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    direction: Mapped[str] = mapped_column(String(2))  # dr|cr
    amount: Mapped[int] = mapped_column(Integer)
    narration: Mapped[str] = mapped_column(String(80))  # short, no counterparty account numbers
    ref: Mapped[str] = mapped_column(String(30))  # synthetic; never spoken
    balance_after: Mapped[int] = mapped_column(Integer)


class CollectionCase(Base):
    __tablename__ = "collection_cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    overdue_amount: Mapped[int] = mapped_column(Integer, default=0)
    missed_emis: Mapped[int] = mapped_column(Integer, default=0)
    dpd: Mapped[int] = mapped_column(Integer, default=0)
    bucket: Mapped[str] = mapped_column(String(6), default="0")  # 0|1-30|31-60|61-90|90+
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|ptp|rtp|resolved
    priority: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_call_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    next_action_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TS, default=now)


class PromiseToPay(Base):
    __tablename__ = "promises_to_pay"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("collection_cases.id"), index=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), default="inbound")
    amount: Mapped[int] = mapped_column(Integer)
    promised_date: Mapped[date] = mapped_column(Date)
    amount_tag: Mapped[str] = mapped_column(String(8))  # full|partial
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|kept|broken|cancelled
    paid_amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class RefusalToPay(Base):
    __tablename__ = "refusals_to_pay"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("collection_cases.id"), index=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), default="inbound")
    reason_code: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    overdue_amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    follow_up_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job: Mapped[str] = mapped_column(String(30))
    started_at: Mapped[datetime] = mapped_column(TS, default=now)
    finished_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
