from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_session
from ..models import Role, User
from .sessions import user_for_token


def optional_user(request: Request, db: Annotated[Session, Depends(get_session)]) -> User | None:
    return user_for_token(db, request.cookies.get(get_settings().session_cookie_name))


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Log in to continue.")
    return user


def require_role(*roles: Role):
    """Dependency for routes only some roles may use, e.g. Depends(require_role(Role.ADMIN))."""

    def check(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You don't have access to this.")
        return user

    return check
