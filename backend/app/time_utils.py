"""Single replacement for the deprecated datetime.utcnow() (BE-050/M139).

Everything the app stores and compares is naive UTC (column defaults, scoring
cutoffs, stats month math). datetime.utcnow() is deprecated since Python 3.12
and its naive result is misread as local time by .timestamp(); this helper
keeps the stored convention (naive UTC) while deriving it from the aware
clock, so introducing an aware datetime elsewhere later cannot silently
change what these call sites produce.
"""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time as a NAIVE datetime, matching every stored timestamp."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
