"""Moolre (https://docs.moolre.com): the client, the SMS code step and its callback."""

import json
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select

from app.billing.service import create_bill
from app.config import get_settings
from app.db import utcnow
from app.main import app
from app.models import BillKind, Booking, Payment, PaymentMethod, PaymentStatus
from app.payments.gateway import (
    ChargeResult,
    ChargeStatus,
    GatewayError,
    MoolreGateway,
    PaystackGateway,
    SimulatedGateway,
    get_gateway,
    moolre_gateway,
)
from tests.test_bookings import PAY, URL, FakeGateway, book, make_room, payment_for, tenant  # noqa: F401

REF = "altheo-1"
OTP_NEEDED = ChargeResult(ChargeStatus.OTP_REQUIRED, message="Enter the code")
SENT = ChargeResult(ChargeStatus.PENDING)


def moolre(handler):
    return MoolreGateway("user", "pub", "100200300400", transport=httpx.MockTransport(handler))


def replies(*answers):
    """A pretend Moolre giving these answers in order, keeping what it was asked."""
    seen = []
    remaining = list(answers)

    def handler(request):
        seen.append(request)
        answer = remaining.pop(0)
        if isinstance(answer, Exception):
            raise answer
        code, body = answer
        return httpx.Response(code, json=body)

    return moolre(handler), seen


def charge(gw, **kwargs):
    return gw.charge_momo(
        email="a@example.com", amount=300, phone="+233551234987", network="vod", reference=REF, **kwargs
    )


# --- The client ---------------------------------------------------------------------------------------------


def test_charge_request_has_what_moolre_documents():
    gw, seen = replies((200, {"status": 1, "code": "TR099", "message": None, "data": "uuid"}))
    assert charge(gw).status == ChargeStatus.PENDING
    request = seen[0]
    assert str(request.url) == "https://api.moolre.com/open/transact/payment"
    assert request.headers["x-api-user"] == "user"
    assert request.headers["x-api-pubkey"] == "pub"
    assert json.loads(request.content) == {
        "type": 1,
        "channel": "6",
        "currency": "GHS",
        "payer": "0551234987",
        "amount": "300",
        "externalref": REF,
        "accountnumber": "100200300400",
    }


@pytest.mark.parametrize("network, channel", [("mtn", "13"), ("vod", "6"), ("atl", "7")])
def test_network_codes(network, channel):
    gw, seen = replies((200, {"status": 1, "code": "TR099"}))
    gw.charge_momo(email="a@b.co", amount=1, phone="+233551234987", network=network, reference=REF)
    assert json.loads(seen[0].content)["channel"] == channel


def test_moolre_asks_for_a_code_then_the_code_sends_the_prompt():
    gw, seen = replies(
        (200, {"status": 1, "code": "TP14", "message": "Please complete the verification", "data": "all"}),
        (200, {"status": 1, "code": "TP17", "message": "Phone number verification successful."}),
        (200, {"status": 1, "code": "TR099", "data": "uuid"}),
    )
    assert charge(gw).status == ChargeStatus.OTP_REQUIRED
    assert charge(gw, otp="1234").status == ChargeStatus.PENDING
    assert json.loads(seen[1].content)["otpcode"] == "1234"
    assert "otpcode" not in json.loads(seen[2].content)
    assert {json.loads(r.content)["externalref"] for r in seen} == {REF}


def test_a_wrong_code_can_be_tried_again():
    gw, _ = replies((200, {"status": 0, "code": "TP14"}))
    result = charge(gw, otp="9999")
    assert result.status == ChargeStatus.OTP_REQUIRED
    assert "didn't work" in result.message


@pytest.mark.parametrize(
    "answer",
    [httpx.ReadTimeout("slow"), httpx.ConnectError("down"), (502, {"status": 0, "code": "X"})],
)
def test_a_lost_reply_stays_pending_because_a_prompt_may_have_gone_out(answer):
    gw, _ = replies(answer)
    result = charge(gw)
    assert result.status == ChargeStatus.PENDING
    assert result.message == MoolreGateway.CHECKING


def test_a_reference_moolre_already_has_is_left_for_the_status_check():
    gw, _ = replies((400, {"status": "0", "code": "TP13", "message": "must be unique"}))
    assert charge(gw).status == ChargeStatus.PENDING


def test_a_refused_charge_fails_with_moolres_reason():
    gw, _ = replies((400, {"status": 0, "code": "TP01", "message": "Currency Invalid"}))
    result = charge(gw)
    assert (result.status, result.message) == (ChargeStatus.FAILED, "Currency Invalid")


def test_bad_api_keys_dont_reach_the_tenant_as_a_declined_payment():
    gw, _ = replies((401, {"status": 0, "code": "AIN01", "message": "Authentication Error"}))
    with pytest.raises(GatewayError) as e:
        charge(gw)
    assert "Authentication" not in str(e.value)


def status_reply(**data):
    return 200, {"status": 1, "code": "SS01", "data": {"externalref": REF, **data}}


def test_status_request_uses_our_reference():
    gw, seen = replies(status_reply(txstatus=0))
    gw.verify(REF)
    assert str(seen[0].url) == "https://api.moolre.com/open/transact/status"
    assert json.loads(seen[0].content) == {
        "type": 1,
        "idtype": 1,
        "id": REF,
        "accountnumber": "100200300400",
    }


@pytest.mark.parametrize(
    "answer, expected, amount",
    [
        (status_reply(txstatus=1, amount="300.00"), ChargeStatus.SUCCESS, 300.0),
        (status_reply(txstatus="1", amount="300"), ChargeStatus.SUCCESS, 300.0),
        (status_reply(txstatus=1, amount="?"), ChargeStatus.SUCCESS, None),
        (status_reply(txstatus=2), ChargeStatus.FAILED, None),
        (status_reply(txstatus=0), ChargeStatus.PENDING, None),
        ((200, {"status": 0, "code": "X", "data": None}), ChargeStatus.PENDING, None),
        ((200, {"status": 1, "data": {"externalref": "other", "txstatus": 1}}), ChargeStatus.PENDING, None),
    ],
)
def test_status_answers(answer, expected, amount):
    gw, _ = replies(answer)
    result = gw.verify(REF)
    assert (result.status, result.amount_cedis) == (expected, amount)


def test_status_check_that_cant_reach_moolre_tries_again_later():
    gw, _ = replies(httpx.ConnectError("down"))
    with pytest.raises(GatewayError):
        gw.verify(REF)


# --- Which provider ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "details, paystack, env, expected",
    [
        (("u", "p", "a"), None, "production", MoolreGateway),
        (("u", "p", "a"), "sk_live_x", "production", MoolreGateway),
        (("u", "p", None), "sk_live_x", "production", PaystackGateway),
        ((None, None, None), "sk_live_x", "production", PaystackGateway),
        (("u", None, "a"), None, "production", type(None)),
        ((None, None, None), None, "development", SimulatedGateway),
    ],
)
def test_moolre_first_then_paystack(monkeypatch, details, paystack, env, expected):
    settings = get_settings()
    monkeypatch.setattr(settings, "moolre_username", details[0])
    monkeypatch.setattr(settings, "moolre_public_key", details[1])
    monkeypatch.setattr(settings, "moolre_account_number", details[2])
    monkeypatch.setattr(settings, "paystack_secret_key", paystack)
    monkeypatch.setattr(settings, "app_env", env)
    assert isinstance(get_gateway(), expected)


# --- The SMS code step --------------------------------------------------------------------------------------


class Moolreish(FakeGateway):
    method = PaymentMethod.MOOLRE_MOMO


@pytest.fixture
def gateway():
    fake = Moolreish()
    app.dependency_overrides[get_gateway] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_gateway, None)


@pytest.fixture
def room(db):
    return make_room(db)


@pytest.fixture
def waiting_for_code(client, db, tenant, room, gateway):  # noqa: F811
    gateway.charge_result = OTP_NEEDED
    body = book(client, room).json()
    answer = client.post(f"{URL}/{body['id']}/pay", json=PAY).json()
    return body["id"], answer


def test_payment_is_recorded_with_its_provider_number_and_network(client, db, waiting_for_code):
    booking_id, _ = waiting_for_code
    payment = payment_for(db, booking_id)
    assert payment.method == PaymentMethod.MOOLRE_MOMO
    assert (payment.momo_phone, payment.momo_network) == ("+233551234987", "mtn")


def test_the_page_is_told_a_code_is_needed(client, waiting_for_code):
    booking_id, answer = waiting_for_code
    assert answer["payment"] == {"status": "pending", "message": "Enter the code", "otp_required": True}
    assert client.get(f"{URL}/{booking_id}").json()["payment"]["otp_required"] is True


def test_the_code_repeats_the_same_charge_and_sends_the_prompt(client, db, gateway, waiting_for_code):
    booking_id, _ = waiting_for_code
    gateway.charge_result = SENT
    answer = client.post(f"{URL}/{booking_id}/otp", json={"code": " 1234 "}).json()
    assert answer["payment"] == {"status": "pending", "message": None, "otp_required": False}
    first, second = gateway.charges
    assert second["otp"] == "1234"
    assert second["reference"] == first["reference"]
    assert (second["phone"], second["network"]) == (first["phone"], first["network"])
    db.expire_all()
    assert payment_for(db, booking_id).prompted_at is not None


def test_a_wrong_code_keeps_asking(client, gateway, waiting_for_code):
    booking_id, _ = waiting_for_code
    gateway.charge_result = ChargeResult(ChargeStatus.OTP_REQUIRED, message="That code didn't work.")
    answer = client.post(f"{URL}/{booking_id}/otp", json={"code": "9999"}).json()
    assert answer["payment"]["otp_required"] is True
    assert answer["payment"]["message"] == "That code didn't work."


@pytest.mark.parametrize("code", ["", "12", "12 34", "<script>", "1" * 13])
def test_codes_that_cant_be_real_are_refused(client, gateway, waiting_for_code, code):
    booking_id, _ = waiting_for_code
    assert client.post(f"{URL}/{booking_id}/otp", json={"code": code}).status_code == 422
    assert len(gateway.charges) == 1


def test_a_code_with_nothing_waiting_is_refused(client, room, tenant, gateway):  # noqa: F811
    body = book(client, room).json()
    assert client.post(f"{URL}/{body['id']}/otp", json={"code": "1234"}).status_code == 409


def test_another_tenants_booking_cant_take_a_code(client, db, gateway, waiting_for_code):
    from tests.test_bookings import as_other

    booking_id, _ = waiting_for_code
    as_other(client, db, "someone@example.com")
    assert client.post(f"{URL}/{booking_id}/otp", json={"code": "1234"}).status_code == 404


def test_a_different_number_replaces_a_payment_still_waiting_for_a_code(
    client, db, gateway, waiting_for_code
):
    booking_id, _ = waiting_for_code
    gateway.charge_result = SENT
    answer = client.post(f"{URL}/{booking_id}/pay", json={**PAY, "phone": "024 123 4567"})
    assert answer.status_code == 200
    booking = db.get(Booking, booking_id)
    db.refresh(booking.bill)
    assert [p.status for p in booking.bill.payments] == [PaymentStatus.FAILED, PaymentStatus.PENDING]
    assert gateway.charges[-1]["phone"] == "+233241234567"


def test_a_prompt_already_sent_cant_be_replaced(client, gateway, room, tenant):  # noqa: F811
    gateway.charge_result = SENT
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    assert client.post(f"{URL}/{body['id']}/pay", json=PAY).status_code == 409
    assert len(gateway.charges) == 1


def test_a_code_never_entered_times_out_without_asking_moolre(client, db, gateway, waiting_for_code):
    booking_id, _ = waiting_for_code
    gateway.verify_result = ChargeResult(ChargeStatus.SUCCESS, amount_cedis=300, currency="GHS")
    assert client.get(f"{URL}/{booking_id}").json()["payment"]["status"] == "pending"
    payment = payment_for(db, booking_id)
    payment.created_at = utcnow() - timedelta(minutes=5)
    db.commit()
    answer = client.get(f"{URL}/{booking_id}").json()
    assert answer["payment"]["status"] == "failed"
    assert "code" in answer["payment"]["message"]


def test_time_to_approve_runs_from_when_the_code_was_accepted(client, db, gateway, waiting_for_code):
    booking_id, _ = waiting_for_code
    gateway.charge_result = SENT
    payment = payment_for(db, booking_id)
    payment.created_at = utcnow() - timedelta(minutes=5)
    db.commit()
    client.post(f"{URL}/{booking_id}/otp", json={"code": "1234"})
    assert client.get(f"{URL}/{booking_id}").json()["payment"]["status"] == "pending"


def sanitation_bill(db, tenant):  # noqa: F811
    bill = create_bill(
        db,
        tenant=tenant,
        kind=BillKind.SANITATION,
        amount=50,
        description="Sanitation",
        due_date=utcnow().date(),
        period="2026-11",
    )
    db.commit()
    return bill


def test_a_bill_takes_a_code_too(client, db, tenant, gateway):  # noqa: F811
    bill = sanitation_bill(db, tenant)
    url = f"/api/me/bills/{bill.id}"
    gateway.charge_result = OTP_NEEDED
    assert client.post(f"{url}/pay", json=PAY).json()["otp_required"] is True
    gateway.charge_result = SENT
    answer = client.post(f"{url}/otp", json={"code": "1234"}).json()
    assert answer["otp_required"] is False
    assert gateway.charges[-1]["otp"] == "1234"
    assert len(db.scalars(select(Payment).where(Payment.bill_id == bill.id)).all()) == 1


def test_a_bill_can_start_over_with_another_number(client, db, tenant, gateway):  # noqa: F811
    bill = sanitation_bill(db, tenant)
    url = f"/api/me/bills/{bill.id}"
    gateway.charge_result = OTP_NEEDED
    client.post(f"{url}/pay", json=PAY)
    gateway.charge_result = SENT
    assert client.post(f"{url}/pay", json={**PAY, "phone": "024 123 4567"}).status_code == 200
    assert gateway.charges[-1]["phone"] == "+233241234567"


def test_pretend_numbers_ending_000_ask_for_a_code(client, db, tenant, room):  # noqa: F811
    app.dependency_overrides[get_gateway] = lambda: SimulatedGateway()
    try:
        body = book(client, room).json()
        url = f"{URL}/{body['id']}"
        asked = client.post(f"{url}/pay", json={**PAY, "phone": "024 123 4000"}).json()
        assert asked["payment"]["otp_required"] is True
        sent = client.post(f"{url}/otp", json={"code": "1111"}).json()
        assert sent["payment"]["otp_required"] is False
        assert client.post(f"{url}/simulate", json={"outcome": "success"}).json()["status"] == (
            "awaiting_allocation"
        )
    finally:
        app.dependency_overrides.pop(get_gateway, None)


# --- The callback -------------------------------------------------------------------------------------------

HOOK = "/api/webhooks/moolre"
SECRET = "callback-secret"


@pytest.fixture
def hook_gateway(monkeypatch):
    monkeypatch.setattr(get_settings(), "moolre_callback_secret", SECRET)
    fake = Moolreish()
    app.dependency_overrides[moolre_gateway] = lambda: fake
    yield fake
    app.dependency_overrides.pop(moolre_gateway, None)


def callback(client, reference, secret=SECRET, **data):
    body = {"status": 1, "code": "P01", "data": {"externalref": reference, "secret": secret, **data}}
    return client.post(HOOK, json=body)


@pytest.fixture
def paying(client, db, tenant, room, gateway):  # noqa: F811
    body = book(client, room).json()
    client.post(f"{URL}/{body['id']}/pay", json=PAY)
    return body["id"], payment_for(db, body["id"]).reference


def paid(amount=300):
    return ChargeResult(ChargeStatus.SUCCESS, amount_cedis=amount, currency="GHS")


def test_callback_needs_no_csrf_header_and_counts_what_moolre_confirms(client, db, paying, hook_gateway):
    booking_id, reference = paying
    hook_gateway.verify_result = paid()
    assert callback(client, reference).json() == {"received": True}
    db.expire_all()
    assert db.get(Booking, booking_id).status == "awaiting_allocation"


def test_callback_alone_is_never_proof_of_payment(client, db, paying, hook_gateway):
    booking_id, reference = paying
    hook_gateway.verify_result = ChargeResult(ChargeStatus.PENDING)
    callback(client, reference, txstatus=1, amount="300.00")
    db.expire_all()
    assert db.get(Booking, booking_id).status == "pending_payment"


def test_the_amount_moolre_confirms_must_match(client, db, paying, hook_gateway):
    booking_id, reference = paying
    hook_gateway.verify_result = paid(1)
    callback(client, reference)
    db.expire_all()
    assert db.get(Booking, booking_id).status == "pending_payment"


@pytest.mark.parametrize("secret", ["wrong", "", None, 123])
def test_callback_with_the_wrong_secret_is_refused(client, db, paying, hook_gateway, secret):
    booking_id, reference = paying
    hook_gateway.verify_result = paid()
    assert callback(client, reference, secret=secret).status_code == 401
    db.expire_all()
    assert db.get(Booking, booking_id).status == "pending_payment"


@pytest.mark.parametrize("body", [b"not json", b"[]", b'{"data": "x"}'])
def test_callback_with_a_strange_body_is_refused(client, hook_gateway, body):
    response = client.post(HOOK, content=body)
    assert response.status_code in (400, 401)


def test_callback_is_off_without_a_secret(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "moolre_callback_secret", None)
    assert callback(client, "x", secret="").status_code == 404


def test_repeated_callbacks_count_once(client, db, paying, hook_gateway):
    booking_id, reference = paying
    hook_gateway.verify_result = paid()
    callback(client, reference)
    callback(client, reference)
    db.expire_all()
    payments = db.get(Booking, booking_id).bill.payments
    assert [p.status for p in payments] == [PaymentStatus.SUCCESS]


def test_a_failed_payment_is_marked_failed(client, db, paying, hook_gateway):
    booking_id, reference = paying
    hook_gateway.verify_result = ChargeResult(ChargeStatus.FAILED, message="Declined")
    callback(client, reference)
    db.expire_all()
    assert db.get(Booking, booking_id).bill.payments[0].status == PaymentStatus.FAILED


def test_money_that_arrives_after_we_gave_up_still_counts(client, db, paying, hook_gateway):
    booking_id, reference = paying
    payment = payment_for(db, booking_id)
    payment.status = PaymentStatus.FAILED
    db.commit()
    hook_gateway.verify_result = paid()
    callback(client, reference)
    db.expire_all()
    assert db.get(Booking, booking_id).status == "awaiting_allocation"


def test_unknown_reference_is_ignored(client, hook_gateway):
    assert callback(client, "altheo-nobody").status_code == 200


def test_moolre_being_unreachable_asks_for_a_retry(client, paying, hook_gateway):
    _, reference = paying
    hook_gateway.error = GatewayError("down")
    assert callback(client, reference).status_code == 503
