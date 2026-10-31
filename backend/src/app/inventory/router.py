from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import require_role
from ..db import get_session
from ..models import Building, Role, RoomType, User
from .schemas import BuildingIn, BuildingOut, RoomTypeIn

router = APIRouter(tags=["admin: buildings"], dependencies=[Depends(require_role(Role.ADMIN))])

DB = Annotated[Session, Depends(get_session)]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

DUPLICATE_NAME = "A building with that name already exists. Use a different name."


def _get(db: Session, building_id: str) -> Building:
    building = db.scalar(
        select(Building).where(Building.id == building_id).options(selectinload(Building.room_types))
    )
    if building is None:
        raise HTTPException(status_code=404, detail="That building doesn't exist. It may have been deleted.")
    return building


def _name_taken(db: Session, name: str, except_id: str | None = None) -> bool:
    query = select(Building.id).where(func.lower(Building.name) == name.lower())
    if except_id:
        query = query.where(Building.id != except_id)
    return db.scalar(query) is not None


def _apply_room_type(rt: RoomType, data: RoomTypeIn, order: int) -> None:
    rt.name = data.name
    rt.rent = data.rent
    rt.quantity_available = data.quantity_available
    rt.sanitation_fee_override = data.sanitation_fee_override
    rt.description = data.description
    rt.sort_order = order


def _apply_building(b: Building, data: BuildingIn) -> None:
    b.name = data.name
    b.location = data.location
    b.sanitation_fee = data.sanitation_fee
    b.description = data.description
    b.listed = data.listed


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_NAME) from e


@router.get("")
def list_buildings(db: DB) -> list[BuildingOut]:
    buildings = db.scalars(
        select(Building).options(selectinload(Building.room_types)).order_by(Building.name)
    ).all()
    return [BuildingOut.of(b) for b in buildings]


@router.post("", status_code=201)
def create_building(body: BuildingIn, db: DB) -> BuildingOut:
    if _name_taken(db, body.name):
        raise HTTPException(status_code=409, detail=DUPLICATE_NAME)
    building = Building()
    _apply_building(building, body)
    for order, data in enumerate(body.room_types):
        rt = RoomType()
        _apply_room_type(rt, data, order)
        building.room_types.append(rt)
    db.add(building)
    _commit(db)
    return BuildingOut.of(_get(db, building.id))


@router.get("/{building_id}")
def get_building(building_id: str, db: DB) -> BuildingOut:
    return BuildingOut.of(_get(db, building_id))


@router.put("/{building_id}")
def update_building(building_id: str, body: BuildingIn, db: DB) -> BuildingOut:
    """Saves the whole building: room types with an id are updated, new ones added, missing ones removed."""
    building = _get(db, building_id)
    if _name_taken(db, body.name, except_id=building.id):
        raise HTTPException(status_code=409, detail=DUPLICATE_NAME)

    existing = {rt.id: rt for rt in building.room_types}
    unknown = [i for i, rt in enumerate(body.room_types) if rt.id and rt.id not in existing]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail="One of these room types no longer exists. Reload the page and try again.",
        )

    keep = {rt.id for rt in body.room_types if rt.id}
    for rt in list(building.room_types):
        if rt.id not in keep:
            building.room_types.remove(rt)
    db.flush()  # remove first, so a new room type can reuse a removed one's name

    _apply_building(building, body)
    for order, data in enumerate(body.room_types):
        if data.id:
            _apply_room_type(existing[data.id], data, order)
        else:
            rt = RoomType()
            _apply_room_type(rt, data, order)
            building.room_types.append(rt)
    _commit(db)
    db.expire(building)
    return BuildingOut.of(_get(db, building.id))


@router.delete("/{building_id}", status_code=204)
def delete_building(building_id: str, db: DB) -> Response:
    db.delete(_get(db, building_id))
    db.commit()
    return Response(status_code=204)
