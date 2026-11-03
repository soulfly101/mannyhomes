import pytest
from sqlalchemy import select

from app.auth.sessions import start_session
from app.contact.router import contact_limiter
from app.models import Building, ContactMessage, Role, RoomType, User

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/contact"
GOOD = {
    "name": "Kofi  Asante",
    "email": "Kofi@Example.com",
    "phone": "024 123 4567",
    "message": "I'd like to view a 2 bedroom next week.",
}


@pytest.fixture(autouse=True)
def _reset_limiter():
    contact_limiter.reset_all()
    yield
    contact_limiter.reset_all()


def room(db) -> RoomType:
    b = Building(name="Manny Building", location="Oyarifa", sanitation_fee=50)
    rt = RoomType(name="2 bedroom", rent=2000, quantity_available=2)
    b.room_types.append(rt)
    db.add(b)
    db.commit()
    return rt


def as_role(client, db, role):
    u = User(name=f"{role} p", email=f"{role}-c@example.com", phone="+233241234567", role=role)
    db.add(u)
    db.commit()
    client.cookies.set("altheo_session", start_session(db, u))


def test_anyone_can_send_a_message(client, db):
    rt = room(db)
    response = client.post(URL, json={**GOOD, "room_type_id": rt.id})
    assert response.status_code == 201
    assert "get back to you" in response.json()["detail"]
    saved = db.scalar(select(ContactMessage))
    assert (saved.name, saved.email, saved.phone, saved.room_type_id, saved.handled) == (
        "Kofi Asante",
        "kofi@example.com",
        "+233241234567",
        rt.id,
        False,
    )


def test_phone_and_room_are_optional(client, db):
    response = client.post(URL, json={**GOOD, "phone": "", "room_type_id": ""})
    assert response.status_code == 201
    saved = db.scalar(select(ContactMessage))
    assert saved.phone is None
    assert saved.room_type_id is None


def test_an_unknown_room_is_ignored_not_rejected(client, db):
    assert client.post(URL, json={**GOOD, "room_type_id": "gone"}).status_code == 201
    assert db.scalar(select(ContactMessage)).room_type_id is None


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("name", "A", "Enter your full name."),
        ("email", "nope", "Enter a valid email address."),
        ("phone", "123", "Enter a Ghana phone number, like 024 123 4567."),
        ("message", "Hi", "Tell us a little more (at least 10 characters)."),
        ("message", "x" * 2001, "Keep your message under 2,000 characters."),
    ],
)
def test_fields_are_checked(client, field, value, message):
    response = client.post(URL, json={**GOOD, field: value})
    assert response.status_code == 422
    assert response.json()["errors"][field] == message


def test_too_many_messages_are_refused(client):
    for _ in range(5):
        assert client.post(URL, json=GOOD).status_code == 201
    response = client.post(URL, json=GOOD)
    assert response.status_code == 429
    assert "Try again in an hour" in response.json()["detail"]


def test_csrf_header_is_required(anon_client):
    assert anon_client.post(URL, json=GOOD).status_code == 403


def test_admins_can_list_messages_newest_first(client, db):
    rt = room(db)
    client.post(URL, json={**GOOD, "message": "First message, about the flat."})
    client.post(URL, json={**GOOD, "room_type_id": rt.id, "message": "Second message, about the 2 bedroom."})
    as_role(client, db, Role.ADMIN)
    messages = client.get("/api/admin/contact").json()
    assert [m["message"] for m in messages] == [
        "Second message, about the 2 bedroom.",
        "First message, about the flat.",
    ]
    assert (messages[0]["room_type"], messages[0]["building"]) == ("2 bedroom", "Manny Building")
    assert messages[1]["room_type"] is None


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_can_read_messages(client, db, role):
    as_role(client, db, role)
    assert client.get("/api/admin/contact").status_code == 403


def test_logged_out_visitors_cannot_read_messages(client):
    assert client.get("/api/admin/contact").status_code == 401
