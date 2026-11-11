"""Move-out (#26): a tenant leaves their room, deductions come off their deposits, and the room is freed.

It all happens in one transaction when the admin confirms:
- the deposits actually paid (booking + renting) are what's held;
- each deduction is either damage (just a reason and an amount) or arrears on one of the tenant's unpaid
  bills, which is then paid from the deposit (method "deposit", not counted as new money);
- what's no longer owed stops: unpaid parts of the deposit bills, and sanitation bills (and their late
  fees) for months starting after the move-out day;
- the tenancy ends, the booking becomes "moved out", and the room type gets 1 back in `quantity_available`.
The refund (held minus deductions) is paid back by hand; the admin records it afterwards.
"""

from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..billing.service import balance, close_bill, paid_amount, record_payment
from ..db import utcnow
from ..models import (
    Bill,
    BillKind,
    Booking,
    BookingStatus,
    MoveOut,
    MoveOutDeduction,
    PaymentMethod,
    PaymentStatus,
    RoomType,
    Tenancy,
    User,
)
from ..sanitation.service import ensure_sanitation_bills

DEPOSIT_KINDS = (BillKind.BOOKING_DEPOSIT, BillKind.RENTING_DEPOSIT)
REFUND_METHODS = {"cash": "Cash", "bank": "Bank transfer", "momo": "Mobile Money"}


class MoveOutError(Exception):
    """A move-out that can't go ahead; the message is shown to the admin as is."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class Deduction:
    reason: str
    amount: int
    bill_id: int | None = None


def tenancy_query():
    return select(Tenancy).options(
        selectinload(Tenancy.tenant),
        selectinload(Tenancy.renting_bill).selectinload(Bill.payments),
        selectinload(Tenancy.booking).selectinload(Booking.bill).selectinload(Bill.payments),
    )


def deposit_bills(tenancy: Tenancy) -> list[Bill]:
    return [b for b in (tenancy.booking.bill, tenancy.renting_bill) if b.voided_at is None]


def deposits_held(tenancy: Tenancy) -> int:
    return sum(paid_amount(b) for b in deposit_bills(tenancy))


def tenant_bills(db: Session, tenant_id: str) -> list[Bill]:
    """All their live bills. Call `ensure_sanitation_bills` first (it commits, so not under a lock)."""
    return list(
        db.scalars(
            select(Bill)
            .where(Bill.tenant_id == tenant_id, Bill.voided_at.is_(None))
            .options(selectinload(Bill.payments))
            .order_by(Bill.due_date, Bill.id)
        ).all()
    )


def arrears(bills: list[Bill]) -> list[Bill]:
    """Unpaid bills a deduction can settle. Deposits aren't among them: they're what pays."""
    return [b for b in bills if b.kind not in DEPOSIT_KINDS and balance(b) > 0]


def pending_payment(bills: list[Bill]) -> bool:
    return any(p.status == PaymentStatus.PENDING for b in bills for p in b.payments)


def move_out(
    db: Session,
    tenancy_id: str,
    *,
    moved_out_on,
    deductions: list[Deduction],
    note: str | None,
    admin: User,
) -> MoveOut:
    tenant_id = db.scalar(select(Tenancy.tenant_id).where(Tenancy.id == tenancy_id))
    if tenant_id:
        ensure_sanitation_bills(db, tenant_id=tenant_id)
    tenancy = db.scalar(tenancy_query().where(Tenancy.id == tenancy_id).with_for_update(of=Tenancy))
    if tenancy is None:
        raise MoveOutError("That tenancy doesn't exist.", 404)
    if tenancy.ended_at is not None:
        raise MoveOutError(f"{tenancy.tenant.name} has already moved out.")
    today = utcnow().date()
    if moved_out_on > today:
        raise MoveOutError("The move-out day can't be in the future. Do it on the day they leave.", 422)
    if moved_out_on < tenancy.start_date:
        raise MoveOutError("The move-out day can't be before the room was allocated.", 422)

    bills = tenant_bills(db, tenancy.tenant_id)
    if pending_payment(bills):
        raise MoveOutError("A payment from this tenant is still waiting. Try again once it has finished.")

    held = deposits_held(tenancy)
    total = sum(d.amount for d in deductions)
    if any(d.amount <= 0 for d in deductions):
        raise MoveOutError("Each deduction must be more than GH₵ 0.", 422)
    if total > held:
        raise MoveOutError(f"The deductions come to more than the GH₵ {held:,} held in deposits.", 422)
    owed = {b.id: b for b in arrears(bills)}
    seen: set[int] = set()
    for d in deductions:
        if d.bill_id is None:
            continue
        bill = owed.get(d.bill_id)
        if bill is None or d.bill_id in seen:
            raise MoveOutError("One of the bills can't be paid from the deposit. Reload and try again.", 422)
        if d.amount > balance(bill):
            raise MoveOutError(f"That's more than the GH₵ {balance(bill):,} owed on {bill.number}.", 422)
        seen.add(d.bill_id)

    record = MoveOut(
        tenancy_id=tenancy.id,
        tenant_id=tenancy.tenant_id,
        moved_out_on=moved_out_on,
        deposits_held=held,
        deductions_total=total,
        refund_due=held - total,
        note=note,
        created_by_id=admin.id,
        deductions=[
            MoveOutDeduction(reason=d.reason, amount=d.amount, bill_id=d.bill_id) for d in deductions
        ],
    )
    db.add(record)
    db.flush()
    for d in deductions:
        if d.bill_id is not None:
            record_payment(
                db,
                owed[d.bill_id],
                amount=d.amount,
                method=PaymentMethod.DEPOSIT,
                reference=f"deposit-{record.id}-{d.bill_id}",
                recorded_by=admin,
                note="Taken from the deposit at move-out",
            )

    for bill in deposit_bills(tenancy):
        close_bill(db, bill)
    later = {b.period for b in bills if b.kind == BillKind.SANITATION and b.due_date > moved_out_on}
    for bill in bills:
        if bill.kind in (BillKind.SANITATION, BillKind.LATE_FEE) and bill.period in later:
            close_bill(db, bill)

    tenancy.ended_at = datetime.combine(moved_out_on, time())
    tenancy.booking.status = BookingStatus.MOVED_OUT
    if tenancy.room_type_id:
        room = db.scalar(select(RoomType).where(RoomType.id == tenancy.room_type_id).with_for_update())
        if room is not None:
            room.quantity_available += 1
    db.commit()
    return record


def mark_refunded(db: Session, record: MoveOut, *, method: str, reference: str | None) -> MoveOut:
    if record.refunded_at is not None:
        raise MoveOutError("This refund has already been recorded.")
    if record.refund_due <= 0:
        raise MoveOutError("There's nothing to refund: the deductions took the whole deposit.")
    if method not in REFUND_METHODS:
        raise MoveOutError("Choose how the refund was paid.", 422)
    record.refunded_at = utcnow()
    record.refund_method = method
    record.refund_reference = reference or None
    db.commit()
    return record
