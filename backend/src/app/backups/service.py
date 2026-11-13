"""Whether the nightly database backups (#30) are working, for the admin dashboard.

The backups themselves are made by deploy/backup/backup.sh in its own container on the server, which adds a
`backup_runs` row after each try. This only reads those rows, so a backup that stopped running altogether
(the container died, the database was down) shows up too: the latest row just gets too old.
"""

from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import BackupRun

# Backups run nightly; a little over a day allows for a slow night before calling it missed.
STALE_AFTER = timedelta(hours=26)


class BackupStatus(BaseModel):
    state: Literal["ok", "warning"]
    message: str
    last_success_at: datetime | None
    last_size_bytes: int | None


def backup_status(db: Session, now: datetime | None = None) -> BackupStatus | None:
    """The dashboard's backup line, or None where backups aren't expected (development, nothing run yet)."""
    now = now or utcnow()
    newest_first = select(BackupRun).order_by(BackupRun.finished_at.desc(), BackupRun.id.desc())
    latest = db.scalars(newest_first).first()
    last_ok = db.scalars(newest_first.where(BackupRun.status == "ok")).first()

    def status(state: Literal["ok", "warning"], message: str) -> BackupStatus:
        return BackupStatus(
            state=state,
            message=message,
            last_success_at=last_ok.finished_at if last_ok else None,
            last_size_bytes=last_ok.size_bytes if last_ok else None,
        )

    if latest is None:
        if get_settings().app_env != "production":
            return None
        return status("warning", "No database backup has run yet. The first one runs tonight at 02:00.")
    if now - latest.finished_at > STALE_AFTER:
        return status("warning", "The nightly database backup hasn't run for over a day. Check the server.")
    if latest.status == "failed":
        reason = f" ({latest.error})" if latest.error else ""
        return status("warning", f"Last night's database backup failed{reason}. Check the server.")
    if latest.status == "local_only":
        return status(
            "warning",
            "The database backup is only on the server, not copied to Oracle storage. "
            "Set BACKUP_UPLOAD_URL on the server.",
        )
    return status("ok", "The database is backed up every night and copied off the server.")
