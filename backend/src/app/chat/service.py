"""Chat between admins and tenants (#22).

- A tenant has one general conversation and one per repair report, opened by either side.
  Admins can start one with any registered tenant.
- Pages ask for messages after the last one they have every few seconds, and reading them marks them read.
  Any admin reading counts for all admins, since any of them can answer.
- Unread counts drive the badges: messages from the other side after that side's read marker.
"""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db import utcnow
from ..models import Conversation, Message, Role, Ticket, User

GENERAL = "general"
MAX_BODY = 2000
PAGE = 200


class ChatError(Exception):
    """Something that can't be done in chat; the message is shown as is."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def conversations_query():
    return (
        select(Conversation)
        .options(selectinload(Conversation.tenant), selectinload(Conversation.ticket))
        .order_by(Conversation.last_message_at.is_(None), Conversation.last_message_at.desc())
    )


def open_conversation(db: Session, tenant: User, ticket_id: str | None = None) -> Conversation:
    """The tenant's conversation about this report (or the general one), made if it doesn't exist yet."""
    if tenant.role != Role.TENANT:
        raise ChatError("Chats are with tenants.", 404)
    if ticket_id is not None:
        ticket = db.get(Ticket, ticket_id)
        if ticket is None or ticket.tenant_id != tenant.id:
            raise ChatError("That report doesn't exist.", 404)
    topic = f"ticket:{ticket_id}" if ticket_id else GENERAL
    where = (Conversation.tenant_id == tenant.id, Conversation.topic == topic)
    existing = db.scalar(conversations_query().where(*where))
    if existing:
        return existing
    try:
        with db.begin_nested():
            db.add(Conversation(tenant_id=tenant.id, ticket_id=ticket_id, topic=topic))
        db.commit()
    except IntegrityError:
        db.rollback()  # opened by the other side at the same moment
    return db.scalar(conversations_query().where(*where))


def send(db: Session, conversation: Conversation, sender: User, body: str) -> Message:
    body = body.strip()
    if not body:
        raise ChatError("Write a message first.")
    if len(body) > MAX_BODY:
        raise ChatError(f"Keep messages under {MAX_BODY:,} characters.")
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        from_admin=sender.role == Role.ADMIN,
        body=body,
        created_at=utcnow(),
    )
    db.add(message)
    db.flush()
    conversation.last_message_at = message.created_at
    # Your own message is never unread to you.
    if message.from_admin:
        conversation.admin_read_id = message.id
    else:
        conversation.tenant_read_id = message.id
    db.commit()
    return message


def read(db: Session, conversation: Conversation, *, as_admin: bool, after: int = 0) -> list[Message]:
    """Messages after `after` (oldest first, at most PAGE), and marks everything up to the newest as read."""
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id, Message.id > after)
        .options(selectinload(Message.sender))
        .order_by(Message.id.desc())
        .limit(PAGE)
    ).all()[::-1]
    if messages:
        newest = messages[-1].id
        if as_admin and conversation.admin_read_id < newest:
            conversation.admin_read_id = newest
            db.commit()
        elif not as_admin and conversation.tenant_read_id < newest:
            conversation.tenant_read_id = newest
            db.commit()
    return messages


def unread_counts(db: Session, conversation_ids: list[str], *, for_admin: bool) -> dict[str, int]:
    """Per conversation, how many messages from the other side haven't been read."""
    if not conversation_ids:
        return {}
    marker = Conversation.admin_read_id if for_admin else Conversation.tenant_read_id
    rows = db.execute(
        select(Message.conversation_id, func.count())
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.from_admin.is_(not for_admin),
            Message.id > marker,
        )
        .group_by(Message.conversation_id)
    ).all()
    return dict(rows)


def total_unread(db: Session, *, tenant_id: str | None = None) -> int:
    """All unread messages for one tenant, or (with no tenant) for the admins."""
    for_admin = tenant_id is None
    marker = Conversation.admin_read_id if for_admin else Conversation.tenant_read_id
    query = (
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Message.from_admin.is_(not for_admin), Message.id > marker)
    )
    if tenant_id:
        query = query.where(Conversation.tenant_id == tenant_id)
    return db.scalar(query) or 0


def last_messages(db: Session, conversation_ids: list[str]) -> dict[str, Message]:
    if not conversation_ids:
        return {}
    newest = (
        select(func.max(Message.id))
        .where(Message.conversation_id.in_(conversation_ids))
        .group_by(Message.conversation_id)
    )
    return {m.conversation_id: m for m in db.scalars(select(Message).where(Message.id.in_(newest))).all()}
