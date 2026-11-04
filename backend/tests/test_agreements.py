import base64
import struct
from datetime import date

import pytest
from sqlalchemy import select

from app.agreements.service import add_years, check_signature_image
from app.agreements.template import DRAFT_WORDING
from app.allocations.service import allocate
from app.auth.sessions import start_session
from app.billing.service import record_payment
from app.bookings.service import confirm_payment, start_booking
from app.main import app
from app.models import (
    Agreement,
    Bill,
    BillKind,
    Building,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    Tenancy,
    User,
)
from app.payments.gateway import ChargeResult, ChargeStatus, SimulatedGateway, get_gateway

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/agreements"
LANDLORD = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg=="
)
DRAWN = LANDLORD
TYPED = {"kind": "typed", "typed_name": "  Ama   Mensah ", "agreed": True}
PAY = {"phone": "055 123 4987", "network": "mtn"}


class FakeGateway:
    simulated = False

    def __init__(self):
        self.charges = []
        self.verify_result = ChargeResult(ChargeStatus.PENDING)

    def charge_momo(self, **kwargs):
        self.charges.append(kwargs)
        return ChargeResult(ChargeStatus.PENDING, message="Approve on your phone")

    def verify(self, reference):
        return self.verify_result


@pytest.fixture
def gateway():
    fake = FakeGateway()
    app.dependency_overrides[get_gateway] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_gateway, None)


def person(db, email, role=Role.TENANT, name="Ama Mensah") -> User:
    u = User(name=name, email=email, phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    return u


def log_in(client, db, user):
    client.cookies.set("altheo_session", start_session(db, user))


@pytest.fixture
def admin(db):
    a = person(db, "admin-agree@example.com", role=Role.ADMIN, name="Esi Admin")
    a.signature_image = LANDLORD
    db.commit()
    return a


@pytest.fixture
def tenancy(db, admin) -> Tenancy:
    b = Building(name="Manny Building", location="Oyarifa", sanitation_fee=50)
    rt = RoomType(
        name="2 bedroom", rent=2000, quantity_available=2, booking_deposit=300, renting_deposit=4000
    )
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    tenant = person(db, "ama-agree@example.com")
    booking = start_booking(db, tenant, rt.id)
    record_payment(
        db,
        booking.bill,
        amount=300,
        method=PaymentMethod.PAYSTACK_MOMO,
        reference="agree-1",
        status=PaymentStatus.PENDING,
    )
    db.commit()
    confirm_payment(db, "agree-1", amount_cedis=300, currency="GHS")
    return allocate(db, booking.id, "A12", admin)


@pytest.fixture
def as_tenant(client, db, tenancy):
    log_in(client, db, db.get(User, tenancy.tenant_id))
    return client


def agreement_of(db, tenancy) -> Agreement:
    return db.scalar(select(Agreement).where(Agreement.tenancy_id == tenancy.id))


def bill_url(tenancy, suffix=""):
    return f"/api/me/bills/{tenancy.renting_bill_id}{suffix}"


# --- Created at allocation -----------------------------------------------------------------------------


def test_allocating_creates_the_agreement_filled_in(as_tenant, db, tenancy):
    a = agreement_of(db, tenancy)
    body = as_tenant.get(f"{URL}/{a.id}").json()
    assert (body["lease_start"], body["signed_at"]) == (tenancy.start_date.isoformat(), None)
    assert body["lease_end"] == add_years(tenancy.start_date, 1).isoformat()
    text = body["body"]
    assert "{{" not in text
    for expected in (
        "Ama Mensah",
        "room A12",
        "2 bedroom",
        "Manny Building, Oyarifa",
        "GH₵ 2,000",
        "GH₵ 50",
        "GH₵ 300",
        "GH₵ 4,000",
    ):
        assert expected in text
    start = tenancy.start_date
    assert f"{start.day} {start:%b %Y}" in text
    assert body["landlord_signature"] == LANDLORD
    assert (body["landlord_name"], body["draft_wording"]) == ("Altheo Homes", DRAFT_WORDING)
    assert (body["renting_deposit"], body["renting_bill_status"]) == (4000, "unpaid")


def test_later_changes_dont_touch_an_existing_agreement(as_tenant, db, tenancy, admin):
    a = agreement_of(db, tenancy)
    before = as_tenant.get(f"{URL}/{a.id}").json()
    room = db.get(RoomType, tenancy.room_type_id)
    room.rent = 9999
    admin.signature_image = None
    db.commit()
    after = as_tenant.get(f"{URL}/{a.id}").json()
    assert (after["body"], after["landlord_signature"]) == (before["body"], before["landlord_signature"])


@pytest.mark.parametrize(
    "start, end",
    [(date(2026, 11, 4), date(2027, 11, 4)), (date(2028, 2, 29), date(2029, 2, 28))],
)
def test_lease_end_is_a_year_on(start, end):
    assert add_years(start, 1) == end


# --- Signing -------------------------------------------------------------------------------------------


def test_signing_by_typing(as_tenant, db, tenancy):
    a = agreement_of(db, tenancy)
    response = as_tenant.post(f"{URL}/{a.id}/sign", json=TYPED, headers={"user-agent": "Test Phone"})
    assert response.status_code == 200
    body = response.json()
    assert (body["tenant_signature_kind"], body["tenant_typed_name"], body["tenant_signature_image"]) == (
        "typed",
        "Ama Mensah",
        None,
    )
    assert body["signed_at"] is not None
    assert len(body["document_hash"]) == 64
    db.refresh(a)
    assert a.signed_user_agent == "Test Phone"
    assert a.signed_ip


def test_signing_by_drawing(as_tenant, db, tenancy):
    a = agreement_of(db, tenancy)
    body = as_tenant.post(f"{URL}/{a.id}/sign", json={"kind": "drawn", "image": DRAWN, "agreed": True}).json()
    assert (body["tenant_signature_kind"], body["tenant_signature_image"], body["tenant_typed_name"]) == (
        "drawn",
        DRAWN,
        None,
    )


def test_it_can_only_be_signed_once(as_tenant, db, tenancy):
    a = agreement_of(db, tenancy)
    first = as_tenant.post(f"{URL}/{a.id}/sign", json=TYPED).json()
    again = as_tenant.post(f"{URL}/{a.id}/sign", json={**TYPED, "typed_name": "Someone Else"})
    assert (again.status_code, again.json()["detail"]) == (409, "This agreement has already been signed.")
    assert as_tenant.get(f"{URL}/{a.id}").json()["tenant_typed_name"] == first["tenant_typed_name"]


@pytest.mark.parametrize(
    "payload, message",
    [
        ({**TYPED, "agreed": False}, "Tick the box"),
        ({"kind": "typed", "typed_name": " ", "agreed": True}, "Type your full legal name."),
        ({"kind": "typed", "typed_name": "x" * 121, "agreed": True}, "under 120"),
        ({"kind": "drawn", "agreed": True}, "Draw your signature first."),
        ({"kind": "drawn", "image": "data:image/svg+xml;base64,PHN2Zz4=", "agreed": True}, "must be a PNG"),
    ],
)
def test_bad_signatures_are_refused(as_tenant, db, tenancy, payload, message):
    a = agreement_of(db, tenancy)
    response = as_tenant.post(f"{URL}/{a.id}/sign", json=payload)
    assert response.status_code == 422
    assert message in response.json()["detail"]
    db.refresh(a)
    assert a.signed_at is None


def png(width=10, height=10, extra=0) -> str:
    raw = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + struct.pack(">II", width, height) + b"\x00" * (10 + extra)
    return "data:image/png;base64," + base64.b64encode(raw).decode()


def test_signature_images_are_checked():
    assert check_signature_image(LANDLORD) == LANDLORD
    assert check_signature_image(png())
    for bad, message in [
        ("https://example.com/x.png", "must be a PNG"),
        ("data:image/png;base64,not base64!", "must be a PNG"),
        ("data:image/png;base64," + base64.b64encode(b"<svg></svg>" * 5).decode(), "must be a PNG"),
        (png(width=99999), "size looks wrong"),
        (png(height=0), "size looks wrong"),
        (png(extra=600 * 1024), "too large"),
    ]:
        with pytest.raises(ValueError, match=message):
            check_signature_image(bad)


# --- The renting deposit stays locked until it's signed --------------------------------------------------


def test_the_renting_deposit_cant_be_paid_until_signed(as_tenant, db, tenancy, gateway):
    before = as_tenant.get(bill_url(tenancy)).json()
    assert (
        before["locked_reason"] == "Sign your tenancy agreement first, then you can pay the renting deposit."
    )
    refused = as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    assert (refused.status_code, refused.json()["detail"]) == (409, before["locked_reason"])
    assert gateway.charges == []

    a = agreement_of(db, tenancy)
    as_tenant.post(f"{URL}/{a.id}/sign", json=TYPED)
    assert as_tenant.get(bill_url(tenancy)).json()["locked_reason"] is None
    paying = as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    assert paying.status_code == 200
    assert paying.json()["payments"][-1]["status"] == "pending"
    assert (gateway.charges[0]["amount"], gateway.charges[0]["phone"]) == (4000, "+233551234987")

    gateway.verify_result = ChargeResult(ChargeStatus.SUCCESS, amount_cedis=4000, currency="GHS")
    paid = as_tenant.get(bill_url(tenancy)).json()
    assert (paid["status"], paid["balance"]) == ("paid", 0)
    again = as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    assert (again.status_code, again.json()["detail"]) == (409, "This bill is already paid.")


def test_only_one_prompt_at_a_time_on_a_bill(as_tenant, db, tenancy, gateway):
    as_tenant.post(f"{URL}/{agreement_of(db, tenancy).id}/sign", json=TYPED)
    as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    second = as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    assert second.status_code == 409
    assert len(gateway.charges) == 1


def test_only_whats_left_is_charged(as_tenant, db, tenancy, gateway):
    as_tenant.post(f"{URL}/{agreement_of(db, tenancy).id}/sign", json=TYPED)
    bill = db.get(Bill, tenancy.renting_bill_id)
    record_payment(db, bill, amount=1500, method=PaymentMethod.CASH, reference="cash-1")
    db.commit()
    as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    assert gateway.charges[0]["amount"] == 2500


def test_a_booking_deposit_isnt_paid_this_way(as_tenant, db, tenancy, gateway):
    deposit = db.scalar(
        select(Bill).where(Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.BOOKING_DEPOSIT)
    )
    assert as_tenant.post(f"/api/me/bills/{deposit.id}/pay", json=PAY).status_code == 409


def test_when_payments_are_off(as_tenant, db, tenancy):
    app.dependency_overrides[get_gateway] = lambda: None
    try:
        assert as_tenant.post(bill_url(tenancy, "/pay"), json=PAY).status_code == 503
    finally:
        app.dependency_overrides.pop(get_gateway, None)


def test_pretend_payments_for_a_bill(as_tenant, db, tenancy):
    app.dependency_overrides[get_gateway] = lambda: SimulatedGateway()
    try:
        as_tenant.post(f"{URL}/{agreement_of(db, tenancy).id}/sign", json=TYPED)
        assert as_tenant.post(bill_url(tenancy, "/simulate"), json={"outcome": "success"}).status_code == 409
        assert as_tenant.post(bill_url(tenancy, "/pay"), json=PAY).json()["test_mode"] is True
        declined = as_tenant.post(bill_url(tenancy, "/simulate"), json={"outcome": "failed"}).json()
        assert declined["payments"][-1]["status"] == "failed"
        as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
        assert (
            as_tenant.post(bill_url(tenancy, "/simulate"), json={"outcome": "success"}).json()["status"]
            == "paid"
        )
    finally:
        app.dependency_overrides.pop(get_gateway, None)


def test_test_buttons_dont_exist_with_a_real_gateway(as_tenant, tenancy, gateway):
    assert as_tenant.post(bill_url(tenancy, "/simulate"), json={"outcome": "success"}).status_code == 404


def test_money_from_the_webhook_counts_on_a_bill(as_tenant, db, tenancy, gateway):
    as_tenant.post(f"{URL}/{agreement_of(db, tenancy).id}/sign", json=TYPED)
    as_tenant.post(bill_url(tenancy, "/pay"), json=PAY)
    reference = gateway.charges[0]["reference"]
    assert (
        confirm_payment(db, reference, amount_cedis=4000, currency="GHS") is None
    )  # no booking on this bill
    assert as_tenant.get(bill_url(tenancy)).json()["status"] == "paid"


# --- On the tenant's booking -----------------------------------------------------------------------------


def test_the_booking_says_whether_its_signed(as_tenant, db, tenancy):
    a = agreement_of(db, tenancy)
    url = f"/api/bookings/{tenancy.booking_id}"
    t = as_tenant.get(url).json()["tenancy"]
    assert (t["agreement_id"], t["agreement_signed"], t["renting_bill_id"]) == (
        a.id,
        False,
        tenancy.renting_bill_id,
    )
    as_tenant.post(f"{URL}/{a.id}/sign", json=TYPED)
    assert as_tenant.get(url).json()["tenancy"]["agreement_signed"] is True


# --- Everyone's copies, and access -----------------------------------------------------------------------


def test_tenant_and_admin_both_keep_a_copy(client, db, tenancy, admin):
    a = agreement_of(db, tenancy)
    log_in(client, db, db.get(User, tenancy.tenant_id))
    client.post(f"{URL}/{a.id}/sign", json=TYPED)
    mine = client.get(URL).json()
    assert [(m["id"], m["room_number"]) for m in mine] == [(a.id, "A12")]
    assert mine[0]["signed_at"]
    log_in(client, db, admin)
    listed = client.get("/api/admin/agreements").json()
    assert [(x["id"], x["tenant_name"]) for x in listed] == [(a.id, "Ama Mensah")]
    assert client.get(f"/api/admin/agreements/{a.id}").json()["tenant_typed_name"] == "Ama Mensah"
    assert client.get("/api/admin/agreements/nope").status_code == 404


def test_people_only_reach_their_own(client, db, tenancy, gateway):
    a = agreement_of(db, tenancy)
    log_in(client, db, person(db, "kofi-agree@example.com", name="Kofi"))
    assert client.get(URL).json() == []
    assert client.get(f"{URL}/{a.id}").status_code == 404
    assert client.post(f"{URL}/{a.id}/sign", json=TYPED).status_code == 404
    assert client.get(bill_url(tenancy)).status_code == 404
    assert client.post(bill_url(tenancy, "/pay"), json=PAY).status_code == 404
    assert client.get("/api/admin/agreements").status_code == 403
    assert client.get("/api/admin/signature").status_code == 403
    db.refresh(a)
    assert a.signed_at is None


def test_logged_out_is_refused(client):
    assert client.get(URL).status_code == 401
    assert client.get("/api/admin/signature").status_code == 401


def test_signing_needs_the_csrf_header(anon_client):
    assert anon_client.post(f"{URL}/x/sign", json=TYPED).status_code == 403


# --- The admin's signature -------------------------------------------------------------------------------


def test_admin_uploads_and_replaces_their_signature(client, db):
    a = person(db, "admin-sign@example.com", role=Role.ADMIN, name="Esi")
    log_in(client, db, a)
    assert client.get("/api/admin/signature").json() == {"image": None}
    assert client.put("/api/admin/signature", json={"image": LANDLORD}).json() == {"image": LANDLORD}
    assert client.get("/api/admin/signature").json() == {"image": LANDLORD}
    other = png()
    assert client.put("/api/admin/signature", json={"image": other}).json() == {"image": other}


@pytest.mark.parametrize("image", ["data:image/svg+xml;base64,PHN2Zz4=", "nonsense"])
def test_only_png_signatures_are_accepted(client, db, image):
    log_in(client, db, person(db, "admin-bad@example.com", role=Role.ADMIN, name="Esi"))
    response = client.put("/api/admin/signature", json={"image": image})
    assert response.status_code == 422
    assert response.json()["errors"]["image"] == "The signature must be a PNG image."
