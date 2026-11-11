"""Admin dashboard: real figures, bookings by stage, recent tenants and recent activity."""

from collections import Counter
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import require_role
from ..billing.service import PERIOD, balance, current_period
from ..bookings.service import holds_by_room
from ..db import get_session, utcnow
from ..models import (
    Agreement,
    Bill,
    BillKind,
    Booking,
    BookingStatus,
    Building,
    ContactMessage,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    Tenancy,
    User,
)
from ..sanitation.service import ensure_sanitation_bills
from .payments import Fee, PaymentStatusOut, payment_status

DB = Annotated[Session, Depends(get_session)]

router = APIRouter(tags=["admin: dashboard"], dependencies=[Depends(require_role(Role.ADMIN))])

KIND_WORDS = {
    BillKind.BOOKING_DEPOSIT: "booking deposit",
    BillKind.RENTING_DEPOSIT: "renting deposit",
    BillKind.SANITATION: "sanitation fee",
    BillKind.LATE_FEE: "late fee",
}
ACTIVITY_LIMIT = 6
RECENT_TENANTS = 5


class Figures(BaseModel):
    active_tenants: int
    rooms_available: int
    buildings: int
    waiting_for_room: int
    waiting_to_sign: int
    collected_this_month: int
    collected_last_month: int
    # Renting deposits and sanitation not yet paid. Unpaid booking deposits aren't owed until someone books.
    still_owed: int


class MonthTotal(BaseModel):
    month: str  # "2026-11"
    amount: int


class Stage(BaseModel):
    key: str
    label: str
    count: int


class RecentTenant(BaseModel):
    id: str
    name: str
    email: str
    status: str
    tone: Literal["success", "warning", "neutral"]


class Activity(BaseModel):
    kind: Literal["payment", "allocation", "agreement", "enquiry"]
    text: str
    at: datetime


class Overview(BaseModel):
    figures: Figures
    revenue: list[MonthTotal]
    stages: list[Stage]
    recent_tenants: list[RecentTenant]
    activity: list[Activity]


def _month_starts(today: date, months: int) -> list[date]:
    """The first day of each of the last `months` months, oldest first."""
    index = today.year * 12 + today.month - 1
    return [date((i // 12), i % 12 + 1, 1) for i in range(index - months + 1, index + 1)]


def _tenant_status(booking: Booking | None) -> tuple[str, Literal["success", "warning", "neutral"]]:
    if booking is None:
        return "No booking", "neutral"
    if booking.status == BookingStatus.PENDING_PAYMENT:
        return "Waiting for payment", "warning"
    if booking.status == BookingStatus.AWAITING_ALLOCATION:
        return "Waiting for a room", "warning"
    tenancy = booking.tenancy
    if tenancy is None:
        return "No booking", "neutral"
    if not (tenancy.agreement and tenancy.agreement.signed_at):
        return f"Room {tenancy.room_number}, to sign", "warning"
    return f"Room {tenancy.room_number}", "success"


def _activity(db: Session) -> list[Activity]:
    items: list[Activity] = []
    payments = db.execute(
        select(Payment, Bill.kind, User.name)
        .join(Payment.bill)
        .join(Bill.tenant)
        .where(
            Payment.status == PaymentStatus.SUCCESS,
            Payment.paid_at.is_not(None),
            Payment.method != PaymentMethod.DEPOSIT,
        )
        .order_by(Payment.paid_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all()
    for payment, kind, name in payments:
        text = f"{name} paid GH₵ {payment.amount:,} {KIND_WORDS[kind]}"
        items.append(Activity(kind="payment", text=text, at=payment.paid_at))
    for tenancy, name in db.execute(
        select(Tenancy, User.name)
        .join(User, Tenancy.tenant_id == User.id)
        .order_by(Tenancy.created_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all():
        text = f"Room {tenancy.room_number} at {tenancy.building_name} allocated to {name}"
        items.append(Activity(kind="allocation", text=text, at=tenancy.created_at))
    for signed_at, name in db.execute(
        select(Agreement.signed_at, User.name)
        .join(Agreement.tenancy)
        .join(User, Tenancy.tenant_id == User.id)
        .where(Agreement.signed_at.is_not(None))
        .order_by(Agreement.signed_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all():
        items.append(Activity(kind="agreement", text=f"{name} signed their tenancy agreement", at=signed_at))
    for created_at, name in db.execute(
        select(ContactMessage.created_at, ContactMessage.name)
        .order_by(ContactMessage.created_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all():
        items.append(Activity(kind="enquiry", text=f"New enquiry from {name}", at=created_at))
    items.sort(key=lambda a: a.at, reverse=True)
    return items[:ACTIVITY_LIMIT]


@router.get("/overview")
def overview(db: DB, months: Annotated[int, Query(ge=1, le=12)] = 6) -> Overview:
    ensure_sanitation_bills(db)
    today = utcnow().date()
    # Always at least two months, for the comparison with last month.
    starts = _month_starts(today, max(months, 2))
    since = datetime(starts[0].year, starts[0].month, 1)
    by_month: Counter[str] = Counter()
    for amount, paid_at in db.execute(
        select(Payment.amount, Payment.paid_at).where(
            Payment.status == PaymentStatus.SUCCESS,
            Payment.paid_at >= since,
            # Taken from a deposit at move-out: that money was counted when the deposit was paid.
            Payment.method != PaymentMethod.DEPOSIT,
        )
    ).all():
        by_month[paid_at.strftime("%Y-%m")] += amount
    keys = [s.strftime("%Y-%m") for s in starts]

    bookings = db.scalars(
        select(Booking)
        .where(Booking.status != BookingStatus.CANCELLED)
        .options(selectinload(Booking.tenancy).selectinload(Tenancy.agreement))
        .order_by(Booking.created_at.desc())
    ).all()
    signed = sum(1 for b in bookings if b.tenancy and b.tenancy.agreement and b.tenancy.agreement.signed_at)
    allocated = sum(1 for b in bookings if b.status == BookingStatus.ALLOCATED)
    waiting_for_room = sum(1 for b in bookings if b.status == BookingStatus.AWAITING_ALLOCATION)
    waiting_to_sign = allocated - signed

    holds = holds_by_room(db)
    rooms = db.scalars(select(RoomType)).all()
    owed = db.scalars(
        select(Bill)
        .where(Bill.voided_at.is_(None), Bill.kind != BillKind.BOOKING_DEPOSIT)
        .options(selectinload(Bill.payments))
    ).all()

    tenants = db.scalars(
        select(User).where(User.role == Role.TENANT).order_by(User.created_at.desc()).limit(RECENT_TENANTS)
    ).all()
    latest: dict[str, Booking] = {}
    for b in bookings:
        latest.setdefault(b.tenant_id, b)

    return Overview(
        figures=Figures(
            active_tenants=len(db.scalars(select(Tenancy.id).where(Tenancy.ended_at.is_(None))).all()),
            rooms_available=sum(max(rt.quantity_available - holds[rt.id], 0) for rt in rooms),
            buildings=len(db.scalars(select(Building.id)).all()),
            waiting_for_room=waiting_for_room,
            waiting_to_sign=waiting_to_sign,
            collected_this_month=by_month[keys[-1]],
            collected_last_month=by_month[keys[-2]],
            still_owed=sum(balance(b) for b in owed),
        ),
        revenue=[MonthTotal(month=k, amount=by_month[k]) for k in keys[-months:]],
        stages=[
            Stage(
                key="payment",
                label="Waiting for payment",
                count=sum(1 for b in bookings if b.status == BookingStatus.PENDING_PAYMENT),
            ),
            Stage(key="room", label="Waiting for a room", count=waiting_for_room),
            Stage(key="sign", label="Waiting to sign", count=waiting_to_sign),
            Stage(key="signed", label="Signed", count=signed),
        ],
        recent_tenants=[
            RecentTenant(
                id=t.id,
                name=t.name,
                email=t.email,
                status=_tenant_status(latest.get(t.id))[0],
                tone=_tenant_status(latest.get(t.id))[1],
            )
            for t in tenants
        ],
        activity=_activity(db),
    )


@router.get("/overview/payments")
def payments_by_status(
    db: DB,
    period: str | None = None,
    fee: Fee = "all",
    building_id: str | None = None,
) -> PaymentStatusOut:
    """Tenants grouped by whether they've paid, for the dashboard's filtered chart (#20)."""
    period = period or current_period()
    if not PERIOD.match(period):
        raise HTTPException(422, "Give the month like 2026-11.")
    return payment_status(db, period=period, fee=fee, building_id=building_id or None)
