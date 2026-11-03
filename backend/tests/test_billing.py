from datetime import date

import pytest
from sqlalchemy import select

from app.auth.sessions import start_session
from app.billing.service import (
    BillingError,
    BillStatus,
    balance,
    bill_status,
    create_bill,
    current_period,
    mark_payment,
    record_payment,
    tenant_compliance,
    void_bill,
)
from app.models import Bill, BillKind, Building, Payment, PaymentMethod, PaymentStatus, Role, RoomType, User

from .conftest import needs_db

pytestmark = needs_db

DUE = date(2026, 11, 10)
MOMO = PaymentMethod.PAYSTACK_MOMO
CASH = PaymentMethod.CASH


def person(db, email, role=Role.TENANT, name="Ama Mensah") -> User:
    u = User(name=name, email=email, phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def tenant(db):
    return person(db, "ama-bills@example.com")


@pytest.fixture
def room(db) -> RoomType:
    b = Building(name="Manny Building", location="Oyarifa", sanitation_fee=50)
    rt = RoomType(
        name="2 bedroom", rent=2000, quantity_available=2, booking_deposit=300, renting_deposit=4000
    )
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


def deposit(db, tenant, room=None, amount=300, kind=BillKind.BOOKING_DEPOSIT) -> Bill:
    return create_bill(
        db,
        tenant=tenant,
        kind=kind,
        amount=amount,
        description="Booking deposit",
        due_date=DUE,
        room_type=room,
    )


def sanitation(db, tenant, period="2026-11", amount=50) -> Bill:
    return create_bill(
        db,
        tenant=tenant,
        kind=BillKind.SANITATION,
        amount=amount,
        description=f"Sanitation {period}",
        due_date=DUE,
        period=period,
    )


def pay(db, bill, amount, ref, status=PaymentStatus.SUCCESS, method=MOMO):
    return record_payment(db, bill, amount=amount, method=method, reference=ref, status=status)


# --- Status -----------------------------------------------------------------------------------------


def test_a_new_bill_is_unpaid(db, tenant):
    bill = deposit(db, tenant)
    assert (bill_status(bill), balance(bill), bill.number) == (BillStatus.UNPAID, 300, f"BILL-{bill.id:06d}")


def test_part_payment_makes_it_partial_and_the_rest_makes_it_paid(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 100, "ref-1")
    assert (bill_status(bill), balance(bill)) == (BillStatus.PARTIAL, 200)
    pay(db, bill, 200, "ref-2")
    assert (bill_status(bill), balance(bill)) == (BillStatus.PAID, 0)


def test_pending_and_failed_payments_dont_count(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 300, "ref-pending", status=PaymentStatus.PENDING)
    pay(db, bill, 300, "ref-failed", status=PaymentStatus.FAILED)
    assert bill_status(bill) == BillStatus.UNPAID


def test_paying_more_than_is_owed_is_refused(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 250, "ref-1")
    with pytest.raises(BillingError, match="more than the GH₵ 50 still owed"):
        pay(db, bill, 100, "ref-2")


def test_payments_must_be_positive(db, tenant):
    with pytest.raises(BillingError, match="more than GH₵ 0"):
        pay(db, deposit(db, tenant), 0, "ref-0")


def test_recording_the_same_payment_twice_counts_it_once(db, tenant):
    bill = deposit(db, tenant)
    first = pay(db, bill, 100, "ps_123")
    again = pay(db, bill, 100, "ps_123")
    assert again.id == first.id
    assert db.scalars(select(Payment).where(Payment.bill_id == bill.id)).all() == [first]
    assert balance(bill) == 200


def test_a_reference_cant_be_reused_for_something_else(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 100, "ps_123")
    with pytest.raises(BillingError, match="already been used"):
        pay(db, bill, 50, "ps_123")
    with pytest.raises(BillingError, match="already been used"):
        pay(db, sanitation(db, tenant), 100, "ps_123")


def test_bills_must_be_for_something(db, tenant):
    with pytest.raises(BillingError, match="more than GH₵ 0"):
        deposit(db, tenant, amount=0)


# --- Paystack confirmations (used by #14) -----------------------------------------------------------------


def test_a_pending_payment_is_confirmed_once(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 300, "ps_9", status=PaymentStatus.PENDING)
    confirmed = mark_payment(db, "ps_9", PaymentStatus.SUCCESS)
    assert confirmed.paid_at is not None
    assert bill_status(bill) == BillStatus.PAID
    assert (
        mark_payment(db, "ps_9", PaymentStatus.SUCCESS).id == confirmed.id
    )  # a repeated webhook is harmless


def test_a_failed_payment_stays_failed(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 300, "ps_9", status=PaymentStatus.PENDING)
    mark_payment(db, "ps_9", PaymentStatus.FAILED)
    with pytest.raises(BillingError, match="already failed"):
        mark_payment(db, "ps_9", PaymentStatus.SUCCESS)
    assert bill_status(bill) == BillStatus.UNPAID


def test_confirming_an_unknown_reference_fails(db):
    with pytest.raises(BillingError, match="no payment with that reference"):
        mark_payment(db, "nope", PaymentStatus.SUCCESS)


def test_confirming_wont_overpay_a_bill_paid_in_the_meantime(db, tenant):
    bill = deposit(db, tenant)
    pay(db, bill, 300, "ps_late", status=PaymentStatus.PENDING)
    pay(db, bill, 300, "cash-1", method=CASH)
    with pytest.raises(BillingError, match="still owed"):
        mark_payment(db, "ps_late", PaymentStatus.SUCCESS)


# --- Cancelling, copies and sanitation months ------------------------------------------------------------


def test_cancelled_bills_cant_be_paid_and_paid_ones_cant_be_cancelled(db, tenant):
    unpaid = deposit(db, tenant)
    void_bill(db, unpaid)
    with pytest.raises(BillingError, match="cancelled"):
        pay(db, unpaid, 100, "ref-v")
    paid = deposit(db, tenant)
    pay(db, paid, 100, "ref-p")
    with pytest.raises(BillingError, match="can't be cancelled"):
        void_bill(db, paid)


def test_bill_amounts_dont_change_when_prices_do(db, tenant, room):
    bill = deposit(db, tenant, room=room, amount=room.booking_deposit)
    room.booking_deposit = 500
    db.commit()
    db.refresh(bill)
    assert (bill.amount, balance(bill)) == (300, 300)


def test_one_sanitation_bill_per_tenant_per_month(db, tenant):
    sanitation(db, tenant, "2026-11")
    sanitation(db, tenant, "2026-12")
    with pytest.raises(BillingError, match="already has a sanitation bill for 2026-11"):
        sanitation(db, tenant, "2026-11")
    other = person(db, "kofi-bills@example.com", name="Kofi")
    sanitation(db, other, "2026-11")


@pytest.mark.parametrize("period", [None, "2026-13", "Nov 2026", "2026-1"])
def test_sanitation_bills_need_a_valid_month(db, tenant, period):
    with pytest.raises(BillingError, match="needs the month"):
        sanitation(db, tenant, period)


def test_only_sanitation_bills_have_a_month(db, tenant):
    with pytest.raises(BillingError, match="Only sanitation bills"):
        create_bill(
            db,
            tenant=tenant,
            kind=BillKind.BOOKING_DEPOSIT,
            amount=300,
            description="x",
            due_date=DUE,
            period="2026-11",
        )


# --- Compliance ------------------------------------------------------------------------------------------


def statuses(c):
    return {f.kind: f.status for f in c.fees}


def test_a_tenant_with_no_bills_is_not_compliant(db, tenant):
    c = tenant_compliance(db, tenant.id, "2026-11")
    assert not c.fully_compliant
    assert set(statuses(c).values()) == {BillStatus.UNPAID}


def test_fully_compliant_only_when_all_three_are_paid(db, tenant):
    booking = deposit(db, tenant)
    renting = deposit(db, tenant, amount=4000, kind=BillKind.RENTING_DEPOSIT)
    nov = sanitation(db, tenant, "2026-11")
    pay(db, booking, 300, "b")
    pay(db, renting, 2000, "r1")
    assert statuses(tenant_compliance(db, tenant.id, "2026-11")) == {
        BillKind.BOOKING_DEPOSIT: BillStatus.PAID,
        BillKind.RENTING_DEPOSIT: BillStatus.PARTIAL,
        BillKind.SANITATION: BillStatus.UNPAID,
    }
    pay(db, renting, 2000, "r2")
    assert not tenant_compliance(db, tenant.id, "2026-11").fully_compliant
    pay(db, nov, 50, "s")
    assert tenant_compliance(db, tenant.id, "2026-11").fully_compliant


def test_compliance_is_per_month(db, tenant):
    for kind, amount in ((BillKind.BOOKING_DEPOSIT, 300), (BillKind.RENTING_DEPOSIT, 4000)):
        pay(db, deposit(db, tenant, amount=amount, kind=kind), amount, f"{kind}")
    pay(db, sanitation(db, tenant, "2026-11"), 50, "nov")
    assert tenant_compliance(db, tenant.id, "2026-11").fully_compliant
    # December's sanitation bill doesn't exist yet, so December isn't cleared.
    dec = tenant_compliance(db, tenant.id, "2026-12")
    assert not dec.fully_compliant
    assert next(f for f in dec.fees if f.kind == BillKind.SANITATION).bill is None


def test_cancelled_bills_dont_count_towards_compliance(db, tenant):
    bill = deposit(db, tenant)
    void_bill(db, bill)
    fee = next(
        f for f in tenant_compliance(db, tenant.id, "2026-11").fees if f.kind == BillKind.BOOKING_DEPOSIT
    )
    assert fee.bill is None


def test_current_period_format():
    assert current_period(date(2026, 3, 9)) == "2026-03"


# --- API -------------------------------------------------------------------------------------------------


def log_in(client, db, user):
    client.cookies.set("altheo_session", start_session(db, user))


@pytest.fixture
def admin(client, db):
    a = person(db, "admin-bills@example.com", role=Role.ADMIN, name="Esi Admin")
    log_in(client, db, a)
    return a


def test_tenants_see_only_their_own_bills(client, db, tenant, room):
    mine = deposit(db, tenant, room=room)
    pay(db, mine, 100, "mine-1")
    deposit(db, person(db, "kofi-bills@example.com", name="Kofi"))
    db.commit()
    log_in(client, db, tenant)
    body = client.get("/api/me/bills").json()
    assert [b["id"] for b in body] == [mine.id]
    assert {
        k: body[0][k]
        for k in ("number", "kind", "amount", "paid", "balance", "status", "room_type", "building")
    } == {
        "number": mine.number,
        "kind": "booking_deposit",
        "amount": 300,
        "paid": 100,
        "balance": 200,
        "status": "partial",
        "room_type": "2 bedroom",
        "building": "Manny Building",
    }
    assert body[0]["tenant"] is None
    assert [p["reference"] for p in body[0]["payments"]] == ["mine-1"]


def test_my_bills_needs_login(client):
    assert client.get("/api/me/bills").status_code == 401


def test_admin_lists_and_filters_bills(client, db, admin, tenant, room):
    paid = deposit(db, tenant, room=room)
    pay(db, paid, 300, "p")
    nov = sanitation(db, tenant, "2026-11")
    void_bill(db, deposit(db, tenant))
    db.commit()
    all_ids = [b["id"] for b in client.get("/api/admin/bills").json()]
    assert all_ids == [nov.id, paid.id]  # newest first, cancelled left out
    assert [b["id"] for b in client.get("/api/admin/bills", params={"status": "paid"}).json()] == [paid.id]
    assert [b["id"] for b in client.get("/api/admin/bills", params={"kind": "sanitation"}).json()] == [nov.id]
    assert [b["id"] for b in client.get("/api/admin/bills", params={"period": "2026-11"}).json()] == [nov.id]
    assert [
        b["id"] for b in client.get("/api/admin/bills", params={"building": room.building_id}).json()
    ] == [paid.id]
    assert [b["id"] for b in client.get("/api/admin/bills", params={"tenant": tenant.id}).json()] == [
        nov.id,
        paid.id,
    ]
    assert client.get("/api/admin/bills").json()[0]["tenant"] == {
        "id": tenant.id,
        "name": "Ama Mensah",
        "email": tenant.email,
    }
    assert client.get("/api/admin/bills", params={"period": "Nov"}).status_code == 422


def test_admin_records_cash_until_the_bill_is_paid(client, db, admin, tenant):
    bill = deposit(db, tenant)
    db.commit()
    url = f"/api/admin/bills/{bill.id}/payments"
    first = client.post(url, json={"amount": 100, "method": "cash", "note": "Paid at the office"})
    assert first.status_code == 201
    assert (first.json()["status"], first.json()["balance"]) == ("partial", 200)
    second = client.post(url, json={"amount": 200, "method": "bank"}).json()
    assert (second["status"], second["balance"]) == ("paid", 0)
    saved = db.scalars(select(Payment).where(Payment.bill_id == bill.id)).all()
    assert [(p.method, p.recorded_by_id, p.note) for p in saved] == [
        (CASH, admin.id, "Paid at the office"),
        (PaymentMethod.BANK, admin.id, None),
    ]
    too_much = client.post(url, json={"amount": 1, "method": "cash"})
    assert (too_much.status_code, too_much.json()["detail"]) == (
        400,
        "That's more than the GH₵ 0 still owed on this bill.",
    )


@pytest.mark.parametrize(
    "payload, field",
    [
        ({"amount": 0, "method": "cash"}, "amount"),
        ({"amount": 10, "method": "paystack_momo"}, "method"),
        ({"amount": 10, "method": "cash", "note": "x" * 201}, "note"),
    ],
)
def test_manual_payments_are_checked(client, db, admin, tenant, payload, field):
    bill = deposit(db, tenant)
    db.commit()
    response = client.post(f"/api/admin/bills/{bill.id}/payments", json=payload)
    assert response.status_code == 422
    assert field in response.json()["errors"]


def test_unknown_bill_is_404(client, admin):
    assert (
        client.post("/api/admin/bills/999999/payments", json={"amount": 10, "method": "cash"}).status_code
        == 404
    )


def test_compliance_endpoint(client, db, admin, tenant):
    bill = sanitation(db, tenant, "2026-11")
    pay(db, bill, 50, "s")
    db.commit()
    body = client.get(f"/api/admin/tenants/{tenant.id}/compliance", params={"period": "2026-11"}).json()
    assert body["fully_compliant"] is False
    assert {f["kind"]: (f["status"], f["bill_id"]) for f in body["fees"]} == {
        "booking_deposit": ("unpaid", None),
        "renting_deposit": ("unpaid", None),
        "sanitation": ("paid", bill.id),
    }
    assert client.get(f"/api/admin/tenants/{tenant.id}/compliance").json()["period"] == current_period()
    assert (
        client.get(f"/api/admin/tenants/{tenant.id}/compliance", params={"period": "2026-13"}).status_code
        == 400
    )
    assert client.get("/api/admin/tenants/nobody/compliance").status_code == 404


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_use_the_admin_bills_api(client, db, tenant, role):
    log_in(client, db, person(db, f"{role}-x@example.com", role=role))
    bill = deposit(db, tenant)
    db.commit()
    assert client.get("/api/admin/bills").status_code == 403
    assert (
        client.post(f"/api/admin/bills/{bill.id}/payments", json={"amount": 10, "method": "cash"}).status_code
        == 403
    )
    assert client.get(f"/api/admin/tenants/{tenant.id}/compliance").status_code == 403


def test_recording_a_payment_needs_the_csrf_header(db, admin, tenant, anon_client, client):
    bill = deposit(db, tenant)
    db.commit()
    anon_client.cookies.update(client.cookies)
    assert (
        anon_client.post(
            f"/api/admin/bills/{bill.id}/payments", json={"amount": 10, "method": "cash"}
        ).status_code
        == 403
    )
