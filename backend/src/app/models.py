from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
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
