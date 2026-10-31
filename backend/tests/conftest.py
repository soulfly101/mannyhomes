from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.ratelimit import login_limiter
from app.config import get_settings
from app.db import get_engine, get_session
from app.main import app

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
needs_db = pytest.mark.skipif(
    not get_settings().database_url,
    reason="DATABASE_URL not set; start MySQL with `make up` to run this test",
)


@pytest.fixture(scope="session")
def engine():
    config = Config(str(ALEMBIC_INI))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")
    return get_engine()


@pytest.fixture
def db(engine):
    """A session whose changes are rolled back after each test, so tests never touch each other's data."""
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    outer.rollback()
    connection.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_session] = lambda: db
    login_limiter.reset_all()
    with TestClient(app, headers={"X-Requested-With": "altheo"}) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    """A client without the CSRF header, like a forged cross-site request."""
    with TestClient(app) as c:
        yield c
