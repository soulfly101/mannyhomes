"""The visitor's address when the website's Cloudflare function forwards an API call (#32)."""

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app as real_app
from app.proxy import ProxyClientIP

SECRET = "proxy-secret-for-tests"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(get_settings(), "proxy_secret", SECRET)
    app = FastAPI()
    app.add_middleware(ProxyClientIP)

    @app.get("/who")
    def who(request: Request) -> dict:
        return {
            "ip": request.client.host if request.client else None,
            "headers": sorted(k for k in request.headers if k.startswith("x-altheo")),
        }

    return TestClient(app, client=("172.70.1.1", 5000))


def who(client, **headers) -> dict:
    return client.get("/who", headers=headers).json()


def test_the_function_with_the_secret_sets_the_visitors_address(client):
    body = who(client, **{"X-Altheo-Proxy-Key": SECRET, "X-Altheo-Client-IP": "41.66.200.7"})
    assert body["ip"] == "41.66.200.7"
    # The secret never travels further in.
    assert body["headers"] == []


def test_ipv6_visitors_work_too(client):
    body = who(client, **{"X-Altheo-Proxy-Key": SECRET, "X-Altheo-Client-IP": "2c0f:2a80::1"})
    assert body["ip"] == "2c0f:2a80::1"


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Altheo-Client-IP": "41.66.200.7"},  # no secret: anyone could claim any address
        {"X-Altheo-Proxy-Key": "wrong", "X-Altheo-Client-IP": "41.66.200.7"},
        {"X-Altheo-Proxy-Key": SECRET, "X-Altheo-Client-IP": "not-an-address"},
        {"X-Altheo-Proxy-Key": SECRET},
    ],
)
def test_anything_else_keeps_the_connecting_address(client, headers):
    body = who(client, **headers)
    assert body["ip"] == "172.70.1.1"
    assert body["headers"] == []


def test_with_no_secret_set_the_header_is_ignored(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "proxy_secret", None)
    body = who(client, **{"X-Altheo-Proxy-Key": "", "X-Altheo-Client-IP": "41.66.200.7"})
    assert body["ip"] == "172.70.1.1"


def test_requests_without_the_headers_are_untouched(client):
    assert who(client)["ip"] == "172.70.1.1"


def test_the_app_uses_it():
    assert any(m.cls is ProxyClientIP for m in real_app.user_middleware)
