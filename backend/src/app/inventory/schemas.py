from datetime import datetime

from pydantic import BaseModel, field_validator

from ..models import Building, RoomType

MAX_CEDIS = 1_000_000
MAX_QUANTITY = 10_000


def _text(value: str, *, min_len: int, max_len: int, missing: str, too_long: str) -> str:
    value = " ".join(value.split())
    if len(value) < min_len:
        raise ValueError(missing)
    if len(value) > max_len:
        raise ValueError(too_long)
    return value


def _optional_text(value: str | None, max_len: int = 1000) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    if len(value) > max_len:
        raise ValueError(f"Keep the description under {max_len} characters.")
    return value


def _cedis(value: int, *, minimum: int, message: str) -> int:
    if value < minimum:
        raise ValueError(message)
    if value > MAX_CEDIS:
        raise ValueError("That amount looks too high. Check it and try again.")
    return value


class RoomTypeIn(BaseModel):
    id: str | None = None
    name: str
    rent: int
    quantity_available: int
    sanitation_fee_override: int | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _text(
            v,
            min_len=1,
            max_len=60,
            missing="Enter the room type, like 2 bedroom.",
            too_long="Keep it under 60 characters.",
        )

    @field_validator("rent")
    @classmethod
    def _rent(cls, v: int) -> int:
        return _cedis(v, minimum=1, message="Rent must be more than GH₵ 0.")

    @field_validator("quantity_available")
    @classmethod
    def _quantity(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Quantity can't be negative.")
        if v > MAX_QUANTITY:
            raise ValueError("That quantity looks too high. Check it and try again.")
        return v

    @field_validator("sanitation_fee_override")
    @classmethod
    def _fee(cls, v: int | None) -> int | None:
        return None if v is None else _cedis(v, minimum=0, message="The sanitation fee can't be negative.")

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return _optional_text(v, 500)


class BuildingIn(BaseModel):
    name: str
    location: str
    sanitation_fee: int = 0
    description: str | None = None
    listed: bool = True
    room_types: list[RoomTypeIn]

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _text(
            v,
            min_len=2,
            max_len=100,
            missing="Enter the building name.",
            too_long="Keep the name under 100 characters.",
        )

    @field_validator("location")
    @classmethod
    def _location(cls, v: str) -> str:
        return _text(
            v,
            min_len=2,
            max_len=100,
            missing="Enter the location, like Oyarifa.",
            too_long="Keep the location under 100 characters.",
        )

    @field_validator("sanitation_fee")
    @classmethod
    def _fee(cls, v: int) -> int:
        return _cedis(v, minimum=0, message="The sanitation fee can't be negative.")

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return _optional_text(v)

    @field_validator("room_types")
    @classmethod
    def _room_types(cls, v: list[RoomTypeIn]) -> list[RoomTypeIn]:
        if not v:
            raise ValueError("Add at least one room type.")
        names = [rt.name.casefold() for rt in v]
        if len(set(names)) != len(names):
            raise ValueError("Each room type in a building needs a different name.")
        return v


class RoomTypeOut(BaseModel):
    id: str
    name: str
    rent: int
    quantity_available: int
    sanitation_fee_override: int | None
    sanitation_fee: int
    description: str | None

    @classmethod
    def of(cls, rt: RoomType) -> RoomTypeOut:
        return cls(
            id=rt.id,
            name=rt.name,
            rent=rt.rent,
            quantity_available=rt.quantity_available,
            sanitation_fee_override=rt.sanitation_fee_override,
            sanitation_fee=rt.sanitation_fee,
            description=rt.description,
        )


class BuildingOut(BaseModel):
    id: str
    name: str
    location: str
    description: str | None
    sanitation_fee: int
    listed: bool
    room_types: list[RoomTypeOut]
    total_available: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, b: Building) -> BuildingOut:
        return cls(
            id=b.id,
            name=b.name,
            location=b.location,
            description=b.description,
            sanitation_fee=b.sanitation_fee,
            listed=b.listed,
            room_types=[RoomTypeOut.of(rt) for rt in b.room_types],
            total_available=sum(rt.quantity_available for rt in b.room_types),
            created_at=b.created_at,
            updated_at=b.updated_at,
        )
