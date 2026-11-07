"""Booking a room type by paying its deposit (#14).

Rules:
- One open booking per tenant.
- A paid booking holds a room until the admin allocates it (#18), and a booking being paid for holds
  one for HOLD minutes, so tenants can't pay for rooms that aren't there. `quantity_available` itself
  only changes at allocation and move-out.
- If money arrives, it counts, whatever else has happened: the provider's word on a payment wins over
  a timeout or a cancelled booking, and the admin sorts out the booking from there.
"""

import logging
from collections import Counter
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ..billing.service import BillingError, balance, create_bill, mark_payment, record_payment, void_bill
from ..db import utcnow
from ..models import (
    Bill,
    BillKind,
    Booking,
    BookingStatus,
    Building,
    Payment,
    PaymentStatus,
    RoomType,
    Tenancy,
    User,
)
from ..payments.gateway import ChargeResult, ChargeStatus, GatewayError, MomoNetwork, PaymentGateway

logger = logging.getLogger(__name__)

HOLD = timedelta(minutes=10)
# Networks give people 180 seconds to approve a prompt; after this we stop waiting.
PAYMENT_WINDOW = timedelta(minutes=4)
TIMED_OUT = "The prompt timed out before it was approved. Try again."
OTP_TIMED_OUT = "The SMS code wasn't entered in time. Try again."


class BookingError(Exception):
    """A booking step that can't go ahead; the message is shown to people as is."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def holds_by_room(db: Session, *, exclude: str | None = None, viewer: User | None = None) -> Counter[str]:
    """How many rooms of each room type are spoken for by bookings.

    `viewer`'s own unpaid booking isn't counted: it's their hold, so the room is still open to them.
    """
    query = select(Booking.room_type_id).where(
        Booking.room_type_id.is_not(None),
        or_(
            Booking.status == BookingStatus.AWAITING_ALLOCATION,
            (Booking.status == BookingStatus.PENDING_PAYMENT) & (Booking.hold_until > utcnow()),
        ),
    )
    if exclude:
        query = query.where(Booking.id != exclude)
    if viewer:
        query = query.where(
            or_(Booking.tenant_id != viewer.id, Booking.status != BookingStatus.PENDING_PAYMENT)
        )
    return Counter(db.scalars(query).all())


def _locked_room(db: Session, room_type_id: str | None) -> RoomType | None:
    """Locks the room type's row, so two people can't take its last room at the same moment."""
    return db.scalar(
        select(RoomType)
        .join(RoomType.building)
        .where(RoomType.id == room_type_id, Building.listed.is_(True))
        .options(selectinload(RoomType.building))
        .with_for_update(of=RoomType)
    )


def _free_rooms(db: Session, room: RoomType, exclude: str | None = None) -> int:
    return room.quantity_available - holds_by_room(db, exclude=exclude)[room.id]


def bookings_query():
    return (
        select(Booking)
        .options(
            selectinload(Booking.bill).selectinload(Bill.payments),
            selectinload(Booking.tenancy).selectinload(Tenancy.renting_bill),
            selectinload(Booking.tenancy).selectinload(Tenancy.agreement),
        )
        .order_by(Booking.created_at.desc())
    )


def waiting_payment(bill: Bill) -> Payment | None:
    return next((p for p in reversed(bill.payments) if p.status == PaymentStatus.PENDING), None)


def cancel_booking(db: Session, booking: Booking) -> None:
    if booking.status == BookingStatus.CANCELLED:
        return
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise BookingError(
            "This booking is paid, so it can't be cancelled here. Contact us about a refund.", 409
        )
    if waiting_payment(booking.bill):
        raise BookingError("A payment is still in progress. Wait for it to finish, then try again.", 409)
    void_bill(db, booking.bill)
    booking.status = BookingStatus.CANCELLED
    booking.hold_until = None
    db.commit()


def start_booking(db: Session, tenant: User, room_type_id: str) -> Booking:
    """Creates the booking and its deposit bill, or returns the one already waiting for this room."""
    open_bookings = db.scalars(
        bookings_query().where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(
                [BookingStatus.PENDING_PAYMENT, BookingStatus.AWAITING_ALLOCATION, BookingStatus.ALLOCATED]
            ),
        )
    ).all()
    for existing in open_bookings:
        if existing.status == BookingStatus.ALLOCATED:
            raise BookingError(
                f"You already have a room at {existing.building_name}. Contact us to change it.",
                409,
            )
        if existing.status == BookingStatus.AWAITING_ALLOCATION:
            raise BookingError(
                f"You've already booked a {existing.room_name} at {existing.building_name}. "
                "Contact us if you'd like to change it.",
                409,
            )
        if existing.room_type_id == room_type_id:
            return existing
        cancel_booking(db, existing)  # changed their mind about an unpaid booking

    # Locked after any cancelling, because cancelling commits and would release the lock.
    room = _locked_room(db, room_type_id)
    if room is None:
        raise BookingError("That residence isn't available.", 404)
    if room.booking_deposit <= 0:
        raise BookingError("Online booking isn't open for this residence yet. Enquire instead.", 409)

    if _free_rooms(db, room) <= 0:
        raise BookingError(
            "This residence has just been fully booked. Have a look at what else is free.", 409
        )
    bill = create_bill(
        db,
        tenant=tenant,
        kind=BillKind.BOOKING_DEPOSIT,
        amount=room.booking_deposit,
        description=f"Refundable booking deposit, {room.name} at {room.building.name}",
        due_date=utcnow().date(),
        room_type=room,
    )
    booking = Booking(
        tenant_id=tenant.id,
        room_type_id=room.id,
        room_name=room.name,
        building_name=room.building.name,
        location=room.building.location,
        bill=bill,
        hold_until=utcnow() + HOLD,
    )
    db.add(booking)
    db.commit()
    return booking


def start_payment(
    db: Session, booking: Booking, gateway: PaymentGateway, *, tenant: User, phone: str, network: MomoNetwork
) -> Payment:
    """Sends the Mobile Money prompt. The payment is saved first, so a fast webhook always finds it."""
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise BookingError("This booking doesn't need paying.", 409)
    refresh_booking(db, booking, gateway)
    if booking.status != BookingStatus.PENDING_PAYMENT:
        return booking.bill.payments[-1]
    abandon_otp(db, booking.bill)
    if waiting_payment(booking.bill):
        raise BookingError("A payment is already waiting. Approve the prompt on your phone.", 409)

    room = _locked_room(db, booking.room_type_id)
    if room is None or _free_rooms(db, room, exclude=booking.id) <= 0:
        raise BookingError(
            "This residence has just been fully booked. Have a look at what else is free.", 409
        )
    booking.hold_until = utcnow() + HOLD
    return charge_bill(db, booking.bill, gateway, tenant=tenant, phone=phone, network=network)


def charge_bill(
    db: Session, bill: Bill, gateway: PaymentGateway, *, tenant: User, phone: str, network: MomoNetwork
) -> Payment:
    """Sends a Mobile Money prompt for what's left on a bill. Saved first, so a fast webhook finds it."""
    payment = record_payment(
        db,
        bill,
        amount=balance(bill),
        method=gateway.method,
        reference=f"altheo-{uuid4().hex}",
        status=PaymentStatus.PENDING,
    )
    payment.momo_phone = phone
    payment.momo_network = network
    db.commit()

    try:
        result = gateway.charge_momo(
            email=tenant.email,
            amount=payment.amount,
            phone=phone,
            network=network,
            reference=payment.reference,
        )
    except GatewayError as e:
        fail_payment(db, payment, str(e))
        raise BookingError(str(e), 502) from e
    _apply(db, payment, result)
    return payment


def submit_otp(db: Session, bill: Bill, gateway: PaymentGateway, *, tenant: User, code: str) -> None:
    """Repeats the charge with the SMS code, under the same reference, which sends the prompt."""
    payment = waiting_payment(bill)
    if payment is None or not payment.otp_required:
        raise BookingError("There's no code waiting to be entered.", 409)
    try:
        result = gateway.charge_momo(
            email=tenant.email,
            amount=payment.amount,
            phone=payment.momo_phone,
            network=payment.momo_network,
            reference=payment.reference,
            otp=code,
        )
    except GatewayError as e:
        raise BookingError(str(e), 502) from e
    _apply(db, payment, result)


def abandon_otp(db: Session, bill: Bill) -> None:
    """Lets a tenant start again with another number. Safe: no prompt goes out until the code is accepted."""
    payment = waiting_payment(bill)
    if payment is not None and payment.otp_required:
        fail_payment(db, payment, "Replaced by a new payment.")


def _apply(db: Session, payment: Payment, result: ChargeResult) -> None:
    if result.status == ChargeStatus.OTP_REQUIRED:
        payment.otp_required = True
        payment.note = (result.message or "")[:200] or None
        db.commit()
        return
    if result.status == ChargeStatus.PENDING and payment.otp_required:
        payment.otp_required = False
        payment.note = None
        payment.prompted_at = utcnow()
    if result.status == ChargeStatus.SUCCESS:
        confirm_payment(db, payment.reference, amount_cedis=result.amount_cedis, currency=result.currency)
    elif result.status == ChargeStatus.FAILED:
        fail_payment(db, payment, result.message or "The payment didn't go through. Try again.")
    else:
        if result.message:
            payment.note = result.message[:200]
        db.commit()


def fail_payment(db: Session, payment: Payment, message: str) -> None:
    payment.note = message[:200]
    mark_payment(db, payment.reference, PaymentStatus.FAILED)
    db.commit()


def confirm_payment(
    db: Session, reference: str, *, amount_cedis: float | None, currency: str | None
) -> Booking | None:
    """The provider says this payment succeeded. Safe to repeat; used by the webhook and by verifying."""
    payment = db.scalar(select(Payment).where(Payment.reference == reference))
    if payment is None:
        logger.warning("Payment confirmed for an unknown reference: %s", reference)
        return None
    booking = db.scalar(bookings_query().where(Booking.bill_id == payment.bill_id))
    if payment.status == PaymentStatus.SUCCESS:
        return booking
    if currency != "GHS" or amount_cedis != payment.amount:
        # Never mark money as received unless it's the right money. Left pending for a person to look at.
        logger.error(
            "Payment %s confirmed with %s %s, expected GHS %s",
            reference,
            currency,
            amount_cedis,
            payment.amount,
        )
        return booking

    bill = payment.bill
    # The money is real even if we'd given up waiting or the booking was cancelled.
    bill.voided_at = None
    payment.status = PaymentStatus.PENDING
    try:
        mark_payment(db, reference, PaymentStatus.SUCCESS)
    except BillingError:
        logger.error("Payment %s succeeded on a bill that was already paid: refund needed", reference)
        payment.status = PaymentStatus.FAILED
        payment.note = "Paid twice: this payment needs refunding."
        db.commit()
        return booking
    if booking is not None and booking.status in (BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED):
        booking.status = BookingStatus.AWAITING_ALLOCATION
        booking.paid_at = payment.paid_at
        booking.hold_until = None
    db.commit()
    return booking


def refresh_booking(db: Session, booking: Booking, gateway: PaymentGateway | None) -> None:
    refresh_bill(db, booking.bill, gateway)


def refresh_bill(db: Session, bill: Bill, gateway: PaymentGateway | None) -> None:
    """Checks a payment in progress with the provider, in case its webhook is late or can't reach us."""
    payment = waiting_payment(bill)
    if payment is None or gateway is None:
        return
    if payment.otp_required:
        # Nothing has been sent to the phone yet, so there's nothing to ask the provider about.
        if utcnow() - payment.created_at > PAYMENT_WINDOW:
            fail_payment(db, payment, OTP_TIMED_OUT)
        return
    try:
        result = gateway.verify(payment.reference)
    except GatewayError:
        return  # try again on the next check
    if result.status == ChargeStatus.PENDING:
        # Pretend payments wait for the test buttons, however long that takes.
        started = payment.prompted_at or payment.created_at
        if not gateway.simulated and utcnow() - started > PAYMENT_WINDOW:
            fail_payment(db, payment, TIMED_OUT)
        return
    _apply(db, payment, result)


def settle_from_provider(db: Session, reference: str, gateway: PaymentGateway) -> None:
    """A callback says something happened to this payment, so ask the provider what. Safe to repeat."""
    payment = db.scalar(select(Payment).where(Payment.reference == reference))
    if payment is None:
        logger.warning("Callback for an unknown payment reference: %s", reference)
        return
    if payment.status == PaymentStatus.SUCCESS or payment.otp_required:
        return
    result = gateway.verify(reference)
    # A payment we'd given up on still counts if the money arrived, but nothing else changes it.
    if result.status == ChargeStatus.SUCCESS or payment.status == PaymentStatus.PENDING:
        _apply(db, payment, result)
