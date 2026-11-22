"""Photos of buildings and room types (#38): admin uploads, checks, order, delete, and the public pages."""

import io

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.models import Photo, Role
from app.photos import images
from app.photos import router as photos_router
from app.photos.router import cover_photo_id

from .conftest import needs_db
from .test_inventory import MANNY, log_in

pytestmark = needs_db

BUILDINGS = "/api/admin/buildings"


def jpeg(size=(2400, 1200), color=(200, 120, 40), exif: Image.Exif | None = None) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "JPEG", exif=exif if exif is not None else Image.Exif())
    return out.getvalue()


def png_with_transparency() -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (300, 200), (0, 0, 0, 0)).save(out, "PNG")
    return out.getvalue()


@pytest.fixture
def admin(client, db):
    return log_in(client, db, Role.ADMIN)


@pytest.fixture
def building(client, admin):
    return client.post(BUILDINGS, json=MANNY).json()


def upload(client, building_id, data, room_type_id=None, content_type="image/jpeg"):
    params = {"room_type_id": room_type_id} if room_type_id else {}
    return client.post(
        f"{BUILDINGS}/{building_id}/photos",
        content=data,
        params=params,
        headers={"Content-Type": content_type},
    )


def opened(client, photo_id, size="large") -> Image.Image:
    response = client.get(f"/api/photos/{photo_id}/{size}.jpg")
    assert response.status_code == 200
    return Image.open(io.BytesIO(response.content))


def test_admin_uploads_a_building_photo_in_two_sizes(client, building):
    response = upload(client, building["id"], jpeg())
    assert response.status_code == 201
    photo = response.json()
    assert photo["room_type_id"] is None
    assert photo["position"] == 0
    assert (photo["width"], photo["height"]) == (1600, 800)

    large = client.get(f"/api/photos/{photo['id']}/large.jpg")
    assert large.headers["content-type"] == "image/jpeg"
    # A new upload always gets a new id, so browsers can keep each photo for good.
    assert "immutable" in large.headers["cache-control"]
    assert opened(client, photo["id"]).size == (1600, 800)
    assert opened(client, photo["id"], "thumb").size == (640, 320)


def test_small_photos_are_not_enlarged(client, building):
    photo = upload(client, building["id"], jpeg(size=(500, 400))).json()
    assert opened(client, photo["id"]).size == (500, 400)


def test_location_data_is_removed_and_sideways_photos_are_turned(client, building):
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: the camera was turned; show it rotated 90°.
    exif[0x8825] = {2: (5.0, 36.0, 0.0)}  # GPSInfo with a latitude
    photo = upload(client, building["id"], jpeg(size=(400, 200), exif=exif)).json()
    image = opened(client, photo["id"])
    assert image.size == (200, 400)
    assert not image.getexif()


def test_transparent_pngs_become_jpegs_on_white(client, building):
    photo = upload(client, building["id"], png_with_transparency(), content_type="image/png").json()
    image = opened(client, photo["id"])
    assert image.format == "JPEG"
    assert image.getpixel((10, 10)) == pytest.approx((255, 255, 255), abs=2)


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"", "empty"),
        (b"definitely not a photo", "couldn't be read"),
        (b"GIF89a" + b"\x00" * 50, "couldn't be read"),
    ],
)
def test_files_that_arent_usable_photos_are_refused(client, building, data, message):
    response = upload(client, building["id"], data)
    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_gifs_are_refused_with_the_formats_we_take(client, building):
    out = io.BytesIO()
    Image.new("RGB", (50, 50)).save(out, "GIF")
    response = upload(client, building["id"], out.getvalue(), content_type="image/gif")
    assert response.status_code == 422
    assert response.json()["detail"] == "Use a JPEG, PNG or WebP photo."


def test_too_large_uploads_are_refused(client, building, monkeypatch):
    monkeypatch.setattr(photos_router, "MAX_UPLOAD_BYTES", 1000)
    response = upload(client, building["id"], jpeg())
    assert response.status_code == 413
    assert "under 15 MB" in response.json()["detail"]


def test_huge_images_in_small_files_are_refused(client, building, monkeypatch):
    # A "decompression bomb" is a small file that expands to an enormous image.
    monkeypatch.setattr(images, "MAX_PIXELS", 1000)
    response = upload(client, building["id"], jpeg(size=(100, 100)))
    assert response.status_code == 422
    assert "too large" in response.json()["detail"]


def test_each_set_has_a_limit(client, building, monkeypatch):
    monkeypatch.setattr(photos_router, "MAX_PER_SET", 2)
    for _ in range(2):
        assert upload(client, building["id"], jpeg(size=(50, 50))).status_code == 201
    response = upload(client, building["id"], jpeg(size=(50, 50)))
    assert response.status_code == 409
    # Room types have their own sets.
    room = building["room_types"][0]["id"]
    assert upload(client, building["id"], jpeg(size=(50, 50)), room_type_id=room).status_code == 201


def test_room_type_must_belong_to_the_building(client, building):
    other = client.post(BUILDINGS, json={**MANNY, "name": "Other Building"}).json()
    response = upload(client, building["id"], jpeg(), room_type_id=other["room_types"][0]["id"])
    assert response.status_code == 404
    assert upload(client, "no-such-building", jpeg()).status_code == 404


def test_only_admins_manage_photos(client, db, building):
    photo = upload(client, building["id"], jpeg(size=(50, 50))).json()
    client.cookies.clear()
    assert upload(client, building["id"], jpeg()).status_code == 401
    log_in(client, db, Role.TENANT)
    assert upload(client, building["id"], jpeg()).status_code == 403
    assert client.get(f"{BUILDINGS}/{building['id']}/photos").status_code == 403
    assert client.delete(f"{BUILDINGS}/{building['id']}/photos/{photo['id']}").status_code == 403
    # Anyone may look at them.
    assert client.get(f"/api/photos/{photo['id']}/thumb.jpg").status_code == 200


def test_uploads_need_the_csrf_header(anon_client, building):
    response = anon_client.post(f"{BUILDINGS}/{building['id']}/photos", content=jpeg())
    assert response.status_code == 403


def test_admin_reorders_a_set(client, building):
    ids = [upload(client, building["id"], jpeg(size=(50, 50))).json()["id"] for _ in range(3)]
    new_order = [ids[2], ids[0], ids[1]]
    response = client.put(f"{BUILDINGS}/{building['id']}/photos/order", json={"photo_ids": new_order})
    assert response.status_code == 200
    listed = client.get(f"{BUILDINGS}/{building['id']}/photos").json()
    assert [p["id"] for p in listed] == new_order
    assert [p["position"] for p in listed] == [0, 1, 2]


def test_reordering_must_name_exactly_the_set(client, building):
    ids = [upload(client, building["id"], jpeg(size=(50, 50))).json()["id"] for _ in range(2)]
    url = f"{BUILDINGS}/{building['id']}/photos/order"
    assert client.put(url, json={"photo_ids": ids[:1]}).status_code == 409
    assert client.put(url, json={"photo_ids": [*ids, "someone-else"]}).status_code == 409
    room = building["room_types"][0]["id"]
    assert client.put(url, json={"room_type_id": room, "photo_ids": ids}).status_code == 409


def test_deleting_closes_the_gap(client, db, building):
    ids = [upload(client, building["id"], jpeg(size=(50, 50))).json()["id"] for _ in range(3)]
    assert client.delete(f"{BUILDINGS}/{building['id']}/photos/{ids[0]}").status_code == 204
    listed = client.get(f"{BUILDINGS}/{building['id']}/photos").json()
    assert [(p["id"], p["position"]) for p in listed] == [(ids[1], 0), (ids[2], 1)]
    assert client.get(f"/api/photos/{ids[0]}/large.jpg").status_code == 404
    assert client.delete(f"{BUILDINGS}/{building['id']}/photos/{ids[0]}").status_code == 404


def test_listings_show_room_photos_before_building_photos(client, building):
    rooms = {rt["name"]: rt["id"] for rt in building["room_types"]}
    outside = upload(client, building["id"], jpeg(size=(50, 50))).json()["id"]
    lounge = upload(client, building["id"], jpeg(size=(50, 50)), room_type_id=rooms["2 bedroom"]).json()["id"]

    listing = client.get("/api/listings").json()["buildings"][0]
    assert listing["photos"] == [outside]
    by_name = {rt["name"]: rt["photos"] for rt in listing["room_types"]}
    assert by_name["2 bedroom"] == [lounge, outside]
    assert by_name["1 bedroom"] == [outside]

    room = client.get(f"/api/listings/rooms/{rooms['2 bedroom']}").json()["room"]
    assert room["photos"] == [lounge, outside]
    assert client.get(f"/api/listings/{building['id']}").json()["photos"] == [outside]


def test_visitors_see_photos_too(client, building):
    upload(client, building["id"], jpeg(size=(50, 50)))
    client.cookies.clear()
    listing = client.get("/api/listings").json()
    assert listing["prices_visible"] is False
    assert len(listing["buildings"][0]["photos"]) == 1


def test_removing_a_room_type_removes_its_photos(client, db, building):
    rooms = building["room_types"]
    upload(client, building["id"], jpeg(size=(50, 50)), room_type_id=rooms[0]["id"])
    fields = ("id", "name", "rent", "quantity_available")
    kept = [{k: v for k, v in rt.items() if k in fields} for rt in rooms[1:]]
    response = client.put(f"{BUILDINGS}/{building['id']}", json={**MANNY, "room_types": kept})
    assert response.status_code == 200
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Photo)) == 0


def test_the_cover_is_the_room_photo_or_else_the_building_photo(client, db, building):
    rooms = building["room_types"]
    assert cover_photo_id(db, rooms[0]["id"]) is None
    outside = upload(client, building["id"], jpeg(size=(50, 50))).json()["id"]
    assert cover_photo_id(db, rooms[0]["id"]) == outside
    inside = upload(client, building["id"], jpeg(size=(50, 50)), room_type_id=rooms[0]["id"]).json()["id"]
    assert cover_photo_id(db, rooms[0]["id"]) == inside
    assert cover_photo_id(db, None) is None
