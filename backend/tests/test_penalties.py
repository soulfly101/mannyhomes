from datetime import date

import pytest
from sqlalchemy import select

from app.billing.service import COMPLIANCE_KINDS, balance, create_bill, record_payment, tenant_compliance
from app.models import Bill, BillKind, PaymentMethod, PaymentStatus, PenaltySettings
from app.sanitation.penalties import PenaltyError, penalty_settings, save_penalty_settings, tickets_frozen
from app.sanitation.service import ensure_sanitation_bills, set_move_in

from .conftest import needs_db
from .test_agreements import person
from .test_agreements import tenancy as tenancy  # noqa: F401 (fixture)
from .test_sanitation import admin as admin  # noqa: F401 (fixture)
from .test_sanitation import log_in, moved_in

pytestmark = needs_db

URL = "/api/admin/settings/penalties"
MOVE_IN = date(2030, 11, 15)
SWITCHED_ON = date(2030, 11, 1)


def fees(db, tenancy):
    db.expire_all()
    return db.scalars(
        select(Bill)
        .where(Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.LATE_FEE)
        .order_by(Bill.period)
    ).all()


def month(db, tenancy, period):
    db.expire_all()
    return db.scalar(
        select(Bill).where(
            Bill.tenant_id == tenancy.tenant_id, Bill.kind == BillKind.SANITATION, Bill.period == period
        )
    )


def switch_on(db, late_fee=20, freeze=False, today=SWITCHED_ON):
    save_penalty_settings(db, enabled=True, late_fee=late_fee, freeze_tickets=freeze, today=today)


def pay(db, bill, amount=None, reference="pay-1", status=PaymentStatus.SUCCESS):
    record_payment(
        db,
        bill,
        amount=amount or bill.amount,
        method=PaymentMethod.CASH,
        reference=reference,
        status=status,
    )
    db.commit()


# --- Off -------------------------------------------------------------------------------------------------


def test_never_saved_means_off(db):
    settings = penalty_settings(db)
    assert (settings.enabled, settings.late_fee, settings.freeze_tickets) == (False, 0, False)
    assert db.scalar(select(PenaltySettings)) is None


def test_off_charges_nothing_and_freezes_nothing(db, tenancy):
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2031, 3, 1))
    assert fees(db, tenancy) == []
    assert tickets_frozen(db, tenancy.tenant_id, today=date(2031, 3, 1)) is False


# --- Late fees -------------------------------------------------------------------------------------------


def test_not_late_on_the_due_date_late_the_day_after(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 15))
    assert fees(db, tenancy) == []
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    only = fees(db, tenancy)
    assert [(f.period, f.amount, f.due_date) for f in only] == [("2030-11", 20, date(2030, 11, 16))]
    assert only[0].description.startswith("Late fee: Sanitation fee, November 2030, room A12")


def test_one_fee_per_overdue_month_however_often_bills_are_read(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    for day in (date(2031, 1, 20), date(2031, 1, 21), date(2031, 1, 22)):
        ensure_sanitation_bills(db, today=day)
    assert [f.period for f in fees(db, tenancy)] == ["2030-11", "2030-12", "2031-01"]


def test_late_fees_dont_get_late_fees_of_their_own(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    ensure_sanitation_bills(db, today=date(2030, 11, 30))
    assert len(fees(db, tenancy)) == 1


def test_a_month_paid_on_time_is_never_charged(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 2))
    pay(db, month(db, tenancy, "2030-11"))
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []


def test_part_paying_is_still_late(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 2))
    pay(db, month(db, tenancy, "2030-11"), amount=10)
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert len(fees(db, tenancy)) == 1


def test_a_payment_waiting_on_a_phone_holds_the_fee_until_it_settles(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 2))
    pay(db, month(db, tenancy, "2030-11"), status=PaymentStatus.PENDING)
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []


def test_old_debts_arent_charged_when_penalties_are_switched_on(db, tenancy):
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 12, 20))
    switch_on(db, today=date(2030, 12, 20))
    ensure_sanitation_bills(db, today=date(2031, 1, 16))
    assert [f.period for f in fees(db, tenancy)] == ["2031-01"]


def test_a_bill_due_the_day_they_were_switched_on_counts(db, tenancy):
    moved_in(db, tenancy, MOVE_IN)
    switch_on(db, today=MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    assert len(fees(db, tenancy)) == 1


def test_switching_off_and_on_again_forgives_what_was_due_while_off(db, tenancy):
    moved_in(db, tenancy, MOVE_IN)
    switch_on(db)
    save_penalty_settings(db, enabled=False, late_fee=20, freeze_tickets=False)
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []
    switch_on(db, today=date(2030, 12, 1))
    ensure_sanitation_bills(db, today=date(2030, 12, 2))
    assert fees(db, tenancy) == []


def test_saving_again_while_on_keeps_the_original_start_day(db):
    switch_on(db)
    switch_on(db, late_fee=30, today=date(2031, 5, 1))
    assert penalty_settings(db).enabled_on == SWITCHED_ON


def test_switching_off_keeps_fees_already_charged(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    save_penalty_settings(db, enabled=False, late_fee=0, freeze_tickets=False)
    ensure_sanitation_bills(db, today=date(2031, 1, 20))
    assert [f.period for f in fees(db, tenancy)] == ["2030-11"]


def test_the_fee_is_copied_so_changing_it_later_doesnt_touch_old_ones(db, tenancy):
    switch_on(db, late_fee=20)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    switch_on(db, late_fee=35)
    ensure_sanitation_bills(db, today=date(2030, 12, 16))
    assert [f.amount for f in fees(db, tenancy)] == [20, 35]


def test_freeze_only_charges_no_fee(db, tenancy):
    switch_on(db, late_fee=0, freeze=True)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []


def test_a_moved_out_tenant_gets_no_new_fees(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 2))
    tenancy.ended_at = date(2030, 11, 3)
    db.commit()
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []


def test_a_cancelled_month_gets_no_fee(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 2))
    month(db, tenancy, "2030-11").voided_at = date(2030, 11, 3)
    db.commit()
    ensure_sanitation_bills(db, today=date(2030, 11, 20))
    assert fees(db, tenancy) == []


# --- Moving the date -------------------------------------------------------------------------------------


def test_moving_the_due_day_later_drops_a_fee_no_longer_owed(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 16)
    ensure_sanitation_bills(db, today=today)
    set_move_in(db, tenancy, date(2030, 11, 25), today=today)
    assert fees(db, tenancy)[0].voided_at is not None


def test_a_fee_dropped_this_way_isnt_charged_again_for_that_month(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 16)
    ensure_sanitation_bills(db, today=today)
    set_move_in(db, tenancy, date(2030, 11, 25), today=today)
    ensure_sanitation_bills(db, today=date(2030, 11, 26))
    assert len(fees(db, tenancy)) == 1


def test_moving_the_date_past_a_month_drops_that_months_fee(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 16)
    ensure_sanitation_bills(db, today=today)
    set_move_in(db, tenancy, date(2030, 12, 15), today=today)
    assert fees(db, tenancy)[0].voided_at is not None


def test_a_month_still_overdue_keeps_its_fee_after_a_date_change(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 20)
    ensure_sanitation_bills(db, today=today)
    set_move_in(db, tenancy, date(2030, 11, 18), today=today)
    assert fees(db, tenancy)[0].voided_at is None


def test_a_paid_fee_is_left_alone_by_a_date_change(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 16)
    ensure_sanitation_bills(db, today=today)
    pay(db, fees(db, tenancy)[0])
    set_move_in(db, tenancy, date(2030, 11, 25), today=today)
    assert fees(db, tenancy)[0].voided_at is None


# --- The ticket freeze -----------------------------------------------------------------------------------


def test_frozen_while_overdue_and_cleared_by_paying(db, tenancy):
    switch_on(db, late_fee=0, freeze=True)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 20)
    ensure_sanitation_bills(db, today=today)
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is True
    pay(db, month(db, tenancy, "2030-11"))
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is False


def test_not_frozen_by_a_bill_not_yet_due(db, tenancy):
    switch_on(db, late_fee=0, freeze=True)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 15)
    ensure_sanitation_bills(db, today=today)
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is False


def test_an_unpaid_late_fee_keeps_the_freeze_on(db, tenancy):
    switch_on(db, late_fee=20, freeze=True)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 16)
    ensure_sanitation_bills(db, today=today)
    pay(db, month(db, tenancy, "2030-11"))
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is True
    pay(db, fees(db, tenancy)[0], reference="pay-2")
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is False


def test_old_debts_do_freeze_because_nothing_is_charged(db, tenancy):
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 12, 20)
    ensure_sanitation_bills(db, today=today)
    switch_on(db, late_fee=0, freeze=True, today=today)
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is True


def test_the_freeze_does_nothing_when_not_chosen(db, tenancy):
    switch_on(db, late_fee=20, freeze=False)
    moved_in(db, tenancy, MOVE_IN)
    today = date(2030, 11, 20)
    ensure_sanitation_bills(db, today=today)
    assert tickets_frozen(db, tenancy.tenant_id, today=today) is False


# --- Fitting in with other bills --------------------------------------------------------------------------


def test_late_fees_dont_change_what_compliance_looks_at(db, tenancy):
    switch_on(db)
    moved_in(db, tenancy, MOVE_IN)
    ensure_sanitation_bills(db, today=date(2030, 11, 16))
    compliance = tenant_compliance(db, tenancy.tenant_id, "2030-11")
    assert [f.kind for f in compliance.fees] == list(COMPLIANCE_KINDS)
    assert BillKind.LATE_FEE not in COMPLIANCE_KINDS


def test_a_late_fee_needs_its_month_and_there_is_one_per_month(db, tenancy):
    from app.billing.service import BillingError

    tenant = tenancy.tenant
    make = dict(tenant=tenant, kind=BillKind.LATE_FEE, amount=20, description="x", due_date=date(2030, 11, 1))
    with pytest.raises(BillingError, match="late fee needs the month"):
        create_bill(db, **make)
    create_bill(db, **make, period="2030-11")
    with pytest.raises(BillingError, match="already has a late fee for 2030-11"):
        create_bill(db, **make, period="2030-11")
    db.rollback()


def test_a_tenant_sees_and_can_pay_a_late_fee(client, db, tenancy):
    from app.main import app
    from app.payments.gateway import SimulatedGateway, get_gateway

    switch_on(db)
    moved_in(db, tenancy, date(2020, 1, 15))
    tenancy.start_date = date(2020, 1, 1)
    db.commit()
    db.get(PenaltySettings, 1).enabled_on = date(2020, 1, 1)
    db.commit()
    log_in(client, db, tenancy.tenant)
    bills = client.get("/api/me/bills").json()
    late = next(b for b in bills if b["kind"] == "late_fee")
    assert (late["amount"], late["status"]) == (20, "unpaid")
    app.dependency_overrides[get_gateway] = lambda: SimulatedGateway()
    try:
        url = f"/api/me/bills/{late['id']}"
        assert client.post(f"{url}/pay", json={"phone": "0551234987", "network": "mtn"}).status_code == 200
        assert client.post(f"{url}/simulate", json={"outcome": "success"}).json()["status"] == "paid"
    finally:
        app.dependency_overrides.pop(get_gateway, None)
    db.expire_all()
    assert balance(db.get(Bill, late["id"])) == 0


# --- The settings API -------------------------------------------------------------------------------------


def test_only_admins_can_see_or_change_the_settings(client, db):
    assert client.get(URL).status_code == 401
    log_in(client, db, person(db, "not-admin@example.com"))
    assert client.get(URL).status_code == 403
    body = {"enabled": True, "late_fee": 20, "freeze_tickets": False}
    assert client.put(URL, json=body).status_code == 403


def test_saving_and_reading_back(client, db, admin):  # noqa: F811
    log_in(client, db, admin)
    assert client.get(URL).json() == {
        "enabled": False,
        "late_fee": 0,
        "freeze_tickets": False,
        "enabled_on": None,
    }
    saved = client.put(URL, json={"enabled": True, "late_fee": 20, "freeze_tickets": True}).json()
    assert saved["enabled"] is True
    assert saved["enabled_on"] is not None
    assert client.get(URL).json() == saved
    off = client.put(URL, json={"enabled": False, "late_fee": 20, "freeze_tickets": True}).json()
    assert (off["enabled"], off["enabled_on"]) == (False, None)


def test_on_with_no_penalty_is_refused(client, db, admin):  # noqa: F811
    log_in(client, db, admin)
    response = client.put(URL, json={"enabled": True, "late_fee": 0, "freeze_tickets": False})
    assert response.status_code == 400
    assert "Set a late fee" in response.json()["detail"]
    assert client.get(URL).json()["enabled"] is False


@pytest.mark.parametrize("fee", [-1, 100_001, 20.5, "abc"])
def test_impossible_fees_are_refused(client, db, admin, fee):  # noqa: F811
    log_in(client, db, admin)
    assert (
        client.put(URL, json={"enabled": True, "late_fee": fee, "freeze_tickets": False}).status_code == 422
    )


def test_service_refuses_on_with_no_penalty(db):
    with pytest.raises(PenaltyError):
        save_penalty_settings(db, enabled=True, late_fee=0, freeze_tickets=False)
