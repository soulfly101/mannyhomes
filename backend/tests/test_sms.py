import json
from contextlib import contextmanager
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select

from app import jobs
from app.allocations.service import allocate
from app.auth.sessions import start_session
from app.billing.service import create_bill, mark_payment, record_payment
from app.config import get_settings
from app.db import utcnow
from app.models import (
    BillKind,
    Building,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    SmsKind,
    SmsMessage,
    SmsStatus,
    Ticket,
    TicketCategory,
)
from app.sanitation.service import ensure_sanitation_bills
from app.sms import router as sms_router
from app.sms.sender import MAX_LENGTH, MoolreSms, SendResult, SimulatedSms, get_sms_sender, local_number
from app.sms.service import fit, notify, personalise, send_queued
from app.sms.texts import queue_due_reminders
from app.tickets.service import set_status

from .conftest import needs_db
from .test_overview import admin, paid_booking, person, room  # noqa: F401  (fixtures)

pytestmark = needs_db


def texts(db, kind=None):
    query = select(SmsMessage).order_by(SmsMessage.id)
    if kind:
        query = query.where(SmsMessage.kind == kind)
    return list(db.scalars(query).all())


# --- Sending through Moolre -------------------------------------------------------------------------


def moolre(handler):
    return MoolreSms("vas-key", "ALTHEO", "https://api.moolre.test", transport=httpx.MockTransport(handler))


def test_moolre_gets_the_documented_request():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers["X-API-VASKEY"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"status": 1, "code": "SMS01", "message": "Success", "data": None})

    assert moolre(handler).send("+233241234567", "Hello", "altheo-7") == SendResult(ok=True)
    assert seen["url"] == "https://api.moolre.test/open/sms/send"
    assert seen["key"] == "vas-key"
    assert seen["body"] == {
        "type": 1,
        "senderid": "ALTHEO",
        "messages": [{"recipient": "0241234567", "message": "Hello", "ref": "altheo-7"}],
    }


def test_a_refusal_is_final_and_says_why():
    reply = {"status": 0, "code": "ASMS07", "message": "Sender ID is not approved", "data": "senderid"}
    result = moolre(lambda r: httpx.Response(400, json=reply)).send("+233241234567", "Hi", "r")
    assert result == SendResult(ok=False, retry=False, error="Sender ID is not approved")


@pytest.mark.parametrize(
    "handler",
    [
        lambda r: httpx.Response(503, json={"status": 0, "message": "Down"}),
        lambda r: httpx.Response(502, text="<html>bad gateway</html>"),
        lambda r: (_ for _ in ()).throw(httpx.ConnectError("no route")),
    ],
)
def test_trouble_that_may_pass_is_retried(handler):
    result = moolre(handler).send("+233241234567", "Hi", "r")
    assert (result.ok, result.retry) == (False, True)


def test_local_number():
    assert local_number("+233241234567") == "0241234567"
    assert local_number("0241234567") == "0241234567"


@pytest.mark.parametrize(
    "key, sender_id, env, expected",
    [
        ("k", "ALTHEO", "production", MoolreSms),
        ("k", None, "development", SimulatedSms),
        (None, "ALTHEO", "development", SimulatedSms),
        (None, None, "production", type(None)),
    ],
)
def test_moolre_when_set_up_pretend_in_development_else_off(monkeypatch, key, sender_id, env, expected):
    settings = get_settings()
    monkeypatch.setattr(settings, "moolre_sms_vas_key", key)
    monkeypatch.setattr(settings, "moolre_sms_sender_id", sender_id)
    monkeypatch.setattr(settings, "app_env", env)
    assert isinstance(get_sms_sender(), expected)


# --- Queueing and the worker ------------------------------------------------------------------------


def test_texts_fit_one_part_with_the_sign_off_when_there_is_room():
    assert fit("Hello  there") == "Hello there - Altheo Homes"
    long = "x" * 150
    assert fit(long) == long
    assert len(fit("y" * 300)) == MAX_LENGTH


def test_the_placeholder_becomes_the_first_name(db):
    ama = person(db, "ama-sms@example.com", name="Ama Serwaa Mensah")
    assert personalise("Merry Christmas, {{Tenant Name}}! {{ tenant name }}", ama) == (
        "Merry Christmas, Ama! Ama"
    )


def test_a_key_stops_the_same_text_twice_and_no_phone_is_skipped(db):
    ama = person(db, "key@example.com")
    assert notify(db, ama, SmsKind.BILL_DUE, "Hi", key="bill_due:1") is not None
    assert notify(db, ama, SmsKind.BILL_DUE, "Hi", key="bill_due:1") is None
    nophone = person(db, "nophone@example.com")
    nophone.phone = None
    skipped = notify(db, nophone, SmsKind.BILL_DUE, "Hi")
    assert (skipped.status, skipped.error) == (SmsStatus.SKIPPED, "No phone number on their account.")


class FakeSender:
    simulated = False

    def __init__(self, *results):
        self.results = list(results)
        self.sent = []

    def send(self, phone, text, ref):
        self.sent.append((phone, text, ref))
        return self.results.pop(0) if self.results else SendResult(ok=True)


def test_the_worker_sends_waiting_texts_once(db):
    ama = person(db, "send@example.com")
    first = notify(db, ama, SmsKind.PAYMENT, "One")
    second = notify(db, ama, SmsKind.PAYMENT, "Two")
    db.commit()
    sender = FakeSender(SendResult(ok=True), SendResult(ok=False, error="Sender ID is not approved"))
    assert send_queued(db, sender=sender) == 1
    assert sender.sent[0] == ("+233241234567", first.body, f"altheo-{first.id}")
    assert (first.status, second.status, second.error) == (
        SmsStatus.SENT,
        SmsStatus.FAILED,
        "Sender ID is not approved",
    )
    assert first.sent_at is not None
    assert send_queued(db, sender=FakeSender()) == 0


def test_passing_trouble_is_tried_three_times(db):
    message = notify(db, person(db, "retry@example.com"), SmsKind.PAYMENT, "Hi")
    db.commit()
    down = SendResult(ok=False, retry=True, error="Couldn't reach Moolre.")
    sender = FakeSender(down, down, down)
    for status in (SmsStatus.QUEUED, SmsStatus.QUEUED, SmsStatus.FAILED):
        send_queued(db, sender=sender)
        assert message.status == status
    assert message.attempts == 3


def test_with_texts_off_waiting_texts_are_skipped(db, monkeypatch):
    message = notify(db, person(db, "off@example.com"), SmsKind.PAYMENT, "Hi")
    db.commit()
    monkeypatch.setattr("app.sms.service.get_sms_sender", lambda: None)
    send_queued(db)
    assert (message.status, message.error) == (SmsStatus.SKIPPED, "Texts aren't set up.")


# --- The automatic texts ----------------------------------------------------------------------------


@pytest.fixture
def tenancy(db, admin, room):  # noqa: F811
    t = allocate(db, paid_booking(db, room, "kojo@example.com", name="Kojo Mensah").id, "A12", admin)
    return t


def test_allocation_and_the_booking_payment_are_texted(db, tenancy):
    [paid] = texts(db, SmsKind.PAYMENT)
    bill = f"BILL-{tenancy.booking.bill_id:06d}"
    assert (
        paid.body
        == f"Hi Kojo, we received GH₵ 300 for your booking deposit ({bill}). Thank you! - Altheo Homes"
    )
    [allocated] = texts(db, SmsKind.ALLOCATION)
    assert allocated.body.startswith(
        "Hi Kojo, room A12 at Manny Building is yours! Sign your tenancy agreement"
    )
    assert allocated.dedupe_key == f"allocated:{tenancy.id}"
    assert all(len(m.body) <= MAX_LENGTH for m in texts(db))


def test_cash_payments_are_texted_but_not_money_from_a_deposit(db, tenancy):
    record_payment(db, tenancy.renting_bill, amount=1000, method=PaymentMethod.CASH, reference="manual-c1")
    record_payment(db, tenancy.renting_bill, amount=50, method=PaymentMethod.DEPOSIT, reference="deposit-x")
    record_payment(
        db,
        tenancy.renting_bill,
        amount=100,
        method=PaymentMethod.MOOLRE_MOMO,
        reference="momo-1",
        status=PaymentStatus.PENDING,
    )
    bodies = [m.body for m in texts(db, SmsKind.PAYMENT)]
    assert len(bodies) == 2 and "GH₵ 1,000 for your renting deposit" in bodies[1]
    mark_payment(db, "momo-1", PaymentStatus.SUCCESS)
    assert "GH₵ 100 for your renting deposit" in texts(db, SmsKind.PAYMENT)[-1].body


def test_a_repair_status_change_is_texted(db, tenancy):
    ticket = Ticket(
        tenant_id=tenancy.tenant_id,
        tenancy_id=tenancy.id,
        category=TicketCategory.PLUMBING,
        description="Leaking tap",
        room_number="A12",
        building_name="Manny Building",
    )
    db.add(ticket)
    db.commit()
    set_status(db, ticket, "in_progress")
    set_status(db, ticket, "in_progress")  # no change, no text
    [text] = texts(db, SmsKind.TICKET)
    assert text.body == (
        "Hi Kojo, your plumbing report for room A12 is now: In progress. "
        "We're on it and will be in touch. - Altheo Homes"
    )


def test_the_new_monthly_bill_is_texted_once_but_not_earlier_months(db, tenancy):
    tenancy.move_in_date = utcnow().date().replace(day=1) - timedelta(days=40)
    db.commit()
    ensure_sanitation_bills(db)
    ensure_sanitation_bills(db)
    [new] = texts(db, SmsKind.BILL_NEW)
    month = utcnow().strftime("%B")
    assert new.body.startswith(f"Hi Kojo, your {month} sanitation bill of GH₵ 50 is ready, due ")


def test_a_reminder_goes_the_day_before_an_unpaid_bill_is_due(db, tenancy):
    today = utcnow().date()
    bill = create_bill(
        db,
        tenant=tenancy.tenant,
        kind=BillKind.SANITATION,
        amount=50,
        description="Sanitation",
        period="2099-01",
        due_date=today + timedelta(days=1),
    )
    paid = create_bill(
        db,
        tenant=tenancy.tenant,
        kind=BillKind.SANITATION,
        amount=50,
        description="Sanitation",
        period="2099-02",
        due_date=today + timedelta(days=1),
    )
    record_payment(db, paid, amount=50, method=PaymentMethod.CASH, reference="manual-paid")
    db.commit()
    assert queue_due_reminders(db, today) == 1
    assert queue_due_reminders(db, today) == 0
    [reminder] = texts(db, SmsKind.BILL_DUE)
    assert reminder.dedupe_key == f"bill_due:{bill.id}"
    assert "GH₵ 50 for your sanitation bill is due tomorrow" in reminder.body
    # Nobody who has moved out is reminded.
    tenancy.ended_at = utcnow()
    db.commit()
    assert queue_due_reminders(db, today - timedelta(days=0)) == 0


def test_the_worker_makes_bills_queues_reminders_and_sends(db, tenancy, monkeypatch):
    tenancy.move_in_date = utcnow().date()
    db.commit()

    @contextmanager
    def same_session(_engine):
        yield db

    sender = FakeSender()
    monkeypatch.setattr(jobs, "Session", same_session)
    monkeypatch.setattr("app.sms.service.get_sms_sender", lambda: sender)
    monkeypatch.setattr(jobs, "_last_bills", -jobs.BILLS_EVERY)
    jobs.tick(now=0)
    assert texts(db, SmsKind.BILL_NEW)
    assert {m.status for m in texts(db)} == {SmsStatus.SENT}
    assert len(sender.sent) == len(texts(db))


# --- The admin's broadcast panel --------------------------------------------------------------------


@pytest.fixture
def two_buildings(db, admin, room, tenancy):  # noqa: F811
    other = Building(name="Tema Court", location="Tema", sanitation_fee=80)
    rt = RoomType(name="Studio", rent=900, quantity_available=2, booking_deposit=300, renting_deposit=1000)
    other.room_types.append(rt)
    db.add(other)
    db.commit()
    allocate(db, paid_booking(db, rt, "efua@example.com", name="Efua Longername").id, "T1", admin)
    return other


def test_the_overview_says_how_texts_go_and_lists_recent_ones(client, tenancy, monkeypatch):
    monkeypatch.setattr(sms_router, "sms_mode", lambda: "test")
    body = client.get("/api/admin/sms").json()
    assert (body["mode"], body["max_length"]) == ("test", 160)
    assert [b["name"] for b in body["buildings"]] == ["Manny Building"]
    assert [(m["kind"], m["to"], m["status"]) for m in body["recent"]] == [
        ("Room allocated", "Kojo Mensah", "queued"),
        ("Payment received", "Kojo Mensah", "queued"),
    ]


def test_the_audience_counts_tenants_with_a_room(client, two_buildings, room):  # noqa: F811
    assert client.get("/api/admin/sms/audience").json() == {
        "tenants": 2,
        "with_phone": 2,
        "example_name": "Efua",
        "longest_name": 4,
    }
    only = client.get("/api/admin/sms/audience", params={"building_id": room.building_id}).json()
    assert (only["tenants"], only["example_name"]) == (1, "Kojo")


def test_a_broadcast_is_personalised_for_each_tenant(client, db, two_buildings, monkeypatch):
    monkeypatch.setattr(sms_router, "sms_mode", lambda: "live")
    r = client.post("/api/admin/sms/broadcasts", json={"text": "Happy  Eid, {{Tenant Name}}!"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["audience"], body["template"], body["sent_by"]) == (
        "All tenants with a room",
        "Happy Eid, {{Tenant Name}}!",
        "Esi Admin",
    )
    assert body["counts"] == {"queued": 2, "sent": 0, "failed": 0, "skipped": 0}
    assert sorted(m.body for m in texts(db, SmsKind.BROADCAST)) == ["Happy Eid, Efua!", "Happy Eid, Kojo!"]
    listed = client.get("/api/admin/sms").json()["broadcasts"]
    assert [b["id"] for b in listed] == [body["id"]]


def test_a_broadcast_can_go_to_one_building(client, db, two_buildings, monkeypatch):
    monkeypatch.setattr(sms_router, "sms_mode", lambda: "live")
    body = client.post(
        "/api/admin/sms/broadcasts",
        json={"text": "Water off tomorrow 9-12.", "building_id": two_buildings.id},
    ).json()
    assert body["audience"] == "Tenants at Tema Court"
    assert [m.body for m in texts(db, SmsKind.BROADCAST)] == ["Water off tomorrow 9-12."]


@pytest.mark.parametrize(
    "mode, payload, status, message",
    [
        ("off", {"text": "Hi"}, 409, "aren't set up"),
        ("live", {"text": "   "}, 422, "Write the message first"),
        ("live", {"text": "x" * 157 + " {{Tenant Name}}"}, 422, "Keep it to 160"),
        ("live", {"text": "Hi", "building_id": "nope"}, 404, "doesn't exist"),
    ],
)
def test_bad_broadcasts_are_refused(client, db, tenancy, monkeypatch, mode, payload, status, message):
    monkeypatch.setattr(sms_router, "sms_mode", lambda: mode)
    r = client.post("/api/admin/sms/broadcasts", json=payload)
    assert r.status_code == status
    assert message in r.json()["detail"]
    assert texts(db, SmsKind.BROADCAST) == []


def test_nobody_to_text(client, admin, monkeypatch):  # noqa: F811
    monkeypatch.setattr(sms_router, "sms_mode", lambda: "live")
    r = client.post("/api/admin/sms/broadcasts", json={"text": "Hi"})
    assert (r.status_code, r.json()["detail"]) == (422, "Nobody there has a phone number to text.")


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_send_texts(client, db, role):
    user = person(db, f"{role}-sms@example.com", role=role)
    client.cookies.set("altheo_session", start_session(db, user))
    assert client.get("/api/admin/sms").status_code == 403
    assert client.post("/api/admin/sms/broadcasts", json={"text": "Hi"}).status_code == 403
