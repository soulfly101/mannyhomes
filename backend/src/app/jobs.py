"""The background worker, started with the app (#27).

Every few seconds it sends queued texts. Every so often it also makes any monthly sanitation bills that
are due (so they, and their texts, come on time rather than when someone next opens a page) and queues
the "due tomorrow" reminders. Everything it does is safe to repeat and safe to run from several copies of
the app at once: bills and reminders can't be made twice, and each text is claimed by one worker.
"""

import asyncio
import logging
import time

from sqlalchemy.orm import Session

from .db import get_engine, utcnow
from .sanitation.service import ensure_sanitation_bills
from .sms.service import send_queued
from .sms.texts import queue_due_reminders

log = logging.getLogger(__name__)

SEND_EVERY = 15  # seconds
BILLS_EVERY = 30 * 60  # seconds

_last_bills = 0.0


def tick(*, now: float | None = None) -> None:
    global _last_bills
    now = now if now is not None else time.monotonic()
    with Session(get_engine()) as db:
        if now - _last_bills >= BILLS_EVERY:
            ensure_sanitation_bills(db)
            queue_due_reminders(db, utcnow().date())
            _last_bills = now
        send_queued(db)


async def run(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.to_thread(tick)
        except Exception:
            log.exception("Background job failed; trying again shortly")
        try:
            await asyncio.wait_for(stop.wait(), timeout=SEND_EVERY)
        except TimeoutError:
            pass
