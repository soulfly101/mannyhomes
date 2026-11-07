"""Tenants paying one of their own bills by Mobile Money. Pages ask repeatedly while a payment is waiting."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..agreements.service import payment_block
from ..auth.deps import require_role
from ..auth.schemas import normalise_phone
from ..bookings.service import (
    BookingError,
    abandon_otp,
    charge_bill,
    confirm_payment,
    fail_payment,
    refresh_bill,
    submit_otp,
    waiting_payment,
)
from ..db import get_session
from ..models import Bill, BillKind, Role, User
from ..payments.gateway import MomoNetwork, PaymentGateway, get_gateway
from .router import BillOut
from .service import BillingError, balance, bills_query

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(require_role(Role.TENANT))]
Gateway = Annotated[PaymentGateway | None, Depends(get_gateway)]

router = APIRouter(tags=["bills"])


class PayableBill(BillOut):
    # Why it can't be paid online yet (e.g. the agreement isn't signed); None when it can.
    locked_reason: str | None
    # True while the provider wants the SMS code; no prompt has gone to the phone yet.
    otp_required: bool
    # True when payments are pretend (local development only).
    test_mode: bool


def _mine(db: Session, bill_id: int, tenant: User) -> Bill:
    bill = db.scalar(bills_query().where(Bill.id == bill_id, Bill.tenant_id == tenant.id))
    if bill is None:
        raise HTTPException(status_code=404, detail="That bill doesn't exist.")
    return bill


def _out(db: Session, bill: Bill, gateway: PaymentGateway | None) -> PayableBill:
    waiting = waiting_payment(bill)
    return PayableBill(
        **BillOut.of(bill).model_dump(),
        locked_reason=payment_block(db, bill),
        otp_required=bool(waiting and waiting.otp_required),
        test_mode=bool(gateway and gateway.simulated),
    )


@router.get("/{bill_id}")
def get_bill(bill_id: int, tenant: Tenant, db: DB, gateway: Gateway) -> PayableBill:
    bill = _mine(db, bill_id, tenant)
    refresh_bill(db, bill, gateway)
    return _out(db, bill, gateway)


class PayIn(BaseModel):
    phone: str
    network: MomoNetwork

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)


@router.post("/{bill_id}/pay")
def pay_bill(bill_id: int, data: PayIn, tenant: Tenant, db: DB, gateway: Gateway) -> PayableBill:
    """Sends the Mobile Money prompt for what's left on the bill."""
    if gateway is None:
        raise HTTPException(status_code=503, detail="Online payment isn't available right now.")
    bill = _mine(db, bill_id, tenant)
    if bill.kind == BillKind.BOOKING_DEPOSIT:
        raise HTTPException(status_code=409, detail="Pay the booking deposit from your booking.")
    reason = payment_block(db, bill)
    if reason:
        raise HTTPException(status_code=409, detail=reason)
    refresh_bill(db, bill, gateway)
    abandon_otp(db, bill)
    if balance(bill) <= 0:
        raise HTTPException(status_code=409, detail="This bill is already paid.")
    if waiting_payment(bill):
        raise HTTPException(
            status_code=409, detail="A payment is already waiting. Approve the prompt on your phone."
        )
    try:
        charge_bill(db, bill, gateway, tenant=tenant, phone=data.phone, network=data.network)
    except (BookingError, BillingError) as e:
        db.rollback()
        status = e.status_code if isinstance(e, BookingError) else 400
        raise HTTPException(status_code=status, detail=str(e)) from e
    return _out(db, bill, gateway)


class OtpIn(BaseModel):
    code: str = Field(pattern=r"^\s*[0-9A-Za-z]{3,12}\s*$")


@router.post("/{bill_id}/otp")
def enter_otp(bill_id: int, data: OtpIn, tenant: Tenant, db: DB, gateway: Gateway) -> PayableBill:
    """The SMS code the provider asked for, which lets the prompt go to the tenant's phone."""
    if gateway is None:
        raise HTTPException(status_code=503, detail="Online payment isn't available right now.")
    bill = _mine(db, bill_id, tenant)
    try:
        submit_otp(db, bill, gateway, tenant=tenant, code=data.code.strip())
    except BookingError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return _out(db, bill, gateway)


class SimulateIn(BaseModel):
    outcome: Literal["success", "failed"]


@router.post("/{bill_id}/simulate")
def simulate(bill_id: int, data: SimulateIn, tenant: Tenant, db: DB, gateway: Gateway) -> PayableBill:
    """Test buttons for the pretend gateway. Doesn't exist as far as anyone else can tell."""
    if gateway is None or not gateway.simulated:
        raise HTTPException(status_code=404, detail="Not found")
    bill = _mine(db, bill_id, tenant)
    payment = waiting_payment(bill)
    if payment is None:
        raise HTTPException(status_code=409, detail="There's no payment waiting.")
    if data.outcome == "success":
        confirm_payment(db, payment.reference, amount_cedis=payment.amount, currency="GHS")
    else:
        fail_payment(db, payment, "Test mode: the payment was declined.")
    return _out(db, bill, gateway)
