import threading
import time
from typing import Dict, List, Tuple, Union

from fastapi import HTTPException

# Process-local by design: correct only under the single-worker, single-replica
# deployment invariant (M138, see backend/railway.toml and ARCHITECTURE.md).
#
# bucket key -> (window_seconds, timestamps). The window is stored with the
# bucket so the sweep can expire each bucket after ITS OWN window instead of
# holding every bucket for the largest window in use (24h) -- an attacker
# spraying unique ip:/email: keys now inflates memory for minutes, not a day
# (ARCH-008). Timestamps are time.monotonic() values: never serialized, never
# compared across processes, immune to wall-clock steps and DST (ARCH-007).
_counters: Dict[str, Tuple[float, List[float]]] = {}

# One lock for both the check-then-append sequence and the sweep. The critical
# sections are microseconds over in-memory lists, so a single module lock is
# fine at one worker; it closes the parallel-burst over-admission and the
# lost-append interleavings (ARCH-003/ARCH-010/BUG-070).
_lock = threading.Lock()

SWEEP_INTERVAL_SECONDS = 600


def sweep_idle_buckets(now: float = None) -> None:
    """Drop buckets idle past their own window so the dict cannot grow forever.

    Runs from the periodic background task main.py starts in the lifespan
    (never inline in a request or websocket frame, ARCH-009). `now` is
    injectable for tests only.
    """
    if now is None:
        now = time.monotonic()
    with _lock:
        stale = [
            bucket
            for bucket, (window, timestamps) in _counters.items()
            if not timestamps or timestamps[-1] < now - window
        ]
        for bucket in stale:
            _counters.pop(bucket, None)


def check_rate_limit(user_id: Union[int, str], key: str, max_count: int, window_seconds: int) -> None:
    # user_id is usually a numeric user id; unauthenticated endpoints pass a
    # string identity instead (e.g. "ip:1.2.3.4" or "email:a@b.c").
    now = time.monotonic()
    bucket = f"{user_id}:{key}"
    cutoff = now - window_seconds
    with _lock:
        _window, timestamps = _counters.get(bucket, (window_seconds, []))
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= max_count:
            _counters[bucket] = (float(window_seconds), timestamps)
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        timestamps.append(now)
        _counters[bucket] = (float(window_seconds), timestamps)
