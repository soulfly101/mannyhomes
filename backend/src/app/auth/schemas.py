import re

from pydantic import BaseModel, EmailStr, field_validator

from ..models import Role, User

GHANA_PHONE = re.compile(r"^(?:0|\+233)(\d{9})$")


def normalise_phone(value: str) -> str:
    """Accepts 024 123 4567 / 0241234567 / +233241234567 and returns +233241234567."""
    match = GHANA_PHONE.match(re.sub(r"[\s\-()]", "", value))
    if not match:
        raise ValueError("Enter a Ghana phone number, like 024 123 4567.")
    return f"+233{match.group(1)}"


def clean_name(value: str) -> str:
    value = " ".join(value.split())
    if len(value) < 2:
        raise ValueError("Enter your full name.")
    if len(value) > 120:
        raise ValueError("Keep your name under 120 characters.")
    return value


class RegisterIn(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str

    _name = field_validator("name")(clean_name)
    _phone = field_validator("phone")(normalise_phone)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.lower()

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Use at least 8 characters for your password.")
        if len(value) > 128:
            raise ValueError("Keep your password under 128 characters.")
        return value


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.strip().lower()


class UpdateMeIn(BaseModel):
    name: str | None = None
    phone: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else clean_name(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return None if value is None else normalise_phone(value)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    role: Role
    needs_onboarding: bool

    @classmethod
    def of(cls, user: User) -> UserOut:
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            role=user.role,
            needs_onboarding=user.phone is None,
        )
