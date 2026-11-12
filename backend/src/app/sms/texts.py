"""The automatic texts (#27), queued where each event happens. Each fits one SMS part (see `fit`).

Owner's choice: repair status changes, a new monthly sanitation bill, a reminder the day before it's due,
payments received, and room allocation. No refuse-collection reminders for now.
"""

import calendar
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    Bill,
    BillKind,
    Payment,
    PaymentMethod,
    SmsKind,
    Tenancy,
    Ticket,
    TicketStatus,
)
from .service import first_name, notify, short_date

TICKET_WORDS = {
    TicketStatus.PENDING: "Pending",
    TicketStatus.IN_PROGRESS: "In progress",
    TicketStatus.RESOLVED: "Resolved",
    TicketStatus.CLOSED: "Closed",
}
TICKET_NEXT = {
    TicketStatus.IN_PROGRESS: " We're on it and will be in touch.",
    TicketStatus.RESOLVED: " Tell us in the app if it isn't fixed.",
}
KIND_WORDS = {
    BillKind.BOOKING_DEPOSIT: "booking deposit",
    BillKind.RENTING_DEPOSIT: "renting deposit",
    BillKind.SANITATION: "sanitation bill",
    BillKind.LATE_FEE: "late fee",
}


def ticket_status_changed(db: Session, ticket: Ticket) -> None:
    text = (
        f"Hi {first_name(ticket.tenant)}, your {ticket.category.value} report for room {ticket.room_number} "
        f"is now: {TICKET_WORDS[ticket.status]}.{TICKET_NEXT.get(ticket.status, '')}"
    )
    notify(db, ticket.tenant, SmsKind.TICKET, text)


def room_allocated(db: Session, tenancy: Tenancy) -> None:
    text = (
        f"Hi {first_name(tenancy.tenant)}, room {tenancy.room_number} at {tenancy.building_name} is yours! "
        "Sign your tenancy agreement in the app to continue."
    )
    notify(db, tenancy.tenant, SmsKind.ALLOCATION, text, key=f"allocated:{tenancy.id}")


def payment_received(db: Session, payment: Payment) -> None:
    # Money taken from a deposit at move-out isn't a payment the tenant made.
    if payment.method == PaymentMethod.DEPOSIT:
        return
    bill = payment.bill
    text = (
        f"Hi {first_name(bill.tenant)}, we received GH₵ {payment.amount:,} for your "
        f"{KIND_WORDS[bill.kind]} ({bill.number}). Thank you!"
    )
    notify(db, bill.tenant, SmsKind.PAYMENT, text, key=f"paid:{payment.id}")


def _month(period: str) -> str:
    return calendar.month_name[int(period[5:])]


def sanitation_bill_created(db: Session, bill: Bill) -> None:
    text = (
        f"Hi {first_name(bill.tenant)}, your {_month(bill.period or '')} sanitation bill of "
        f"GH₵ {bill.amount:,} is ready, due {short_date(bill.due_date)}. Pay in the app."
    )
    notify(db, bill.tenant, SmsKind.BILL_NEW, text, key=f"bill_new:{bill.id}")


def queue_due_reminders(db: Session, today: date) -> int:
    """A text the day before each unpaid sanitation bill is due, for tenants still living there."""
    from ..billing.service import balance  # billing queues texts too, so import here

    tomorrow = today + timedelta(days=1)
    active = select(Tenancy.tenant_id).where(Tenancy.ended_at.is_(None))
    bills = db.scalars(
        select(Bill)
        .where(
            Bill.kind == BillKind.SANITATION,
            Bill.voided_at.is_(None),
            Bill.due_date == tomorrow,
            Bill.tenant_id.in_(active),
        )
        .options(selectinload(Bill.payments), selectinload(Bill.tenant))
    ).all()
    queued = 0
    for bill in bills:
        owed = balance(bill)
        if owed <= 0:
            continue
        text = (
            f"Hi {first_name(bill.tenant)}, a reminder: GH₵ {owed:,} for your sanitation bill is due "
            f"tomorrow ({short_date(bill.due_date)}). Pay in the app."
        )
        if notify(db, bill.tenant, SmsKind.BILL_DUE, text, key=f"bill_due:{bill.id}"):
            queued += 1
    db.commit()
    return queued
