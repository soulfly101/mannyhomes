"""Admin API for who's living where, the move-in date behind their bills (#16), and penalties (#25)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..billing.service import BillStatus, balance, bill_status, current_period
from ..db import get_session
from ..models import Bill, BillKind, Role, Tenancy
from .penalties import PenaltyError, penalty_settings, save_penalty_settings
from .service import MoveInError, ensure_sanitation_bills, move_in_of, set_move_in, tenancies_query

DB = Annotated[Session, Depends(get_session)]

router = APIRouter(tags=["admin: tenancies"], dependencies=[Depends(require_role(Role.ADMIN))])
settings_router = APIRouter(tags=["admin: settings"], dependencies=[Depends(require_role(Role.ADMIN))])


class MonthBill(BaseModel):
    number: str
    status: BillStatus
    balance: int
    due_date: date


class TenancyRow(BaseModel):
    id: str
    tenant_name: str
    room_number: str
    building: str
    sanitation_fee: int
    # None until the tenant signs or the admin sets it; nothing is billed until then.
    move_in_date: date | None
    set_by_admin: bool
    this_month: MonthBill | None


def _row(t: Tenancy, bill: Bill | None) -> TenancyRow:
    return TenancyRow(
        id=t.id,
        tenant_name=t.tenant.name,
        room_number=t.room_number,
        building=t.building_name,
        sanitation_fee=t.sanitation_fee,
        move_in_date=move_in_of(t),
        set_by_admin=t.move_in_date is not None,
        this_month=MonthBill(
            number=bill.number, status=bill_status(bill), balance=balance(bill), due_date=bill.due_date
        )
        if bill
        else None,
    )


def _this_months_bill(db: Session, tenant_id: str) -> Bill | None:
    return db.scalar(
        select(Bill).where(
            Bill.tenant_id == tenant_id,
            Bill.kind == BillKind.SANITATION,
            Bill.period == current_period(),
            Bill.voided_at.is_(None),
        )
    )


@router.get("")
def tenancies(db: DB) -> list[TenancyRow]:
    """Everyone living in a room now, newest first."""
    ensure_sanitation_bills(db)
    rows = db.scalars(tenancies_query().order_by(Tenancy.created_at.desc())).all()
    return [_row(t, _this_months_bill(db, t.tenant_id)) for t in rows]


class MoveInIn(BaseModel):
    move_in_date: date


@router.patch("/{tenancy_id}")
def update_move_in(tenancy_id: str, data: MoveInIn, db: DB) -> TenancyRow:
    tenancy = db.scalar(tenancies_query().where(Tenancy.id == tenancy_id))
    if tenancy is None:
        raise HTTPException(status_code=404, detail="That tenancy doesn't exist.")
    try:
        set_move_in(db, tenancy, data.move_in_date)
    except MoveInError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    return _row(tenancy, _this_months_bill(db, tenancy.tenant_id))


class PenaltiesIn(BaseModel):
    enabled: bool
    late_fee: int = Field(ge=0, le=100_000)
    freeze_tickets: bool


class PenaltiesOut(PenaltiesIn):
    # The day they were last switched on: only bills due from then on get a late fee.
    enabled_on: date | None


def _penalties(settings) -> PenaltiesOut:
    return PenaltiesOut(
        enabled=settings.enabled,
        late_fee=settings.late_fee,
        freeze_tickets=settings.freeze_tickets,
        enabled_on=settings.enabled_on,
    )


@settings_router.get("/penalties")
def get_penalties(db: DB) -> PenaltiesOut:
    return _penalties(penalty_settings(db))


@settings_router.put("/penalties")
def update_penalties(data: PenaltiesIn, db: DB) -> PenaltiesOut:
    try:
        return _penalties(save_penalty_settings(db, **data.model_dump()))
    except PenaltyError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
