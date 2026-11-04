"""Tenancy agreements API (#24): tenants read and sign their own; admins see them all and keep a signature."""

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, undefer

from ..auth.deps import require_role
from ..billing.service import BillStatus, bill_status
from ..db import get_session
from ..models import Agreement, Role, Tenancy, User
from .service import AgreementError, agreements_query, check_signature_image, sign

DB = Annotated[Session, Depends(get_session)]
Tenant = Annotated[User, Depends(require_role(Role.TENANT))]
Admin = Annotated[User, Depends(require_role(Role.ADMIN))]

router = APIRouter(tags=["agreements"])
admin_router = APIRouter(tags=["admin: agreements"], dependencies=[Depends(require_role(Role.ADMIN))])


class AgreementSummary(BaseModel):
    id: str
    tenant_name: str
    room_number: str
    room: str
    building: str
    location: str
    lease_start: date
    lease_end: date
    signed_at: datetime | None

    @classmethod
    def of(cls, a: Agreement) -> AgreementSummary:
        t = a.tenancy
        return cls(
            id=a.id,
            tenant_name=t.tenant.name,
            room_number=t.room_number,
            room=t.room_name,
            building=t.building_name,
            location=t.location,
            lease_start=a.lease_start,
            lease_end=a.lease_end,
            signed_at=a.signed_at,
        )


class AgreementOut(AgreementSummary):
    body: str
    draft_wording: bool
    landlord_name: str
    landlord_signature: str
    tenant_signature_kind: str | None
    tenant_signature_image: str | None
    tenant_typed_name: str | None
    document_hash: str | None
    renting_bill_id: int
    renting_deposit: int
    renting_bill_status: BillStatus

    @classmethod
    def of(cls, a: Agreement) -> AgreementOut:
        bill = a.tenancy.renting_bill
        return cls(
            **AgreementSummary.of(a).model_dump(),
            body=a.body,
            draft_wording=a.draft_wording,
            landlord_name=a.landlord_name,
            landlord_signature=a.landlord_signature,
            tenant_signature_kind=a.tenant_signature_kind,
            tenant_signature_image=a.tenant_signature_image,
            tenant_typed_name=a.tenant_typed_name,
            document_hash=a.document_hash,
            renting_bill_id=bill.id,
            renting_deposit=bill.amount,
            renting_bill_status=bill_status(bill),
        )


def _mine(db: Session, agreement_id: str, tenant: User) -> Agreement:
    agreement = db.scalar(
        agreements_query()
        .join(Agreement.tenancy)
        .where(Agreement.id == agreement_id, Tenancy.tenant_id == tenant.id)
    )
    if agreement is None:
        raise HTTPException(status_code=404, detail="That agreement doesn't exist.")
    return agreement


@router.get("")
def my_agreements(tenant: Tenant, db: DB) -> list[AgreementSummary]:
    query = agreements_query().join(Agreement.tenancy).where(Tenancy.tenant_id == tenant.id)
    return [AgreementSummary.of(a) for a in db.scalars(query).all()]


@router.get("/{agreement_id}")
def my_agreement(agreement_id: str, tenant: Tenant, db: DB) -> AgreementOut:
    return AgreementOut.of(_mine(db, agreement_id, tenant))


class SignIn(BaseModel):
    kind: Literal["drawn", "typed"]
    image: str | None = None
    typed_name: str | None = None
    agreed: bool

    @field_validator("agreed")
    @classmethod
    def _agreed(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Tick the box to confirm you've read and agree to this.")
        return v

    @field_validator("typed_name")
    @classmethod
    def _typed_name(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v else v

    @model_validator(mode="after")
    def _signature(self) -> SignIn:
        if self.kind == "drawn":
            if not self.image:
                raise ValueError("Draw your signature first.")
            check_signature_image(self.image)
            self.typed_name = None
        else:
            if not self.typed_name or len(self.typed_name) < 2:
                raise ValueError("Type your full legal name.")
            if len(self.typed_name) > 120:
                raise ValueError("Keep your name under 120 characters.")
            self.image = None
        return self


@router.post("/{agreement_id}/sign")
def sign_agreement(agreement_id: str, data: SignIn, request: Request, tenant: Tenant, db: DB) -> AgreementOut:
    # Locked so a double click can't sign twice.
    locked = db.scalar(
        select(Agreement)
        .join(Agreement.tenancy)
        .where(Agreement.id == agreement_id, Tenancy.tenant_id == tenant.id)
        .with_for_update(of=Agreement)
    )
    if locked is None:
        raise HTTPException(status_code=404, detail="That agreement doesn't exist.")
    agreement = _mine(db, agreement_id, tenant)
    try:
        sign(
            db,
            agreement,
            image=data.image,
            typed_name=data.typed_name,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except AgreementError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return AgreementOut.of(agreement)


@admin_router.get("/agreements")
def all_agreements(db: DB) -> list[AgreementSummary]:
    return [AgreementSummary.of(a) for a in db.scalars(agreements_query()).all()]


@admin_router.get("/agreements/{agreement_id}")
def one_agreement(agreement_id: str, db: DB) -> AgreementOut:
    agreement = db.scalar(agreements_query().where(Agreement.id == agreement_id))
    if agreement is None:
        raise HTTPException(status_code=404, detail="That agreement doesn't exist.")
    return AgreementOut.of(agreement)


class SignatureOut(BaseModel):
    image: str | None


class SignatureIn(BaseModel):
    image: str

    @field_validator("image")
    @classmethod
    def _image(cls, v: str) -> str:
        return check_signature_image(v)


def _with_signature(db: Session, admin: User) -> User:
    return db.scalar(select(User).where(User.id == admin.id).options(undefer(User.signature_image)))


@admin_router.get("/signature")
def my_signature(admin: Admin, db: DB) -> SignatureOut:
    return SignatureOut(image=_with_signature(db, admin).signature_image)


@admin_router.put("/signature")
def save_signature(data: SignatureIn, admin: Admin, db: DB) -> SignatureOut:
    """Saves the admin's signature for future agreements. Existing ones keep the one they were made with."""
    user = _with_signature(db, admin)
    user.signature_image = data.image
    db.commit()
    return SignatureOut(image=user.signature_image)
