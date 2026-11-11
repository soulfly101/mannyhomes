"""Move-out API (#26): the admin checks a tenant out and records the refund; tenants see their own."""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import current_user, require_role
from ..billing.service import balance, paid_amount
from ..db import get_session
from ..models import MoveOut, Role, Tenancy, User
from ..sanitation.service import ensure_sanitation_bills
from .service import (
    REFUND_METHODS,
    Deduction,
    MoveOutError,
    arrears,
    deposit_bills,
    deposits_held,
    mark_refunded,
    move_out,
    pending_payment,
    tenancy_query,
    tenant_bills,
)

DB = Annotated[Session, Depends(get_session)]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]
Me = Annotated[User, Depends(current_user)]

router = APIRouter(tags=["admin: move-out"])
me_router = APIRouter(tags=["move-out"])

DEPOSIT_WORDS = {"booking_deposit": "Booking deposit", "renting_deposit": "Renting deposit"}


class DepositOut(BaseModel):
    label: str
    number: str
    amount: int
    paid: int


class ArrearsOut(BaseModel):
    bill_id: int
    number: str
    description: str
    due_date: date
    balance: int


class MoveOutPreview(BaseModel):
    tenancy_id: str
    tenant_name: str
    room_number: str
    building: str
    start_date: date
    deposits: list[DepositOut]
    deposits_held: int
    arrears: list[ArrearsOut]
    # Why it can't go ahead right now, if anything.
    blocked_reason: str | None


class DeductionOut(BaseModel):
    reason: str
    amount: int
    bill_number: str | None


class MoveOutOut(BaseModel):
    id: str
    tenancy_id: str
    tenant_id: str
    tenant_name: str
    room_number: str
    building: str
    moved_out_on: date
    deposits_held: int
    deductions: list[DeductionOut]
    deductions_total: int
    refund_due: int
    note: str | None
    refunded_at: datetime | None
    refund_method: str | None
    refund_reference: str | None

    @classmethod
    def of(cls, m: MoveOut) -> MoveOutOut:
        return cls(
            id=m.id,
            tenancy_id=m.tenancy_id,
            tenant_id=m.tenant_id,
            tenant_name=m.tenant.name,
            room_number=m.tenancy.room_number,
            building=m.tenancy.building_name,
            moved_out_on=m.moved_out_on,
            deposits_held=m.deposits_held,
            deductions=[
                DeductionOut(
                    reason=d.reason,
                    amount=d.amount,
                    bill_number=f"BILL-{d.bill_id:06d}" if d.bill_id else None,
                )
                for d in m.deductions
            ],
            deductions_total=m.deductions_total,
            refund_due=m.refund_due,
            note=m.note,
            refunded_at=m.refunded_at,
            refund_method=REFUND_METHODS.get(m.refund_method or ""),
            refund_reference=m.refund_reference,
        )


class DeductionIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)
    amount: int = Field(gt=0, le=10_000_000)
    bill_id: int | None = None

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Say what the deduction is for.")
        return v


class MoveOutIn(BaseModel):
    moved_out_on: date
    deductions: list[DeductionIn] = Field(default_factory=list, max_length=50)
    note: str | None = Field(default=None, max_length=500)


class RefundIn(BaseModel):
    method: str
    reference: str | None = Field(default=None, max_length=100)


def _move_outs():
    return select(MoveOut).options(
        selectinload(MoveOut.tenant), selectinload(MoveOut.tenancy), selectinload(MoveOut.deductions)
    )


def _tenancy(db: Session, tenancy_id: str) -> Tenancy:
    tenancy = db.scalar(tenancy_query().where(Tenancy.id == tenancy_id))
    if tenancy is None:
        raise HTTPException(status_code=404, detail="That tenancy doesn't exist.")
    if tenancy.ended_at is not None:
        raise HTTPException(status_code=409, detail=f"{tenancy.tenant.name} has already moved out.")
    return tenancy


@router.get("/tenancies/{tenancy_id}/move-out")
def preview(tenancy_id: str, admin: Admin, db: DB) -> MoveOutPreview:
    tenancy = _tenancy(db, tenancy_id)
    ensure_sanitation_bills(db, tenant_id=tenancy.tenant_id)
    bills = tenant_bills(db, tenancy.tenant_id)
    blocked = (
        "A payment from this tenant is still waiting. Try again once it has finished."
        if pending_payment(bills)
        else None
    )
    return MoveOutPreview(
        tenancy_id=tenancy.id,
        tenant_name=tenancy.tenant.name,
        room_number=tenancy.room_number,
        building=tenancy.building_name,
        start_date=tenancy.start_date,
        deposits=[
            DepositOut(
                label=DEPOSIT_WORDS[b.kind.value], number=b.number, amount=b.amount, paid=paid_amount(b)
            )
            for b in deposit_bills(tenancy)
        ],
        deposits_held=deposits_held(tenancy),
        arrears=[
            ArrearsOut(
                bill_id=b.id,
                number=b.number,
                description=b.description,
                due_date=b.due_date,
                balance=balance(b),
            )
            for b in arrears(bills)
        ],
        blocked_reason=blocked,
    )


@router.post("/tenancies/{tenancy_id}/move-out", status_code=201)
def confirm(tenancy_id: str, data: MoveOutIn, admin: Admin, db: DB) -> MoveOutOut:
    try:
        record = move_out(
            db,
            tenancy_id,
            moved_out_on=data.moved_out_on,
            deductions=[Deduction(d.reason, d.amount, d.bill_id) for d in data.deductions],
            note=(data.note or "").strip() or None,
            admin=admin,
        )
    except MoveOutError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return MoveOutOut.of(db.scalar(_move_outs().where(MoveOut.id == record.id)))


@router.get("/move-outs")
def move_outs(admin: Admin, db: DB) -> list[MoveOutOut]:
    """Everyone who has moved out, refunds still to pay first, then the latest."""
    rows = db.scalars(_move_outs().order_by(MoveOut.moved_out_on.desc(), MoveOut.created_at.desc())).all()
    owing = [m for m in rows if m.refunded_at is None and m.refund_due > 0]
    return [MoveOutOut.of(m) for m in owing + [m for m in rows if m not in owing]]


@router.post("/move-outs/{move_out_id}/refund")
def refund(move_out_id: str, data: RefundIn, admin: Admin, db: DB) -> MoveOutOut:
    record = db.scalar(_move_outs().where(MoveOut.id == move_out_id))
    if record is None:
        raise HTTPException(status_code=404, detail="That move-out doesn't exist.")
    try:
        mark_refunded(db, record, method=data.method, reference=(data.reference or "").strip())
    except MoveOutError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return MoveOutOut.of(record)


@me_router.get("")
def my_move_outs(user: Me, db: DB) -> list[MoveOutOut]:
    rows = db.scalars(
        _move_outs().where(MoveOut.tenant_id == user.id).order_by(MoveOut.moved_out_on.desc())
    ).all()
    return [MoveOutOut.of(m) for m in rows]
