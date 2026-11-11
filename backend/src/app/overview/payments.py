"""Who has paid (#20): tenants grouped as Paid / Partly paid / Nothing paid, by building, fee and month.

The tenants counted are those with a room at some point in the month. Each fee is judged on its own bill:
- booking and renting deposit: the bills copied for that tenancy (paid once, so the month only picks who
  was living there);
- sanitation: that month's bill. Someone without one (not moved in yet that month) isn't counted;
- all fees: the three together, as in `tenant_compliance`. Late fees are left out, as they are there.
A status is worked out from successful payments only, the same way as everywhere else.
"""

import calendar
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ..billing.service import BillStatus, balance, bill_status, paid_amount
from ..models import Bill, BillKind, Booking, Building, Tenancy
from ..sanitation.service import ensure_sanitation_bills

Fee = Literal["all", "booking_deposit", "renting_deposit", "sanitation"]

GROUP_LABELS = {
    BillStatus.PAID: "Paid",
    BillStatus.PARTIAL: "Partly paid",
    BillStatus.UNPAID: "Nothing paid",
}
ALL_FEES_LABELS = {
    BillStatus.PAID: "Fully paid",
    BillStatus.PARTIAL: "Still owes something",
    BillStatus.UNPAID: "Nothing paid",
}


class StatusGroup(BaseModel):
    key: BillStatus
    label: str
    count: int
    owed: int


class StatusTenant(BaseModel):
    id: str
    name: str
    room: str
    building: str
    status: BillStatus
    owed: int


class BuildingOption(BaseModel):
    id: str
    name: str


class PaymentStatusOut(BaseModel):
    period: str
    fee: Fee
    building_id: str | None
    groups: list[StatusGroup]
    tenants: list[StatusTenant]
    # Tenants living there that month who have no bill of this kind (e.g. not moved in yet for sanitation).
    not_billed: int
    buildings: list[BuildingOption]


def _live(bill: Bill | None) -> Bill | None:
    return bill if bill is not None and bill.voided_at is None else None


def _combined(bills: list[Bill]) -> BillStatus:
    statuses = [bill_status(b) for b in bills]
    if all(s == BillStatus.PAID for s in statuses):
        return BillStatus.PAID
    return BillStatus.PARTIAL if any(paid_amount(b) > 0 for b in bills) else BillStatus.UNPAID


def payment_status(db: Session, *, period: str, fee: Fee, building_id: str | None) -> PaymentStatusOut:
    ensure_sanitation_bills(db)
    year, month = int(period[:4]), int(period[5:])
    last = date(year, month, calendar.monthrange(year, month)[1])

    query = (
        select(Tenancy)
        .where(
            Tenancy.start_date <= last,
            or_(Tenancy.ended_at.is_(None), Tenancy.ended_at >= datetime(year, month, 1)),
        )
        .options(
            selectinload(Tenancy.tenant),
            selectinload(Tenancy.renting_bill).selectinload(Bill.payments),
            selectinload(Tenancy.booking).selectinload(Booking.bill).selectinload(Bill.payments),
        )
        .order_by(Tenancy.start_date.desc(), Tenancy.created_at.desc())
    )
    if building_id:
        query = query.where(Tenancy.building_id == building_id)
    # One row per tenant: the latest room they had in the month.
    tenancies: dict[str, Tenancy] = {}
    for t in db.scalars(query).all():
        tenancies.setdefault(t.tenant_id, t)

    sanitation = (
        {
            b.tenant_id: b
            for b in db.scalars(
                select(Bill)
                .where(
                    Bill.kind == BillKind.SANITATION,
                    Bill.period == period,
                    Bill.voided_at.is_(None),
                    Bill.tenant_id.in_(list(tenancies)),
                )
                .options(selectinload(Bill.payments))
            ).all()
        }
        if tenancies
        else {}
    )

    rows: list[StatusTenant] = []
    not_billed = 0
    for t in tenancies.values():
        booking = _live(t.booking.bill)
        renting = _live(t.renting_bill)
        monthly = sanitation.get(t.tenant_id)
        chosen = {
            "booking_deposit": [booking],
            "renting_deposit": [renting],
            "sanitation": [monthly],
            "all": [booking, renting, monthly],
        }[fee]
        # No sanitation bill that month means not moved in yet; a deposit is only missing if cancelled.
        bills = [b for b in chosen if b is not None]
        if len(bills) < len(chosen):
            not_billed += 1
            continue
        rows.append(
            StatusTenant(
                id=t.tenant_id,
                name=t.tenant.name,
                room=t.room_number,
                building=t.building_name,
                status=_combined(bills),
                owed=sum(balance(b) for b in bills),
            )
        )

    rows.sort(key=lambda r: (-r.owed, r.name.lower()))
    labels = ALL_FEES_LABELS if fee == "all" else GROUP_LABELS
    groups = [
        StatusGroup(
            key=status,
            label=labels[status],
            count=sum(1 for r in rows if r.status == status),
            owed=sum(r.owed for r in rows if r.status == status),
        )
        for status in (BillStatus.PAID, BillStatus.PARTIAL, BillStatus.UNPAID)
    ]
    buildings = db.execute(select(Building.id, Building.name).order_by(Building.name)).all()
    return PaymentStatusOut(
        period=period,
        fee=fee,
        building_id=building_id,
        groups=groups,
        tenants=rows,
        not_billed=not_billed,
        buildings=[BuildingOption(id=i, name=n) for i, n in buildings],
    )
