import pytest
from sqlalchemy import select

from app.auth.sessions import start_session
from app.billing.service import record_payment, tenant_compliance
from app.bookings.service import confirm_payment, start_booking
from app.db import utcnow
from app.main import app
from app.models import (
    Bill,
    BillKind,
    Booking,
    BookingStatus,
    Building,
    PaymentMethod,
    PaymentStatus,
    Role,
    RoomType,
    Tenancy,
    User,
)
from app.payments.gateway import SimulatedGateway, get_gateway

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/admin/allocations"


def person(db, email, role=Role.TENANT, name="Ama Mensah") -> User:
    u = User(name=name, email=email, phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    return u


def log_in(client, db, user):
    client.cookies.set("altheo_session", start_session(db, user))


@pytest.fixture
def admin(client, db):
    a = person(db, "admin-alloc@example.com", role=Role.ADMIN, name="Esi Admin")
    log_in(client, db, a)
    return a


def make_room(db, name="Manny Building", quantity=2, renting=4000) -> RoomType:
    b = Building(name=name, location="Oyarifa", sanitation_fee=50)
    rt = RoomType(
        name="2 bedroom", rent=2000, quantity_available=quantity, booking_deposit=300, renting_deposit=renting
    )
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


@pytest.fixture
def room(db):
    return make_room(db)


def paid_booking(db, room, email="ama-alloc@example.com") -> Booking:
    tenant = person(db, email)
    booking = start_booking(db, tenant, room.id)
    payment = record_payment(
        db,
        booking.bill,
        amount=booking.bill.amount,
        method=PaymentMethod.PAYSTACK_MOMO,
        reference=f"ref-{email}",
        status=PaymentStatus.PENDING,
    )
    db.commit()
    confirm_payment(db, payment.reference, amount_cedis=payment.amount, currency="GHS")
    return booking


def give(client, booking, room_number="A12"):
    return client.post(f"{URL}/{booking.id}", json={"room_number": room_number})


# --- The queue -----------------------------------------------------------------------------------------


def test_the_queue_lists_paid_bookings_longest_wait_first(client, db, admin, room):
    first = paid_booking(db, room, "first@example.com")
    second = paid_booking(db, room, "second@example.com")
    first.paid_at, second.paid_at = utcnow().replace(year=2020), utcnow().replace(year=2021)
    db.commit()
    body = client.get(URL).json()
    assert [q["booking_id"] for q in body] == [first.id, second.id]
    item = body[0]
    assert item["tenant"]["email"] == "first@example.com"
    assert (item["room"], item["building"], item["location"], item["booking_deposit"]) == (
        "2 bedroom",
        "Manny Building",
        "Oyarifa",
        300,
    )
    assert (item["rent"], item["sanitation_fee"], item["renting_deposit"], item["rooms_left"]) == (
        2000,
        50,
        4000,
        2,
    )
    assert item["blocked_reason"] is None


def test_unpaid_bookings_arent_in_the_queue(client, db, admin, room):
    start_booking(db, person(db, "unpaid@example.com"), room.id)
    assert client.get(URL).json() == []


def test_one_booking_from_the_queue(client, db, admin, room):
    booking = paid_booking(db, room)
    assert client.get(f"{URL}/{booking.id}").json()["booking_id"] == booking.id
    assert client.get(f"{URL}/nope").status_code == 404
    give(client, booking)
    assert client.get(f"{URL}/{booking.id}").status_code == 404


# --- Allocating ----------------------------------------------------------------------------------------


def test_allocating_does_everything_together(client, db, admin, room):
    booking = paid_booking(db, room)
    response = give(client, booking, "  A12 ")
    assert response.status_code == 201
    body = response.json()
    assert (
        body["tenant_name"],
        body["room_number"],
        body["rent"],
        body["sanitation_fee"],
        body["renting_deposit"],
    ) == (
        "Ama Mensah",
        "A12",
        2000,
        50,
        4000,
    )
    db.refresh(room)
    db.refresh(booking)
    assert room.quantity_available == 1
    assert booking.status == BookingStatus.ALLOCATED
    assert client.get(URL).json() == []

    tenancy = db.scalar(select(Tenancy).where(Tenancy.booking_id == booking.id))
    assert (tenancy.tenant_id, tenancy.allocated_by_id, tenancy.ended_at) == (
        booking.tenant_id,
        admin.id,
        None,
    )
    assert tenancy.start_date == utcnow().date()
    bill = db.get(Bill, tenancy.renting_bill_id)
    assert (bill.kind, bill.amount, bill.tenant_id, bill.room_type_id) == (
        BillKind.RENTING_DEPOSIT,
        4000,
        booking.tenant_id,
        room.id,
    )
    assert bill.description == "Renting security deposit, room A12 at Manny Building"
    assert bill.number == body["renting_bill_number"]


def test_a_paid_booking_held_a_room_and_allocation_keeps_the_count_right(client, db, admin):
    room = make_room(db, quantity=2)
    booking = paid_booking(db, room)
    free = lambda: client.get(f"/api/listings/rooms/{room.id}").json()["room"]["quantity_available"]  # noqa: E731
    assert free() == 1  # one held by the paid booking
    give(client, booking)
    assert free() == 1  # now one really gone, and no hold


def test_prices_are_copied_so_later_changes_dont_touch_the_tenancy(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    room.rent, room.renting_deposit = 9999, 9999
    db.commit()
    tenancy = db.scalar(select(Tenancy).where(Tenancy.booking_id == booking.id))
    assert (tenancy.rent, db.get(Bill, tenancy.renting_bill_id).amount) == (2000, 4000)


def test_the_tenant_sees_their_room(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    log_in(client, db, booking.tenant)
    app.dependency_overrides[get_gateway] = lambda: SimulatedGateway()
    try:
        body = client.get(f"/api/bookings/{booking.id}").json()
    finally:
        app.dependency_overrides.pop(get_gateway, None)
    assert body["status"] == "allocated"
    tenancy = body["tenancy"]
    assert (
        tenancy["room_number"],
        tenancy["rent"],
        tenancy["renting_deposit"],
        tenancy["renting_bill_status"],
    ) == (
        "A12",
        2000,
        4000,
        "unpaid",
    )


def test_the_renting_deposit_counts_towards_compliance(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    fees = {f.kind: f for f in tenant_compliance(db, booking.tenant_id, "2026-11").fees}
    assert fees[BillKind.BOOKING_DEPOSIT].status == "paid"
    assert fees[BillKind.RENTING_DEPOSIT].bill is not None
    assert fees[BillKind.RENTING_DEPOSIT].status == "unpaid"


def test_a_tenant_with_a_room_cant_book_another(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    log_in(client, db, booking.tenant)
    response = client.post("/api/bookings", json={"room_type_id": make_room(db, name="Other Block").id})
    assert response.status_code == 409
    assert "already have a room at Manny Building" in response.json()["detail"]


# --- What stops an allocation ----------------------------------------------------------------------------


def nothing_changed(db, room, booking, quantity):
    db.refresh(room)
    db.refresh(booking)
    assert room.quantity_available == quantity
    assert booking.status == BookingStatus.AWAITING_ALLOCATION
    assert db.scalars(select(Tenancy).where(Tenancy.booking_id == booking.id)).first() is None


def test_a_room_already_lived_in_cant_be_given_again(client, db, admin):
    room = make_room(db, quantity=3)
    give(client, paid_booking(db, room, "one@example.com"), "A12")
    second = paid_booking(db, room, "two@example.com")
    assert client.get(f"{URL}/{second.id}").json()["taken_rooms"] == ["A12"]
    response = give(client, second, "a12")  # ignoring case
    assert response.status_code == 409
    assert response.json()["errors"]["room_number"] == "Room a12 at Manny Building already has a tenant."
    nothing_changed(db, room, second, 2)
    assert give(client, second, "A13").status_code == 201


def test_the_same_room_number_is_fine_in_another_building(client, db, admin, room):
    give(client, paid_booking(db, room, "one@example.com"), "A12")
    other = make_room(db, name="Other Block")
    assert give(client, paid_booking(db, other, "two@example.com"), "A12").status_code == 201


def test_a_room_is_free_again_once_the_tenancy_ends(client, db, admin):
    room = make_room(db, quantity=3)
    first = paid_booking(db, room, "one@example.com")
    give(client, first, "A12")
    tenancy = db.scalar(select(Tenancy).where(Tenancy.booking_id == first.id))
    tenancy.ended_at = utcnow()
    db.commit()
    assert give(client, paid_booking(db, room, "two@example.com"), "A12").status_code == 201


def test_no_renting_deposit_set_stops_it(client, db, admin):
    room = make_room(db, renting=0)
    booking = paid_booking(db, room)
    reason = "Set the renting deposit for 2 bedroom at Manny Building first."
    assert client.get(f"{URL}/{booking.id}").json()["blocked_reason"] == reason
    response = give(client, booking)
    assert (response.status_code, response.json()["detail"]) == (409, reason)
    nothing_changed(db, room, booking, 2)


def test_no_rooms_left_stops_it(client, db, admin, room):
    booking = paid_booking(db, room)
    room.quantity_available = 0
    db.commit()
    response = give(client, booking)
    assert response.status_code == 409
    assert "no 2 bedroom rooms left" in response.json()["detail"]
    nothing_changed(db, room, booking, 0)


def test_a_deleted_room_type_stops_it_and_the_queue_still_shows_the_booking(client, db, admin, room):
    booking = paid_booking(db, room)
    client.delete(f"/api/admin/buildings/{room.building_id}")
    db.expire_all()
    item = client.get(URL).json()[0]
    assert (item["room"], item["rent"], item["rooms_left"]) == ("2 bedroom", None, None)
    assert "has been deleted" in item["blocked_reason"]
    assert give(client, booking).status_code == 409


def test_only_a_waiting_booking_can_be_allocated(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    again = give(client, booking, "B1")
    assert (again.status_code, again.json()["detail"]) == (409, "This booking already has room A12.")
    db.refresh(room)
    assert room.quantity_available == 1
    unpaid = start_booking(db, person(db, "unpaid@example.com"), room.id)
    assert give(client, unpaid).json()["detail"] == "This booking isn't waiting for a room."
    assert client.post(f"{URL}/nope", json={"room_number": "A1"}).status_code == 404


@pytest.mark.parametrize(
    "value, message",
    [("   ", "Enter the room, like A12."), ("x" * 21, "Keep the room under 20 characters.")],
)
def test_room_numbers_are_checked(client, db, admin, room, value, message):
    response = give(client, paid_booking(db, room), value)
    assert response.status_code == 422
    assert response.json()["errors"]["room_number"] == message


# --- A late confirmation can't undo an allocation -------------------------------------------------------


def test_a_repeated_payment_confirmation_doesnt_undo_the_allocation(client, db, admin, room):
    booking = paid_booking(db, room)
    give(client, booking)
    confirm_payment(db, "ref-ama-alloc@example.com", amount_cedis=300, currency="GHS")
    db.refresh(booking)
    assert booking.status == BookingStatus.ALLOCATED


# --- Access --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_allocate(client, db, room, role):
    booking = paid_booking(db, room)
    log_in(client, db, person(db, f"{role}-a@example.com", role=role))
    assert client.get(URL).status_code == 403
    assert give(client, booking).status_code == 403


def test_logged_out_is_refused(client):
    assert client.get(URL).status_code == 401


def test_allocating_needs_the_csrf_header(db, admin, room, anon_client, client):
    booking = paid_booking(db, room)
    anon_client.cookies.update(client.cookies)
    assert anon_client.post(f"{URL}/{booking.id}", json={"room_number": "A1"}).status_code == 403
