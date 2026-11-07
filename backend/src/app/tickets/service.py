"""Repair and issue reports (#17, #21).

- Only a tenant living in a room can report, and the report is tied to that room.
- If the admin has chosen the ticket freeze (#25), a tenant with overdue sanitation bills or unpaid late
  fees can't report until they've paid.
- Admins can move a report to any status at any time; the tenant's page shows it on its next check.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import utcnow
from ..models import Tenancy, Ticket, TicketCategory, TicketStatus, User
from ..sanitation.penalties import tickets_frozen
from ..sanitation.service import ensure_sanitation_bills

FROZEN = (
    "New reports are paused until your overdue sanitation bills are paid. "
    "For anything urgent, contact us directly."
)
NO_ROOM = "You can report issues once you've been given a room."


class TicketError(Exception):
    """A report that can't be made; the message is shown to the tenant as is."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def tickets_query():
    return select(Ticket).options(selectinload(Ticket.tenant)).order_by(Ticket.created_at.desc())


def current_tenancy(db: Session, tenant_id: str) -> Tenancy | None:
    return db.scalar(
        select(Tenancy)
        .where(Tenancy.tenant_id == tenant_id, Tenancy.ended_at.is_(None))
        .order_by(Tenancy.created_at.desc())
    )


def report_block(db: Session, tenant: User) -> str | None:
    """Why this tenant can't report an issue right now; None when they can."""
    if current_tenancy(db, tenant.id) is None:
        return NO_ROOM
    ensure_sanitation_bills(db, tenant_id=tenant.id)
    return FROZEN if tickets_frozen(db, tenant.id) else None


def report(db: Session, tenant: User, *, category: TicketCategory, description: str) -> Ticket:
    reason = report_block(db, tenant)
    if reason:
        raise TicketError(reason, 403 if reason == FROZEN else 409)
    tenancy = current_tenancy(db, tenant.id)
    ticket = Ticket(
        tenant=tenant,
        tenancy_id=tenancy.id,
        category=category,
        description=description,
        status=TicketStatus.PENDING,
        room_number=tenancy.room_number,
        building_name=tenancy.building_name,
    )
    db.add(ticket)
    db.commit()
    return ticket


def set_status(db: Session, ticket: Ticket, status: TicketStatus) -> None:
    if ticket.status != status:
        ticket.status = status
        ticket.updated_at = utcnow()
        db.commit()
