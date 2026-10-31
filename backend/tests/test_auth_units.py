import pytest

from app.auth.passwords import hash_password, verify_password
from app.auth.ratelimit import FailureLimiter
from app.auth.schemas import normalise_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0241234567", "+233241234567"),
        ("024 123 4567", "+233241234567"),
        ("+233-24-123-4567", "+233241234567"),
    ],
)
def test_phone_numbers_are_normalised(raw, expected):
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["241234567", "02412345678", "+44241234567", "phone"])
def test_bad_phone_numbers_are_rejected(raw):
    with pytest.raises(ValueError):
        normalise_phone(raw)


def test_passwords_verify_only_against_their_hash():
    hashed = hash_password("correct horse")
    assert verify_password("correct horse", hashed)
    assert not verify_password("wrong horse", hashed)
    assert not verify_password("correct horse", None)
    assert not verify_password("correct horse", "not-a-hash")


def test_limiter_blocks_after_max_failures_and_resets():
    limiter = FailureLimiter(max_failures=2, window_seconds=60)
    assert not limiter.blocked("k")
    limiter.record_failure("k")
    limiter.record_failure("k")
    assert limiter.blocked("k")
    assert not limiter.blocked("other")
    limiter.reset("k")
    assert not limiter.blocked("k")


def test_limiter_forgets_old_failures(monkeypatch):
    clock = iter([0.0, 0.0, 100.0])
    monkeypatch.setattr("app.auth.ratelimit.time.monotonic", lambda: next(clock))
    limiter = FailureLimiter(max_failures=1, window_seconds=60)
    limiter.record_failure("k")
    assert limiter.blocked("k")
    assert not limiter.blocked("k")
