"""Public listings (#13): what each building offers and what's available. Rent only for logged-in users."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import optional_user
from ..db import get_session
from ..models import Building, RoomType, User

router = APIRouter(tags=["listings"])

DB = Annotated[Session, Depends(get_session)]
Viewer = Annotated[User | None, Depends(optional_user)]


class ListingRoomType(BaseModel):
    id: str
    name: str
    description: str | None
    quantity_available: int
    # Only for logged-in users; None for visitors.
    rent: int | None
    sanitation_fee: int | None


class Listing(BaseModel):
    id: str
    name: str
    location: str
    description: str | None
    total_available: int
    fully_booked: bool
    room_types: list[ListingRoomType]


class Filters(BaseModel):
    locations: list[str]
    room_types: list[str]


class ListingsOut(BaseModel):
    buildings: list[Listing]
    filters: Filters
    prices_visible: bool


def _room(rt: RoomType, show_prices: bool) -> ListingRoomType:
    return ListingRoomType(
        id=rt.id,
        name=rt.name,
        description=rt.description,
        quantity_available=rt.quantity_available,
        rent=rt.rent if show_prices else None,
        sanitation_fee=rt.sanitation_fee if show_prices else None,
    )


def _listing(b: Building, show_prices: bool, room_type: str | None = None) -> Listing:
    rooms = [rt for rt in b.room_types if room_type is None or rt.name.casefold() == room_type.casefold()]
    total = sum(rt.quantity_available for rt in rooms)
    return Listing(
        id=b.id,
        name=b.name,
        location=b.location,
        description=b.description,
        total_available=total,
        fully_booked=total == 0,
        room_types=[_room(rt, show_prices) for rt in rooms],
    )


def _listed(db: Session) -> list[Building]:
    return list(
        db.scalars(
            select(Building).where(Building.listed.is_(True)).options(selectinload(Building.room_types))
        ).all()
    )


@router.get("")
def list_listings(
    db: DB, viewer: Viewer, location: str | None = None, room_type: str | None = None
) -> ListingsOut:
    """Listed buildings, ones with rooms free first. Filters match whole names, ignoring case."""
    show_prices = viewer is not None
    buildings = _listed(db)
    filters = Filters(
        locations=sorted({b.location for b in buildings}, key=str.casefold),
        room_types=sorted({rt.name for b in buildings for rt in b.room_types}, key=str.casefold),
    )
    location = (location or "").strip() or None
    room_type = (room_type or "").strip() or None
    matches = [
        _listing(b, show_prices, room_type)
        for b in buildings
        if (location is None or b.location.casefold() == location.casefold())
    ]
    if room_type:
        matches = [m for m in matches if m.room_types]
    matches.sort(key=lambda m: (m.fully_booked, m.name.casefold()))
    return ListingsOut(buildings=matches, filters=filters, prices_visible=show_prices)


@router.get("/{building_id}")
def get_listing(building_id: str, db: DB, viewer: Viewer) -> Listing:
    building = db.scalar(
        select(Building)
        .where(Building.id == building_id, Building.listed.is_(True))
        .options(selectinload(Building.room_types))
    )
    if building is None:
        raise HTTPException(status_code=404, detail="That building isn't listed.")
    return _listing(building, viewer is not None)
