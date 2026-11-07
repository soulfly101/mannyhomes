from datetime import date

import pytest
from sqlalchemy import select

from app.db import utcnow
from app.models import Role, Ticket, TicketStatus
from app.sanitation.penalties import save_penalty_settings

from .conftest import needs_db
from .test_agreements import person
from .test_agreements import tenancy as tenancy  # noqa: F401 (fixture)
from .test_sanitation import admin as admin  # noqa: F401 (fixture)
from .test_sanitation import log_in, moved_in

pytestmark = needs_db

URL = "/api/tickets"
ADMIN_URL = "/api/admin/tickets"
LEAK = {"category": "plumbing", "description": "The kitchen tap drips all night."}


@pytest.fixture
def as_tenant(client, db, tenancy):  # noqa: F811
    log_in(client, db, tenancy.tenant)
    return tenancy


def report(client, **overrides):
    return client.post(URL, json={**LEAK, **overrides})


# --- Tenants reporting ------------------------------------------------------------------------------------


def test_a_tenant_reports_an_issue_tied_to_their_room(client, db, as_tenant):
    response = report(client, description="  The kitchen tap drips all night.  ")
    assert response.status_code == 201
    body = response.json()
    assert (body["category"], body["status"]) == ("plumbing", "pending")
    assert body["description"] == "The kitchen tap drips all night."
    assert (body["room_number"], body["building"]) == ("A12", "Manny Building")
    ticket = db.get(Ticket, body["id"])
    assert (ticket.tenant_id, ticket.tenancy_id) == (as_tenant.tenant_id, as_tenant.id)


def test_their_history_lists_their_reports_newest_first(client, as_tenant):
    report(client, category="electrical", description="The bedroom socket sparks.")
    report(client)
    body = client.get(URL).json()
    assert [t["category"] for t in body["tickets"]] == ["plumbing", "electrical"]
    assert body["blocked_reason"] is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"category": "roof"},
        {"description": "leak"},
        {"description": "          "},
        {"description": "x" * 2001},
    ],
)
def test_reports_that_cant_be_used_are_refused(client, db, as_tenant, overrides):
    assert report(client, **overrides).status_code == 422
    assert db.scalar(select(Ticket.id)) is None


def test_the_description_is_kept_as_text(client, as_tenant):
    text = "<script>alert(1)</script> under the sink"
    assert report(client, description=text).json()["description"] == text


def test_someone_without_a_room_cant_report(client, db):
    log_in(client, db, person(db, "no-room@example.com"))
    response = report(client)
    assert response.status_code == 409
    assert "once you've been given a room" in response.json()["detail"]
    assert "once you've been given a room" in client.get(URL).json()["blocked_reason"]


def test_a_moved_out_tenant_cant_report(client, db, as_tenant):
    as_tenant.ended_at = utcnow()
    db.commit()
    assert report(client).status_code == 409


def test_only_tenants_use_the_tenant_side(client, db, admin):  # noqa: F811
    assert client.get(URL).status_code == 401
    log_in(client, db, admin)
    assert client.get(URL).status_code == 403
    assert report(client).status_code == 403


def test_tenants_only_see_their_own_reports(client, db, as_tenant):
    report(client)
    log_in(client, db, person(db, "someone-else@example.com"))
    assert client.get(URL).json()["tickets"] == []


# --- The freeze from #25 ----------------------------------------------------------------------------------


def overdue(db, tenancy):
    moved_in(db, tenancy, date(2020, 1, 15))
    tenancy.start_date = date(2020, 1, 1)
    db.commit()


def test_overdue_bills_pause_reports_when_the_freeze_is_on(client, db, as_tenant):
    overdue(db, as_tenant)
    save_penalty_settings(db, enabled=True, late_fee=0, freeze_tickets=True)
    response = report(client)
    assert response.status_code == 403
    assert "paused until your overdue sanitation bills are paid" in response.json()["detail"]
    assert "paused" in client.get(URL).json()["blocked_reason"]


def test_overdue_bills_change_nothing_when_penalties_are_off(client, db, as_tenant):
    overdue(db, as_tenant)
    assert report(client).status_code == 201


def test_the_freeze_needs_choosing_not_just_penalties_on(client, db, as_tenant):
    overdue(db, as_tenant)
    save_penalty_settings(db, enabled=True, late_fee=20, freeze_tickets=False)
    assert report(client).status_code == 201


# --- Admins ---------------------------------------------------------------------------------------------


@pytest.fixture
def reported(client, db, as_tenant, admin):  # noqa: F811
    ticket_id = report(client).json()["id"]
    log_in(client, db, admin)
    return ticket_id


def test_admins_see_every_report_with_who_and_where(client, db, reported):
    rows = client.get(ADMIN_URL).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["tenant_name"] == db.get(Ticket, reported).tenant.name
    assert (row["building"], row["room_number"], row["category"]) == ("Manny Building", "A12", "plumbing")
    assert row["description"] == LEAK["description"]
    assert row["created_at"]


def test_admins_can_filter_by_status(client, reported):
    assert len(client.get(ADMIN_URL, params={"status": "pending"}).json()) == 1
    assert client.get(ADMIN_URL, params={"status": "resolved"}).json() == []
    assert client.get(ADMIN_URL, params={"status": "nonsense"}).status_code == 422


@pytest.mark.parametrize("status", ["in_progress", "resolved", "closed", "pending"])
def test_admins_can_set_any_status_at_any_time(client, db, reported, status):
    client.patch(f"{ADMIN_URL}/{reported}", json={"status": "closed"})
    response = client.patch(f"{ADMIN_URL}/{reported}", json={"status": status})
    assert response.status_code == 200
    assert response.json()["status"] == status
    db.expire_all()
    assert db.get(Ticket, reported).status == TicketStatus(status)


def test_the_tenant_sees_the_new_status(client, db, reported, as_tenant):
    client.patch(f"{ADMIN_URL}/{reported}", json={"status": "in_progress"})
    log_in(client, db, as_tenant.tenant)
    assert client.get(URL).json()["tickets"][0]["status"] == "in_progress"


def test_a_status_change_moves_the_updated_time_and_the_same_status_doesnt(client, db, reported):
    first = db.get(Ticket, reported).updated_at
    client.patch(f"{ADMIN_URL}/{reported}", json={"status": "pending"})
    db.expire_all()
    assert db.get(Ticket, reported).updated_at == first
    client.patch(f"{ADMIN_URL}/{reported}", json={"status": "resolved"})
    db.expire_all()
    assert db.get(Ticket, reported).updated_at > first


def test_unknown_reports_and_statuses(client, reported):
    assert client.patch(f"{ADMIN_URL}/nope", json={"status": "closed"}).status_code == 404
    assert client.patch(f"{ADMIN_URL}/{reported}", json={"status": "done"}).status_code == 422


def test_only_admins_manage_reports(client, db, reported):
    log_in(client, db, person(db, "staff-person@example.com", role=Role.STAFF))
    assert client.get(ADMIN_URL).status_code == 403
    assert client.patch(f"{ADMIN_URL}/{reported}", json={"status": "closed"}).status_code == 403
