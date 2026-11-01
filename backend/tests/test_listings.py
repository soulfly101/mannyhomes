import pytest

from app.auth.sessions import start_session
from app.models import Building, Role, RoomType, User

from .conftest import needs_db

pytestmark = needs_db

URL = "/api/listings"


def building(db, name, location, rooms, listed=True, fee=50):
    b = Building(name=name, location=location, sanitation_fee=fee, listed=listed)
    for i, (rt_name, rent, qty) in enumerate(rooms):
        b.room_types.append(RoomType(name=rt_name, rent=rent, quantity_available=qty, sort_order=i))
    db.add(b)
    db.commit()
    return b


@pytest.fixture
def inventory(db):
    return {
        "manny": building(db, "Manny Building", "Oyarifa", [("1 bedroom", 1200, 1), ("2 bedroom", 2000, 2)]),
        "aburi": building(db, "Apartment B", "Aburi", [("2 bedroom", 1800, 0), ("3 bedroom", 2600, 0)]),
        "hidden": building(db, "Secret Block", "Oyarifa", [("1 bedroom", 900, 5)], listed=False),
    }


def log_in(client, db):
    user = User(name="Ama Mensah", email="ama-list@example.com", phone="+233241234567", role=Role.TENANT)
    db.add(user)
    db.commit()
    client.cookies.set("altheo_session", start_session(db, user))


def test_visitors_see_listings_without_prices(client, inventory):
    body = client.get(URL).json()
    assert body["prices_visible"] is False
    names = [b["name"] for b in body["buildings"]]
    assert names == ["Manny Building", "Apartment B"]
    manny = body["buildings"][0]
    assert manny["location"] == "Oyarifa"
    assert [(r["name"], r["quantity_available"], r["rent"]) for r in manny["room_types"]] == [
        ("1 bedroom", 1, None),
        ("2 bedroom", 2, None),
    ]


def test_logged_in_users_see_prices(client, db, inventory):
    log_in(client, db)
    body = client.get(URL).json()
    assert body["prices_visible"] is True
    rooms = body["buildings"][0]["room_types"]
    assert [(r["rent"], r["sanitation_fee"]) for r in rooms] == [(1200, 50), (2000, 50)]


def test_hidden_buildings_are_not_listed(client, inventory):
    names = [b["name"] for b in client.get(URL).json()["buildings"]]
    assert "Secret Block" not in names
    assert client.get(f"{URL}/{inventory['hidden'].id}").status_code == 404


def test_fully_booked_buildings_are_flagged_and_listed_last(client, inventory):
    buildings = client.get(URL).json()["buildings"]
    assert [(b["name"], b["fully_booked"], b["total_available"]) for b in buildings] == [
        ("Manny Building", False, 3),
        ("Apartment B", True, 0),
    ]


def test_availability_follows_the_admin_inventory(client, db, inventory):
    inventory["aburi"].room_types[0].quantity_available = 2
    db.commit()
    aburi = next(b for b in client.get(URL).json()["buildings"] if b["name"] == "Apartment B")
    assert aburi["fully_booked"] is False
    assert aburi["total_available"] == 2


def test_filter_options_cover_listed_buildings_only(client, inventory):
    filters = client.get(URL).json()["filters"]
    assert filters == {
        "locations": ["Aburi", "Oyarifa"],
        "room_types": ["1 bedroom", "2 bedroom", "3 bedroom"],
    }


def test_filter_by_location(client, inventory):
    names = [b["name"] for b in client.get(URL, params={"location": "aburi"}).json()["buildings"]]
    assert names == ["Apartment B"]


def test_filter_by_room_type_keeps_only_matching_rooms(client, inventory):
    buildings = client.get(URL, params={"room_type": "2 Bedroom"}).json()["buildings"]
    assert [(b["name"], [r["name"] for r in b["room_types"]], b["total_available"]) for b in buildings] == [
        ("Manny Building", ["2 bedroom"], 2),
        ("Apartment B", ["2 bedroom"], 0),
    ]


def test_filters_that_match_nothing(client, inventory):
    body = client.get(URL, params={"location": "Tema"}).json()
    assert body["buildings"] == []
    assert body["filters"]["locations"] == ["Aburi", "Oyarifa"]


def test_empty_filters_are_ignored(client, inventory):
    assert len(client.get(URL, params={"location": " ", "room_type": ""}).json()["buildings"]) == 2


def test_one_listing(client, db, inventory):
    body = client.get(f"{URL}/{inventory['manny'].id}").json()
    assert body["name"] == "Manny Building"
    assert body["room_types"][0]["rent"] is None
    log_in(client, db)
    assert client.get(f"{URL}/{inventory['manny'].id}").json()["room_types"][0]["rent"] == 1200


def test_unknown_listing(client):
    response = client.get(f"{URL}/nope")
    assert response.status_code == 404
    assert response.json()["detail"] == "That building isn't listed."


def test_no_buildings_yet(client):
    body = client.get(URL).json()
    assert body["buildings"] == []
    assert body["filters"] == {"locations": [], "room_types": []}
