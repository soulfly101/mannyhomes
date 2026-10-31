import hashlib
import secrets
from datetime import timedelta

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import User, UserSession

# Renew the expiry at most once a day so active people stay logged in without a write on every request.
RENEW_AFTER = timedelta(days=1)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User, user_agent: str | None = None) -> str:
    """Creates a login session and returns the raw token for the cookie."""
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=get_settings().session_days),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    user.last_login_at = now
    db.commit()
    return token


def user_for_token(db: Session, token: str | None) -> User | None:
    """The user a session token belongs to (None if missing or expired); renews sessions in use."""
    if not token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None:
        return None
    now = utcnow()
    if session.expires_at <= now:
        db.delete(session)
        db.commit()
        return None
    if now - session.last_seen_at >= RENEW_AFTER:
        session.last_seen_at = now
        session.expires_at = now + timedelta(days=get_settings().session_days)
        db.commit()
    return session.user


def end_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
        db.commit()


def set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=s.session_days * 86400,
        httponly=True,
        secure=s.session_cookie_secure,
        samesite=s.session_cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(
        s.session_cookie_name, path="/", secure=s.session_cookie_secure, samesite=s.session_cookie_samesite
    )
