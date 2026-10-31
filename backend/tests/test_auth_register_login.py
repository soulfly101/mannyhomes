import pytest
from sqlalchemy import select

from app.models import Role, User, UserSession

from .conftest import needs_db

pytestmark = needs_db

AMA = {
    "name": "Ama  Mensah",
    "phone": "024 123 4567",
    "email": "Ama@Example.com",
    "password": "correct horse",
}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**AMA, **overrides})


def test_register_creates_a_logged_in_tenant(client, db):
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Ama Mensah"
    assert body["email"] == "ama@example.com"
    assert body["phone"] == "+233241234567"
    assert body["role"] == "tenant"
    assert body["needs_onboarding"] is False

    user = db.scalar(select(User).where(User.email == "ama@example.com"))
    assert user.password_hash and user.password_hash.startswith("$argon2")
    assert "correct horse" not in user.password_hash
    assert client.get("/api/auth/me").json()["email"] == "ama@example.com"


def test_register_sets_a_safe_session_cookie(client):
    cookie = register(client).headers["set-cookie"]
    assert cookie.startswith("altheo_session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=7776000" in cookie  # 90 days


def test_register_rejects_duplicate_email(client):
    register(client)
    response = register(client, email="AMA@example.com")
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("phone", "12345", "Enter a Ghana phone number, like 024 123 4567."),
        ("password", "short", "Use at least 8 characters for your password."),
        ("email", "not-an-email", "Enter a valid email address."),
        ("name", " A ", "Enter your full name."),
    ],
)
def test_register_explains_invalid_fields(client, field, value, message):
    response = register(client, **{field: value})
    assert response.status_code == 422
    assert response.json()["errors"][field] == message
    assert response.json()["detail"] == message


def test_register_accepts_plus_233_numbers(client):
    assert register(client, phone="+233 20 000 0001").json()["phone"] == "+233200000001"


def test_login_with_correct_password(client):
    register(client)
    client.cookies.clear()
    response = client.post(
        "/api/auth/login", json={"email": " AMA@example.com ", "password": "correct horse"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "ama@example.com"
    assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize("email", ["ama@example.com", "nobody@example.com"])
def test_login_failures_look_the_same(client, email):
    register(client)
    client.cookies.clear()
    response = client.post("/api/auth/login", json={"email": email, "password": "wrong password"})
    assert response.status_code == 401
    assert response.json()["detail"] == "That email and password don't match. Try again."


def test_login_is_blocked_after_five_failures(client):
    register(client)
    client.cookies.clear()
    bad = {"email": "ama@example.com", "password": "wrong password"}
    for _ in range(5):
        assert client.post("/api/auth/login", json=bad).status_code == 401
    blocked = client.post("/api/auth/login", json={"email": "ama@example.com", "password": "correct horse"})
    assert blocked.status_code == 429
    assert "Wait 15 minutes" in blocked.json()["detail"]


def test_successful_login_resets_the_failure_count(client):
    register(client)
    client.cookies.clear()
    bad = {"email": "ama@example.com", "password": "wrong password"}
    for _ in range(4):
        client.post("/api/auth/login", json=bad)
    assert client.post("/api/auth/login", json={**bad, "password": "correct horse"}).status_code == 200
    for _ in range(4):
        assert client.post("/api/auth/login", json=bad).status_code == 401


def test_google_only_account_cannot_log_in_with_a_password(client, db):
    db.add(User(name="Kofi", email="kofi@example.com", google_sub="g-1", role=Role.TENANT))
    db.commit()
    response = client.post("/api/auth/login", json={"email": "kofi@example.com", "password": "anything123"})
    assert response.status_code == 401


def test_each_login_creates_its_own_session(client, db):
    register(client)
    client.post("/api/auth/login", json={"email": "ama@example.com", "password": "correct horse"})
    user = db.scalar(select(User).where(User.email == "ama@example.com"))
    assert db.query(UserSession).filter_by(user_id=user.id).count() == 2
