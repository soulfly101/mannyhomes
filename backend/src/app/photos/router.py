"""Photos of buildings and room types: the admin uploads, orders and deletes them; anyone can view them.

Each set (a building's own photos, or one room type's) is ordered by position; the first is the cover.
Listings show a room type's photos first, then its building's (see listings/router.py).
"""

from collections import defaultdict
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..db import get_session
from ..models import Building, Photo, Role, RoomType
from .images import MAX_UPLOAD_BYTES, PhotoError, process_photo

admin_router = APIRouter(tags=["admin: photos"], dependencies=[Depends(require_role(Role.ADMIN))])
router = APIRouter(tags=["photos"])

DB = Annotated[Session, Depends(get_session)]

MAX_PER_SET = 20
# A photo's bytes never change for its id (a new upload gets a new id), so browsers may keep it for good.
CACHE_FOREVER = "public, max-age=31536000, immutable"


class PhotoOut(BaseModel):
    id: str
    room_type_id: str | None
    position: int
    width: int
    height: int

    @classmethod
    def of(cls, p: Photo) -> PhotoOut:
        return cls(id=p.id, room_type_id=p.room_type_id, position=p.position, width=p.width, height=p.height)


class OrderIn(BaseModel):
    room_type_id: str | None = None
    photo_ids: list[str]


def photo_ids_by_owner(db: Session, building_ids: list[str]) -> dict[tuple[str, str | None], list[str]]:
    """Photo ids per (building id, room type id or None), in order. One query for any number of buildings."""
    found: dict[tuple[str, str | None], list[str]] = defaultdict(list)
    if not building_ids:
        return found
    rows = db.execute(
        select(Photo.id, Photo.building_id, Photo.room_type_id)
        .where(Photo.building_id.in_(building_ids))
        .order_by(Photo.position, Photo.created_at)
    )
    for photo_id, building_id, room_type_id in rows:
        found[(building_id, room_type_id)].append(photo_id)
    return found


def cover_photo_id(db: Session, room_type_id: str | None) -> str | None:
    """The first photo of a room type, or else of its building; None when neither has any."""
    if room_type_id is None:
        return None
    rt = db.get(RoomType, room_type_id)
    if rt is None:
        return None
    photos = photo_ids_by_owner(db, [rt.building_id])
    return next(iter(photos.get((rt.building_id, rt.id), []) + photos.get((rt.building_id, None), [])), None)


def _building(db: Session, building_id: str) -> Building:
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="That building doesn't exist. It may have been deleted.")
    return building


def _check_room_type(db: Session, building: Building, room_type_id: str | None) -> None:
    if room_type_id is None:
        return
    rt = db.get(RoomType, room_type_id)
    if rt is None or rt.building_id != building.id:
        raise HTTPException(status_code=404, detail="That room type doesn't exist. It may have been deleted.")


def _set(db: Session, building_id: str, room_type_id: str | None) -> list[Photo]:
    query = select(Photo).where(Photo.building_id == building_id)
    query = query.where(
        Photo.room_type_id.is_(None) if room_type_id is None else Photo.room_type_id == room_type_id
    )
    return list(db.scalars(query.order_by(Photo.position, Photo.created_at)))


@admin_router.get("/{building_id}/photos")
def list_photos(building_id: str, db: DB) -> list[PhotoOut]:
    _building(db, building_id)
    photos = db.scalars(
        select(Photo).where(Photo.building_id == building_id).order_by(Photo.position, Photo.created_at)
    )
    return [PhotoOut.of(p) for p in photos]


def _save_upload(db: Session, building_id: str, room_type_id: str | None, data: bytes) -> PhotoOut:
    building = _building(db, building_id)
    _check_room_type(db, building, room_type_id)
    existing = _set(db, building_id, room_type_id)
    if len(existing) >= MAX_PER_SET:
        raise HTTPException(
            status_code=409, detail=f"There are already {MAX_PER_SET} photos here. Delete one to add another."
        )
    try:
        processed = process_photo(data)
    except PhotoError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    photo = Photo(
        building_id=building_id,
        room_type_id=room_type_id,
        position=max((p.position for p in existing), default=-1) + 1,
        width=processed.width,
        height=processed.height,
        large=processed.large,
        thumb=processed.thumb,
    )
    db.add(photo)
    db.commit()
    return PhotoOut.of(photo)


@admin_router.post("/{building_id}/photos", status_code=201)
async def upload_photo(
    building_id: str, request: Request, db: DB, room_type_id: str | None = None
) -> PhotoOut:
    """One photo as the raw request body (the file as the browser sends it), for a building or room type."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That photo is too large. Use one under 15 MB.")
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="That photo is too large. Use one under 15 MB.")
    # Decoding and resizing takes a moment; keep it off the event loop.
    return await run_in_threadpool(_save_upload, db, building_id, room_type_id or None, bytes(data))


@admin_router.put("/{building_id}/photos/order")
def reorder_photos(building_id: str, body: OrderIn, db: DB) -> list[PhotoOut]:
    """Sets the order of one set. It must list exactly that set's photos, so nothing is lost by accident."""
    building = _building(db, building_id)
    _check_room_type(db, building, body.room_type_id)
    photos = {p.id: p for p in _set(db, building_id, body.room_type_id)}
    if sorted(body.photo_ids) != sorted(photos):
        raise HTTPException(
            status_code=409, detail="The photos changed in the meantime. Reload the page and try again."
        )
    for position, photo_id in enumerate(body.photo_ids):
        photos[photo_id].position = position
    db.commit()
    return [PhotoOut.of(photos[i]) for i in body.photo_ids]


@admin_router.delete("/{building_id}/photos/{photo_id}", status_code=204)
def delete_photo(building_id: str, photo_id: str, db: DB) -> Response:
    photo = db.get(Photo, photo_id)
    if photo is None or photo.building_id != building_id:
        raise HTTPException(status_code=404, detail="That photo doesn't exist. It may have been deleted.")
    db.delete(photo)
    db.flush()
    for position, rest in enumerate(_set(db, building_id, photo.room_type_id)):
        rest.position = position
    db.commit()
    return Response(status_code=204)


@router.get("/{photo_id}/{size}.jpg")
def get_photo(photo_id: str, size: Literal["large", "thumb"], db: DB) -> Response:
    column = Photo.large if size == "large" else Photo.thumb
    data = db.scalar(select(column).where(Photo.id == photo_id))
    if data is None:
        raise HTTPException(status_code=404, detail="That photo doesn't exist.")
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": CACHE_FOREVER})
