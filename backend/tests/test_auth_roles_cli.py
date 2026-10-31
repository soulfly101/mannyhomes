import contextlib
import io
from typing import Annotated

import pytest
from fastapi import Depends
from sqlalchemy import select

from app import cli
from app.auth.deps import require_role
from app.auth.passwords import verify_password
from app.auth.sessions import start_session
from app.main import app
from app.models import Role, User

from .conftest import needs_db

pytestmark = needs_db


@app.get("/api/test-only/admin")
def _admin_only(user: Annotated[User, Depends(require_role(Role.ADMIN))]) -> dict[str, str]:
    return {"hello": user.name}


def as_user(client, db, role: Role) -> User:
    user = User(name=f"{role} user", email=f"{role}@example.com", phone="+233241234567", role=role)
    db.add(user)
    db.commit()
    client.cookies.set("altheo_session", start_session(db, user))
    return user


def test_admin_route_allows_admins(client, db):
    as_user(client, db, Role.ADMIN)
    assert client.get("/api/test-only/admin").json() == {"hello": "admin user"}


@pytest.mark.parametrize("role", [Role.TENANT, Role.STAFF])
def test_admin_route_refuses_other_roles(client, db, role):
    as_user(client, db, role)
    response = client.get("/api/test-only/admin")
    assert response.status_code == 403


def test_admin_route_needs_login(client):
    assert client.get("/api/test-only/admin").status_code == 401


def test_cli_creates_an_admin(db):
    user = cli.create_user(
        db,
        name="Property Manager",
        email="Manager@Example.com",
        phone="0200000001",
        password="a-long-password",
        role=Role.ADMIN,
    )
    assert user.role is Role.ADMIN
    stored = db.scalar(select(User).where(User.email == "manager@example.com"))
    assert verify_password("a-long-password", stored.password_hash)


def test_cli_refuses_duplicate_email(db):
    kwargs = dict(name="Manager", email="m@example.com", phone="0200000001", password="a-long-password")
    cli.create_user(db, role=Role.ADMIN, **kwargs)
    with pytest.raises(ValueError, match="already exists"):
        cli.create_user(db, role=Role.STAFF, **kwargs)


def test_cli_main_reports_bad_input(monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO("short\n"))
    code = cli.main(
        [
            "create-user",
            "--email",
            "x@example.com",
            "--name",
            "X Person",
            "--phone",
            "0200000001",
            "--password-stdin",
        ]
    )
    assert code == 1
    assert "at least 8 characters" in capsys.readouterr().err


def test_cli_main_creates_the_user_and_reports_it(monkeypatch, capsys, db):
    monkeypatch.setattr(cli, "Session", lambda *_a, **_k: contextlib.nullcontext(db))
    monkeypatch.setattr("sys.stdin", io.StringIO("a-long-password\n"))
    args = ["create-user", "--role", "staff", "--email", "Tech@Example.com", "--name", "Kwame Boateng"]
    code = cli.main([*args, "--phone", "0200000002", "--password-stdin"])
    assert code == 0
    assert capsys.readouterr().out.strip() == "Created staff tech@example.com"
    assert db.scalar(select(User).where(User.email == "tech@example.com")).role is Role.STAFF
