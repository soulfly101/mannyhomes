from datetime import timedelta

from sqlalchemy import select

from app.auth.sessions import hash_token
from app.db import utcnow
from app.models import Role, User, UserSession

from .conftest import needs_db

pytestmark = needs_db


def sign_up(client):
    client.post(
        "/api/auth/register",
        json={
            "name": "Ama Mensah",
            "phone": "0241234567",
            "email": "ama@example.com",
            "password": "correct horse",
        },
    )
    return client.cookies.get("altheo_session")


def session_row(db, token):
    return db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))


def test_me_requires_login(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Log in to continue."


def test_only_a_hash_of_the_token_is_stored(client, db):
    token = sign_up(client)
    row = session_row(db, token)
    assert row is not None
    assert row.token_hash != token
    assert len(row.token_hash) == 64


def test_logout_ends_the_session(client, db):
    token = sign_up(client)
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert (
        'altheo_session=""' in response.headers["set-cookie"] or "Max-Age=0" in response.headers["set-cookie"]
    )
    assert session_row(db, token) is None
    client.cookies.set("altheo_session", token)
    assert client.get("/api/auth/me").status_code == 401


def test_expired_sessions_are_rejected_and_removed(client, db):
    token = sign_up(client)
    row = session_row(db, token)
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert session_row(db, token) is None


def test_sessions_in_use_are_renewed(client, db):
    token = sign_up(client)
    row = session_row(db, token)
    row.last_seen_at = utcnow() - timedelta(days=2)
    row.expires_at = utcnow() + timedelta(days=10)
    db.commit()
    assert client.get("/api/auth/me").status_code == 200
    db.refresh(row)
    assert row.expires_at > utcnow() + timedelta(days=89)


def test_sessions_are_not_rewritten_on_every_request(client, db):
    token = sign_up(client)
    row = session_row(db, token)
    before = row.expires_at
    client.get("/api/auth/me")
    db.refresh(row)
    assert row.expires_at == before


def test_update_me_sets_phone_and_name(client):
    sign_up(client)
    response = client.patch("/api/auth/me", json={"phone": "+233 50 111 2222", "name": "Ama  Serwaa Mensah"})
    assert response.status_code == 200
    assert response.json()["phone"] == "+233501112222"
    assert response.json()["name"] == "Ama Serwaa Mensah"


def test_update_me_validates_phone(client):
    sign_up(client)
    response = client.patch("/api/auth/me", json={"phone": "999"})
    assert response.status_code == 422
    assert response.json()["errors"]["phone"] == "Enter a Ghana phone number, like 024 123 4567."


def test_google_users_without_phone_need_onboarding(client, db):
    user = User(name="Kofi", email="kofi@example.com", google_sub="g-1", role=Role.TENANT)
    db.add(user)
    db.commit()
    from app.auth.sessions import start_session

    client.cookies.set("altheo_session", start_session(db, user))
    assert client.get("/api/auth/me").json()["needs_onboarding"] is True
    client.patch("/api/auth/me", json={"phone": "0241234567"})
    assert client.get("/api/auth/me").json()["needs_onboarding"] is False


def test_state_changing_requests_need_the_csrf_header(anon_client):
    response = anon_client.post("/api/auth/logout")
    assert response.status_code == 403
    assert anon_client.get("/api/auth/config").status_code == 200
