"""Monthly sanitation bills (#16), which follow the day each tenant moves in.

- The move-in date is the one the admin set, otherwise the day the tenant signed their agreement.
  Until there is one, nothing is billed.
- Each bill is the full fee for a month starting on that day of the month, so nobody pays for part of a
  month. Moved in on 15 Nov: the first bill is due 15 Nov, the next 15 Dec. In shorter months, the last day.
- A month's bill appears on the 1st of that month, so tenants can see it coming.
- There's no scheduler: bills are created whenever bills are looked at, catching up on any missed months.
  The unique (tenant, kind, period) rule means this can't bill a month twice.
"""

import calendar
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..billing.service import BillingError, balance, create_bill, current_period, paid_amount
from ..db import utcnow
from ..models import Agreement, Bill, BillKind, PaymentStatus, RoomType, Tenancy
from ..sms.texts import sanitation_bill_created
from .penalties import apply_late_fees, cancel_late_fees_no_longer_owed

MAX_MOVE_IN_AHEAD = timedelta(days=365)


class MoveInError(Exception):
    """A move-in date that can't be used; the message is shown to the admin as is."""


def tenancies_query():
    """People living in a room now, without the agreement's heavy signature images."""
    return (
        select(Tenancy)
        .where(Tenancy.ended_at.is_(None))
        .options(
            selectinload(Tenancy.tenant),
            selectinload(Tenancy.agreement).load_only(Agreement.signed_at),
        )
    )


def move_in_of(tenancy: Tenancy) -> date | None:
    if tenancy.move_in_date:
        return tenancy.move_in_date
    if tenancy.agreement is None:  # allocated before agreements existed
        return tenancy.start_date
    return tenancy.agreement.signed_at.date() if tenancy.agreement.signed_at else None


def due_date(move_in: date, period: str) -> date:
    year, month = int(period[:4]), int(period[5:])
    return date(year, month, min(move_in.day, calendar.monthrange(year, month)[1]))


def _periods(move_in: date, today: date) -> list[str]:
    """Each month from the move-in month up to this one."""
    year, month = move_in.year, move_in.month
    periods = []
    while (year, month) <= (today.year, today.month):
        periods.append(f"{year}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return periods


def _month_name(period: str) -> str:
    return f"{calendar.month_name[int(period[5:])]} {period[:4]}"


def ensure_sanitation_bills(db: Session, *, tenant_id: str | None = None, today: date | None = None) -> None:
    """Creates missing monthly bills and late fees, for one tenant or everyone. Commits if it made any."""
    today = today or utcnow().date()
    query = tenancies_query().where(Tenancy.sanitation_fee > 0)
    if tenant_id:
        query = query.where(Tenancy.tenant_id == tenant_id)
    tenancies = db.scalars(query).all()
    if not tenancies:
        return
    # Cancelled bills count too: that month stays taken.
    rows = db.execute(
        select(Bill.tenant_id, Bill.period).where(
            Bill.kind == BillKind.SANITATION, Bill.tenant_id.in_([t.tenant_id for t in tenancies])
        )
    ).all()
    existing = {(tenant, period) for tenant, period in rows}
    created = False
    for t in tenancies:
        move_in = move_in_of(t)
        if move_in is None:
            continue
        where = f"room {t.room_number} at {t.building_name}"
        for period in _periods(move_in, today):
            if (t.tenant_id, period) in existing:
                continue
            try:
                with db.begin_nested():
                    bill = create_bill(
                        db,
                        tenant=t.tenant,
                        kind=BillKind.SANITATION,
                        amount=t.sanitation_fee,
                        description=f"Sanitation fee, {_month_name(period)}, {where}",
                        due_date=due_date(move_in, period),
                        period=period,
                        room_type=db.get(RoomType, t.room_type_id) if t.room_type_id else None,
                    )
                    # Only this month's bill is news; catching up on earlier months isn't texted.
                    if period == current_period(today):
                        sanitation_bill_created(db, bill)
                created = True
            except IntegrityError, BillingError:
                continue  # someone looking at the same moment created it first
    if apply_late_fees(db, [t.tenant_id for t in tenancies], today):
        created = True
    if created:
        db.commit()


def set_move_in(db: Session, tenancy: Tenancy, move_in: date, *, today: date | None = None) -> None:
    """The admin sets the date. Bills still owed move to the new day; months before it are no longer owed."""
    today = today or utcnow().date()
    if move_in < tenancy.start_date:
        raise MoveInError("The move-in date can't be before the room was allocated.")
    if move_in > today + MAX_MOVE_IN_AHEAD:
        raise MoveInError("The move-in date must be within the next year.")
    first = current_period(move_in)
    bills = db.scalars(
        select(Bill)
        .where(Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.SANITATION)
        .options(selectinload(Bill.payments))
        .with_for_update()
    ).all()
    for bill in bills:
        if bill.period >= first:
            continue
        if paid_amount(bill) > 0:
            raise MoveInError(
                f"{_month_name(bill.period)} has been paid, so the move-in date can't be after that month."
            )
        if any(p.status == PaymentStatus.PENDING for p in bill.payments):
            raise MoveInError(
                f"A payment for {_month_name(bill.period)} is still waiting. Try again shortly."
            )
    now = utcnow()
    for bill in bills:
        if bill.period < first:
            bill.voided_at = bill.voided_at or now
            continue
        # Only moving the date cancels these bills, so one cancelled earlier is owed again if it moves back.
        bill.voided_at = None
        if balance(bill) > 0:
            bill.due_date = due_date(move_in, bill.period)
    tenancy.move_in_date = move_in
    db.flush()
    cancel_late_fees_no_longer_owed(db, tenancy.tenant_id, today)
    db.commit()
    ensure_sanitation_bills(db, tenant_id=tenancy.tenant_id, today=today)
