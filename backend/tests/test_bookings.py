import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select

from app.auth.sessions import start_session
from app.bookings.service import HOLD, PAYMENT_WINDOW, TIMED_OUT
from app.config import get_settings
from app.db import utcnow
from app.main import app
from app.models import Bill, Booking, Building, Payment, PaymentMethod, PaymentStatus, Role, RoomType, User
from app.payments.gateway import (
    ChargeResult,
    ChargeStatus,
    GatewayError,
    PaystackGateway,
    SimulatedGateway,
    get_gateway,
)

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/bookings"
PAY = {"phone": "055 123 4987", "network": "mtn"}


class FakeGateway:
    """Stands in for a provider: records charges and answers what the test says."""

    simulated = False
    method = PaymentMethod.PAYSTACK_MOMO

    def __init__(self):
        self.charges = []
        self.charge_result = ChargeResult(ChargeStatus.PENDING, message="Approve on your phone")
        self.verify_result = ChargeResult(ChargeStatus.PENDING)
        self.error = None

    def charge_momo(self, **kwargs):
        self.charges.append(kwargs)
        if self.error:
            raise self.error
        return self.charge_result

    def verify(self, reference):
        if self.error:
            raise self.error
        return self.verify_result


@pytest.fixture
def gateway():
    fake = FakeGateway()
    app.dependency_overrides[get_gateway] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_gateway, None)


def person(db, email, role=Role.TENANT) -> User:
    u = User(name="Ama Mensah", email=email, phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    return u


def log_in(client, db, user):
    client.cookies.set("altheo_session", start_session(db, user))


@pytest.fixture
def tenant(client, db):
    u = person(db, "ama-book@example.com")
    log_in(client, db, u)
    return u


def make_room(db, name="Manny Building", quantity=2, deposit=300, listed=True) -> RoomType:
    b = Building(name=name, location="Oyarifa", sanitation_fee=50, listed=listed)
    rt = RoomType(name="2 bedroom", rent=2000, quantity_available=quantity, booking_deposit=deposit)
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


@pytest.fixture
def room(db):
    return make_room(db)


def book(client, room):
    return client.post(URL, json={"room_type_id": room.id})


def payment_for(db, booking_id) -> Payment:
    booking = db.get(Booking, booking_id)
    return db.scalars(
        select(Payment).where(Payment.bill_id == booking.bill_id).order_by(Payment.id.desc())
    ).first()


def paid_booking(client, db, gateway, room) -> dict:
    """A booking whose deposit Paystack has confirmed."""
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    gateway.verify_result = ChargeResult(
        ChargeStatus.SUCCESS, amount_cedis=room.booking_deposit, currency="GHS"
    )
    return client.get(f"{URL}/{body['id']}").json()


# --- Starting a booking ------------------------------------------------------------------------------


def test_booking_creates_a_deposit_bill_with_the_amount_copied(client, db, tenant, room, gateway):
    response = book(client, room)
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["room"], body["building"], body["location"], body["deposit"]) == (
        "pending_payment",
        "2 bedroom",
        "Manny Building",
        "Oyarifa",
        300,
    )
    assert (body["bill_status"], body["payment"], body["test_mode"]) == ("unpaid", None, False)
    room.booking_deposit = 900
    db.commit()
    assert client.get(f"{URL}/{body['id']}").json()["deposit"] == 300
    bill = db.get(Bill, db.get(Booking, body["id"]).bill_id)
    assert bill.description == "Refundable booking deposit, 2 bedroom at Manny Building"


def test_booking_the_same_room_again_continues_the_same_booking(client, db, tenant, room, gateway):
    first = book(client, room).json()
    assert book(client, room).json()["id"] == first["id"]
    assert len(db.scalars(select(Bill).where(Bill.tenant_id == tenant.id)).all()) == 1


def test_choosing_another_room_replaces_an_unpaid_booking(client, db, tenant, room, gateway):
    first = book(client, room).json()
    second = book(client, make_room(db, name="Other Block")).json()
    assert second["id"] != first["id"]
    assert client.get(f"{URL}/{first['id']}").json()["status"] == "cancelled"
    assert db.get(Bill, db.get(Booking, first["id"]).bill_id).voided_at is not None


def test_a_paid_booking_stops_another_one(client, db, tenant, room, gateway):
    paid_booking(client, db, gateway, room)
    response = book(client, make_room(db, name="Other Block"))
    assert response.status_code == 409
    assert "already booked a 2 bedroom at Manny Building" in response.json()["detail"]


@pytest.mark.parametrize(
    "kwargs, code, message",
    [
        ({"deposit": 0}, 409, "Online booking isn't open"),
        ({"quantity": 0}, 409, "fully booked"),
        ({"listed": False}, 404, "isn't available"),
    ],
)
def test_rooms_that_cant_be_booked(client, db, tenant, gateway, kwargs, code, message):
    response = book(client, make_room(db, **kwargs))
    assert response.status_code == code
    assert message in response.json()["detail"]


def test_unknown_room(client, tenant, gateway):
    assert client.post(URL, json={"room_type_id": "nope"}).status_code == 404


# --- Rooms are held so nobody pays for a room that isn't there ----------------------------------------


def as_other(client, db, email):
    log_in(client, db, person(db, email))


def listed_quantity(client, room):
    return client.get(f"/api/listings/rooms/{room.id}").json()["room"]["quantity_available"]


def test_paid_and_in_progress_bookings_hold_rooms(client, db, tenant, gateway):
    room = make_room(db, quantity=2)
    paid_booking(client, db, gateway, room)
    gateway.verify_result = ChargeResult(ChargeStatus.PENDING)
    assert listed_quantity(client, room) == 1
    as_other(client, db, "kofi-book@example.com")
    assert book(client, room).status_code == 201
    as_other(client, db, "esi-book@example.com")
    assert listed_quantity(client, room) == 0
    response = book(client, room)
    assert response.status_code == 409
    assert "fully booked" in response.json()["detail"]
    db.refresh(room)
    assert room.quantity_available == 2  # only allocation changes the real count


def test_your_own_unpaid_hold_doesnt_lock_you_out_of_the_room(client, db, tenant, gateway):
    room = make_room(db, quantity=1)
    book(client, room)
    assert listed_quantity(client, room) == 1  # still open to the person holding it, so they can retry
    as_other(client, db, "kofi-book@example.com")
    assert listed_quantity(client, room) == 0


def test_your_own_paid_booking_still_counts(client, db, tenant, gateway):
    room = make_room(db, quantity=1)
    paid_booking(client, db, gateway, room)
    assert listed_quantity(client, room) == 0


def test_an_abandoned_booking_lets_go_of_the_room_after_the_hold(client, db, tenant, gateway):
    room = make_room(db, quantity=1)
    first = book(client, room).json()
    as_other(client, db, "kofi-book@example.com")
    assert listed_quantity(client, room) == 0
    booking = db.get(Booking, first["id"])
    booking.hold_until = utcnow() - timedelta(seconds=1)
    db.commit()
    assert listed_quantity(client, room) == 1
    assert book(client, room).status_code == 201


def test_coming_back_after_the_hold_cant_take_a_room_someone_else_got(client, db, tenant, gateway):
    room = make_room(db, quantity=1)
    first = book(client, room).json()
    booking = db.get(Booking, first["id"])
    booking.hold_until = utcnow() - timedelta(seconds=1)
    db.commit()
    log_in(client, db, person(db, "kofi-book@example.com"))
    book(client, room)
    log_in(client, db, tenant)
    response = client.post(f"{URL}/{first['id']}/pay", json=PAY)
    assert response.status_code == 409
    assert gateway.charges == []


def test_paying_renews_the_hold(client, db, tenant, room, gateway):
    body = book(client, room).json()
    booking = db.get(Booking, body["id"])
    booking.hold_until = utcnow() - timedelta(seconds=1)
    db.commit()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    db.refresh(booking)
    assert booking.hold_until > utcnow() + HOLD - timedelta(minutes=1)


# --- Paying ------------------------------------------------------------------------------------------


def test_pay_sends_the_prompt_and_waits(client, db, tenant, room, gateway):
    body = book(client, room).json()
    response = client.post(f"{URL}/{body['id']}/pay", json=PAY)
    assert response.status_code == 200
    assert response.json()["payment"] == {
        "status": "pending",
        "message": "Approve on your phone",
        "otp_required": False,
    }
    assert response.json()["status"] == "pending_payment"
    charge = gateway.charges[0]
    assert {k: charge[k] for k in ("email", "amount", "phone", "network")} == {
        "email": tenant.email,
        "amount": 300,
        "phone": "+233551234987",
        "network": "mtn",
    }
    assert charge["reference"] == payment_for(db, body["id"]).reference


def test_the_booking_is_confirmed_when_the_provider_says_so(client, db, tenant, room, gateway):
    body = paid_booking(client, db, gateway, room)
    assert (body["status"], body["bill_status"], body["payment"]["status"]) == (
        "awaiting_allocation",
        "paid",
        "success",
    )
    booking = db.get(Booking, body["id"])
    assert booking.paid_at is not None
    assert booking.hold_until is None


def test_an_immediate_success_confirms_straight_away(client, db, tenant, room, gateway):
    gateway.charge_result = ChargeResult(ChargeStatus.SUCCESS, amount_cedis=300, currency="GHS")
    body = book(client, room).json()
    assert client.post(f"{URL}/{body['id']}/pay", json=PAY).json()["status"] == "awaiting_allocation"


def test_a_refused_charge_can_be_tried_again(client, db, tenant, room, gateway):
    gateway.charge_result = ChargeResult(ChargeStatus.FAILED, message="Insufficient funds")
    body = book(client, room).json()
    failed = client.post(f"{URL}/{body['id']}/pay", json=PAY).json()
    assert failed["payment"] == {
        "status": "failed",
        "message": "Insufficient funds",
        "otp_required": False,
    }
    assert failed["status"] == "pending_payment"
    gateway.charge_result = ChargeResult(ChargeStatus.PENDING)
    assert client.post(f"{URL}/{body['id']}/pay", json=PAY).json()["payment"]["status"] == "pending"
    assert len(gateway.charges) == 2


def test_when_the_provider_cant_be_reached(client, db, tenant, room, gateway):
    gateway.error = GatewayError("We couldn't reach the payment service. Try again in a moment.")
    body = book(client, room).json()
    response = client.post(f"{URL}/{body['id']}/pay", json=PAY)
    assert response.status_code == 502
    assert "couldn't reach" in response.json()["detail"]
    assert payment_for(db, body["id"]).status == PaymentStatus.FAILED


def test_only_one_prompt_at_a_time(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    second = client.post(f"{URL}/{body['id']}/pay", json=PAY)
    assert second.status_code == 409
    assert "already waiting" in second.json()["detail"]
    assert len(gateway.charges) == 1


def test_a_paid_booking_cant_be_paid_again(client, db, tenant, room, gateway):
    body = paid_booking(client, db, gateway, room)
    assert client.post(f"{URL}/{body['id']}/pay", json=PAY).status_code == 409
    assert len(gateway.charges) == 1


def test_a_failure_reported_later_is_shown(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    gateway.verify_result = ChargeResult(ChargeStatus.FAILED, message="Declined by the customer")
    assert client.get(f"{URL}/{body['id']}").json()["payment"] == {
        "status": "failed",
        "message": "Declined by the customer",
        "otp_required": False,
    }


def test_a_prompt_nobody_approves_times_out(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    assert client.get(f"{URL}/{body['id']}").json()["payment"]["status"] == "pending"
    payment = payment_for(db, body["id"])
    payment.created_at = utcnow() - PAYMENT_WINDOW - timedelta(seconds=1)
    db.commit()
    assert client.get(f"{URL}/{body['id']}").json()["payment"] == {
        "status": "failed",
        "message": TIMED_OUT,
        "otp_required": False,
    }


def test_a_provider_hiccup_while_checking_changes_nothing(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    gateway.error = GatewayError("down")
    assert client.get(f"{URL}/{body['id']}").json()["payment"]["status"] == "pending"


@pytest.mark.parametrize(
    "amount, currency",
    [(100, "GHS"), (300, "NGN"), (None, None)],
)
def test_the_wrong_amount_is_never_counted_as_paid(client, db, tenant, room, gateway, amount, currency):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    gateway.verify_result = ChargeResult(ChargeStatus.SUCCESS, amount_cedis=amount, currency=currency)
    after = client.get(f"{URL}/{body['id']}").json()
    assert (after["status"], after["bill_status"]) == ("pending_payment", "unpaid")


@pytest.mark.parametrize(
    "payload, field",
    [({"phone": "123", "network": "mtn"}, "phone"), ({"phone": "0551234987", "network": "glo"}, "network")],
)
def test_pay_details_are_checked(client, tenant, room, gateway, payload, field):
    body = book(client, room).json()
    response = client.post(f"{URL}/{body['id']}/pay", json=payload)
    assert response.status_code == 422
    assert field in response.json()["errors"]


def test_when_payments_are_off(client, tenant, room):
    app.dependency_overrides[get_gateway] = lambda: None
    try:
        body = book(client, room).json()
        response = client.post(f"{URL}/{body['id']}/pay", json=PAY)
        assert response.status_code == 503
        assert "isn't available" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_gateway, None)


# --- Cancelling --------------------------------------------------------------------------------------


def test_cancelling_an_unpaid_booking_frees_the_room(client, db, tenant, gateway):
    room = make_room(db, quantity=1)
    body = book(client, room).json()
    assert client.post(f"{URL}/{body['id']}/cancel").json()["status"] == "cancelled"
    assert listed_quantity(client, room) == 1
    assert client.post(f"{URL}/{body['id']}/cancel").status_code == 200


def test_cant_cancel_while_a_payment_is_waiting_or_after_paying(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    waiting = client.post(f"{URL}/{body['id']}/cancel")
    assert (waiting.status_code, "still in progress" in waiting.json()["detail"]) == (409, True)
    gateway.verify_result = ChargeResult(ChargeStatus.SUCCESS, amount_cedis=300, currency="GHS")
    paid = client.post(f"{URL}/{body['id']}/cancel")  # checking first finds it has just been paid
    assert paid.status_code == 409
    assert "can't be cancelled" in paid.json()["detail"]


# --- Webhook -----------------------------------------------------------------------------------------

SECRET = "sk_test_webhook"


@pytest.fixture
def webhook_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "paystack_secret_key", SECRET)


def send_webhook(anon_client, event, secret=SECRET):
    raw = json.dumps(event).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    return anon_client.post(
        "/api/webhooks/paystack", content=raw, headers={"x-paystack-signature": signature}
    )


@pytest.fixture
def waiting(client, db, tenant, room, gateway):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    return body["id"], payment_for(db, body["id"]).reference


def success_event(reference, amount=30000, currency="GHS"):
    return {
        "event": "charge.success",
        "data": {"reference": reference, "amount": amount, "currency": currency},
    }


def test_the_webhook_confirms_a_booking_without_the_csrf_header(
    client, db, anon_client, webhook_key, waiting
):
    booking_id, reference = waiting
    response = send_webhook(client, success_event(reference))
    assert (response.status_code, response.json()) == (200, {"received": True})
    assert client.get(f"{URL}/{booking_id}").json()["status"] == "awaiting_allocation"


def test_a_repeated_webhook_counts_once(client, db, webhook_key, waiting):
    booking_id, reference = waiting
    send_webhook(client, success_event(reference))
    assert send_webhook(client, success_event(reference)).status_code == 200
    assert client.get(f"{URL}/{booking_id}").json()["bill_status"] == "paid"
    assert len(db.scalars(select(Payment).where(Payment.reference == reference)).all()) == 1


def test_a_webhook_with_a_bad_signature_is_refused(client, db, webhook_key, waiting):
    booking_id, reference = waiting
    assert send_webhook(client, success_event(reference), secret="wrong").status_code == 401
    missing = client.post("/api/webhooks/paystack", content=b"{}")
    assert missing.status_code == 401
    assert client.get(f"{URL}/{booking_id}").json()["status"] == "pending_payment"


def test_a_webhook_with_the_wrong_amount_doesnt_confirm(client, db, webhook_key, waiting):
    booking_id, reference = waiting
    assert send_webhook(client, success_event(reference, amount=100)).status_code == 200
    assert client.get(f"{URL}/{booking_id}").json()["status"] == "pending_payment"


def test_a_webhook_for_something_else_is_ignored(client, webhook_key, waiting):
    assert send_webhook(client, success_event("not-ours")).status_code == 200
    assert send_webhook(client, {"event": "transfer.success", "data": {}}).status_code == 200


def test_webhook_is_off_without_a_key(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "paystack_secret_key", None)
    assert client.post("/api/webhooks/paystack", content=b"{}").status_code == 404


def test_money_arriving_after_a_timeout_still_counts(client, db, webhook_key, waiting):
    booking_id, reference = waiting
    payment = payment_for(db, booking_id)
    payment.created_at = utcnow() - PAYMENT_WINDOW - timedelta(seconds=1)
    db.commit()
    assert client.get(f"{URL}/{booking_id}").json()["payment"]["status"] == "failed"
    send_webhook(client, success_event(reference))
    after = client.get(f"{URL}/{booking_id}").json()
    assert (after["status"], after["bill_status"]) == ("awaiting_allocation", "paid")


def test_money_arriving_for_a_cancelled_booking_still_counts(client, db, webhook_key, waiting):
    booking_id, reference = waiting
    payment = payment_for(db, booking_id)
    payment.status = PaymentStatus.FAILED
    db.commit()
    assert client.post(f"{URL}/{booking_id}/cancel").json()["status"] == "cancelled"
    send_webhook(client, success_event(reference))
    after = client.get(f"{URL}/{booking_id}").json()
    assert (after["status"], after["bill_status"]) == ("awaiting_allocation", "paid")
    assert db.get(Booking, booking_id).bill.voided_at is None


def test_paying_twice_is_flagged_not_lost(client, db, webhook_key, waiting, gateway):
    booking_id, first_ref = waiting
    payment = payment_for(db, booking_id)
    payment.status = PaymentStatus.FAILED  # we gave up on the first prompt...
    db.commit()
    client.post(f"{URL}/{booking_id}/pay", json=PAY)
    second_ref = payment_for(db, booking_id).reference
    send_webhook(client, success_event(second_ref))
    send_webhook(client, success_event(first_ref))  # ...but both were approved
    refund = db.scalar(select(Payment).where(Payment.reference == first_ref))
    assert (refund.status, refund.note) == (PaymentStatus.FAILED, "Paid twice: this payment needs refunding.")
    assert client.get(f"{URL}/{booking_id}").json()["bill_status"] == "paid"


# --- Access ------------------------------------------------------------------------------------------


def test_people_only_see_their_own_bookings(client, db, tenant, room, gateway):
    body = book(client, room).json()
    assert [b["id"] for b in client.get(URL).json()] == [body["id"]]
    as_other(client, db, "kofi-book@example.com")
    assert client.get(URL).json() == []
    assert client.get(f"{URL}/{body['id']}").status_code == 404
    assert client.post(f"{URL}/{body['id']}/pay", json=PAY).status_code == 404
    assert client.post(f"{URL}/{body['id']}/cancel").status_code == 404


def test_only_tenants_book(client, db, room, gateway):
    assert book(client, room).status_code == 401
    log_in(client, db, person(db, "admin-book@example.com", role=Role.ADMIN))
    assert book(client, room).status_code == 403


def test_booking_needs_the_csrf_header(anon_client):
    assert anon_client.post(URL, json={"room_type_id": "x"}).status_code == 403


# --- Pretend payments --------------------------------------------------------------------------------


@pytest.fixture
def pretend():
    app.dependency_overrides[get_gateway] = lambda: SimulatedGateway()
    yield
    app.dependency_overrides.pop(get_gateway, None)


def test_pretend_payments_can_be_confirmed_or_declined(client, db, tenant, room, pretend):
    body = book(client, room).json()
    assert body["test_mode"] is True
    url = f"{URL}/{body['id']}"
    assert (
        client.post(f"{url}/simulate", json={"outcome": "success"}).status_code == 409
    )  # nothing waiting yet
    client.post(f"{url}/pay", json=PAY)
    declined = client.post(f"{url}/simulate", json={"outcome": "failed"}).json()
    assert declined["payment"]["status"] == "failed"
    client.post(f"{url}/pay", json=PAY)
    assert (
        client.post(f"{url}/simulate", json={"outcome": "success"}).json()["status"] == "awaiting_allocation"
    )


def test_pretend_payments_wait_however_long_it_takes(client, db, tenant, room, pretend):
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    payment = payment_for(db, body["id"])
    payment.created_at = utcnow() - PAYMENT_WINDOW - timedelta(minutes=1)
    db.commit()
    assert client.get(f"{URL}/{body['id']}").json()["payment"]["status"] == "pending"


def test_the_test_buttons_dont_exist_with_a_real_gateway(client, tenant, room, gateway):
    body = book(client, room).json()
    assert client.post(f"{URL}/{body['id']}/simulate", json={"outcome": "success"}).status_code == 404


@pytest.mark.parametrize(
    "env, key, expected",
    [
        ("production", None, type(None)),
        ("development", None, SimulatedGateway),
        ("development", "", SimulatedGateway),
        ("production", "sk_live_x", PaystackGateway),
        ("development", "sk_test_x", PaystackGateway),
    ],
)
def test_which_gateway_is_used(monkeypatch, env, key, expected):
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", env)
    monkeypatch.setattr(settings, "paystack_secret_key", key)
    assert isinstance(get_gateway(), expected)


# --- The Paystack client ---------------------------------------------------------------------------------


def paystack(handler):
    return PaystackGateway("sk_test_x", transport=httpx.MockTransport(handler))


def charge(gw):
    return gw.charge_momo(
        email="a@example.com", amount=300, phone="+233551234987", network="mtn", reference="ref-1"
    )


def test_paystack_charge_request_and_prompt():
    seen = {}

    def handler(request):
        seen.update(
            body=json.loads(request.content), url=str(request.url), auth=request.headers["authorization"]
        )
        return httpx.Response(
            200,
            json={
                "status": True,
                "message": "Charge attempted",
                "data": {
                    "reference": "ref-1",
                    "status": "pay_offline",
                    "display_text": "Complete on your phone",
                },
            },
        )

    result = charge(paystack(handler))
    assert (result.status, result.message) == (ChargeStatus.PENDING, "Complete on your phone")
    assert seen["url"] == "https://api.paystack.co/charge"
    assert seen["auth"] == "Bearer sk_test_x"
    assert seen["body"] == {
        "email": "a@example.com",
        "amount": 30000,
        "currency": "GHS",
        "reference": "ref-1",
        "mobile_money": {"phone": "0551234987", "provider": "mtn"},
    }


@pytest.mark.parametrize(
    "status_code, body, expected, message",
    [
        (
            200,
            {"status": True, "data": {"status": "success", "amount": 30000, "currency": "GHS"}},
            ChargeStatus.SUCCESS,
            None,
        ),
        (
            200,
            {"status": True, "data": {"status": "failed", "gateway_response": "Declined"}},
            ChargeStatus.FAILED,
            "Declined",
        ),
        (400, {"status": False, "message": "Invalid phone"}, ChargeStatus.FAILED, "Invalid phone"),
        (
            200,
            {"status": True, "data": {"status": "send_otp"}},
            ChargeStatus.FAILED,
            "The payment couldn't be started.",
        ),
    ],
)
def test_paystack_charge_outcomes(status_code, body, expected, message):
    result = charge(paystack(lambda r: httpx.Response(status_code, json=body)))
    assert (result.status, result.message) == (expected, message)


def test_paystack_success_reports_the_amount_in_cedis():
    body = {"status": True, "data": {"status": "success", "amount": 30000, "currency": "GHS"}}
    result = paystack(lambda r: httpx.Response(200, json=body)).verify("ref-1")
    assert (result.status, result.amount_cedis, result.currency) == (ChargeStatus.SUCCESS, 300, "GHS")


@pytest.mark.parametrize(
    "status, expected",
    [
        ("success", ChargeStatus.SUCCESS),
        ("failed", ChargeStatus.FAILED),
        ("reversed", ChargeStatus.FAILED),
        ("abandoned", ChargeStatus.PENDING),
        ("ongoing", ChargeStatus.PENDING),
        ("pay_offline", ChargeStatus.PENDING),
    ],
)
def test_paystack_verify_outcomes(status, expected):
    seen = []

    def handler(request):
        seen.append(request.url.path)
        return httpx.Response(200, json={"status": True, "data": {"status": status}})

    assert paystack(handler).verify("ref-1").status == expected
    assert seen == ["/transaction/verify/ref-1"]


def test_paystack_outages_are_reported():
    def refuse(request):
        raise httpx.ConnectError("no route")

    with pytest.raises(GatewayError, match="couldn't reach"):
        charge(paystack(refuse))
    with pytest.raises(GatewayError, match="having trouble"):
        charge(paystack(lambda r: httpx.Response(503, json={})))
    with pytest.raises(GatewayError, match="couldn't reach"):
        charge(paystack(lambda r: httpx.Response(200, text="not json")))
