"""Bills and payments (#19): what each tenant owes, what they've paid, and whether they're fully compliant.

Rules:
- A bill's amount is copied when it's created, so later price changes never alter what someone owes.
- A bill's status is worked out from its successful payments, never stored:
  paid in full -> Paid, something paid -> Partial, nothing yet -> Unpaid. Voided bills are ignored.
- Every payment has a unique reference (Paystack's, or one made up for cash/bank), so recording the
  same payment twice is harmless.
- A tenant is fully compliant for a month only when their booking deposit, renting deposit and that
  month's sanitation bill are all Paid. A bill that doesn't exist yet counts as not cleared.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import utcnow
from ..models import Bill, BillKind, Payment, PaymentMethod, PaymentStatus, RoomType, User
from ..sms.texts import payment_received

PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
# Bills that are for a particular month: one of each per tenant per month.
MONTHLY_KINDS = {BillKind.SANITATION: "sanitation bill", BillKind.LATE_FEE: "late fee"}
# What "fully compliant" looks at. Late fees are charged on top and don't count.
COMPLIANCE_KINDS = (BillKind.BOOKING_DEPOSIT, BillKind.RENTING_DEPOSIT, BillKind.SANITATION)


class BillStatus(StrEnum):
    PAID = "paid"
    PARTIAL = "partial"
    UNPAID = "unpaid"


class BillingError(ValueError):
    """Something about a bill or payment that isn't allowed; the message is shown to people as is."""


def current_period(today: date | None = None) -> str:
    """This month as "YYYY-MM" (Ghana is on UTC all year)."""
    return (today or utcnow().date()).strftime("%Y-%m")


def paid_amount(bill: Bill) -> int:
    return sum(p.amount for p in bill.payments if p.status == PaymentStatus.SUCCESS)


def balance(bill: Bill) -> int:
    return max(bill.amount - paid_amount(bill), 0)


def bill_status(bill: Bill) -> BillStatus:
    paid = paid_amount(bill)
    if paid >= bill.amount:
        return BillStatus.PAID
    return BillStatus.PARTIAL if paid > 0 else BillStatus.UNPAID


def create_bill(
    db: Session,
    *,
    tenant: User,
    kind: BillKind,
    amount: int,
    description: str,
    due_date: date,
    period: str | None = None,
    room_type: RoomType | None = None,
) -> Bill:
    """Adds a bill (not committed). Monthly bills need a period and there's one per tenant per month."""
    if amount <= 0:
        raise BillingError("A bill must be for more than GH₵ 0.")
    if kind in MONTHLY_KINDS:
        if period is None or not PERIOD.match(period):
            raise BillingError(f"A {MONTHLY_KINDS[kind]} needs the month it's for, like 2026-11.")
        # Cancelled bills count too: the month stays taken so it can't be billed twice by mistake.
        taken = db.scalar(
            select(Bill.id).where(Bill.tenant_id == tenant.id, Bill.kind == kind, Bill.period == period)
        )
        if taken is not None:
            raise BillingError(f"This tenant already has a {MONTHLY_KINDS[kind]} for {period}.")
    elif period is not None:
        raise BillingError("Only sanitation bills and late fees are for a month.")
    bill = Bill(
        tenant_id=tenant.id,
        kind=kind,
        amount=amount,
        description=description,
        due_date=due_date,
        period=period,
        room_type_id=room_type.id if room_type else None,
    )
    bill.payments = []
    db.add(bill)
    db.flush()
    return bill


def _payment(db: Session, reference: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.reference == reference))


def _check_room_for(bill: Bill, amount: int) -> None:
    owed = balance(bill)
    if amount > owed:
        raise BillingError(f"That's more than the GH₵ {owed:,} still owed on this bill.")


def record_payment(
    db: Session,
    bill: Bill,
    *,
    amount: int,
    method: PaymentMethod,
    reference: str,
    status: PaymentStatus = PaymentStatus.SUCCESS,
    recorded_by: User | None = None,
    note: str | None = None,
    paid_at: datetime | None = None,
) -> Payment:
    """Adds a payment to a bill (not committed). Recording the same reference again returns the first one."""
    existing = _payment(db, reference)
    if existing is not None:
        if existing.bill_id != bill.id or existing.amount != amount:
            raise BillingError("That payment reference has already been used.")
        return existing
    if bill.voided_at is not None:
        raise BillingError("This bill was cancelled, so it can't be paid.")
    if amount <= 0:
        raise BillingError("A payment must be more than GH₵ 0.")
    if status == PaymentStatus.SUCCESS:
        _check_room_for(bill, amount)
    payment = Payment(
        bill=bill,
        amount=amount,
        method=method,
        status=status,
        reference=reference,
        recorded_by_id=recorded_by.id if recorded_by else None,
        note=note,
        paid_at=(paid_at or utcnow()) if status == PaymentStatus.SUCCESS else None,
    )
    db.add(payment)
    db.flush()
    if status == PaymentStatus.SUCCESS:
        payment_received(db, payment)
    return payment


def mark_payment(db: Session, reference: str, status: PaymentStatus) -> Payment:
    """Settles a pending payment, e.g. when Paystack confirms or fails it (#14). Repeating it is harmless."""
    payment = _payment(db, reference)
    if payment is None:
        raise BillingError("There's no payment with that reference.")
    if payment.status == status:
        return payment
    if payment.status != PaymentStatus.PENDING:
        raise BillingError(f"That payment is already {payment.status.value}.")
    if status == PaymentStatus.SUCCESS:
        _check_room_for(payment.bill, payment.amount)
        payment.paid_at = utcnow()
    payment.status = status
    db.flush()
    if status == PaymentStatus.SUCCESS:
        payment_received(db, payment)
    return payment


def void_bill(db: Session, bill: Bill) -> None:
    """Cancels a bill that has nothing paid on it; it stays on record but is ignored."""
    if paid_amount(bill) > 0:
        raise BillingError("Money has been paid on this bill, so it can't be cancelled. Refund it instead.")
    bill.voided_at = bill.voided_at or utcnow()
    db.flush()


def close_bill(db: Session, bill: Bill) -> None:
    """Stops a bill at what has been paid, when the rest is no longer owed (e.g. at move-out, #26).

    Nothing paid: it's cancelled. Something paid: its amount comes down to that, so it reads as Paid.
    """
    paid = paid_amount(bill)
    if paid == 0:
        void_bill(db, bill)
    elif paid < bill.amount:
        bill.amount = paid
        db.flush()


def bills_query():
    """Live (not cancelled) bills with what's needed to show them, newest first."""
    return (
        select(Bill)
        .where(Bill.voided_at.is_(None))
        .options(
            selectinload(Bill.payments),
            selectinload(Bill.tenant),
            selectinload(Bill.room_type).selectinload(RoomType.building),
        )
        .order_by(Bill.created_at.desc(), Bill.id.desc())
    )


@dataclass
class FeeState:
    kind: BillKind
    status: BillStatus
    bill: Bill | None


@dataclass
class Compliance:
    period: str
    fees: list[FeeState]

    @property
    def fully_compliant(self) -> bool:
        return all(f.bill is not None and f.status == BillStatus.PAID for f in self.fees)


def tenant_compliance(db: Session, tenant_id: str, period: str) -> Compliance:
    """Each fee type's state for the month: the latest deposit bills and that month's sanitation bill."""
    if not PERIOD.match(period):
        raise BillingError("Give the month like 2026-11.")
    bills = db.scalars(bills_query().where(Bill.tenant_id == tenant_id)).all()

    def latest(kind: BillKind) -> Bill | None:
        matching = [
            b for b in bills if b.kind == kind and (kind != BillKind.SANITATION or b.period == period)
        ]
        return matching[0] if matching else None

    fees = []
    for kind in COMPLIANCE_KINDS:
        bill = latest(kind)
        fees.append(FeeState(kind=kind, status=bill_status(bill) if bill else BillStatus.UNPAID, bill=bill))
    return Compliance(period=period, fees=fees)
