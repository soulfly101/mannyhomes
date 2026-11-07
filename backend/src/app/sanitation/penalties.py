"""Optional penalties for overdue sanitation bills (#25), which the admin switches on or off.

- Off: no late fees and no restrictions. Late fees already charged stay on the tenant's account.
- On: a flat late fee, a freeze on new repair tickets until cleared, or both.
- A bill is overdue the day after its due date. Each overdue month gets one late fee, as its own bill with
  the amount copied, and only bills due on or after the day penalties were switched on can get one, so
  turning them on never charges anyone for old debts.
- Late fees don't count towards `tenant_compliance`, which stays as the deposits and the month's bill.
- Like the monthly bills, there's no scheduler: `ensure_sanitation_bills` adds late fees when bills are read.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..billing.service import BillingError, balance, bills_query, create_bill
from ..db import utcnow
from ..models import Bill, BillKind, PaymentStatus, PenaltySettings

SETTINGS_ID = 1


class PenaltyError(Exception):
    """Settings that can't be saved; the message is shown to the admin as is."""


def penalty_settings(db: Session) -> PenaltySettings:
    """The saved settings, or switched off if the admin has never saved any (not added to the session)."""
    return db.get(PenaltySettings, SETTINGS_ID) or PenaltySettings(
        id=SETTINGS_ID, enabled=False, enabled_on=None, late_fee=0, freeze_tickets=False
    )


def save_penalty_settings(
    db: Session, *, enabled: bool, late_fee: int, freeze_tickets: bool, today: date | None = None
) -> PenaltySettings:
    if enabled and late_fee <= 0 and not freeze_tickets:
        raise PenaltyError("Set a late fee or freeze repair tickets, or switch penalties off.")
    row = db.get(PenaltySettings, SETTINGS_ID, with_for_update=True)
    if row is None:
        row = PenaltySettings(id=SETTINGS_ID, enabled=False)
        db.add(row)
    if enabled and not row.enabled:
        row.enabled_on = today or utcnow().date()
    if not enabled:
        row.enabled_on = None
    row.enabled = enabled
    row.late_fee = late_fee
    row.freeze_tickets = freeze_tickets
    db.commit()
    return row


def apply_late_fees(db: Session, tenant_ids: list[str], today: date) -> bool:
    """Adds any late fees that are missing, not committed. True if it added one."""
    settings = penalty_settings(db)
    if not settings.enabled or settings.late_fee <= 0 or not tenant_ids:
        return False
    overdue = db.scalars(
        select(Bill)
        .where(
            Bill.kind == BillKind.SANITATION,
            Bill.voided_at.is_(None),
            Bill.tenant_id.in_(tenant_ids),
            Bill.due_date >= settings.enabled_on,
            Bill.due_date < today,
        )
        .options(selectinload(Bill.payments), selectinload(Bill.tenant), selectinload(Bill.room_type))
    ).all()
    # Cancelled late fees count too: that month's fee isn't charged again.
    rows = db.execute(
        select(Bill.tenant_id, Bill.period).where(
            Bill.kind == BillKind.LATE_FEE, Bill.tenant_id.in_(tenant_ids)
        )
    ).all()
    charged = {(tenant, period) for tenant, period in rows}
    created = False
    for bill in overdue:
        if balance(bill) <= 0 or (bill.tenant_id, bill.period) in charged:
            continue
        # A prompt on their phone may be about to clear it; the next look decides.
        if any(p.status == PaymentStatus.PENDING for p in bill.payments):
            continue
        try:
            with db.begin_nested():
                create_bill(
                    db,
                    tenant=bill.tenant,
                    kind=BillKind.LATE_FEE,
                    amount=settings.late_fee,
                    description=f"Late fee: {bill.description}"[:200],
                    due_date=today,
                    period=bill.period,
                    room_type=bill.room_type,
                )
            created = True
        except IntegrityError, BillingError:
            continue  # someone looking at the same moment created it first
    return created


def cancel_late_fees_no_longer_owed(db: Session, tenant_id: str, today: date) -> None:
    """After a move-in date change: drops unpaid late fees whose month is cancelled or no longer overdue."""
    months = db.scalars(
        select(Bill).where(Bill.tenant_id == tenant_id, Bill.kind == BillKind.SANITATION)
    ).all()
    late = {b.period for b in months if b.voided_at is None and b.due_date < today}
    fees = db.scalars(
        select(Bill)
        .where(Bill.tenant_id == tenant_id, Bill.kind == BillKind.LATE_FEE, Bill.voided_at.is_(None))
        .options(selectinload(Bill.payments))
    ).all()
    for fee in fees:
        untouched = balance(fee) == fee.amount and not any(
            p.status == PaymentStatus.PENDING for p in fee.payments
        )
        if fee.period not in late and untouched:
            fee.voided_at = utcnow()


def tickets_frozen(db: Session, tenant_id: str, today: date | None = None) -> bool:
    """Whether this tenant is barred from new repair tickets. Call `ensure_sanitation_bills` first."""
    settings = penalty_settings(db)
    if not settings.enabled or not settings.freeze_tickets:
        return False
    today = today or utcnow().date()
    bills = db.scalars(
        bills_query().where(
            Bill.tenant_id == tenant_id, Bill.kind.in_([BillKind.SANITATION, BillKind.LATE_FEE])
        )
    ).all()
    return any(balance(b) > 0 and (b.kind == BillKind.LATE_FEE or b.due_date < today) for b in bills)
