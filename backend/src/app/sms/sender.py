"""Sending one text (#27). Moolre's SMS service when it's set up; a pretend sender for local work; else off.

Moolre's docs (docs.moolre.com/ai/send-sms.md) give: POST /open/sms/send with the X-API-VASKEY header and
{"type": 1, "senderid", "messages": [{"recipient", "message", "ref"}]}; success is code SMS01, an
unapproved sender name ASMS07, a bad key AIN01. They don't say which number format `recipient` takes; we
send the local form (0244123456), as Moolre's payment API takes. Check this on the first real text.
"""

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

# The only length Moolre documents (on its GET endpoint). Texts are kept to one part.
MAX_LENGTH = 160


@dataclass
class SendResult:
    ok: bool
    # Worth trying again later (network trouble, Moolre down), as opposed to a refusal.
    retry: bool = False
    error: str | None = None


class SmsSender(Protocol):
    simulated: bool

    def send(self, phone: str, text: str, ref: str) -> SendResult: ...


def local_number(phone: str) -> str:
    """+233244123456 -> 0244123456."""
    return "0" + phone[4:] if phone.startswith("+233") else phone


class MoolreSms:
    simulated = False

    def __init__(
        self, vas_key: str, sender_id: str, base_url: str, transport: httpx.BaseTransport | None = None
    ):
        self._sender_id = sender_id
        self._client = httpx.Client(
            base_url=base_url,
            headers={"X-API-VASKEY": vas_key, "Content-Type": "application/json"},
            timeout=30,
            transport=transport,
        )

    def send(self, phone: str, text: str, ref: str) -> SendResult:
        body = {
            "type": 1,
            "senderid": self._sender_id,
            "messages": [{"recipient": local_number(phone), "message": text, "ref": ref}],
        }
        try:
            reply = self._client.post("/open/sms/send", json=body)
            data = reply.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Moolre SMS unreachable: %s", e)
            return SendResult(ok=False, retry=True, error="Couldn't reach Moolre.")
        if data.get("status") == 1 and data.get("code") == "SMS01":
            return SendResult(ok=True)
        message = str(data.get("message") or "Moolre refused the text.")[:200]
        # Server trouble may pass; a refusal (bad key, sender name not approved) won't.
        return SendResult(ok=False, retry=reply.status_code >= 500, error=message)


class SimulatedSms:
    """Local development only: nothing leaves the machine, the text is just logged."""

    simulated = True

    def send(self, phone: str, text: str, ref: str) -> SendResult:
        log.info("Pretend SMS to %s: %s", phone, text)
        return SendResult(ok=True)


def get_sms_sender() -> SmsSender | None:
    settings = get_settings()
    if settings.moolre_sms_vas_key and settings.moolre_sms_sender_id:
        return MoolreSms(settings.moolre_sms_vas_key, settings.moolre_sms_sender_id, settings.moolre_base_url)
    if settings.app_env == "development":
        return SimulatedSms()
    return None


def sms_mode() -> str:
    """How texts go out now: "live", "test" (pretend, development only) or "off"."""
    sender = get_sms_sender()
    if sender is None:
        return "off"
    return "test" if sender.simulated else "live"
