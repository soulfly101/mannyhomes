from datetime import timedelta

import pytest
from sqlalchemy import select

from app.allocations.service import allocate
from app.auth.sessions import start_session
from app.billing.service import current_period, record_payment
from app.db import utcnow
from app.models import Bill, BillKind, Building, PaymentMethod, PaymentStatus, Role, RoomType

from .conftest import needs_db
from .test_overview import admin, paid_booking, person, room  # noqa: F401  (fixtures)

pytestmark = needs_db

URL = "/api/admin/overview/payments"


def pay(db, bill, amount, ref):
    record_payment(
        db, bill, amount=amount, method=PaymentMethod.CASH, reference=ref, status=PaymentStatus.SUCCESS
    )
    db.commit()


@pytest.fixture
def other_room(db):
    b = Building(name="Tema Court", location="Tema", sanitation_fee=80)
    rt = RoomType(name="Studio", rent=900, quantity_available=2, booking_deposit=300, renting_deposit=1000)
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


@pytest.fixture
def tenants(db, admin, room, other_room):  # noqa: F811
    """Ama: signed, deposit paid, sanitation not. Kofi: unsigned, deposit part paid. Yaw: other building."""
    ama = allocate(db, paid_booking(db, room, "ama@example.com", name="Ama Paid").id, "A1", admin)
    ama.agreement.signed_at = utcnow()
    db.commit()
    pay(db, ama.renting_bill, 4000, "manual-ama")
    kofi = allocate(db, paid_booking(db, room, "kofi@example.com", name="Kofi Part").id, "A2", admin)
    pay(db, kofi.renting_bill, 1500, "manual-kofi")
    yaw = allocate(db, paid_booking(db, other_room, "yaw@example.com", name="Yaw Owes").id, "T1", admin)
    return ama, kofi, yaw


def groups(body):
    return {g["key"]: (g["count"], g["owed"]) for g in body["groups"]}


def test_renting_deposit_across_all_buildings(client, tenants):
    body = client.get(URL, params={"fee": "renting_deposit"}).json()
    assert body["period"] == current_period()
    assert groups(body) == {"paid": (1, 0), "partial": (1, 2500), "unpaid": (1, 1000)}
    # Who owes most comes first.
    assert [(t["name"], t["room"], t["status"]) for t in body["tenants"]] == [
        ("Kofi Part", "A2", "partial"),
        ("Yaw Owes", "T1", "unpaid"),
        ("Ama Paid", "A1", "paid"),
    ]
    assert body["not_billed"] == 0
    assert [b["name"] for b in body["buildings"]] == ["Manny Building", "Tema Court"]


def test_filtered_by_building(client, tenants, room):  # noqa: F811
    body = client.get(URL, params={"fee": "renting_deposit", "building_id": room.building_id}).json()
    assert body["building_id"] == room.building_id
    assert {t["name"] for t in body["tenants"]} == {"Ama Paid", "Kofi Part"}


def test_sanitation_only_counts_tenants_billed_that_month(client, tenants):
    body = client.get(URL, params={"fee": "sanitation"}).json()
    assert [(t["name"], t["status"], t["owed"]) for t in body["tenants"]] == [("Ama Paid", "unpaid", 50)]
    # Kofi and Yaw haven't signed, so they have no sanitation bill yet.
    assert body["not_billed"] == 2


def test_all_fees_needs_every_fee_paid(client, db, tenants):
    ama = tenants[0]
    body = client.get(URL).json()
    assert body["fee"] == "all"
    labels = {g["key"]: g["label"] for g in body["groups"]}
    assert labels == {"paid": "Fully paid", "partial": "Still owes something", "unpaid": "Nothing paid"}
    # Ama's booking and renting deposits are paid but not this month's sanitation.
    assert groups(body) == {"paid": (0, 0), "partial": (1, 50), "unpaid": (0, 0)}
    assert body["not_billed"] == 2

    bill = db.scalar(select(Bill).where(Bill.tenant_id == ama.tenant_id, Bill.kind == BillKind.SANITATION))
    pay(db, bill, 50, "manual-ama-san")
    assert groups(client.get(URL).json())["paid"] == (1, 0)


def test_the_booking_deposit_is_paid_by_everyone_with_a_room(client, tenants):
    body = client.get(URL, params={"fee": "booking_deposit"}).json()
    assert groups(body) == {"paid": (3, 0), "partial": (0, 0), "unpaid": (0, 0)}


def test_only_tenants_with_a_room_that_month(client, db, tenants):
    first = utcnow().date().replace(day=1)
    before = (first - timedelta(days=1)).strftime("%Y-%m")
    body = client.get(URL, params={"period": before, "fee": "renting_deposit"}).json()
    assert body["tenants"] == []
    assert groups(body) == {"paid": (0, 0), "partial": (0, 0), "unpaid": (0, 0)}

    # A tenancy that ended before this month started isn't counted.
    yaw = tenants[2]
    yaw.ended_at = utcnow().replace(day=1) - timedelta(days=1)
    db.commit()
    names = {t["name"] for t in client.get(URL, params={"fee": "renting_deposit"}).json()["tenants"]}
    assert names == {"Ama Paid", "Kofi Part"}


def test_an_empty_system(client, admin):  # noqa: F811
    body = client.get(URL).json()
    assert (body["tenants"], body["not_billed"], body["buildings"]) == ([], 0, [])


@pytest.mark.parametrize("params", [{"period": "2026-13"}, {"period": "Nov"}, {"fee": "late_fee"}])
def test_bad_filters_are_refused(client, admin, params):  # noqa: F811
    assert client.get(URL, params=params).status_code == 422


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_see_it(client, db, role):
    user = person(db, f"{role}-pay@example.com", role=role)
    client.cookies.set("altheo_session", start_session(db, user))
    assert client.get(URL).status_code == 403


def test_logged_out_is_refused(client):
    assert client.get(URL).status_code == 401
