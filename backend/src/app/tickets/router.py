"""Tickets API: tenants report issues and follow them (#17); admins see all and set their status (#21)."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..db import get_session
from ..models import Role, Ticket, TicketCategory, TicketStatus, User
from .service import TicketError, report, report_block, set_status, tickets_query

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(require_role(Role.TENANT))]

router = APIRouter(tags=["tickets"])
admin_router = APIRouter(tags=["admin: tickets"], dependencies=[Depends(require_role(Role.ADMIN))])

MIN_DESCRIPTION = 10
MAX_DESCRIPTION = 2000


class TicketOut(BaseModel):
    id: str
    category: TicketCategory
    description: str
    status: TicketStatus
    room_number: str
    building: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, t: Ticket) -> TicketOut:
        return cls(
            id=t.id,
            category=t.category,
            description=t.description,
            status=t.status,
            room_number=t.room_number,
            building=t.building_name,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


class MyTickets(BaseModel):
    tickets: list[TicketOut]
    # Why a new report can't be made right now (no room yet, or paused for overdue bills); None when it can.
    blocked_reason: str | None


@router.get("")
def my_tickets(tenant: Tenant, db: DB) -> MyTickets:
    """The tenant's reports, newest first. Their page asks again every so often to pick up status changes."""
    tickets = db.scalars(tickets_query().where(Ticket.tenant_id == tenant.id)).all()
    return MyTickets(tickets=[TicketOut.of(t) for t in tickets], blocked_reason=report_block(db, tenant))


class TicketIn(BaseModel):
    category: TicketCategory
    description: str

    @field_validator("description")
    @classmethod
    def _description(cls, v: str) -> str:
        v = v.strip()
        if len(v) < MIN_DESCRIPTION:
            raise ValueError("Describe the problem in a few more words.")
        if len(v) > MAX_DESCRIPTION:
            raise ValueError(f"Keep the description under {MAX_DESCRIPTION:,} characters.")
        return v


@router.post("", status_code=201)
def create_ticket(data: TicketIn, tenant: Tenant, db: DB) -> TicketOut:
    try:
        return TicketOut.of(report(db, tenant, category=data.category, description=data.description))
    except TicketError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


class AdminTicketOut(TicketOut):
    tenant_name: str
    tenant_phone: str | None

    @classmethod
    def of(cls, t: Ticket) -> AdminTicketOut:
        return cls(**TicketOut.of(t).model_dump(), tenant_name=t.tenant.name, tenant_phone=t.tenant.phone)


@admin_router.get("")
def all_tickets(db: DB, status: TicketStatus | None = None) -> list[AdminTicketOut]:
    """Every report across all buildings, newest first, optionally with one status."""
    query = tickets_query()
    if status:
        query = query.where(Ticket.status == status)
    return [AdminTicketOut.of(t) for t in db.scalars(query).all()]


class StatusIn(BaseModel):
    status: TicketStatus


@admin_router.patch("/{ticket_id}")
def update_status(ticket_id: str, data: StatusIn, db: DB) -> AdminTicketOut:
    ticket = db.scalar(tickets_query().where(Ticket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status_code=404, detail="That report doesn't exist.")
    set_status(db, ticket, data.status)
    return AdminTicketOut.of(ticket)
