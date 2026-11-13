"""The visitor's real address when the website's Cloudflare function forwards an API call (#32).

The website on Cloudflare Pages sends its /api/* requests on to this server (frontend/functions/api/), so
they all arrive from Cloudflare's addresses. The function adds the visitor's address and a shared secret
(PROXY_SECRET); only when the secret matches is that address used as the request's client, so login limits,
the contact form limit and agreement signatures see the real visitor. Anyone else sending the header is
ignored.
"""

import ipaddress
import secrets

from starlette.types import ASGIApp, Receive, Scope, Send

from .config import get_settings

CLIENT_IP_HEADER = b"x-altheo-client-ip"
PROXY_KEY_HEADER = b"x-altheo-proxy-key"


class ProxyClientIP:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            scope = _with_visitor_ip(scope)
        await self.app(scope, receive, send)


def _with_visitor_ip(scope: Scope) -> Scope:
    headers = scope["headers"]
    key = ip = None
    for name, value in headers:
        if name == PROXY_KEY_HEADER:
            key = value
        elif name == CLIENT_IP_HEADER:
            ip = value
    if key is None and ip is None:
        return scope
    # Never pass the secret further in (logs, error pages).
    scope = dict(scope, headers=[(n, v) for n, v in headers if n not in (PROXY_KEY_HEADER, CLIENT_IP_HEADER)])
    secret = get_settings().proxy_secret
    if not secret or key is None or ip is None:
        return scope
    if not secrets.compare_digest(key, secret.encode()):
        return scope
    try:
        address = str(ipaddress.ip_address(ip.decode("ascii").strip()))
    except ValueError, UnicodeDecodeError:
        return scope
    return dict(scope, client=(address, 0))
