"""Bills API (#19).

Tenants see their own bills; admins see everyone's, record cash/bank payments and check compliance.
"""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth.deps import current_user, require_role
from ..db import get_session
from ..models import Bill, BillKind, PaymentMethod, PaymentStatus, Role, RoomType, User
from ..sanitation.service import ensure_sanitation_bills
from .service import (
    BillingError,
    BillStatus,
    balance,
    bill_status,
    bills_query,
    current_period,
    paid_amount,
    record_payment,
    tenant_compliance,
)

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

router = APIRouter(tags=["bills"])
admin_router = APIRouter(tags=["admin: bills"], dependencies=[Depends(require_role(Role.ADMIN))])


class PaymentOut(BaseModel):
    id: int
    amount: int
    method: PaymentMethod
    status: PaymentStatus
    reference: str
    paid_at: datetime | None
    note: str | None


class PersonOut(BaseModel):
    id: str
    name: str
    email: str


class BillOut(BaseModel):
    id: int
    number: str
    kind: BillKind
    description: str
    amount: int
    paid: int
    balance: int
    status: BillStatus
    period: str | None
    due_date: date
    room_type: str | None
    building: str | None
    created_at: datetime
    payments: list[PaymentOut]
    tenant: PersonOut | None = None

    @classmethod
    def of(cls, bill: Bill, with_tenant: bool = False) -> BillOut:
        rt: RoomType | None = bill.room_type
        return cls(
            id=bill.id,
            number=bill.number,
            kind=bill.kind,
            description=bill.description,
            amount=bill.amount,
            paid=paid_amount(bill),
            balance=balance(bill),
            status=bill_status(bill),
            period=bill.period,
            due_date=bill.due_date,
            room_type=rt.name if rt else None,
            building=rt.building.name if rt else None,
            created_at=bill.created_at,
            payments=[
                PaymentOut(
                    id=p.id,
                    amount=p.amount,
                    method=p.method,
                    status=p.status,
                    reference=p.reference,
                    paid_at=p.paid_at,
                    note=p.note,
                )
                for p in bill.payments
            ],
            tenant=PersonOut(id=bill.tenant.id, name=bill.tenant.name, email=bill.tenant.email)
            if with_tenant
            else None,
        )


@router.get("/me/bills")
def my_bills(user: Tenant, db: DB) -> list[BillOut]:
    """The logged-in person's own bills, newest first."""
    ensure_sanitation_bills(db, tenant_id=user.id)
    return [BillOut.of(b) for b in db.scalars(bills_query().where(Bill.tenant_id == user.id)).all()]


@admin_router.get("/bills")
def list_bills(
    db: DB,
    tenant: str | None = None,
    kind: BillKind | None = None,
    status: BillStatus | None = None,
    period: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
    building: str | None = None,
) -> list[BillOut]:
    """Every live bill, newest first, optionally filtered."""
    ensure_sanitation_bills(db)
    query = bills_query()
    if tenant:
        query = query.where(Bill.tenant_id == tenant)
    if kind:
        query = query.where(Bill.kind == kind)
    if period:
        query = query.where(Bill.period == period)
    if building:
        query = query.join(Bill.room_type).where(RoomType.building_id == building)
    bills = db.scalars(query).all()
    if status:
        bills = [b for b in bills if bill_status(b) == status]
    return [BillOut.of(b, with_tenant=True) for b in bills]


class ManualPaymentIn(BaseModel):
    amount: int
    method: Literal["cash", "bank"]
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Enter an amount more than GH₵ 0.")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        if len(v.strip()) > 200:
            raise ValueError("Keep the note under 200 characters.")
        return v.strip()


@admin_router.post("/bills/{bill_id}/payments", status_code=201)
def add_manual_payment(bill_id: int, data: ManualPaymentIn, admin: Admin, db: DB) -> BillOut:
    """An admin records money received in cash or by bank transfer."""
    bill = db.scalar(bills_query().where(Bill.id == bill_id))
    if bill is None:
        raise HTTPException(status_code=404, detail="That bill doesn't exist.")
    try:
        record_payment(
            db,
            bill,
            amount=data.amount,
            method=PaymentMethod(data.method),
            reference=f"manual-{uuid4().hex}",
            recorded_by=admin,
            note=data.note,
        )
    except BillingError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    db.refresh(bill)
    return BillOut.of(bill, with_tenant=True)


class FeeOut(BaseModel):
    kind: BillKind
    status: BillStatus
    bill_id: int | None


class ComplianceOut(BaseModel):
    tenant_id: str
    period: str
    fully_compliant: bool
    fees: list[FeeOut]


@admin_router.get("/tenants/{tenant_id}/compliance")
def compliance(tenant_id: str, db: DB, period: str | None = None) -> ComplianceOut:
    """Whether the tenant has cleared both deposits and the month's sanitation bill."""
    if db.get(User, tenant_id) is None:
        raise HTTPException(status_code=404, detail="That tenant doesn't exist.")
    ensure_sanitation_bills(db, tenant_id=tenant_id)
    try:
        c = tenant_compliance(db, tenant_id, period or current_period())
    except BillingError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ComplianceOut(
        tenant_id=tenant_id,
        period=c.period,
        fully_compliant=c.fully_compliant,
        fees=[FeeOut(kind=f.kind, status=f.status, bill_id=f.bill.id if f.bill else None) for f in c.fees],
    )
