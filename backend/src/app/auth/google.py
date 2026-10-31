"""Google sign-in (OpenID Connect authorization code flow with PKCE)."""

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx
import jwt

from ..config import Settings

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")

_jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True)


class GoogleSignInError(Exception):
    pass


def new_pkce() -> tuple[str, str]:
    """Returns (verifier, S256 challenge)."""
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def authorize_url(settings: Settings, state: str, nonce: str, code_challenge: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code(settings: Settings, code: str, code_verifier: str) -> dict:
    """Swaps the authorization code for an ID token and returns its verified claims."""
    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            timeout=10,
        )
        response.raise_for_status()
        id_token = response.json()["id_token"]
        key = _jwks.get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=settings.google_client_id)
    except (httpx.HTTPError, KeyError, ValueError, jwt.PyJWTError) as e:
        raise GoogleSignInError(str(e)) from e
    if claims.get("iss") not in ISSUERS:
        raise GoogleSignInError("Unexpected token issuer.")
    return claims
