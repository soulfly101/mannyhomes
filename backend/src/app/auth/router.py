import secrets
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_session
from ..models import Role, User
from . import google
from .deps import current_user
from .passwords import hash_password, needs_rehash, verify_password
from .ratelimit import login_limiter
from .schemas import LoginIn, RegisterIn, UpdateMeIn, UserOut
from .sessions import clear_session_cookie, end_session, set_session_cookie, start_session

router = APIRouter(tags=["auth"])

DB = Annotated[Session, Depends(get_session)]
OAUTH_COOKIE = "altheo_google"
OAUTH_COOKIE_PATH = "/api/auth/google"
OAUTH_MAX_AGE = 600


def safe_next(value: str | None) -> str:
    """Only allow redirects to a path on our own site."""
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    return "/"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _login(db: Session, response: Response, request: Request, user: User) -> UserOut:
    token = start_session(db, user, request.headers.get("user-agent"))
    set_session_cookie(response, token)
    return UserOut.of(user)


@router.get("/config")
def auth_config() -> dict[str, bool]:
    return {"google": get_settings().google_enabled}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: DB) -> UserOut:
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(
            status_code=409,
            detail="An account with that email already exists. Log in instead.",
        )
    user = User(
        name=body.name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=Role.TENANT,
    )
    db.add(user)
    db.flush()
    return _login(db, response, request, user)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: DB) -> UserOut:
    key = f"{body.email}|{_client_ip(request)}"
    if login_limiter.blocked(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 15 minutes and try again.")
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None):
        login_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="That email and password don't match. Try again.")
    login_limiter.reset(key)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    return _login(db, response, request, user)


@router.post("/logout", status_code=204)
def logout(request: Request, db: DB) -> Response:
    end_session(db, request.cookies.get(get_settings().session_cookie_name))
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


@router.get("/me")
def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return UserOut.of(user)


@router.patch("/me")
def update_me(body: UpdateMeIn, user: Annotated[User, Depends(current_user)], db: DB) -> UserOut:
    if body.name is not None:
        user.name = body.name
    if body.phone is not None:
        user.phone = body.phone
    db.commit()
    return UserOut.of(user)


def _oauth_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt="google-sign-in")


def _frontend(path: str) -> str:
    return f"{get_settings().frontend_url.rstrip('/')}{path}"


def _google_failed(reason: str) -> RedirectResponse:
    response = RedirectResponse(_frontend(f"/login?error={reason}"), status_code=303)
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@router.get("/google/start")
def google_start(next: str | None = None) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_enabled:
        raise HTTPException(status_code=404, detail="Google sign-in isn't set up.")
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    verifier, challenge = google.new_pkce()
    response = RedirectResponse(google.authorize_url(settings, state, nonce, challenge), status_code=303)
    response.set_cookie(
        OAUTH_COOKIE,
        _oauth_serializer().dumps(
            {"state": state, "nonce": nonce, "verifier": verifier, "next": safe_next(next)}
        ),
        max_age=OAUTH_MAX_AGE,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path=OAUTH_COOKIE_PATH,
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    db: DB,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_enabled:
        raise HTTPException(status_code=404, detail="Google sign-in isn't set up.")
    if error:
        return _google_failed("google_cancelled")
    try:
        saved = _oauth_serializer().loads(request.cookies.get(OAUTH_COOKIE, ""), max_age=OAUTH_MAX_AGE)
    except BadSignature:
        return _google_failed("google")
    if not code or not state or not secrets.compare_digest(state, saved["state"]):
        return _google_failed("google")
    try:
        claims = google.exchange_code(settings, code, saved["verifier"])
    except google.GoogleSignInError:
        return _google_failed("google")
    if claims.get("nonce") != saved["nonce"] or not claims.get("email_verified") or not claims.get("sub"):
        return _google_failed("google")

    email = str(claims["email"]).lower()
    user = db.scalar(select(User).where(User.google_sub == claims["sub"]))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.google_sub = claims["sub"]
        else:
            name = " ".join(str(claims.get("name") or email.split("@")[0]).split())[:120]
            user = User(name=name, email=email, google_sub=claims["sub"], role=Role.TENANT)
            db.add(user)
        db.flush()

    next_path = saved["next"]
    if user.phone is None:
        next_path = f"/onboarding?next={quote(next_path, safe='')}"
    response = RedirectResponse(_frontend(next_path), status_code=303)
    set_session_cookie(response, start_session(db, user, request.headers.get("user-agent")))
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response
