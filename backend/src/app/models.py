from datetime import date, datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.dialects.mysql import DATETIME as MYSQL_DATETIME
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, utcnow


class Role(StrEnum):
    TENANT = "tenant"
    ADMIN = "admin"
    STAFF = "staff"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    # E.164, e.g. +233241234567. Empty for Google sign-ups until they finish onboarding.
    phone: Mapped[str | None] = mapped_column(String(16))
    # Empty for people who only ever sign in with Google.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    role: Mapped[Role] = mapped_column(
        Enum(
            Role,
            name="user_role",
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=Role.TENANT,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    # An admin's signature as a PNG data URL, stamped on agreements (#24). Loaded only when asked for.
    signature_image: Mapped[str | None] = mapped_column(MEDIUMTEXT, deferred=True)

    sessions: Mapped[list[UserSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    """A logged-in browser. The cookie holds a random token; only its SHA-256 hash is stored."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="sessions")


class Building(Base):
    """An apartment building, e.g. "Manny Building" in Oyarifa, offering one or more room types."""

    __tablename__ = "buildings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    # Unique regardless of case (MySQL's default collation compares case-insensitively).
    name: Mapped[str] = mapped_column(String(100), unique=True)
    location: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    # Monthly sanitation (rubbish pickup) fee in whole cedis; room types can override it.
    sanitation_fee: Mapped[int] = mapped_column(Integer, default=0)
    # Shown to tenants when browsing (#13).
    listed: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    room_types: Mapped[list[RoomType]] = relationship(
        back_populates="building", cascade="all, delete-orphan", order_by="RoomType.sort_order"
    )


class RoomType(Base):
    """A kind of room a building rents out (e.g. "2 bedroom"), with its price and how many are free.

    Prices are only the current offer: bookings, tenancies and bills copy the amount when they're created,
    so changing a price never alters what someone already owes.
    """

    __tablename__ = "room_types"
    __table_args__ = (UniqueConstraint("building_id", "name", name="uq_room_types_building_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    building_id: Mapped[str] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    # Base monthly rent in whole cedis.
    rent: Mapped[int] = mapped_column(Integer)
    # Set by the admin; allocation (#18) takes one, move-out (#26) gives one back.
    quantity_available: Mapped[int] = mapped_column(Integer, default=0)
    # Monthly sanitation fee for this room type in whole cedis; None means use the building's.
    sanitation_fee_override: Mapped[int | None] = mapped_column(Integer)
    # Refundable deposit paid when booking (#14), and the security deposit charged at allocation (#18).
    # Whole cedis; 0 means the admin hasn't set it yet. Copied into bills when they're created.
    booking_deposit: Mapped[int] = mapped_column(Integer, default=0)
    renting_deposit: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    building: Mapped[Building] = relationship(back_populates="room_types")

    @property
    def sanitation_fee(self) -> int:
        """The monthly sanitation fee that applies to this room type."""
        if self.sanitation_fee_override is not None:
            return self.sanitation_fee_override
        return self.building.sanitation_fee


class ContactMessage(Base):
    """A message sent from the website's contact form (e.g. "I'd like to view a 2 bedroom")."""

    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    # E.164, e.g. +233241234567; optional.
    phone: Mapped[str | None] = mapped_column(String(16))
    # The room type the visitor asked about, if any. Kept if the room type is later deleted (set to NULL).
    room_type_id: Mapped[str | None] = mapped_column(ForeignKey("room_types.id", ondelete="SET NULL"))
    message: Mapped[str] = mapped_column(Text)
    handled: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    room_type: Mapped[RoomType | None] = relationship()


def _str_enum(cls: type[StrEnum], name: str) -> Enum:
    """Stored as its plain value (e.g. "booking_deposit") in a VARCHAR, like Role."""
    return Enum(cls, name=name, native_enum=False, length=24, values_callable=lambda e: [m.value for m in e])


class BillKind(StrEnum):
    BOOKING_DEPOSIT = "booking_deposit"
    RENTING_DEPOSIT = "renting_deposit"
    SANITATION = "sanitation"
    LATE_FEE = "late_fee"


class PaymentMethod(StrEnum):
    PAYSTACK_MOMO = "paystack_momo"
    PAYSTACK_CARD = "paystack_card"
    MOOLRE_MOMO = "moolre_momo"
    CASH = "cash"
    BANK = "bank"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class Bill(Base):
    """Something a tenant owes (#19): a deposit, a month's sanitation fee or a late fee on one (#25).

    The amount is copied when the bill is created, so later price changes never alter it.
    Whether it's Paid, Partial or Unpaid is worked out from its successful payments (see app.billing).
    """

    __tablename__ = "bills"
    # One sanitation bill and one late fee per tenant per month. Deposits have no period (NULLs never clash).
    __table_args__ = (UniqueConstraint("tenant_id", "kind", "period", name="uq_bills_tenant_kind_period"),)

    # Also the bill number shown to people, e.g. BILL-000042.
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[BillKind] = mapped_column(_str_enum(BillKind, "bill_kind"))
    amount: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(200))
    # "2026-11" for a month's sanitation bill or its late fee; None for deposits.
    period: Mapped[str | None] = mapped_column(String(7))
    due_date: Mapped[date] = mapped_column(Date)
    # The room type it's for, if any. Kept as NULL if the room type is later deleted.
    room_type_id: Mapped[str | None] = mapped_column(ForeignKey("room_types.id", ondelete="SET NULL"))
    # Cancelled bills are kept for the record but ignored everywhere.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    tenant: Mapped[User] = relationship()
    room_type: Mapped[RoomType | None] = relationship()
    payments: Mapped[list[Payment]] = relationship(back_populates="bill", order_by="Payment.id")

    @property
    def number(self) -> str:
        return f"BILL-{self.id:06d}"


class Payment(Base):
    """Money paid towards a bill: through a payment provider or recorded by an admin (cash or bank)."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[PaymentMethod] = mapped_column(_str_enum(PaymentMethod, "payment_method"))
    status: Mapped[PaymentStatus] = mapped_column(
        _str_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    # The reference sent to the payment provider, or one we make up for cash/bank.
    # Unique, so the same payment is never counted twice.
    reference: Mapped[str] = mapped_column(String(100), unique=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    # The admin who recorded a cash or bank payment.
    recorded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(200))
    # The number and network being charged, for repeating the request with an SMS code.
    momo_phone: Mapped[str | None] = mapped_column(String(16))
    momo_network: Mapped[str | None] = mapped_column(String(8))
    # True while the provider wants an SMS code; no prompt has gone to the phone yet.
    otp_required: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # When the code was accepted: the time to approve the prompt runs from here, not from created_at.
    prompted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    bill: Mapped[Bill] = relationship(back_populates="payments")
    recorded_by: Mapped[User | None] = relationship()


class PenaltySettings(Base):
    """The admin's choice of penalties for overdue sanitation bills (#25): one row, or none if never saved."""

    __tablename__ = "penalty_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # The day they were last switched on: only bills due from then on get a late fee.
    enabled_on: Mapped[date | None] = mapped_column(Date)
    # The flat fee in whole cedis, copied onto each late fee bill. 0 means no fee.
    late_fee: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Stops new repair tickets until the tenant is cleared (for #17 to enforce with `tickets_frozen`).
    freeze_tickets: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class BookingStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    AWAITING_ALLOCATION = "awaiting_allocation"
    ALLOCATED = "allocated"
    CANCELLED = "cancelled"


class Booking(Base):
    """A tenant reserving a room type by paying its booking deposit (#14). The admin allocates next (#18)."""

    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    room_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("room_types.id", ondelete="SET NULL"), index=True
    )
    # Copied so the booking still reads properly if the room type is renamed or deleted.
    room_name: Mapped[str] = mapped_column(String(60))
    building_name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(100))
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"))
    status: Mapped[BookingStatus] = mapped_column(
        _str_enum(BookingStatus, "booking_status"), default=BookingStatus.PENDING_PAYMENT
    )
    # While paying, the room is held until this time so it can't be sold to someone else meanwhile.
    hold_until: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    tenant: Mapped[User] = relationship()
    room_type: Mapped[RoomType | None] = relationship()
    bill: Mapped[Bill] = relationship()
    tenancy: Mapped[Tenancy | None] = relationship(back_populates="booking")


class Tenancy(Base):
    """A tenant living in a specific room (#18), started when the admin allocates it to their booking.

    Rent and sanitation are copied here, so later price changes never alter what this tenant pays.
    """

    __tablename__ = "tenancies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), unique=True)
    # Kept as NULL if the building or room type is later deleted; the names below stay.
    room_type_id: Mapped[str | None] = mapped_column(ForeignKey("room_types.id", ondelete="SET NULL"))
    building_id: Mapped[str | None] = mapped_column(
        ForeignKey("buildings.id", ondelete="SET NULL"), index=True
    )
    room_name: Mapped[str] = mapped_column(String(60))
    building_name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(100))
    # The physical room, typed in by the admin, e.g. "A12". One active tenancy per room in a building.
    room_number: Mapped[str] = mapped_column(String(20))
    rent: Mapped[int] = mapped_column(Integer)
    sanitation_fee: Mapped[int] = mapped_column(Integer)
    renting_bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"))
    start_date: Mapped[date] = mapped_column(Date)
    # Set by the admin if it differs from the day the agreement was signed (see app.sanitation).
    move_in_date: Mapped[date | None] = mapped_column(Date)
    # Set at move-out (#26). None means the tenant is living there now.
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    allocated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    booking: Mapped[Booking] = relationship(back_populates="tenancy")
    renting_bill: Mapped[Bill] = relationship()
    tenant: Mapped[User] = relationship(foreign_keys=[tenant_id])
    agreement: Mapped[Agreement | None] = relationship(back_populates="tenancy")


class Agreement(Base):
    """A tenancy agreement (#24). Frozen when the room is allocated, and finished when the tenant signs.

    The wording, dates and the landlord's signature are copied here, so nothing later can change a document
    someone has signed. Large fields are only loaded when asked for.
    """

    __tablename__ = "agreements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenancy_id: Mapped[str] = mapped_column(ForeignKey("tenancies.id"), unique=True)
    lease_start: Mapped[date] = mapped_column(Date)
    lease_end: Mapped[date] = mapped_column(Date)
    # The filled-in wording: plain text, with "## " marking headings.
    body: Mapped[str] = mapped_column(Text, deferred=True)
    # True while the wording hasn't been approved by a lawyer; the document says so.
    draft_wording: Mapped[bool] = mapped_column(default=True)
    landlord_name: Mapped[str] = mapped_column(String(120))
    landlord_signature: Mapped[str] = mapped_column(MEDIUMTEXT, deferred=True)
    # "drawn" or "typed"; empty until signed.
    tenant_signature_kind: Mapped[str | None] = mapped_column(String(8))
    tenant_signature_image: Mapped[str | None] = mapped_column(MEDIUMTEXT, deferred=True)
    tenant_typed_name: Mapped[str | None] = mapped_column(String(120))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Evidence of the signing.
    signed_ip: Mapped[str | None] = mapped_column(String(45))
    signed_user_agent: Mapped[str | None] = mapped_column(String(255))
    # SHA-256 of what was signed, shown on the document so a copy can be checked later.
    document_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    tenancy: Mapped[Tenancy] = relationship(back_populates="agreement")


_PRECISE = DateTime().with_variant(MYSQL_DATETIME(fsp=6), "mysql")


class TicketCategory(StrEnum):
    PLUMBING = "plumbing"
    ELECTRICAL = "electrical"
    GENERAL = "general"


class TicketStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class Ticket(Base):
    """A problem a tenant reports (#17), which admins work through (#21).

    The room number and building are copied, so the report still says where it was after a move-out.
    """

    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    tenancy_id: Mapped[str] = mapped_column(ForeignKey("tenancies.id"))
    category: Mapped[TicketCategory] = mapped_column(_str_enum(TicketCategory, "ticket_category"))
    # Shown as plain text, never HTML.
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[TicketStatus] = mapped_column(
        _str_enum(TicketStatus, "ticket_status"), default=TicketStatus.PENDING
    )
    room_number: Mapped[str] = mapped_column(String(20))
    building_name: Mapped[str] = mapped_column(String(100))
    # To the microsecond, so two reports sent in the same second still list in the order they came.
    created_at: Mapped[datetime] = mapped_column(_PRECISE, default=utcnow, index=True)
    # When it was reported or its status last changed.
    updated_at: Mapped[datetime] = mapped_column(_PRECISE, default=utcnow)

    tenant: Mapped[User] = relationship()


class Conversation(Base):
    """A chat between a tenant and the admins (#22) about one topic: general, or one repair report.

    Any admin can answer, so the admins share one read marker. Read markers are the last message id seen.
    """

    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("tenant_id", "topic", name="uq_conversations_tenant_topic"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("tickets.id"))
    # "general", or "ticket:<id>": one conversation per tenant per topic.
    topic: Mapped[str] = mapped_column(String(60))
    tenant_read_id: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    admin_read_id: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(_PRECISE, default=utcnow)
    last_message_at: Mapped[datetime | None] = mapped_column(_PRECISE, index=True)

    tenant: Mapped[User] = relationship()
    ticket: Mapped[Ticket | None] = relationship()


class Message(Base):
    """One chat message. Shown as plain text, never HTML."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    # Which side sent it, kept even if the sender's role later changes.
    from_admin: Mapped[bool] = mapped_column(Boolean)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(_PRECISE, default=utcnow)

    sender: Mapped[User] = relationship()
