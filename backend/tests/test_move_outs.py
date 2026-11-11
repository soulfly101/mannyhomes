from datetime import timedelta

import pytest
from sqlalchemy import select

from app.allocations.service import allocate
from app.auth.sessions import start_session
from app.billing.service import BillStatus, bill_status, create_bill, record_payment
from app.bookings.service import start_booking
from app.db import utcnow
from app.models import (
    Bill,
    BillKind,
    Booking,
    BookingStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    Tenancy,
)
from app.sanitation.service import ensure_sanitation_bills

from .conftest import needs_db
from .test_overview import admin, paid_booking, person, room  # noqa: F401  (fixtures)

pytestmark = needs_db


def url(tenancy):
    return f"/api/admin/tenancies/{tenancy.id}/move-out"


def pay(db, bill, amount, ref):
    record_payment(db, bill, amount=amount, method=PaymentMethod.CASH, reference=ref)
    db.commit()


def sanitation_bill(db, tenancy):
    return db.scalar(
        select(Bill).where(Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.SANITATION)
    )


@pytest.fixture
def tenancy(db, admin, room):  # noqa: F811
    """Signed today (so this month's GH₵ 50 sanitation bill exists, unpaid), renting deposit paid."""
    t = allocate(db, paid_booking(db, room, "leaving@example.com", name="Kwame Leaving").id, "A1", admin)
    t.agreement.signed_at = utcnow()
    db.commit()
    pay(db, t.renting_bill, 4000, "manual-rd")
    ensure_sanitation_bills(db)
    return t


def today():
    return utcnow().date().isoformat()


def test_the_preview_shows_deposits_held_and_unpaid_bills(client, tenancy):
    body = client.get(url(tenancy)).json()
    assert (body["tenant_name"], body["room_number"], body["building"]) == (
        "Kwame Leaving",
        "A1",
        "Manny Building",
    )
    assert [(d["label"], d["amount"], d["paid"]) for d in body["deposits"]] == [
        ("Booking deposit", 300, 300),
        ("Renting deposit", 4000, 4000),
    ]
    assert body["deposits_held"] == 4300
    assert [(a["balance"], a["description"][:15]) for a in body["arrears"]] == [(50, "Sanitation fee,")]
    assert body["blocked_reason"] is None


def test_moving_out_frees_the_room_and_works_out_the_refund(client, db, tenancy, room):  # noqa: F811
    before = room.quantity_available
    collected = client.get("/api/admin/overview").json()["figures"]["collected_this_month"]
    bill = sanitation_bill(db, tenancy)
    r = client.post(
        url(tenancy),
        json={
            "moved_out_on": today(),
            "deductions": [
                {"reason": "Broken  window", "amount": 250},
                {"reason": "Sanitation arrears", "amount": 50, "bill_id": bill.id},
            ],
            "note": "Keys returned",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["deposits_held"], body["deductions_total"], body["refund_due"]) == (4300, 300, 4000)
    assert [(d["reason"], d["amount"], d["bill_number"]) for d in body["deductions"]] == [
        ("Broken window", 250, None),
        ("Sanitation arrears", 50, bill.number),
    ]
    assert (body["note"], body["refunded_at"]) == ("Keys returned", None)

    db.expire_all()
    t = db.get(Tenancy, tenancy.id)
    assert t.ended_at is not None
    assert db.get(Booking, t.booking_id).status == BookingStatus.MOVED_OUT
    assert db.get(RoomType, room.id).quantity_available == before + 1
    # The arrears were paid from the deposit, which isn't new money.
    assert bill_status(db.get(Bill, bill.id)) == BillStatus.PAID
    payment = db.scalar(select(Payment).where(Payment.bill_id == bill.id))
    assert payment.method == PaymentMethod.DEPOSIT
    assert client.get("/api/admin/overview").json()["figures"]["collected_this_month"] == collected
    # The room can be given to someone else, and the tenant is no longer counted.
    figures = client.get("/api/admin/overview").json()["figures"]
    assert figures["active_tenants"] == 0
    assert client.get("/api/admin/tenancies").json() == []


def test_the_room_number_is_free_again(client, db, admin, tenancy, room):  # noqa: F811
    client.post(url(tenancy), json={"moved_out_on": today()})
    newcomer = paid_booking(db, room, "new@example.com", name="New Tenant")
    assert allocate(db, newcomer.id, "a1", admin).room_number == "a1"


def test_unpaid_deposit_parts_and_later_months_stop(client, db, admin, room):  # noqa: F811
    t = allocate(db, paid_booking(db, room, "part@example.com").id, "B2", admin)
    pay(db, t.renting_bill, 1500, "manual-part")
    upcoming = create_bill(
        db,
        tenant=t.tenant,
        kind=BillKind.SANITATION,
        amount=50,
        description="Sanitation fee, next month",
        period="2099-01",
        due_date=utcnow().date() + timedelta(days=5),
    )
    db.commit()
    body = client.post(url(t), json={"moved_out_on": today()}).json()
    assert (body["deposits_held"], body["refund_due"]) == (1800, 1800)
    db.expire_all()
    renting = db.get(Bill, t.renting_bill_id)
    assert (renting.amount, bill_status(renting)) == (1500, BillStatus.PAID)
    assert db.get(Bill, upcoming.id).voided_at is not None


def test_a_deposit_with_nothing_paid_is_cancelled(client, db, admin, room):  # noqa: F811
    t = allocate(db, paid_booking(db, room, "none@example.com").id, "B3", admin)
    assert client.post(url(t), json={"moved_out_on": today()}).json()["refund_due"] == 300
    db.expire_all()
    assert db.get(Bill, t.renting_bill_id).voided_at is not None


@pytest.mark.parametrize(
    "change, message",
    [
        ({"deductions": [{"reason": "Damage", "amount": 4301}]}, "more than the GH₵ 4,300 held"),
        ({"moved_out_on": "2999-01-01"}, "can't be in the future"),
        ({"moved_out_on": "2000-01-01"}, "before the room was allocated"),
        (
            {"deductions": [{"reason": "Arrears", "amount": 51, "bill_id": "SAN"}]},
            "more than the GH₵ 50 owed",
        ),
        (
            {"deductions": [{"reason": "Arrears", "amount": 10, "bill_id": "RENT"}]},
            "can't be paid from the deposit",
        ),
        (
            {"deductions": [{"reason": "Arrears", "amount": 10, "bill_id": 999999}]},
            "can't be paid from the deposit",
        ),
        (
            {
                "deductions": [
                    {"reason": "A", "amount": 10, "bill_id": "SAN"},
                    {"reason": "B", "amount": 10, "bill_id": "SAN"},
                ]
            },
            "can't be paid from the deposit",
        ),
        ({"deductions": [{"reason": "   ", "amount": 10}]}, "Say what the deduction is for"),
        ({"deductions": [{"reason": "Damage", "amount": 0}]}, ""),
    ],
)
def test_bad_move_outs_are_refused_and_change_nothing(client, db, tenancy, change, message):
    ids = {"SAN": sanitation_bill(db, tenancy).id, "RENT": tenancy.renting_bill_id}
    for d in change.get("deductions", []):
        d["bill_id"] = ids.get(d.get("bill_id"), d.get("bill_id"))
    r = client.post(url(tenancy), json={"moved_out_on": today(), **change})
    assert r.status_code == 422
    assert message in r.json()["detail"]
    db.expire_all()
    assert db.get(Tenancy, tenancy.id).ended_at is None


def test_it_waits_for_a_pending_payment(client, db, tenancy):
    record_payment(
        db,
        sanitation_bill(db, tenancy),
        amount=50,
        method=PaymentMethod.MOOLRE_MOMO,
        reference="pending-1",
        status=PaymentStatus.PENDING,
    )
    db.commit()
    assert "still waiting" in client.get(url(tenancy)).json()["blocked_reason"]
    r = client.post(url(tenancy), json={"moved_out_on": today()})
    assert r.status_code == 409
    assert "still waiting" in r.json()["detail"]


def test_it_happens_only_once(client, tenancy):
    assert client.post(url(tenancy), json={"moved_out_on": today()}).status_code == 201
    again = client.post(url(tenancy), json={"moved_out_on": today()})
    assert again.status_code == 409
    assert "already moved out" in again.json()["detail"]
    assert client.get(url(tenancy)).status_code == 409


def test_unknown_tenancy(client, admin):  # noqa: F811
    assert client.get("/api/admin/tenancies/nope/move-out").status_code == 404
    assert (
        client.post("/api/admin/tenancies/nope/move-out", json={"moved_out_on": today()}).status_code == 404
    )


def test_the_refund_is_recorded_once(client, tenancy):
    move_out_id = client.post(url(tenancy), json={"moved_out_on": today()}).json()["id"]
    refund = f"/api/admin/move-outs/{move_out_id}/refund"
    assert client.post(refund, json={"method": "cheque"}).status_code == 422
    body = client.post(refund, json={"method": "momo", "reference": " MM123 "}).json()
    assert (body["refund_method"], body["refund_reference"]) == ("Mobile Money", "MM123")
    assert body["refunded_at"] is not None
    assert client.post(refund, json={"method": "cash"}).status_code == 409
    assert client.post("/api/admin/move-outs/nope/refund", json={"method": "cash"}).status_code == 404


def test_nothing_to_refund_when_the_deposit_is_all_kept(client, tenancy):
    body = client.post(
        url(tenancy), json={"moved_out_on": today(), "deductions": [{"reason": "Damage", "amount": 4300}]}
    ).json()
    assert body["refund_due"] == 0
    r = client.post(f"/api/admin/move-outs/{body['id']}/refund", json={"method": "cash"})
    assert r.status_code == 409


def test_the_list_puts_refunds_still_owed_first(client, db, admin, room, tenancy):  # noqa: F811
    other = allocate(db, paid_booking(db, room, "other@example.com", name="Other Tenant").id, "C1", admin)
    first = client.post(url(tenancy), json={"moved_out_on": today()}).json()["id"]
    client.post(url(other), json={"moved_out_on": today()})
    client.post(f"/api/admin/move-outs/{first}/refund", json={"method": "cash"})
    names = [m["tenant_name"] for m in client.get("/api/admin/move-outs").json()]
    assert names == ["Other Tenant", "Kwame Leaving"]


def test_after_moving_out_the_tenant_sees_it_and_can_book_again(client, db, tenancy, room):  # noqa: F811
    client.post(
        url(tenancy), json={"moved_out_on": today(), "deductions": [{"reason": "Damage", "amount": 100}]}
    )
    tenant = db.get(Tenancy, tenancy.id).tenant
    client.cookies.set("altheo_session", start_session(db, tenant))
    mine = client.get("/api/me/move-outs").json()
    assert [(m["refund_due"], m["deductions"][0]["reason"]) for m in mine] == [(4200, "Damage")]
    bookings = client.get("/api/bookings").json()
    assert bookings[0]["status"] == "moved_out"
    # No room any more, so no repair reports; and a new booking is allowed.
    assert client.get("/api/tickets").json()["blocked_reason"]
    assert start_booking(db, tenant, room.id).status == BookingStatus.PENDING_PAYMENT


def test_others_see_only_their_own(client, db, tenancy):
    client.post(url(tenancy), json={"moved_out_on": today()})
    stranger = person(db, "stranger@example.com")
    client.cookies.set("altheo_session", start_session(db, stranger))
    assert client.get("/api/me/move-outs").json() == []


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_move_tenants_out(client, db, tenancy, role):
    user = person(db, f"{role}-mo@example.com", role=role)
    client.cookies.set("altheo_session", start_session(db, user))
    assert client.get(url(tenancy)).status_code == 403
    assert client.post(url(tenancy), json={"moved_out_on": today()}).status_code == 403
    assert client.get("/api/admin/move-outs").status_code == 403
