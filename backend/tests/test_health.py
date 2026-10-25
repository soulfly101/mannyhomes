from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db import get_session
from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class BrokenSession:
    def execute(self, *_args, **_kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def test_health_db_reports_unavailable_database():
    app.dependency_overrides[get_session] = lambda: BrokenSession()
    try:
        response = client.get("/api/health/db")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {"database": "unavailable"}
