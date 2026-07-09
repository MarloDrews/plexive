from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Union

from fastapi import HTTPException

# Process-local by design: correct only under the single-worker, single-replica
# deployment invariant (M138, see backend/railway.toml and ARCHITECTURE.md).
_counters: Dict[str, List[float]] = defaultdict(list)

# Largest window used anywhere (create_post: 20/day). Buckets whose newest
# timestamp is older than this can never affect a limit again.
_SWEEP_IDLE_SECONDS = 86400
_SWEEP_INTERVAL_SECONDS = 600
_last_sweep = 0.0


def _sweep(now: float) -> None:
    """Drop buckets idle past every window so the dict cannot grow forever.

    Runs in the threadpool alongside other requests: iterate over a snapshot
    of the keys and pop with a default so concurrent inserts are safe.
    """
    for bucket in list(_counters.keys()):
        timestamps = _counters.get(bucket)
        if timestamps is not None and (not timestamps or timestamps[-1] < now - _SWEEP_IDLE_SECONDS):
            _counters.pop(bucket, None)


def check_rate_limit(user_id: Union[int, str], key: str, max_count: int, window_seconds: int) -> None:
    # user_id is usually a numeric user id; unauthenticated endpoints pass a
    # string identity instead (e.g. "ip:1.2.3.4" or "email:a@b.c").
    global _last_sweep
    now = datetime.utcnow().timestamp()
    if now - _last_sweep > _SWEEP_INTERVAL_SECONDS:
        _last_sweep = now
        _sweep(now)
    bucket = f"{user_id}:{key}"
    cutoff = now - window_seconds
    _counters[bucket] = [t for t in _counters[bucket] if t > cutoff]
    if len(_counters[bucket]) >= max_count:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    _counters[bucket].append(now)
