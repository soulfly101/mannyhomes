"""Admin API for the pending allocations queue and giving tenants a room (#18)."""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..db import get_session
from ..models import Booking, Role, User
from .service import AllocationError, allocate, blocked_reason, queue_query, taken_rooms

DB = Annotated[Session, Depends(get_session)]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

router = APIRouter(tags=["admin: allocations"], dependencies=[Depends(require_role(Role.ADMIN))])


class TenantOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None


class PendingAllocation(BaseModel):
    booking_id: str
    tenant: TenantOut
    room: str
    building: str
    location: str
    booking_deposit: int
    paid_at: datetime | None
    # None if the room type has since been deleted.
    rent: int | None
    sanitation_fee: int | None
    renting_deposit: int | None
    rooms_left: int | None
    taken_rooms: list[str]
    # Why it can't be allocated yet; None when it can.
    blocked_reason: str | None

    @classmethod
    def of(cls, db: Session, b: Booking) -> PendingAllocation:
        rt = b.room_type
        return cls(
            booking_id=b.id,
            tenant=TenantOut(id=b.tenant.id, name=b.tenant.name, email=b.tenant.email, phone=b.tenant.phone),
            room=b.room_name,
            building=b.building_name,
            location=b.location,
            booking_deposit=b.bill.amount,
            paid_at=b.paid_at,
            rent=rt.rent if rt else None,
            sanitation_fee=rt.sanitation_fee if rt else None,
            renting_deposit=rt.renting_deposit if rt else None,
            rooms_left=rt.quantity_available if rt else None,
            taken_rooms=taken_rooms(db, rt.building_id) if rt else [],
            blocked_reason=blocked_reason(rt),
        )


@router.get("")
def pending_allocations(db: DB) -> list[PendingAllocation]:
    """Tenants who have paid their booking deposit and are waiting for a room, longest wait first."""
    return [PendingAllocation.of(db, b) for b in db.scalars(queue_query()).all()]


@router.get("/{booking_id}")
def pending_allocation(booking_id: str, db: DB) -> PendingAllocation:
    booking = db.scalar(queue_query().where(Booking.id == booking_id))
    if booking is None:
        raise HTTPException(status_code=404, detail="That booking isn't waiting for a room.")
    return PendingAllocation.of(db, booking)


class AllocateIn(BaseModel):
    room_number: str

    @field_validator("room_number")
    @classmethod
    def _room_number(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Enter the room, like A12.")
        if len(v) > 20:
            raise ValueError("Keep the room under 20 characters.")
        return v


class TenancyOut(BaseModel):
    id: str
    tenant_name: str
    room: str
    building: str
    room_number: str
    start_date: date
    rent: int
    sanitation_fee: int
    renting_deposit: int
    renting_bill_number: str


@router.post("/{booking_id}", status_code=201, response_model=None)
def allocate_room(booking_id: str, data: AllocateIn, admin: Admin, db: DB) -> TenancyOut | JSONResponse:
    """Gives the tenant this room: availability goes down by one, and the renting deposit is billed."""
    try:
        t = allocate(db, booking_id, data.room_number, admin)
    except AllocationError as e:
        db.rollback()
        content: dict = {"detail": str(e)}
        if e.field:
            content["errors"] = {e.field: str(e)}
        return JSONResponse(status_code=e.status_code, content=content)
    return TenancyOut(
        id=t.id,
        tenant_name=t.booking.tenant.name,
        room=t.room_name,
        building=t.building_name,
        room_number=t.room_number,
        start_date=t.start_date,
        rent=t.rent,
        sanitation_fee=t.sanitation_fee,
        renting_deposit=t.renting_bill.amount,
        renting_bill_number=t.renting_bill.number,
    )
