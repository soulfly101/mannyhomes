"""Allocating rooms (#18): the admin gives a tenant who has paid their booking deposit a specific room.

It all happens in one transaction: availability goes down by one, the renting deposit is billed, and the
tenancy starts with the rent and sanitation fee copied.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..billing.service import create_bill
from ..db import utcnow
from ..models import Bill, BillKind, Booking, BookingStatus, Building, RoomType, Tenancy, User

RENTING_DEPOSIT_DUE = timedelta(days=7)


class AllocationError(Exception):
    """An allocation that can't go ahead; the message is shown to the admin as is."""

    def __init__(self, message: str, status_code: int = 409, field: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.field = field


def queue_query():
    """Paid bookings waiting for a room, longest wait first."""
    return (
        select(Booking)
        .where(Booking.status == BookingStatus.AWAITING_ALLOCATION)
        .options(
            selectinload(Booking.tenant),
            selectinload(Booking.bill).selectinload(Bill.payments),
            selectinload(Booking.room_type).selectinload(RoomType.building),
        )
        .order_by(Booking.paid_at, Booking.created_at)
    )


def taken_rooms(db: Session, building_id: str) -> list[str]:
    """Rooms in this building with someone living in them."""
    rooms = db.scalars(
        select(Tenancy.room_number).where(Tenancy.building_id == building_id, Tenancy.ended_at.is_(None))
    ).all()
    return sorted(rooms, key=str.casefold)


def blocked_reason(room: RoomType | None) -> str | None:
    """Why this booking can't be allocated yet, in words the admin can act on."""
    if room is None:
        return "This room type has been deleted. Refund the deposit or add it back first."
    if room.renting_deposit <= 0:
        return f"Set the renting deposit for {room.name} at {room.building.name} first."
    if room.quantity_available <= 0:
        return (
            f"{room.building.name} has no {room.name} rooms left. Raise the number available if one is free."
        )
    return None


def allocate(db: Session, booking_id: str, room_number: str, admin: User) -> Tenancy:
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(selectinload(Booking.tenant), selectinload(Booking.tenancy))
        .with_for_update(of=Booking)
    )
    if booking is None:
        raise AllocationError("That booking doesn't exist.", 404)
    if booking.status == BookingStatus.ALLOCATED and booking.tenancy:
        raise AllocationError(f"This booking already has room {booking.tenancy.room_number}.")
    if booking.status != BookingStatus.AWAITING_ALLOCATION:
        raise AllocationError("This booking isn't waiting for a room.")

    # Locking the building stops two admins giving out the same room number at the same moment.
    building_id = db.scalar(select(RoomType.building_id).where(RoomType.id == booking.room_type_id))
    building = db.scalar(select(Building).where(Building.id == building_id).with_for_update())
    room = (
        db.scalar(select(RoomType).where(RoomType.id == booking.room_type_id).with_for_update())
        if building
        else None
    )
    reason = blocked_reason(room)
    if reason:
        raise AllocationError(reason)

    taken = db.scalar(
        select(Tenancy.id).where(
            Tenancy.building_id == building.id,
            Tenancy.ended_at.is_(None),
            func.lower(Tenancy.room_number) == room_number.lower(),
        )
    )
    if taken:
        raise AllocationError(
            f"Room {room_number} at {building.name} already has a tenant.", field="room_number"
        )

    today = utcnow().date()
    room.quantity_available -= 1
    bill = create_bill(
        db,
        tenant=booking.tenant,
        kind=BillKind.RENTING_DEPOSIT,
        amount=room.renting_deposit,
        description=f"Renting security deposit, room {room_number} at {building.name}",
        due_date=today + RENTING_DEPOSIT_DUE,
        room_type=room,
    )
    tenancy = Tenancy(
        tenant_id=booking.tenant_id,
        booking=booking,
        room_type_id=room.id,
        building_id=building.id,
        room_name=room.name,
        building_name=building.name,
        location=building.location,
        room_number=room_number,
        rent=room.rent,
        sanitation_fee=room.sanitation_fee,
        renting_bill_id=bill.id,
        start_date=today,
        allocated_by_id=admin.id,
    )
    db.add(tenancy)
    booking.status = BookingStatus.ALLOCATED
    db.commit()
    return tenancy
