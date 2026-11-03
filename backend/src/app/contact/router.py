"""Contact form on the landing page: anyone can send a message; admins can read them."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import require_role
from ..auth.ratelimit import FailureLimiter
from ..auth.schemas import clean_name, normalise_phone
from ..db import get_session
from ..models import ContactMessage, Role, RoomType

router = APIRouter(tags=["contact"])
admin_router = APIRouter(tags=["admin: contact"], dependencies=[Depends(require_role(Role.ADMIN))])

DB = Annotated[Session, Depends(get_session)]

# At most 5 messages per IP per hour, to keep the inbox free of spam.
contact_limiter = FailureLimiter(max_failures=5, window_seconds=60 * 60)


class ContactIn(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    room_type_id: str | None = None
    message: str

    _name = field_validator("name")(clean_name)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.lower()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_phone(value) if value and value.strip() else None

    @field_validator("room_type_id")
    @classmethod
    def _room(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("message")
    @classmethod
    def _message(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Tell us a little more (at least 10 characters).")
        if len(value) > 2000:
            raise ValueError("Keep your message under 2,000 characters.")
        return value


class ContactOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None
    room_type: str | None
    building: str | None
    message: str
    handled: bool
    created_at: datetime

    @classmethod
    def of(cls, m: ContactMessage) -> ContactOut:
        return cls(
            id=m.id,
            name=m.name,
            email=m.email,
            phone=m.phone,
            room_type=m.room_type.name if m.room_type else None,
            building=m.room_type.building.name if m.room_type else None,
            message=m.message,
            handled=m.handled,
            created_at=m.created_at,
        )


@router.post("", status_code=201)
def send_message(body: ContactIn, request: Request, db: DB) -> dict[str, str]:
    key = request.client.host if request.client else "unknown"
    if contact_limiter.blocked(key):
        raise HTTPException(
            status_code=429, detail="You've sent several messages already. Try again in an hour."
        )
    room_type_id = body.room_type_id
    if room_type_id and db.get(RoomType, room_type_id) is None:
        room_type_id = None  # the room may have been removed since the page loaded
    db.add(
        ContactMessage(
            name=body.name,
            email=body.email,
            phone=body.phone,
            room_type_id=room_type_id,
            message=body.message,
        )
    )
    db.commit()
    contact_limiter.record_failure(key)  # counts every message, not only failures
    return {"detail": "Thanks! We'll get back to you within one working day."}


@admin_router.get("")
def list_messages(db: DB) -> list[ContactOut]:
    messages = db.scalars(
        select(ContactMessage)
        .options(selectinload(ContactMessage.room_type).selectinload(RoomType.building))
        .order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc())
        .limit(200)
    ).all()
    return [ContactOut.of(m) for m in messages]
