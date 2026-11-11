"""Chat API (#22). Tenants use /api/chat for their own conversations; admins use /api/admin/chat for all."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..db import get_session
from ..models import Conversation, Message, Role, User
from ..tickets.router import CATEGORY_WORDS
from .service import (
    ChatError,
    conversations_query,
    last_messages,
    open_conversation,
    read,
    send,
    total_unread,
    unread_counts,
)

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(require_role(Role.TENANT))]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

router = APIRouter(tags=["chat"])
admin_router = APIRouter(tags=["admin: chat"])


class MessageOut(BaseModel):
    id: int
    body: str
    from_admin: bool
    # The admin's name on their messages; tenants' names are on the conversation.
    sender_name: str
    created_at: datetime

    @classmethod
    def of(cls, m: Message) -> MessageOut:
        return cls(
            id=m.id, body=m.body, from_admin=m.from_admin, sender_name=m.sender.name, created_at=m.created_at
        )


class ConversationOut(BaseModel):
    id: str
    title: str
    ticket_id: str | None
    tenant_id: str
    tenant_name: str
    last_message: str | None
    last_message_at: datetime | None
    unread: int


def _title(c: Conversation) -> str:
    if c.ticket is None:
        return "General"
    return f"{CATEGORY_WORDS[c.ticket.category]} report, room {c.ticket.room_number}"


def _list(db: Session, conversations: list[Conversation], *, for_admin: bool) -> list[ConversationOut]:
    ids = [c.id for c in conversations]
    unread = unread_counts(db, ids, for_admin=for_admin)
    last = last_messages(db, ids)
    return [
        ConversationOut(
            id=c.id,
            title=_title(c),
            ticket_id=c.ticket_id,
            tenant_id=c.tenant_id,
            tenant_name=c.tenant.name,
            last_message=last[c.id].body[:120] if c.id in last else None,
            last_message_at=c.last_message_at,
            unread=unread.get(c.id, 0),
        )
        for c in conversations
    ]


def _one(db: Session, c: Conversation, *, for_admin: bool) -> ConversationOut:
    return _list(db, [c], for_admin=for_admin)[0]


class Thread(BaseModel):
    conversation: ConversationOut
    messages: list[MessageOut]


class OpenIn(BaseModel):
    ticket_id: str | None = None


class AdminOpenIn(OpenIn):
    tenant_id: str


class SendIn(BaseModel):
    body: str


class Unread(BaseModel):
    count: int


def _http(e: ChatError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail=str(e))


# --- Tenants ---------------------------------------------------------------------------------------------


def _mine(db: Session, conversation_id: str, tenant: User) -> Conversation:
    c = db.scalar(
        conversations_query().where(Conversation.id == conversation_id, Conversation.tenant_id == tenant.id)
    )
    if c is None:
        raise HTTPException(status_code=404, detail="That conversation doesn't exist.")
    return c


@router.get("")
def my_conversations(tenant: Tenant, db: DB) -> list[ConversationOut]:
    rows = db.scalars(conversations_query().where(Conversation.tenant_id == tenant.id)).all()
    return _list(db, list(rows), for_admin=False)


@router.get("/unread")
def my_unread(tenant: Tenant, db: DB) -> Unread:
    return Unread(count=total_unread(db, tenant_id=tenant.id))


@router.post("/open")
def tenant_open(data: OpenIn, tenant: Tenant, db: DB) -> ConversationOut:
    try:
        return _one(db, open_conversation(db, tenant, data.ticket_id), for_admin=False)
    except ChatError as e:
        raise _http(e) from e


@router.get("/{conversation_id}")
def tenant_thread(
    conversation_id: str, tenant: Tenant, db: DB, after: Annotated[int, Query(ge=0)] = 0
) -> Thread:
    c = _mine(db, conversation_id, tenant)
    messages = read(db, c, as_admin=False, after=after)
    return Thread(conversation=_one(db, c, for_admin=False), messages=[MessageOut.of(m) for m in messages])


@router.post("/{conversation_id}/messages", status_code=201)
def tenant_send(conversation_id: str, data: SendIn, tenant: Tenant, db: DB) -> MessageOut:
    c = _mine(db, conversation_id, tenant)
    try:
        return MessageOut.of(send(db, c, tenant, data.body))
    except ChatError as e:
        raise _http(e) from e


# --- Admins ----------------------------------------------------------------------------------------------


def _any(db: Session, conversation_id: str) -> Conversation:
    c = db.scalar(conversations_query().where(Conversation.id == conversation_id))
    if c is None:
        raise HTTPException(status_code=404, detail="That conversation doesn't exist.")
    return c


class TenantOption(BaseModel):
    id: str
    name: str
    phone: str | None


@admin_router.get("")
def all_conversations(admin: Admin, db: DB) -> list[ConversationOut]:
    """Every conversation that has a message, newest activity first."""
    rows = db.scalars(conversations_query().where(Conversation.last_message_at.is_not(None))).all()
    return _list(db, list(rows), for_admin=True)


@admin_router.get("/unread")
def admin_unread(admin: Admin, db: DB) -> Unread:
    return Unread(count=total_unread(db))


@admin_router.get("/tenants")
def tenants(admin: Admin, db: DB) -> list[TenantOption]:
    """Every registered tenant, for starting a conversation."""
    rows = db.scalars(select(User).where(User.role == Role.TENANT).order_by(User.name)).all()
    return [TenantOption(id=u.id, name=u.name, phone=u.phone) for u in rows]


@admin_router.post("/open")
def admin_open(data: AdminOpenIn, admin: Admin, db: DB) -> ConversationOut:
    tenant = db.get(User, data.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="That tenant doesn't exist.")
    try:
        return _one(db, open_conversation(db, tenant, data.ticket_id), for_admin=True)
    except ChatError as e:
        raise _http(e) from e


@admin_router.get("/{conversation_id}")
def admin_thread(
    conversation_id: str, admin: Admin, db: DB, after: Annotated[int, Query(ge=0)] = 0
) -> Thread:
    c = _any(db, conversation_id)
    messages = read(db, c, as_admin=True, after=after)
    return Thread(conversation=_one(db, c, for_admin=True), messages=[MessageOut.of(m) for m in messages])


@admin_router.post("/{conversation_id}/messages", status_code=201)
def admin_send(conversation_id: str, data: SendIn, admin: Admin, db: DB) -> MessageOut:
    c = _any(db, conversation_id)
    try:
        return MessageOut.of(send(db, c, admin, data.body))
    except ChatError as e:
        raise _http(e) from e
