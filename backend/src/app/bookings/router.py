"""Booking API (#14): tenants book a room type and pay its deposit by Mobile Money."""

import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..auth.schemas import normalise_phone
from ..billing.service import BillStatus, bill_status
from ..config import get_settings
from ..db import get_session
from ..models import Booking, BookingStatus, PaymentStatus, Role, Tenancy, User
from ..payments.gateway import MomoNetwork, PaymentGateway, get_gateway, valid_paystack_signature
from .service import (
    BookingError,
    bookings_query,
    cancel_booking,
    confirm_payment,
    fail_payment,
    refresh_booking,
    start_booking,
    start_payment,
)

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(require_role(Role.TENANT))]
Gateway = Annotated[PaymentGateway | None, Depends(get_gateway)]

router = APIRouter(tags=["bookings"])
webhook_router = APIRouter(tags=["webhooks"])


class BookingPaymentOut(BaseModel):
    status: PaymentStatus
    message: str | None


class BookingTenancyOut(BaseModel):
    room_number: str
    start_date: date
    rent: int
    sanitation_fee: int
    renting_deposit: int
    renting_bill_number: str
    renting_bill_status: BillStatus
    renting_bill_id: int
    # None only for tenancies from before agreements existed.
    agreement_id: str | None
    agreement_signed: bool


class BookingOut(BaseModel):
    id: str
    status: BookingStatus
    room_type_id: str | None
    room: str
    building: str
    location: str
    deposit: int
    bill_number: str
    bill_status: BillStatus
    payment: BookingPaymentOut | None
    # True when payments are pretend (local development only).
    test_mode: bool
    # Once the admin has allocated a room (#18).
    tenancy: BookingTenancyOut | None

    @classmethod
    def of(cls, b: Booking, gateway: PaymentGateway | None) -> BookingOut:
        latest = b.bill.payments[-1] if b.bill.payments else None
        return cls(
            id=b.id,
            status=b.status,
            room_type_id=b.room_type_id,
            room=b.room_name,
            building=b.building_name,
            location=b.location,
            deposit=b.bill.amount,
            bill_number=b.bill.number,
            bill_status=bill_status(b.bill),
            payment=BookingPaymentOut(status=latest.status, message=latest.note) if latest else None,
            test_mode=bool(gateway and gateway.simulated),
            tenancy=_tenancy(b.tenancy),
        )


def _tenancy(t: Tenancy | None) -> BookingTenancyOut | None:
    if t is None:
        return None
    return BookingTenancyOut(
        room_number=t.room_number,
        start_date=t.start_date,
        rent=t.rent,
        sanitation_fee=t.sanitation_fee,
        renting_deposit=t.renting_bill.amount,
        renting_bill_number=t.renting_bill.number,
        renting_bill_status=bill_status(t.renting_bill),
        renting_bill_id=t.renting_bill.id,
        agreement_id=t.agreement.id if t.agreement else None,
        agreement_signed=bool(t.agreement and t.agreement.signed_at),
    )


def _mine(db: Session, booking_id: str, tenant: User) -> Booking:
    booking = db.scalar(bookings_query().where(Booking.id == booking_id, Booking.tenant_id == tenant.id))
    if booking is None:
        raise HTTPException(status_code=404, detail="That booking doesn't exist.")
    return booking


def _http(e: BookingError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail=str(e))


class BookingIn(BaseModel):
    room_type_id: str


@router.post("", status_code=201)
def create_booking(data: BookingIn, tenant: Tenant, db: DB, gateway: Gateway) -> BookingOut:
    try:
        return BookingOut.of(start_booking(db, tenant, data.room_type_id), gateway)
    except BookingError as e:
        db.rollback()
        raise _http(e) from e


@router.get("")
def my_bookings(tenant: Tenant, db: DB, gateway: Gateway) -> list[BookingOut]:
    return [
        BookingOut.of(b, gateway)
        for b in db.scalars(bookings_query().where(Booking.tenant_id == tenant.id)).all()
    ]


@router.get("/{booking_id}")
def get_booking(booking_id: str, tenant: Tenant, db: DB, gateway: Gateway) -> BookingOut:
    """The booking as it stands. The page asks repeatedly while a payment is waiting."""
    booking = _mine(db, booking_id, tenant)
    refresh_booking(db, booking, gateway)
    return BookingOut.of(booking, gateway)


class PayIn(BaseModel):
    phone: str
    network: MomoNetwork

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)


@router.post("/{booking_id}/pay")
def pay_deposit(booking_id: str, data: PayIn, tenant: Tenant, db: DB, gateway: Gateway) -> BookingOut:
    """Sends the Mobile Money prompt for the booking deposit to the tenant's phone."""
    if gateway is None:
        raise HTTPException(
            status_code=503, detail="Online payment isn't available right now. Enquire instead."
        )
    booking = _mine(db, booking_id, tenant)
    try:
        start_payment(db, booking, gateway, tenant=tenant, phone=data.phone, network=data.network)
    except BookingError as e:
        db.rollback()
        raise _http(e) from e
    return BookingOut.of(booking, gateway)


@router.post("/{booking_id}/cancel")
def cancel(booking_id: str, tenant: Tenant, db: DB, gateway: Gateway) -> BookingOut:
    booking = _mine(db, booking_id, tenant)
    refresh_booking(db, booking, gateway)
    try:
        cancel_booking(db, booking)
    except BookingError as e:
        raise _http(e) from e
    return BookingOut.of(booking, gateway)


class SimulateIn(BaseModel):
    outcome: Literal["success", "failed"]


@router.post("/{booking_id}/simulate")
def simulate(booking_id: str, data: SimulateIn, tenant: Tenant, db: DB, gateway: Gateway) -> BookingOut:
    """Test buttons for the pretend gateway. Doesn't exist as far as anyone else can tell."""
    if gateway is None or not gateway.simulated:
        raise HTTPException(status_code=404, detail="Not found")
    booking = _mine(db, booking_id, tenant)
    payment = next((p for p in booking.bill.payments if p.status == PaymentStatus.PENDING), None)
    if payment is None:
        raise HTTPException(status_code=409, detail="There's no payment waiting.")
    if data.outcome == "success":
        confirm_payment(db, payment.reference, amount_cedis=payment.amount, currency="GHS")
    else:
        fail_payment(db, payment, "Test mode: the payment was declined.")
    return BookingOut.of(booking, gateway)


@webhook_router.post("/paystack")
async def paystack_webhook(request: Request, db: DB) -> dict:
    """Paystack tells us when a charge succeeds, even if the tenant has closed the page."""
    secret = get_settings().paystack_secret_key
    if not secret:
        raise HTTPException(status_code=404, detail="Not found")
    raw = await request.body()
    if not valid_paystack_signature(raw, request.headers.get("x-paystack-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    event = json.loads(raw)
    data = event.get("data") or {}
    if event.get("event") == "charge.success" and data.get("reference"):
        amount = data.get("amount")
        confirm_payment(
            db,
            data["reference"],
            amount_cedis=amount / 100 if isinstance(amount, int) else None,
            currency=data.get("currency"),
        )
    return {"received": True}
