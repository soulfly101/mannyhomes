from datetime import date, timedelta

import pytest

from app.allocations.service import allocate
from app.auth.sessions import start_session
from app.billing.service import create_bill, record_payment
from app.bookings.service import cancel_booking, confirm_payment, start_booking
from app.db import utcnow
from app.models import (
    BillKind,
    Building,
    ContactMessage,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    Tenancy,
    User,
)
from app.overview.router import _month_starts

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/admin/overview"
SIGNATURE = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg=="
)


def person(db, email, role=Role.TENANT, name="Ama Mensah") -> User:
    u = User(name=name, email=email, phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def admin(client, db):
    a = person(db, "admin-over@example.com", role=Role.ADMIN, name="Esi Admin")
    a.signature_image = SIGNATURE
    db.commit()
    client.cookies.set("altheo_session", start_session(db, a))
    return a


@pytest.fixture
def room(db):
    b = Building(name="Manny Building", location="Oyarifa", sanitation_fee=50)
    rt = RoomType(
        name="2 bedroom", rent=2000, quantity_available=5, booking_deposit=300, renting_deposit=4000
    )
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


def paid_booking(db, room, email, name="Ama Mensah"):
    tenant = person(db, email, name=name)
    booking = start_booking(db, tenant, room.id)
    ref = f"ref-{email}"
    record_payment(
        db,
        booking.bill,
        amount=300,
        method=PaymentMethod.PAYSTACK_MOMO,
        reference=ref,
        status=PaymentStatus.PENDING,
    )
    db.commit()
    confirm_payment(db, ref, amount_cedis=300, currency="GHS")
    return booking


def test_an_empty_system_has_zeros(client, admin):
    body = client.get(URL).json()
    assert set(body["figures"].values()) == {0}
    assert [m["amount"] for m in body["revenue"]] == [0] * 6
    assert [s["count"] for s in body["stages"]] == [0, 0, 0, 0]
    assert (body["recent_tenants"], body["activity"]) == ([], [])


def test_the_figures_add_up(client, db, admin, room):
    start_booking(db, person(db, "unpaid@example.com", name="Unpaid Tenant"), room.id)
    paid_booking(db, room, "waiting@example.com", name="Waiting Tenant")
    to_sign = paid_booking(db, room, "tosign@example.com", name="Tosign Tenant")
    allocate(db, to_sign.id, "A1", admin)
    signed = paid_booking(db, room, "signed@example.com", name="Signed Tenant")
    tenancy = allocate(db, signed.id, "A2", admin)
    tenancy.agreement.signed_at = utcnow()
    db.commit()
    cancelled = start_booking(db, person(db, "gone@example.com", name="Gone Tenant"), room.id)
    cancel_booking(db, cancelled)

    body = client.get(URL).json()
    f = body["figures"]
    assert (f["active_tenants"], f["waiting_for_room"], f["waiting_to_sign"], f["buildings"]) == (2, 1, 1, 1)
    # 5 minus 2 allocated = 3; one held by the unpaid booking and one by the paid one.
    assert f["rooms_available"] == 1
    assert f["collected_this_month"] == 900
    # Two renting deposits and the signed tenant's sanitation bill; the unpaid booking deposit isn't owed.
    assert f["still_owed"] == 8050
    assert {s["key"]: s["count"] for s in body["stages"]} == {"payment": 1, "room": 1, "sign": 1, "signed": 1}
    assert {t["name"]: (t["status"], t["tone"]) for t in body["recent_tenants"]}["Signed Tenant"] == (
        "Room A2",
        "success",
    )
    statuses = {t["email"]: t["status"] for t in client.get(URL).json()["recent_tenants"]}
    assert statuses["tosign@example.com"] == "Room A1, to sign"
    assert statuses["waiting@example.com"] == "Waiting for a room"
    assert statuses["gone@example.com"] == "No booking"


def test_revenue_is_grouped_by_month_and_only_counts_money_received(client, db, admin):
    tenant = person(db, "rev@example.com")
    bill = create_bill(
        db,
        tenant=tenant,
        kind=BillKind.RENTING_DEPOSIT,
        amount=9000,
        description="x",
        due_date=date(2026, 1, 1),
    )
    now = utcnow().replace(day=15)
    last_month = (now.replace(day=1) - timedelta(days=1)).replace(day=15)
    this = record_payment(db, bill, amount=1000, method=PaymentMethod.CASH, reference="this")
    this.paid_at = now
    before = record_payment(db, bill, amount=2000, method=PaymentMethod.CASH, reference="before")
    before.paid_at = last_month
    record_payment(
        db, bill, amount=500, method=PaymentMethod.CASH, reference="pending", status=PaymentStatus.PENDING
    )
    record_payment(
        db, bill, amount=500, method=PaymentMethod.CASH, reference="failed", status=PaymentStatus.FAILED
    )
    db.commit()
    body = client.get(URL).json()
    assert [m["amount"] for m in body["revenue"]][-2:] == [2000, 1000]
    assert body["revenue"][-1]["month"] == now.strftime("%Y-%m")
    assert (body["figures"]["collected_this_month"], body["figures"]["collected_last_month"]) == (1000, 2000)
    assert body["figures"]["still_owed"] == 6000


def test_the_chart_range_can_change(client, admin):
    assert len(client.get(URL, params={"months": 12}).json()["revenue"]) == 12
    only_one = client.get(URL, params={"months": 1}).json()
    assert len(only_one["revenue"]) == 1
    assert client.get(URL, params={"months": 13}).status_code == 422
    assert client.get(URL, params={"months": 0}).status_code == 422


def test_month_starts_cross_the_year():
    assert _month_starts(date(2026, 2, 20), 3) == [date(2025, 12, 1), date(2026, 1, 1), date(2026, 2, 1)]


def test_activity_is_real_events_newest_first(client, db, admin, room):
    booking = paid_booking(db, room, "act@example.com")
    tenancy: Tenancy = allocate(db, booking.id, "B4", admin)
    tenancy.agreement.signed_at = utcnow()
    db.add(ContactMessage(name="Kofi Asante", email="k@example.com", message="I'd like a viewing."))
    db.commit()
    body = client.get(URL).json()
    assert len(body["activity"]) == 4
    times = [a["at"] for a in body["activity"]]
    assert times == sorted(times, reverse=True)
    texts = {a["kind"]: a["text"] for a in body["activity"]}
    assert texts == {
        "payment": "Ama Mensah paid GH₵ 300 booking deposit",
        "allocation": "Room B4 at Manny Building allocated to Ama Mensah",
        "agreement": "Ama Mensah signed their tenancy agreement",
        "enquiry": "New enquiry from Kofi Asante",
    }


def test_recent_tenants_and_activity_are_limited(client, db, admin):
    for i in range(7):
        person(db, f"t{i}@example.com", name=f"Tenant {i}")
        db.add(ContactMessage(name=f"Visitor {i}", email="v@example.com", message="Hello there, friends."))
    db.commit()
    body = client.get(URL).json()
    assert len(body["recent_tenants"]) == 5
    assert len(body["activity"]) == 6
    assert all(t["name"].startswith("Tenant") for t in body["recent_tenants"])


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_see_it(client, db, role):
    client.cookies.set("altheo_session", start_session(db, person(db, f"{role}-o@example.com", role=role)))
    assert client.get(URL).status_code == 403


def test_logged_out_is_refused(client):
    assert client.get(URL).status_code == 401


def test_payment_model_is_unchanged_by_reading(client, db, admin):
    assert client.get(URL).status_code == 200
    assert db.query(Payment).count() == 0
