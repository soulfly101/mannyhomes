from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.auth import google
from app.auth.router import safe_next
from app.config import get_settings
from app.models import Role, User

from .conftest import needs_db

pytestmark = needs_db


@pytest.fixture
def google_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")
    return settings


def start(client, next_path="/bookings"):
    response = client.get("/api/auth/google/start", params={"next": next_path}, follow_redirects=False)
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    return query


def finish(client, monkeypatch, query, claims=None, state=None):
    def fake_exchange(settings, code, verifier):
        assert code == "auth-code"
        assert verifier
        return {
            "iss": "https://accounts.google.com",
            "sub": "google-123",
            "email": "Kofi@Gmail.com",
            "email_verified": True,
            "name": "Kofi Asante",
            "nonce": query["nonce"][0],
            **(claims or {}),
        }

    monkeypatch.setattr(google, "exchange_code", fake_exchange)
    return client.get(
        "/api/auth/google/callback",
        params={"code": "auth-code", "state": state or query["state"][0]},
        follow_redirects=False,
    )


def test_config_reports_whether_google_is_set_up(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", None)
    assert client.get("/api/auth/config").json() == {"google": False}
    assert client.get("/api/auth/google/start", follow_redirects=False).status_code == 404


def test_start_redirects_to_google_with_pkce(client, google_on):
    query = start(client)
    assert query["client_id"] == ["test-client.apps.googleusercontent.com"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid email profile"]
    assert query["redirect_uri"] == [google_on.google_redirect_uri]
    assert client.cookies.get("altheo_google")


def test_new_google_user_is_created_and_sent_to_onboarding(client, db, monkeypatch, google_on):
    response = finish(client, monkeypatch, start(client))
    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:5173/onboarding?next=%2Fbookings"
    user = db.scalar(select(User).where(User.email == "kofi@gmail.com"))
    assert user.google_sub == "google-123"
    assert user.role is Role.TENANT
    assert user.name == "Kofi Asante"
    assert user.password_hash is None
    me = client.get("/api/auth/me").json()
    assert me["needs_onboarding"] is True


def test_existing_email_account_is_linked(client, db, monkeypatch, google_on):
    db.add(
        User(name="Kofi", email="kofi@gmail.com", phone="+233241234567", password_hash="x", role=Role.TENANT)
    )
    db.commit()
    response = finish(client, monkeypatch, start(client))
    assert response.headers["location"] == "http://localhost:5173/bookings"
    users = db.scalars(select(User).where(User.email == "kofi@gmail.com")).all()
    assert len(users) == 1
    assert users[0].google_sub == "google-123"


def test_returning_google_user_skips_onboarding(client, db, monkeypatch, google_on):
    db.add(User(name="Kofi", email="kofi@gmail.com", phone="+233241234567", google_sub="google-123"))
    db.commit()
    response = finish(client, monkeypatch, start(client, next_path="/"))
    assert response.headers["location"] == "http://localhost:5173/"


def test_unverified_google_email_is_refused(client, db, monkeypatch, google_on):
    response = finish(client, monkeypatch, start(client), claims={"email_verified": False})
    assert response.headers["location"] == "http://localhost:5173/login?error=google"
    assert db.scalar(select(User).where(User.email == "kofi@gmail.com")) is None


def test_wrong_state_is_refused(client, monkeypatch, google_on):
    response = finish(client, monkeypatch, start(client), state="forged-state")
    assert response.headers["location"].endswith("/login?error=google")


def test_wrong_nonce_is_refused(client, monkeypatch, google_on):
    response = finish(client, monkeypatch, start(client), claims={"nonce": "other"})
    assert response.headers["location"].endswith("/login?error=google")


def test_missing_sign_in_cookie_is_refused(client, monkeypatch, google_on):
    query = start(client)
    client.cookies.clear()
    assert finish(client, monkeypatch, query).headers["location"].endswith("/login?error=google")


def test_cancelling_at_google(client, google_on):
    start(client)
    response = client.get(
        "/api/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert response.headers["location"].endswith("/login?error=google_cancelled")


def test_google_errors_are_handled(client, monkeypatch, google_on):
    query = start(client)

    def boom(*_):
        raise google.GoogleSignInError("token exchange failed")

    monkeypatch.setattr(google, "exchange_code", boom)
    response = client.get(
        "/api/auth/google/callback", params={"code": "c", "state": query["state"][0]}, follow_redirects=False
    )
    assert response.headers["location"].endswith("/login?error=google")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("/bookings", "/bookings"),
        ("//evil.com", "/"),
        ("https://evil.com", "/"),
        ("/\\evil", "/"),
        (None, "/"),
    ],
)
def test_only_local_redirects_are_allowed(value, expected):
    assert safe_next(value) == expected
