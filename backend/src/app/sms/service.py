"""Texts to tenants (#27): queue one in the same transaction as what caused it; the worker sends it.

Queueing never calls Moolre, so a slow or failing SMS service can't hold up or undo a payment, an
allocation or a ticket update. `send_queued` (run by app.jobs) sends what's waiting.
A dedupe key (e.g. "bill_due:42") makes sure a reminder is only ever queued once.
"""

import logging
import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import utcnow
from ..models import SmsKind, SmsMessage, SmsStatus, User
from .sender import MAX_LENGTH, SmsSender, get_sms_sender

log = logging.getLogger(__name__)

SIGN_OFF = " - Altheo Homes"
# Tries for a text that failed for a reason that may pass (network trouble).
MAX_ATTEMPTS = 3
PLACEHOLDER = re.compile(r"\{\{\s*tenant\s*name\s*\}\}", re.IGNORECASE)


def first_name(user: User) -> str:
    return (user.name or "").split(" ")[0] or "there"


def personalise(template: str, user: User) -> str:
    """Swaps {{Tenant Name}} for the person's first name."""
    return PLACEHOLDER.sub(first_name(user), template)


def fit(text: str) -> str:
    """One SMS part at most, with the sign-off if there's room."""
    text = " ".join(text.split())
    if len(text) + len(SIGN_OFF) <= MAX_LENGTH:
        return text + SIGN_OFF
    return text if len(text) <= MAX_LENGTH else text[: MAX_LENGTH - 1].rstrip() + "…"


def short_date(day: date) -> str:
    return f"{day.day} {day.strftime('%b')}"


def notify(
    db: Session,
    user: User,
    kind: SmsKind,
    text: str,
    *,
    key: str | None = None,
    broadcast_id: str | None = None,
    sign: bool = True,
) -> SmsMessage | None:
    """Queues a text (not committed). None if one with this key was queued before."""
    if key and db.scalar(select(SmsMessage.id).where(SmsMessage.dedupe_key == key)):
        return None
    message = SmsMessage(
        user_id=user.id,
        phone=user.phone,
        kind=kind,
        body=fit(text) if sign else text,
        dedupe_key=key,
        broadcast_id=broadcast_id,
        status=SmsStatus.QUEUED if user.phone else SmsStatus.SKIPPED,
        error=None if user.phone else "No phone number on their account.",
    )
    try:
        with db.begin_nested():
            db.add(message)
    except IntegrityError:
        return None  # queued at the same moment elsewhere
    return message


def send_queued(db: Session, *, sender: SmsSender | None = None, limit: int = 50) -> int:
    """Sends up to `limit` waiting texts; returns how many went. Safe to run from several workers at once."""
    sender = sender or get_sms_sender()
    rows = db.scalars(
        select(SmsMessage)
        .where(SmsMessage.status == SmsStatus.QUEUED)
        .order_by(SmsMessage.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    sent = 0
    for m in rows:
        if sender is None:
            m.status = SmsStatus.SKIPPED
            m.error = "Texts aren't set up."
            continue
        m.attempts += 1
        result = sender.send(m.phone or "", m.body, f"altheo-{m.id}")
        if result.ok:
            m.status = SmsStatus.SENT
            m.sent_at = utcnow()
            m.error = None
            sent += 1
        elif result.retry and m.attempts < MAX_ATTEMPTS:
            m.error = result.error
        else:
            m.status = SmsStatus.FAILED
            m.error = result.error
            log.warning("Text %s failed: %s", m.id, result.error)
    db.commit()
    return sent
