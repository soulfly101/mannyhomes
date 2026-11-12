"""Admin texts (#27): send a broadcast to tenants with a room, and see what has been sent."""

from collections import Counter
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import require_role
from ..config import get_settings
from ..db import get_session
from ..models import Building, Role, SmsBroadcast, SmsKind, SmsMessage, SmsStatus, Tenancy, User
from .sender import MAX_LENGTH, sms_mode
from .service import PLACEHOLDER, notify, personalise

DB = Annotated[Session, Depends(get_session)]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

router = APIRouter(tags=["admin: texts"])

RECENT = 40
KIND_WORDS = {
    SmsKind.TICKET: "Repair update",
    SmsKind.BILL_NEW: "New sanitation bill",
    SmsKind.BILL_DUE: "Bill due tomorrow",
    SmsKind.PAYMENT: "Payment received",
    SmsKind.ALLOCATION: "Room allocated",
    SmsKind.BROADCAST: "Broadcast",
}


class BuildingOption(BaseModel):
    id: str
    name: str


class Audience(BaseModel):
    tenants: int
    # Some accounts (e.g. Google sign-ups) may have no phone number yet.
    with_phone: int
    # The first name used in the preview of {{Tenant Name}}.
    example_name: str | None
    # The longest the message can be with every recipient's name swapped in.
    longest_name: int


class BroadcastOut(BaseModel):
    id: str
    template: str
    audience: str
    created_at: datetime
    sent_by: str | None
    counts: dict[str, int]


class MessageOut(BaseModel):
    id: int
    kind: str
    to: str | None
    body: str
    status: SmsStatus
    error: str | None
    created_at: datetime


class SmsOverview(BaseModel):
    mode: Literal["live", "test", "off"]
    sender_id: str | None
    max_length: int
    buildings: list[BuildingOption]
    broadcasts: list[BroadcastOut]
    recent: list[MessageOut]


class BroadcastIn(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    building_id: str | None = None


def _recipients(db: Session, building_id: str | None) -> list[User]:
    """Tenants living in a room now, in that building if one is given."""
    query = select(Tenancy.tenant_id).where(Tenancy.ended_at.is_(None))
    if building_id:
        query = query.where(Tenancy.building_id == building_id)
    return list(db.scalars(select(User).where(User.id.in_(query)).order_by(User.name)).all())


def _audience(users: list[User]) -> Audience:
    names = [u.name.split(" ")[0] for u in users if u.phone]
    return Audience(
        tenants=len(users),
        with_phone=len(names),
        example_name=names[0] if names else None,
        longest_name=max((len(n) for n in names), default=0),
    )


def _broadcast_out(b: SmsBroadcast) -> BroadcastOut:
    counts = Counter(m.status.value for m in b.messages)
    return BroadcastOut(
        id=b.id,
        template=b.template,
        audience=b.audience,
        created_at=b.created_at,
        sent_by=b.sent_by.name if b.sent_by else None,
        counts={s.value: counts.get(s.value, 0) for s in SmsStatus},
    )


@router.get("")
def overview(admin: Admin, db: DB) -> SmsOverview:
    broadcasts = db.scalars(
        select(SmsBroadcast)
        .options(selectinload(SmsBroadcast.messages), selectinload(SmsBroadcast.sent_by))
        .order_by(SmsBroadcast.created_at.desc())
        .limit(10)
    ).all()
    recent = db.scalars(
        select(SmsMessage)
        .where(SmsMessage.kind != SmsKind.BROADCAST)
        .options(selectinload(SmsMessage.user))
        .order_by(SmsMessage.id.desc())
        .limit(RECENT)
    ).all()
    buildings = db.execute(select(Building.id, Building.name).order_by(Building.name)).all()
    return SmsOverview(
        mode=sms_mode(),
        sender_id=get_settings().moolre_sms_sender_id,
        max_length=MAX_LENGTH,
        buildings=[BuildingOption(id=i, name=n) for i, n in buildings],
        broadcasts=[_broadcast_out(b) for b in broadcasts],
        recent=[
            MessageOut(
                id=m.id,
                kind=KIND_WORDS[m.kind],
                to=m.user.name if m.user else None,
                body=m.body,
                status=m.status,
                error=m.error,
                created_at=m.created_at,
            )
            for m in recent
        ],
    )


@router.get("/audience")
def audience(admin: Admin, db: DB, building_id: str | None = None) -> Audience:
    return _audience(_recipients(db, building_id or None))


@router.post("/broadcasts", status_code=201)
def broadcast(data: BroadcastIn, admin: Admin, db: DB) -> BroadcastOut:
    if sms_mode() == "off":
        raise HTTPException(status_code=409, detail="Texts aren't set up yet, so nothing can be sent.")
    text = " ".join(data.text.split())
    if not text:
        raise HTTPException(status_code=422, detail="Write the message first.")
    building = db.get(Building, data.building_id) if data.building_id else None
    if data.building_id and building is None:
        raise HTTPException(status_code=404, detail="That building doesn't exist.")
    users = _recipients(db, building.id if building else None)
    reach = _audience(users)
    if reach.with_phone == 0:
        raise HTTPException(status_code=422, detail="Nobody there has a phone number to text.")
    longest = len(PLACEHOLDER.sub("x" * reach.longest_name, text))
    if longest > MAX_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"That's {longest} characters with the longest name in. Keep it to {MAX_LENGTH}.",
        )
    record = SmsBroadcast(
        template=text,
        building_id=building.id if building else None,
        audience=f"Tenants at {building.name}" if building else "All tenants with a room",
        sent_by_id=admin.id,
    )
    db.add(record)
    db.flush()
    for user in users:
        notify(db, user, SmsKind.BROADCAST, personalise(text, user), broadcast_id=record.id, sign=False)
    db.commit()
    record = db.scalar(
        select(SmsBroadcast)
        .where(SmsBroadcast.id == record.id)
        .options(selectinload(SmsBroadcast.messages), selectinload(SmsBroadcast.sent_by))
    )
    return _broadcast_out(record)
