from datetime import date

import pytest
from sqlalchemy import select

from app.auth.sessions import start_session
from app.billing.service import record_payment
from app.db import utcnow
from app.main import app
from app.models import Bill, BillKind, Building, Payment, PaymentMethod, PaymentStatus, Role, User
from app.payments.gateway import SimulatedGateway, get_gateway
from app.sanitation.service import MoveInError, due_date, ensure_sanitation_bills, move_in_of, set_move_in

from .conftest import needs_db
from .test_agreements import LANDLORD, person
from .test_agreements import tenancy as tenancy  # noqa: F401 (fixture)

pytestmark = needs_db

URL = "/api/admin/tenancies"


def log_in(client, db, user):
    client.cookies.set("altheo_session", start_session(db, user))


@pytest.fixture
def admin(db):
    a = person(db, "admin-sanitation@example.com", role=Role.ADMIN, name="Esi Admin")
    a.signature_image = LANDLORD
    db.commit()
    return a


def bills(db, tenancy):
    db.expire_all()
    return db.scalars(
        select(Bill)
        .where(Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.SANITATION)
        .order_by(Bill.period)
    ).all()


def moved_in(db, tenancy, day: date) -> None:
    tenancy.move_in_date = day
    db.commit()


# --- When bills are due ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "move_in, period, due",
    [
        (date(2026, 11, 15), "2026-12", date(2026, 12, 15)),
        (date(2026, 1, 31), "2026-02", date(2026, 2, 28)),
        (date(2027, 12, 31), "2028-02", date(2028, 2, 29)),
    ],
)
def test_the_due_day_follows_the_move_in_day(move_in, period, due):
    assert due_date(move_in, period) == due


# --- Which date counts -----------------------------------------------------------------------------------


def test_nothing_is_billed_until_the_agreement_is_signed(db, tenancy):
    assert move_in_of(tenancy) is None
    ensure_sanitation_bills(db)
    assert bills(db, tenancy) == []


def test_signing_sets_the_move_in_date_when_the_admin_hasnt(db, tenancy):
    tenancy.agreement.signed_at = utcnow()
    db.commit()
    assert move_in_of(tenancy) == utcnow().date()
    ensure_sanitation_bills(db)
    only = bills(db, tenancy)
    assert [b.period for b in only] == [utcnow().strftime("%Y-%m")]
    assert only[0].due_date == utcnow().date()


def test_the_admins_date_wins_over_signing(db, tenancy):
    tenancy.agreement.signed_at = utcnow()
    moved_in(db, tenancy, date(2030, 3, 9))
    assert move_in_of(tenancy) == date(2030, 3, 9)


# --- Creating bills --------------------------------------------------------------------------------------


def test_each_month_is_the_full_fee_and_missed_months_catch_up(db, tenancy):
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2031, 1, 2))
    made = bills(db, tenancy)
    assert [(b.period, b.due_date, b.amount) for b in made] == [
        ("2030-11", date(2030, 11, 15), 50),
        ("2030-12", date(2030, 12, 15), 50),
        ("2031-01", date(2031, 1, 15), 50),
    ]
    assert made[0].description == "Sanitation fee, November 2030, room A12 at Manny Building"
    assert made[0].room_type_id == tenancy.room_type_id


def test_a_months_bill_appears_on_the_first_before_its_due(db, tenancy):
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2030, 10, 31))
    assert bills(db, tenancy) == []
    ensure_sanitation_bills(db, today=date(2030, 11, 1))
    assert [b.period for b in bills(db, tenancy)] == ["2030-11"]


def test_asking_again_never_bills_a_month_twice(db, tenancy):
    moved_in(db, tenancy, date(2030, 11, 15))
    for _ in range(2):
        ensure_sanitation_bills(db, today=date(2030, 12, 1))
    assert len(bills(db, tenancy)) == 2


def test_the_fee_copied_on_the_tenancy_is_used_not_todays_price(db, tenancy):
    db.get(Building, tenancy.building_id).sanitation_fee = 500
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert bills(db, tenancy)[0].amount == 50


def test_no_fee_means_no_bills(db, tenancy):
    tenancy.sanitation_fee = 0
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert bills(db, tenancy) == []


def test_nobody_is_billed_after_moving_out(db, tenancy):
    tenancy.ended_at = utcnow()
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert bills(db, tenancy) == []


def test_a_deleted_room_type_doesnt_stop_billing(db, tenancy):
    tenancy.room_type_id = None
    moved_in(db, tenancy, date(2030, 11, 15))
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert bills(db, tenancy)[0].room_type_id is None


# --- The admin changing the date -------------------------------------------------------------------------


def later(tenancy, month, day):
    return date(tenancy.start_date.year + 1, month, day)


def test_changing_the_date_moves_whats_owed_and_leaves_whats_paid(db, tenancy):
    first = later(tenancy, 3, 10)
    moved_in(db, tenancy, first)
    ensure_sanitation_bills(db, today=later(tenancy, 4, 1))
    march, april = bills(db, tenancy)
    record_payment(db, march, amount=50, method=PaymentMethod.CASH, reference="san-paid")
    db.commit()
    set_move_in(db, tenancy, first.replace(day=20), today=later(tenancy, 4, 1))
    march, april = bills(db, tenancy)
    assert march.due_date == first
    assert april.due_date == later(tenancy, 4, 20)


def test_months_before_a_later_date_are_no_longer_owed_and_return_if_it_moves_back(db, tenancy):
    moved_in(db, tenancy, later(tenancy, 3, 10))
    today = later(tenancy, 4, 2)
    ensure_sanitation_bills(db, today=today)
    set_move_in(db, tenancy, later(tenancy, 4, 1), today=today)
    march, april = bills(db, tenancy)
    assert march.voided_at is not None
    assert april.voided_at is None
    set_move_in(db, tenancy, later(tenancy, 3, 10), today=today)
    assert all(b.voided_at is None for b in bills(db, tenancy))


def test_a_date_after_a_paid_month_is_refused(db, tenancy):
    moved_in(db, tenancy, later(tenancy, 3, 10))
    today = later(tenancy, 4, 2)
    ensure_sanitation_bills(db, today=today)
    record_payment(db, bills(db, tenancy)[0], amount=20, method=PaymentMethod.CASH, reference="san-part")
    db.commit()
    with pytest.raises(MoveInError, match="has been paid"):
        set_move_in(db, tenancy, later(tenancy, 4, 1), today=today)


def test_a_date_after_a_month_with_a_payment_waiting_is_refused(db, tenancy):
    moved_in(db, tenancy, later(tenancy, 3, 10))
    today = later(tenancy, 4, 2)
    ensure_sanitation_bills(db, today=today)
    record_payment(
        db,
        bills(db, tenancy)[0],
        amount=50,
        method=PaymentMethod.PAYSTACK_MOMO,
        reference="san-wait",
        status=PaymentStatus.PENDING,
    )
    db.commit()
    with pytest.raises(MoveInError, match="still waiting"):
        set_move_in(db, tenancy, later(tenancy, 4, 1), today=today)


# --- Admin API -------------------------------------------------------------------------------------------


def test_the_admin_list_shows_who_lives_where(client, db, admin, tenancy):
    log_in(client, db, admin)
    row = client.get(URL).json()[0]
    assert (row["tenant_name"], row["room_number"], row["building"], row["sanitation_fee"]) == (
        "Ama Mensah",
        "A12",
        "Manny Building",
        50,
    )
    assert (row["move_in_date"], row["set_by_admin"], row["this_month"]) == (None, False, None)


def test_the_admin_sets_the_date(client, db, admin, tenancy):
    log_in(client, db, admin)
    today = utcnow().date()
    r = client.patch(f"{URL}/{tenancy.id}", json={"move_in_date": today.isoformat()})
    assert r.status_code == 200
    body = r.json()
    assert (body["move_in_date"], body["set_by_admin"]) == (today.isoformat(), True)
    assert body["this_month"]["status"] == "unpaid"
    assert body["this_month"]["due_date"] == today.isoformat()


@pytest.mark.parametrize(
    "day, message",
    [
        ("2020-01-01", "The move-in date can't be before the room was allocated."),
        ("2099-01-01", "The move-in date must be within the next year."),
    ],
)
def test_impossible_dates_are_refused(client, db, admin, tenancy, day, message):
    log_in(client, db, admin)
    r = client.patch(f"{URL}/{tenancy.id}", json={"move_in_date": day})
    assert (r.status_code, r.json()["detail"]) == (409, message)


def test_an_unknown_tenancy_is_a_404(client, db, admin):
    log_in(client, db, admin)
    assert client.patch(f"{URL}/nope", json={"move_in_date": "2030-01-01"}).status_code == 404


def test_only_admins_can_use_it(client, db, tenancy):
    log_in(client, db, db.get(User, tenancy.tenant_id))
    assert client.get(URL).status_code == 403
    assert client.patch(f"{URL}/{tenancy.id}", json={"move_in_date": "2030-01-01"}).status_code == 403


# --- Tenants seeing and paying --------------------------------------------------------------------------


def test_the_tenant_sees_this_months_bill_and_can_pay_it(client, db, tenancy):
    app.dependency_overrides[get_gateway] = SimulatedGateway
    tenancy.agreement.signed_at = utcnow()
    db.commit()
    log_in(client, db, db.get(User, tenancy.tenant_id))
    mine = [b for b in client.get("/api/me/bills").json() if b["kind"] == "sanitation"]
    assert [(b["status"], b["balance"]) for b in mine] == [("unpaid", 50)]
    url = f"/api/me/bills/{mine[0]['id']}"
    assert client.post(f"{url}/pay", json={"phone": "0241234567", "network": "mtn"}).status_code == 200
    r = client.post(f"{url}/simulate", json={"outcome": "success"})
    assert r.json()["status"] == "paid"
    assert db.scalar(select(Payment).where(Payment.bill_id == mine[0]["id"])).status == PaymentStatus.SUCCESS


def test_part_payment_shows_as_partial(client, db, tenancy):
    tenancy.agreement.signed_at = utcnow()
    db.commit()
    ensure_sanitation_bills(db)
    record_payment(db, bills(db, tenancy)[0], amount=20, method=PaymentMethod.CASH, reference="san-20")
    db.commit()
    log_in(client, db, db.get(User, tenancy.tenant_id))
    mine = [b for b in client.get("/api/me/bills").json() if b["kind"] == "sanitation"]
    assert [(b["status"], b["balance"]) for b in mine] == [("partial", 30)]


def test_the_admin_bills_list_catches_up_too(client, db, admin, tenancy):
    tenancy.agreement.signed_at = utcnow()
    db.commit()
    log_in(client, db, admin)
    found = client.get("/api/admin/bills", params={"kind": "sanitation"}).json()
    assert [b["tenant"]["name"] for b in found] == ["Ama Mensah"]
    assert found[0]["building"] == "Manny Building"
