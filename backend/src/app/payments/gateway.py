"""Payment gateways behind one interface, so another provider (e.g. Korba) can be added as one more module.

Amounts here are in whole cedis; each gateway converts to what its provider expects.
"""

import hashlib
import hmac
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, Protocol

import httpx

from ..config import get_settings

MomoNetwork = Literal["mtn", "vod", "atl"]  # MTN, Telecel, AT (Paystack's codes)


class ChargeStatus(StrEnum):
    PENDING = "pending"  # waiting for the customer to approve on their phone
    SUCCESS = "success"
    FAILED = "failed"


@dataclass
class ChargeResult:
    status: ChargeStatus
    # What to tell the customer (the provider's instructions, or why it failed).
    message: str | None = None
    # What the provider says was paid, for checking against what we expected.
    amount_cedis: float | None = None
    currency: str | None = None


class GatewayError(Exception):
    """The provider couldn't be reached or refused the request; the message is safe to show."""


class PaymentGateway(Protocol):
    # True only for the pretend gateway used in local development.
    simulated: bool

    def charge_momo(
        self, *, email: str, amount: int, phone: str, network: MomoNetwork, reference: str
    ) -> ChargeResult:
        """Sends a Mobile Money prompt to the phone. `phone` is +233XXXXXXXXX."""
        ...

    def verify(self, reference: str) -> ChargeResult:
        """Asks the provider how a charge ended up."""
        ...


class PaystackGateway:
    """https://paystack.com/docs/payments/payment-channels/ (Mobile Money); amounts are in pesewas."""

    simulated = False
    BASE_URL = "https://api.paystack.co"

    def __init__(self, secret_key: str, transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(
            base_url=self.BASE_URL,
            headers={"Authorization": f"Bearer {secret_key}"},
            timeout=30,
            transport=transport,
        )

    def _call(self, method: str, path: str, **kwargs) -> tuple[bool, str | None, dict]:
        try:
            response = self._client.request(method, path, **kwargs)
            body = response.json()
        except (httpx.HTTPError, ValueError) as e:
            raise GatewayError("We couldn't reach the payment service. Try again in a moment.") from e
        if response.status_code >= 500:
            raise GatewayError("The payment service is having trouble. Try again in a moment.")
        return bool(body.get("status")), body.get("message"), body.get("data") or {}

    def charge_momo(
        self, *, email: str, amount: int, phone: str, network: MomoNetwork, reference: str
    ) -> ChargeResult:
        ok, message, data = self._call(
            "POST",
            "/charge",
            json={
                "email": email,
                "amount": amount * 100,
                "currency": "GHS",
                "reference": reference,
                "mobile_money": {"phone": f"0{phone.removeprefix('+233')}", "provider": network},
            },
        )
        status = data.get("status")
        if status == "success":
            return ChargeResult(
                ChargeStatus.SUCCESS, amount_cedis=_cedis(data), currency=data.get("currency")
            )
        if ok and status in ("pay_offline", "pending", "ongoing"):
            return ChargeResult(ChargeStatus.PENDING, message=data.get("display_text"))
        # Anything else (a failed charge, or a step we don't support) can't go ahead.
        reason = data.get("message") or data.get("gateway_response") or message
        return ChargeResult(ChargeStatus.FAILED, message=reason or "The payment couldn't be started.")

    def verify(self, reference: str) -> ChargeResult:
        _, _, data = self._call("GET", f"/transaction/verify/{reference}")
        status = data.get("status")
        if status == "success":
            return ChargeResult(
                ChargeStatus.SUCCESS, amount_cedis=_cedis(data), currency=data.get("currency")
            )
        if status in ("failed", "reversed"):
            return ChargeResult(
                ChargeStatus.FAILED, message=data.get("message") or data.get("gateway_response")
            )
        # Includes "abandoned", which is also what an unapproved prompt can look like: time decides that one.
        return ChargeResult(ChargeStatus.PENDING)


def _cedis(data: dict) -> float | None:
    amount = data.get("amount")
    return amount / 100 if isinstance(amount, int) else None


class SimulatedGateway:
    """Pretend payments for local development without Paystack keys. Nothing is ever charged.

    Payments stay pending until someone presses a test button on the page (POST /api/bookings/{id}/simulate).
    """

    simulated = True

    def charge_momo(
        self, *, email: str, amount: int, phone: str, network: MomoNetwork, reference: str
    ) -> ChargeResult:
        return ChargeResult(
            ChargeStatus.PENDING, message="Test mode: no real prompt is sent and nothing is charged."
        )

    def verify(self, reference: str) -> ChargeResult:
        return ChargeResult(ChargeStatus.PENDING)


def get_gateway() -> PaymentGateway | None:
    """Paystack when a key is set; the pretend gateway only in development; otherwise payments are off."""
    settings = get_settings()
    if settings.paystack_secret_key:
        return PaystackGateway(settings.paystack_secret_key)
    if settings.app_env == "development":
        return SimulatedGateway()
    return None


def valid_paystack_signature(raw_body: bytes, signature: str | None, secret_key: str) -> bool:
    """Paystack signs webhooks with the HMAC-SHA512 of the raw body, using the secret key."""
    if not signature:
        return False
    expected = hmac.new(secret_key.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)
