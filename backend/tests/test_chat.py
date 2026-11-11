import pytest
from sqlalchemy import select

from app.models import Conversation, Message, Role

from .conftest import needs_db
from .test_agreements import person
from .test_agreements import tenancy as tenancy  # noqa: F401 (fixture)
from .test_sanitation import admin as admin  # noqa: F401 (fixture)
from .test_sanitation import log_in

pytestmark = needs_db

URL = "/api/chat"
ADMIN = "/api/admin/chat"


@pytest.fixture
def tenant(db, tenancy):  # noqa: F811
    return tenancy.tenant


def as_user(client, db, user):
    log_in(client, db, user)


def open_general(client):
    return client.post(f"{URL}/open", json={}).json()


def say(client, base, conversation_id, body):
    return client.post(f"{base}/{conversation_id}/messages", json={"body": body})


# --- Opening conversations --------------------------------------------------------------------------------


def test_a_tenant_opens_one_general_conversation_however_often_they_ask(client, db, tenant):
    as_user(client, db, tenant)
    first = open_general(client)
    second = open_general(client)
    assert first["id"] == second["id"]
    assert (first["title"], first["ticket_id"], first["unread"]) == ("General", None, 0)


def test_a_tenant_opens_a_chat_about_their_own_report(client, db, tenant):
    as_user(client, db, tenant)
    ticket = client.post(
        "/api/tickets", json={"category": "plumbing", "description": "The kitchen tap drips."}
    ).json()
    chat = client.post(f"{URL}/open", json={"ticket_id": ticket["id"]}).json()
    assert chat["ticket_id"] == ticket["id"]
    assert chat["title"] == "Plumbing report, room A12"
    assert chat["id"] != open_general(client)["id"]
    assert client.post(f"{URL}/open", json={"ticket_id": ticket["id"]}).json()["id"] == chat["id"]


def test_nobody_can_open_a_chat_about_someone_elses_report(client, db, tenant):
    as_user(client, db, tenant)
    ticket = client.post(
        "/api/tickets", json={"category": "plumbing", "description": "The kitchen tap drips."}
    ).json()
    as_user(client, db, person(db, "other-tenant@example.com"))
    assert client.post(f"{URL}/open", json={"ticket_id": ticket["id"]}).status_code == 404
    assert client.post(f"{URL}/open", json={"ticket_id": "nope"}).status_code == 404


def test_an_admin_can_start_a_chat_with_any_registered_tenant(client, db, admin):  # noqa: F811
    roomless = person(db, "just-signed-up@example.com")
    as_user(client, db, admin)
    names = [t["name"] for t in client.get(f"{ADMIN}/tenants").json()]
    assert roomless.name in names
    assert admin.name not in names
    chat = client.post(f"{ADMIN}/open", json={"tenant_id": roomless.id}).json()
    assert (chat["tenant_id"], chat["title"]) == (roomless.id, "General")


def test_an_admin_can_only_chat_with_tenants(client, db, admin):  # noqa: F811
    as_user(client, db, admin)
    staff = person(db, "staff-chat@example.com", role=Role.STAFF)
    assert client.post(f"{ADMIN}/open", json={"tenant_id": staff.id}).status_code == 404
    assert client.post(f"{ADMIN}/open", json={"tenant_id": "nobody"}).status_code == 404


# --- Sending and reading ----------------------------------------------------------------------------------


@pytest.fixture
def chat_id(client, db, tenant):
    as_user(client, db, tenant)
    return open_general(client)["id"]


def test_messages_go_both_ways_in_order(client, db, tenant, admin, chat_id):  # noqa: F811
    assert say(client, URL, chat_id, "  Is the water off today?  ").status_code == 201
    as_user(client, db, admin)
    thread = client.get(f"{ADMIN}/{chat_id}").json()
    assert [(m["body"], m["from_admin"]) for m in thread["messages"]] == [("Is the water off today?", False)]
    reply = say(client, ADMIN, chat_id, "Yes, until 3pm.").json()
    assert (reply["from_admin"], reply["sender_name"]) == (True, admin.name)
    as_user(client, db, tenant)
    bodies = [m["body"] for m in client.get(f"{URL}/{chat_id}").json()["messages"]]
    assert bodies == ["Is the water off today?", "Yes, until 3pm."]


def test_asking_for_newer_messages_only_returns_new_ones(client, db, chat_id):
    first = say(client, URL, chat_id, "One").json()
    say(client, URL, chat_id, "Two")
    newer = client.get(f"{URL}/{chat_id}", params={"after": first["id"]}).json()["messages"]
    assert [m["body"] for m in newer] == ["Two"]
    assert client.get(f"{URL}/{chat_id}", params={"after": -1}).status_code == 422


@pytest.mark.parametrize("body, code", [("", 400), ("   ", 400), ("x" * 2001, 400)])
def test_empty_or_huge_messages_are_refused(client, db, chat_id, body, code):
    assert say(client, URL, chat_id, body).status_code == code
    assert db.scalar(select(Message.id)) is None


def test_messages_are_kept_as_text(client, db, chat_id):
    text = "<b>hi</b> <script>alert(1)</script>"
    assert say(client, URL, chat_id, text).json()["body"] == text


def test_tenants_cant_see_or_write_in_other_tenants_chats(client, db, chat_id):
    say(client, URL, chat_id, "Private")
    as_user(client, db, person(db, "nosy@example.com"))
    assert client.get(f"{URL}/{chat_id}").status_code == 404
    assert say(client, URL, chat_id, "Hi").status_code == 404
    assert client.get(URL).json() == []


def test_tenants_cant_use_the_admin_side(client, db, chat_id):
    assert client.get(ADMIN).status_code == 403
    assert client.get(f"{ADMIN}/{chat_id}").status_code == 403
    assert say(client, ADMIN, chat_id, "Hi").status_code == 403
    assert client.get(f"{ADMIN}/unread").status_code == 403


def test_logged_out_people_get_nothing(client):
    assert client.get(URL).status_code == 401
    assert client.get(f"{URL}/unread").status_code == 401


# --- Unread badges ----------------------------------------------------------------------------------------


def test_a_tenants_message_is_unread_for_admins_until_one_reads_it(client, db, admin, chat_id):  # noqa: F811
    say(client, URL, chat_id, "Hello")
    say(client, URL, chat_id, "Anyone there?")
    assert client.get(f"{URL}/unread").json() == {"count": 0}
    as_user(client, db, admin)
    assert client.get(f"{ADMIN}/unread").json() == {"count": 2}
    assert client.get(ADMIN).json()[0]["unread"] == 2
    client.get(f"{ADMIN}/{chat_id}")
    assert client.get(f"{ADMIN}/unread").json() == {"count": 0}
    other_admin = person(db, "second-admin@example.com", role=Role.ADMIN)
    as_user(client, db, other_admin)
    assert client.get(f"{ADMIN}/unread").json() == {"count": 0}


def test_an_admins_reply_is_unread_for_the_tenant_until_they_read_it(client, db, tenant, admin, chat_id):  # noqa: F811
    as_user(client, db, admin)
    say(client, ADMIN, chat_id, "Your bill is ready.")
    assert client.get(f"{ADMIN}/unread").json() == {"count": 0}
    as_user(client, db, tenant)
    assert client.get(f"{URL}/unread").json() == {"count": 1}
    listed = client.get(URL).json()[0]
    assert (listed["unread"], listed["last_message"]) == (1, "Your bill is ready.")
    client.get(f"{URL}/{chat_id}")
    assert client.get(f"{URL}/unread").json() == {"count": 0}


def test_one_tenants_messages_dont_count_for_another_tenant(client, db, admin, chat_id):  # noqa: F811
    as_user(client, db, admin)
    say(client, ADMIN, chat_id, "Only for you")
    as_user(client, db, person(db, "someone-new@example.com"))
    assert client.get(f"{URL}/unread").json() == {"count": 0}


def test_admins_only_list_conversations_with_messages_newest_first(client, db, tenant, admin):  # noqa: F811
    as_user(client, db, admin)
    quiet = client.post(f"{ADMIN}/open", json={"tenant_id": tenant.id}).json()
    assert client.get(ADMIN).json() == []
    other = person(db, "chatty@example.com")
    busy = client.post(f"{ADMIN}/open", json={"tenant_id": other.id}).json()
    say(client, ADMIN, quiet["id"], "First")
    say(client, ADMIN, busy["id"], "Second")
    assert [c["id"] for c in client.get(ADMIN).json()] == [busy["id"], quiet["id"]]
    assert db.scalar(select(Conversation.tenant_id).where(Conversation.id == busy["id"])) == other.id
