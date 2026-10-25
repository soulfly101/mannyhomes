"""Talks to a real MySQL. Runs under docker compose and in CI; skipped when no database is configured."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

pytestmark = pytest.mark.skipif(
    not get_settings().database_url,
    reason="DATABASE_URL not set; start MySQL with `make up` to run this test",
)


def test_health_db_connects_to_mysql():
    response = TestClient(app).get("/api/health/db")
    assert response.status_code == 200
    assert response.json() == {"database": "ok"}
