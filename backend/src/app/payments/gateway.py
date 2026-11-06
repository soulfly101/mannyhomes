"""Payment gateways behind one interface: Moolre first, Paystack as the backup, pretend ones in development.

Amounts here are in whole cedis; each gateway converts to what its provider expects.
"""

import hashlib
import hmac
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, Protocol

import httpx

from ..config import get_settings
from ..models import PaymentMethod

logger = logging.getLogger(__name__)

MomoNetwork = Literal["mtn", "vod", "atl"]  # MTN, Telecel, AT (each gateway converts these)


class ChargeStatus(StrEnum):
    PENDING = "pending"  # waiting for the customer to approve on their phone
    OTP_REQUIRED = "otp_required"  # no prompt yet: repeat the charge with the code sent by SMS
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
    # How payments through this gateway are recorded.
    method: PaymentMethod

    def charge_momo(
        self,
        *,
        email: str,
        amount: int,
        phone: str,
        network: MomoNetwork,
        reference: str,
        otp: str | None = None,
    ) -> ChargeResult:
        """Sends a Mobile Money prompt to the phone. `phone` is +233XXXXXXXXX."""
        ...

    def verify(self, reference: str) -> ChargeResult:
        """Asks the provider how a charge ended up."""
        ...


class PaystackGateway:
    """https://paystack.com/docs/payments/payment-channels/ (Mobile Money); amounts are in pesewas."""

    simulated = False
    method = PaymentMethod.PAYSTACK_MOMO
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
        self,
        *,
        email: str,
        amount: int,
        phone: str,
        network: MomoNetwork,
        reference: str,
        otp: str | None = None,
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


class MoolreGateway:
    """https://docs.moolre.com (Mobile Money Collection, Payment Status); amounts are in cedis.

    A reply that gets lost may still mean a prompt was sent, so it leaves the charge pending for `verify`
    to settle. Moolre says not to make a new reference after one, which is how people get charged twice.
    """

    simulated = False
    method = PaymentMethod.MOOLRE_MOMO
    CHANNELS: dict[MomoNetwork, str] = {"mtn": "13", "vod": "6", "atl": "7"}
    CHECKING = "We're checking with the payment service. If a prompt reaches your phone, approve it."

    def __init__(
        self,
        username: str,
        public_key: str,
        account_number: str,
        base_url: str = "https://api.moolre.com",
        transport: httpx.BaseTransport | None = None,
    ):
        self._account = account_number
        self._client = httpx.Client(
            base_url=base_url,
            headers={"X-API-USER": username, "X-API-PUBKEY": public_key},
            timeout=30,
            transport=transport,
        )

    def _call(self, path: str, payload: dict) -> dict | None:
        """Moolre's answer, or None if we don't know what happened."""
        try:
            response = self._client.post(path, json={**payload, "accountnumber": self._account})
            body = response.json()
        except httpx.HTTPError, ValueError:
            return None
        if response.status_code >= 500 or not isinstance(body, dict):
            return None
        return body

    def charge_momo(
        self,
        *,
        email: str,
        amount: int,
        phone: str,
        network: MomoNetwork,
        reference: str,
        otp: str | None = None,
    ) -> ChargeResult:
        payload = {
            "type": 1,
            "channel": self.CHANNELS[network],
            "currency": "GHS",
            "payer": f"0{phone.removeprefix('+233')}",
            "amount": str(amount),
            "externalref": reference,
        }
        body = self._call("/open/transact/payment", {**payload, "otpcode": otp} if otp else payload)
        # The code was right and the number is verified: asking again is what sends the prompt.
        if body is not None and body.get("code") == "TP17":
            body = self._call("/open/transact/payment", payload)
        if body is None:
            return ChargeResult(ChargeStatus.PENDING, message=self.CHECKING)

        code = body.get("code")
        if code == "TP14":
            message = "That code didn't work. Check the SMS and try again." if otp else None
            return ChargeResult(
                ChargeStatus.OTP_REQUIRED, message=message or "Enter the code sent by SMS to that number."
            )
        if code == "AIN01":
            logger.error("Moolre refused our API username or key")
            raise GatewayError("Online payment isn't working right now. Try again later.")
        # TP13 means Moolre already has this reference, so the status check decides what became of it.
        if code in ("TR099", "TP13") or str(body.get("status")) == "1":
            return ChargeResult(ChargeStatus.PENDING)
        return ChargeResult(
            ChargeStatus.FAILED, message=body.get("message") or "The payment couldn't be started."
        )

    def verify(self, reference: str) -> ChargeResult:
        body = self._call("/open/transact/status", {"type": 1, "idtype": 1, "id": reference})
        if body is None:
            raise GatewayError("We couldn't reach the payment service. Try again in a moment.")
        data = body.get("data")
        if not isinstance(data, dict) or data.get("externalref") != reference:
            return ChargeResult(ChargeStatus.PENDING)
        txstatus = str(data.get("txstatus"))
        if txstatus == "1":
            # Moolre's answer has no currency field; these charges are only ever made in GHS.
            return ChargeResult(
                ChargeStatus.SUCCESS, amount_cedis=_decimal(data.get("amount")), currency="GHS"
            )
        if txstatus == "2":
            return ChargeResult(
                ChargeStatus.FAILED,
                message="The payment didn't go through. Check your balance and try again.",
            )
        return ChargeResult(ChargeStatus.PENDING)


def _decimal(value: object) -> float | None:
    try:
        return float(str(value))
    except ValueError:
        return None


class SimulatedGateway:
    """Pretend payments for local development without a provider. Nothing is ever charged.

    Payments stay pending until someone presses a test button on the page (POST /api/bookings/{id}/simulate).
    Numbers ending in 000 ask for an SMS code first, like Moolre can, and any code is accepted.
    """

    simulated = True
    method = PaymentMethod.PAYSTACK_MOMO

    def charge_momo(
        self,
        *,
        email: str,
        amount: int,
        phone: str,
        network: MomoNetwork,
        reference: str,
        otp: str | None = None,
    ) -> ChargeResult:
        if phone.endswith("000") and not otp:
            return ChargeResult(
                ChargeStatus.OTP_REQUIRED, message="Test mode: no SMS is sent, so type any code."
            )
        return ChargeResult(
            ChargeStatus.PENDING, message="Test mode: no real prompt is sent and nothing is charged."
        )

    def verify(self, reference: str) -> ChargeResult:
        return ChargeResult(ChargeStatus.PENDING)


def moolre_gateway() -> MoolreGateway | None:
    settings = get_settings()
    if settings.moolre_username and settings.moolre_public_key and settings.moolre_account_number:
        return MoolreGateway(
            settings.moolre_username,
            settings.moolre_public_key,
            settings.moolre_account_number,
            settings.moolre_base_url,
        )
    return None


def get_gateway() -> PaymentGateway | None:
    """Moolre when set up, then Paystack; the pretend gateway only in development; otherwise off."""
    settings = get_settings()
    moolre = moolre_gateway()
    if moolre:
        return moolre
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


def valid_moolre_secret(sent: object, secret: str) -> bool:
    """Moolre has no signature on its callbacks, just the secret in the payload."""
    return isinstance(sent, str) and hmac.compare_digest(sent.encode(), secret.encode())
