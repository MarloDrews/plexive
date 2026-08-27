"""Freezes the M139 rate-limiter fixes.

- The module lock makes a deliberately parallel burst admit EXACTLY max_count
  requests: no over-admission past the length check and no appends lost to the
  filter-and-reassign interleaving (ARCH-003).
- Windows expire per bucket, so a request after the window passes is admitted
  again.
- sweep_idle_buckets drops a bucket idle past its OWN window (ARCH-008), keeps
  a still-live bucket, and never eats a concurrent fresh append (ARCH-010,
  covered by taking the same lock; asserted here via the exact counts).

Run with: .venv\\Scripts\\python.exe tests\\rate_limit_test.py
"""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _throwaway_db  # noqa: F401, must run before any app import

from fastapi import HTTPException  # noqa: E402

from app.rate_limit import _counters, check_rate_limit, sweep_idle_buckets  # noqa: E402

PASS = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS
    if not condition:
        raise AssertionError(f"FAIL: {name} {detail}")
    PASS += 1
    print(f"ok: {name}")


def _attempt(identity, key, max_count, window) -> bool:
    try:
        check_rate_limit(identity, key, max_count, window)
        return True
    except HTTPException as exc:
        assert exc.status_code == 429
        return False


# 1. Parallel burst exactness: 320 concurrent attempts against a limit of 50
# must admit exactly 50. Before the lock, threads could both pass the length
# check (over-admission) or lose each other's appends (under-count); either
# failure mode breaks the equality.
_counters.clear()
with ThreadPoolExecutor(max_workers=16) as pool:
    results = list(pool.map(lambda _i: _attempt(7, "burst", 50, 60), range(320)))
admitted = sum(results)
check("parallel burst admits exactly the limit", admitted == 50, f"admitted={admitted}")
_window, timestamps = _counters["7:burst"]
check("no appends lost under contention", len(timestamps) == 50, f"stored={len(timestamps)}")

# 2. Sequential behavior: the request after the limit is rejected, and the
# bucket admits again once its window has passed.
_counters.clear()
for _ in range(3):
    check("within limit admitted", _attempt("u", "tiny", 3, 1))
check("over limit rejected", not _attempt("u", "tiny", 3, 1))
time.sleep(1.05)
check("admitted again after the window", _attempt("u", "tiny", 3, 1))

# 3. Sweep drops a bucket idle past its own window and keeps a live one.
_counters.clear()
check_rate_limit("a", "short", 5, 60)
check_rate_limit("b", "long", 5, 86400)
now = time.monotonic()
sweep_idle_buckets(now=now + 120)
check("short-window bucket swept after its window", "a:short" not in _counters)
check("long-window bucket kept within its window", "b:long" in _counters)
sweep_idle_buckets(now=now + 86500)
check("long-window bucket swept after its window", "b:long" not in _counters)

# 4. Sweeping concurrently with fresh appends never loses a recorded request:
# hammer one bucket from the pool while sweeping in the main thread.
_counters.clear()


def _spam(_i) -> bool:
    return _attempt("c", "race", 10_000, 60)


with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(_spam, i) for i in range(400)]
    for _ in range(50):
        sweep_idle_buckets()
    admitted = sum(f.result() for f in futures)
_window, timestamps = _counters["c:race"]
check(
    "sweep alongside appends loses nothing",
    len(timestamps) == admitted == 400,
    f"stored={len(timestamps)} admitted={admitted}",
)

print(f"\nAll {PASS} rate-limit checks passed.")
