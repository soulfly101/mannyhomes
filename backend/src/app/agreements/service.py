"""Tenancy agreements (#24).

- Created when the room is allocated, in the same transaction. The filled-in wording, dates and the landlord's
  signature are frozen on it, so later changes to prices, wording or signatures can't touch it.
- The tenant signs by drawing or typing. Once signed it can never change.
- The renting deposit can't be paid online until it's signed (`payment_block`).
"""

import base64
import binascii
import hashlib
import struct
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, undefer

from ..db import utcnow
from ..models import Agreement, Bill, BillKind, Tenancy, User
from .template import DRAFT_WORDING, LANDLORD_NAME, LEASE_YEARS, TEMPLATE

PNG_PREFIX = "data:image/png;base64,"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_SIGNATURE_BYTES = 500 * 1024
MAX_SIGNATURE_PIXELS = 3000


class AgreementError(Exception):
    """Something about an agreement that isn't allowed; the message is shown to people as is."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def check_signature_image(data_url: str) -> str:
    """Only real, reasonably sized PNGs are stored and shown. Returns the data URL, or raises ValueError."""
    if not data_url.startswith(PNG_PREFIX):
        raise ValueError("The signature must be a PNG image.")
    try:
        raw = base64.b64decode(data_url[len(PNG_PREFIX) :], validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("The signature must be a PNG image.") from e
    if len(raw) > MAX_SIGNATURE_BYTES:
        raise ValueError("That image is too large. Use one under 500 KB.")
    if not raw.startswith(PNG_MAGIC) or raw[12:16] != b"IHDR" or len(raw) < 24:
        raise ValueError("The signature must be a PNG image.")
    width, height = struct.unpack(">II", raw[16:24])
    if not (0 < width <= MAX_SIGNATURE_PIXELS and 0 < height <= MAX_SIGNATURE_PIXELS):
        raise ValueError("That image's size looks wrong. Use one under 3000 pixels wide.")
    return data_url


def add_years(start: date, years: int) -> date:
    try:
        return start.replace(year=start.year + years)
    except ValueError:  # 29 February
        return start.replace(year=start.year + years, day=28)


def _day(d: date) -> str:
    return f"{d.day} {d:%b %Y}"


def _cedis(amount: int) -> str:
    return f"GH₵ {amount:,}"


def render(
    tenancy: Tenancy, tenant_name: str, lease_end: date, *, booking_deposit: int, renting_deposit: int
) -> str:
    values = {
        "Landlord": LANDLORD_NAME,
        "Tenant Full Name": tenant_name,
        "Building Name & Location": f"{tenancy.building_name}, {tenancy.location}",
        "Room Identification Number": tenancy.room_number,
        "Room Type": tenancy.room_name,
        "Lease Start Date": _day(tenancy.start_date),
        "Lease End Date": _day(lease_end),
        "Monthly Rent": _cedis(tenancy.rent),
        "Monthly Sanitation": _cedis(tenancy.sanitation_fee),
        "Booking Deposit": _cedis(booking_deposit),
        "Renting Deposit": _cedis(renting_deposit),
    }
    text = TEMPLATE
    for name, value in values.items():
        text = text.replace("{{" + name + "}}", value)
    return text


def create_agreement(db: Session, tenancy: Tenancy, *, tenant_name: str, admin: User) -> Agreement:
    """Freezes the agreement for this tenancy (not committed)."""
    lease_end = add_years(tenancy.start_date, LEASE_YEARS)
    agreement = Agreement(
        tenancy=tenancy,
        lease_start=tenancy.start_date,
        lease_end=lease_end,
        body=render(
            tenancy,
            tenant_name,
            lease_end,
            booking_deposit=tenancy.booking.bill.amount,
            renting_deposit=db.get(Bill, tenancy.renting_bill_id).amount,
        ),
        draft_wording=DRAFT_WORDING,
        landlord_name=LANDLORD_NAME,
        landlord_signature=admin.signature_image,
    )
    db.add(agreement)
    db.flush()
    return agreement


def agreements_query():
    """Agreements with everything needed to show them, newest first."""
    return (
        select(Agreement)
        .options(
            undefer(Agreement.body),
            undefer(Agreement.landlord_signature),
            undefer(Agreement.tenant_signature_image),
            selectinload(Agreement.tenancy).selectinload(Tenancy.tenant),
            selectinload(Agreement.tenancy).selectinload(Tenancy.renting_bill).selectinload(Bill.payments),
        )
        .order_by(Agreement.created_at.desc())
    )


def sign(
    db: Session,
    agreement: Agreement,
    *,
    image: str | None,
    typed_name: str | None,
    ip: str | None,
    user_agent: str | None,
) -> None:
    """Records the tenant's signature, once. Exactly one of image and typed_name is given."""
    if agreement.signed_at is not None:
        raise AgreementError("This agreement has already been signed.")
    now = utcnow()
    agreement.tenant_signature_kind = "drawn" if image else "typed"
    agreement.tenant_signature_image = image
    agreement.tenant_typed_name = typed_name
    agreement.signed_at = now
    agreement.signed_ip = ip
    agreement.signed_user_agent = (user_agent or "")[:255] or None
    agreement.document_hash = hashlib.sha256(
        "\n".join(
            [agreement.body, agreement.landlord_signature, image or typed_name or "", now.isoformat()]
        ).encode()
    ).hexdigest()
    db.commit()


def payment_block(db: Session, bill: Bill) -> str | None:
    """Why this bill can't be paid online yet, if there's a reason."""
    if bill.kind != BillKind.RENTING_DEPOSIT:
        return None
    signed_at = db.scalar(
        select(Agreement.signed_at).join(Agreement.tenancy).where(Tenancy.renting_bill_id == bill.id)
    )
    return None if signed_at else "Sign your tenancy agreement first, then you can pay the renting deposit."
