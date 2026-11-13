"""Nightly database backups (#30): what the admin dashboard says about them."""

from datetime import timedelta

import pytest

from app.auth.sessions import start_session
from app.backups.service import backup_status
from app.config import get_settings
from app.db import utcnow
from app.models import BackupRun, Role, User

from .conftest import needs_db

pytestmark = needs_db


def run(db, status, hours_ago, error=None, size=2048):
    finished = utcnow() - timedelta(hours=hours_ago)
    row = BackupRun(
        started_at=finished - timedelta(seconds=5),
        finished_at=finished,
        status=status,
        file=f"altheo-{hours_ago}.sql.gz",
        size_bytes=size,
        error=error,
    )
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "production")


@pytest.fixture
def development(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "development")


def test_nothing_is_said_in_development_before_any_backup(db, development):
    assert backup_status(db) is None


def test_production_warns_when_no_backup_has_run_yet(db, production):
    status = backup_status(db)
    assert status.state == "warning"
    assert "No database backup has run yet" in status.message
    assert status.last_success_at is None


def test_a_recent_backup_copied_off_the_server_is_ok(db, production):
    good = run(db, "ok", hours_ago=3, size=4096)
    status = backup_status(db)
    assert status.state == "ok"
    assert status.last_success_at == good.finished_at
    assert status.last_size_bytes == 4096


def test_a_failed_backup_is_a_warning_with_its_reason(db, development):
    good = run(db, "ok", hours_ago=27)
    run(db, "failed", hours_ago=2, error="upload failed")
    status = backup_status(db)
    assert status.state == "warning"
    assert "failed (upload failed)" in status.message
    # The last good one is still shown, so the admin knows how old the newest safe copy is.
    assert status.last_success_at == good.finished_at


def test_a_backup_kept_only_on_the_server_is_a_warning(db, development):
    run(db, "local_only", hours_ago=1)
    status = backup_status(db)
    assert status.state == "warning"
    assert "only on the server" in status.message
    assert status.last_success_at is None


def test_backups_that_stopped_running_are_noticed(db, development):
    run(db, "ok", hours_ago=30)
    status = backup_status(db)
    assert status.state == "warning"
    assert "hasn't run for over a day" in status.message


def test_a_newer_good_backup_clears_an_older_failure(db, development):
    run(db, "failed", hours_ago=25, error="dump failed")
    run(db, "ok", hours_ago=1)
    assert backup_status(db).state == "ok"


def test_the_dashboard_overview_carries_the_backup_status(client, db, development):
    admin = User(name="Esi Admin", email="admin-backup@example.com", phone="+233241234567", role=Role.ADMIN)
    db.add(admin)
    db.commit()
    client.cookies.set("altheo_session", start_session(db, admin))
    assert client.get("/api/admin/overview").json()["backup"] is None

    run(db, "failed", hours_ago=1, error="dump failed")
    backup = client.get("/api/admin/overview").json()["backup"]
    assert backup["state"] == "warning"
    assert "dump failed" in backup["message"]
