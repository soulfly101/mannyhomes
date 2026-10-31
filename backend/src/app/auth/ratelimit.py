import time
from collections import defaultdict, deque


class FailureLimiter:
    """Blocks a key after too many failures in a time window. In memory: fine for one server process."""

    def __init__(self, max_failures: int = 5, window_seconds: int = 15 * 60) -> None:
        self.max_failures = max_failures
        self.window = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._failures[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._prune(key, time.monotonic())) >= self.max_failures

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)

    def reset_all(self) -> None:
        self._failures.clear()


login_limiter = FailureLimiter()
