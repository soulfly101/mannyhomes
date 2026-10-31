import pytest
from sqlalchemy import func, select

from app.auth.sessions import start_session
from app.models import Building, Role, RoomType, User

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/admin/buildings"

MANNY = {
    "name": "Manny Building",
    "location": "Oyarifa",
    "sanitation_fee": 50,
    "description": "Quiet compound near the main road.",
    "listed": True,
    "room_types": [
        {"name": "1 bedroom", "rent": 1200, "quantity_available": 1},
        {"name": "2 bedroom", "rent": 2000, "quantity_available": 2},
        {"name": "3 bedroom", "rent": 2800, "quantity_available": 1, "sanitation_fee_override": 80},
    ],
}


def log_in(client, db, role: Role) -> User:
    user = User(name=f"{role} person", email=f"{role}-inv@example.com", phone="+233241234567", role=role)
    db.add(user)
    db.commit()
    client.cookies.set("altheo_session", start_session(db, user))
    return user


@pytest.fixture
def admin(client, db):
    return log_in(client, db, Role.ADMIN)


def create(client, **overrides):
    return client.post(URL, json={**MANNY, **overrides})


def test_admin_creates_a_building_with_room_types(client, admin):
    response = create(client)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Manny Building"
    assert body["location"] == "Oyarifa"
    assert body["sanitation_fee"] == 50
    assert [(rt["name"], rt["rent"], rt["quantity_available"]) for rt in body["room_types"]] == [
        ("1 bedroom", 1200, 1),
        ("2 bedroom", 2000, 2),
        ("3 bedroom", 2800, 1),
    ]
    assert body["total_available"] == 4


def test_room_types_use_the_building_sanitation_fee_unless_overridden(client, admin):
    fees = {rt["name"]: rt["sanitation_fee"] for rt in create(client).json()["room_types"]}
    assert fees == {"1 bedroom": 50, "2 bedroom": 50, "3 bedroom": 80}


def test_text_is_tidied(client, admin):
    body = create(client, name="  Manny   Building ", location=" Oyarifa ", description="  ").json()
    assert body["name"] == "Manny Building"
    assert body["location"] == "Oyarifa"
    assert body["description"] is None


def test_a_building_needs_at_least_one_room_type(client, admin):
    response = create(client, room_types=[])
    assert response.status_code == 422
    assert response.json()["errors"]["room_types"] == "Add at least one room type."


def test_room_type_names_must_differ_within_a_building(client, admin):
    rooms = [{"name": "2 bedroom", "rent": 2000, "quantity_available": 1}] * 2
    response = create(client, room_types=[rooms[0], {**rooms[1], "name": "2 Bedroom"}])
    assert response.status_code == 422
    assert response.json()["errors"]["room_types"] == "Each room type in a building needs a different name."


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("rent", 0, "Rent must be more than GH₵ 0."),
        ("rent", "abc", "Enter a whole number."),
        ("quantity_available", -1, "Quantity can't be negative."),
        ("sanitation_fee_override", -5, "The sanitation fee can't be negative."),
        ("name", "  ", "Enter the room type, like 2 bedroom."),
    ],
)
def test_room_type_fields_are_checked(client, admin, field, value, message):
    room = {"name": "2 bedroom", "rent": 2000, "quantity_available": 1, field: value}
    response = create(client, room_types=[room])
    assert response.status_code == 422
    assert response.json()["errors"][f"room_types.0.{field}"] == message


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("name", "", "Enter the building name."),
        ("location", "x", "Enter the location, like Oyarifa."),
        ("sanitation_fee", -1, "The sanitation fee can't be negative."),
    ],
)
def test_building_fields_are_checked(client, admin, field, value, message):
    response = create(client, **{field: value})
    assert response.status_code == 422
    assert response.json()["errors"][field] == message


def test_building_names_are_unique_ignoring_case(client, admin):
    create(client)
    response = create(client, name="MANNY building")
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_list_shows_every_building_with_totals(client, admin):
    create(client)
    create(
        client,
        name="Apartment B",
        location="Aburi",
        room_types=[{"name": "Single room", "rent": 600, "quantity_available": 0}],
    )
    buildings = client.get(URL).json()
    assert [(b["name"], b["total_available"]) for b in buildings] == [
        ("Apartment B", 0),
        ("Manny Building", 4),
    ]


def test_get_one_and_404(client, admin):
    building_id = create(client).json()["id"]
    assert client.get(f"{URL}/{building_id}").json()["name"] == "Manny Building"
    response = client.get(f"{URL}/no-such-id")
    assert response.status_code == 404
    assert "doesn't exist" in response.json()["detail"]


def test_update_edits_adds_and_removes_room_types(client, admin, db):
    created = create(client).json()
    one, two, three = created["room_types"]
    response = client.put(
        f"{URL}/{created['id']}",
        json={
            **MANNY,
            "sanitation_fee": 60,
            "room_types": [
                {**two, "rent": 2100, "quantity_available": 1},
                {"name": "Chamber and hall", "rent": 900, "quantity_available": 3},
                {**one},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert [(rt["name"], rt["rent"], rt["quantity_available"]) for rt in body["room_types"]] == [
        ("2 bedroom", 2100, 1),
        ("Chamber and hall", 900, 3),
        ("1 bedroom", 1200, 1),
    ]
    assert body["room_types"][0]["id"] == two["id"]
    assert body["sanitation_fee"] == 60
    assert db.scalar(select(RoomType).where(RoomType.id == three["id"])) is None


def test_a_removed_room_type_name_can_be_reused(client, admin):
    created = create(client).json()
    rooms = [{"name": "1 bedroom", "rent": 1300, "quantity_available": 2}]
    response = client.put(f"{URL}/{created['id']}", json={**MANNY, "room_types": rooms})
    assert response.status_code == 200
    assert [rt["rent"] for rt in response.json()["room_types"]] == [1300]


def test_update_cannot_remove_the_last_room_type(client, admin):
    created = create(client).json()
    response = client.put(f"{URL}/{created['id']}", json={**MANNY, "room_types": []})
    assert response.status_code == 422
    assert len(client.get(f"{URL}/{created['id']}").json()["room_types"]) == 3


def test_update_rejects_room_types_from_elsewhere(client, admin):
    created = create(client).json()
    rooms = [{"id": "not-in-this-building", "name": "1 bedroom", "rent": 1, "quantity_available": 1}]
    response = client.put(f"{URL}/{created['id']}", json={**MANNY, "room_types": rooms})
    assert response.status_code == 422
    assert "no longer exists" in response.json()["detail"]


def test_update_cannot_take_another_buildings_name(client, admin):
    create(client)
    other = create(client, name="Apartment B").json()
    response = client.put(f"{URL}/{other['id']}", json={**MANNY, "name": "manny building"})
    assert response.status_code == 409


def test_update_can_keep_its_own_name(client, admin):
    created = create(client).json()
    response = client.put(f"{URL}/{created['id']}", json={**MANNY, "location": "Oyarifa North"})
    assert response.status_code == 200
    assert response.json()["location"] == "Oyarifa North"


def test_delete_removes_the_building_and_its_room_types(client, admin, db):
    building_id = create(client).json()["id"]
    assert client.delete(f"{URL}/{building_id}").status_code == 204
    assert client.get(f"{URL}/{building_id}").status_code == 404
    assert (
        db.scalar(select(func.count()).select_from(RoomType).where(RoomType.building_id == building_id)) == 0
    )
    assert db.scalar(select(Building).where(Building.id == building_id)) is None


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_only_admins_can_manage_buildings(client, db, role):
    log_in(client, db, role)
    assert client.get(URL).status_code == 403
    assert create(client).status_code == 403


def test_logged_out_visitors_are_refused(client):
    assert client.get(URL).status_code == 401


def test_changes_need_the_csrf_header(client, admin, anon_client):
    anon_client.cookies.update(client.cookies)
    assert anon_client.post(URL, json=MANNY).status_code == 403
