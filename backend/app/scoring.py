import hashlib
import random
from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Set, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .models import Event, Post

# Scoring formula (plain English):
# Each post starts with a base score of 1.0.
# Posts whose interest tags overlap with the user's selected interests gain +2.0 per matching tag.
# Posts in formats the user has engaged with over the last 30 days gain a bonus of 0 to +3.0,
#   calculated as (avg view duration in ms + like count for that format), normalised so the
#   most-engaged format receives 3.0 and all others scale proportionally.
# Posts that have been viewed before lose 1.0 per recorded view event (last 30 days), with a
#   floor of 0 so the score never goes negative.
# The final score is multiplied by a jitter in [0.85, 1.15]: deterministic per
#   (session seed, post id) when the caller passes a seed, so the order stays
#   stable while a user pages through the feed within one session; random per
#   request without a seed, so a new session still gets a fresh shuffle.


def _jitter(seed: Optional[str], post_id: int) -> float:
    """Score jitter factor in [0.85, 1.15].

    With a session seed the factor is a deterministic hash of (seed, post_id):
    the same seed reproduces the same feed order on every page request, which
    keyset paging requires. Without a seed it stays random per request.
    """
    if seed is None:
        return random.uniform(0.85, 1.15)
    digest = hashlib.blake2b(f"{seed}:{post_id}".encode("utf-8"), digest_size=8).digest()
    return 0.85 + 0.30 * (int.from_bytes(digest, "big") / 2**64)


def rank_post_ids(
    records: Sequence[Tuple[int, str, Set[str]]],
    interest_slugs: List[str],
    db: Session,
    tier_map: Optional[dict] = None,
    seed: Optional[str] = None,
) -> List[int]:
    """Order post ids by score, best first (ties broken by id, newest first).

    records are lightweight (post_id, format, interest-slug set) tuples so the
    whole corpus can be ranked without hydrating full rows; the caller fetches
    complete rows only for the page it actually returns.

    tier_map: post_id -> tier (1 = direct match, 2 = related, 3 = fallback).
    Tier 1 gets full interest bonus, Tier 2 gets half, Tier 3 gets none.
    seed: session seed for the jitter (see _jitter); None = fresh per request.
    """
    # TODO: once per-user engagement matters, pass user_id here and filter
    # events to that user so bonuses reflect individual rather than global engagement.

    cutoff = datetime.utcnow() - timedelta(days=30)
    # Two grouped queries instead of fetching every raw event row of the last
    # 30 days: the aggregates are a handful of rows however much activity the
    # platform records. The CASE filters keep the exact old fold semantics:
    # AVG ignores NULL, so only view events with a duration shape the average
    # (a view without duration still counts as a view below), and only like
    # events count toward likes. The join covers events on posts filtered out
    # by ?format= or ?interests=, like the old version did.
    format_rows = (
        db.query(
            Post.format,
            func.avg(case((Event.event_type == "view", Event.duration_ms))),
            func.coalesce(func.sum(case((Event.event_type == "like", 1), else_=0)), 0),
        )
        .select_from(Event)
        .join(Post, Post.id == Event.post_id)
        .filter(Event.created_at >= cutoff)
        .group_by(Post.format)
        .all()
    )
    post_view_counts: dict[int, int] = dict(
        db.query(Event.post_id, func.count(Event.id))
        .filter(Event.created_at >= cutoff, Event.event_type == "view")
        .group_by(Event.post_id)
        .all()
    )

    # Raw engagement score per format: avg view duration (ms) + like count.
    # Units differ but normalisation below makes the scale irrelevant.
    format_raw: dict[str, float] = {
        fmt: (float(avg_view_ms) if avg_view_ms is not None else 0.0) + (like_count or 0)
        for fmt, avg_view_ms, like_count in format_rows
    }

    max_raw = max(format_raw.values(), default=0.0)
    format_bonus: dict[str, float] = {
        fmt: (raw / max_raw) * 3.0 if max_raw > 0 else 0.0
        for fmt, raw in format_raw.items()
    }

    interest_set = set(interest_slugs)

    def compute_score(post_id: int, post_format: str, slugs: Set[str]) -> float:
        score = 1.0

        # Interest match, multiplied by 1.0 (Tier 1), 0.5 (Tier 2), 0.0 (Tier 3).
        tier = tier_map.get(post_id, 1) if tier_map else 1
        interest_multiplier = {1: 1.0, 2: 0.5, 3: 0.0}.get(tier, 1.0)
        for slug in slugs:
            if slug in interest_set:
                score += 2.0 * interest_multiplier

        # Format engagement bonus.
        score += format_bonus.get(post_format, 0.0)

        # Repeat penalty.
        score -= post_view_counts.get(post_id, 0) * 1.0
        score = max(score, 0.0)

        # Jitter keeps the feed fresh across sessions (see _jitter).
        score *= _jitter(seed, post_id)

        return score

    scored = [(compute_score(pid, fmt, slugs), pid) for pid, fmt, slugs in records]
    # Deterministic tiebreak on id so equal scores cannot reorder between the
    # page requests of one session.
    scored.sort(key=lambda pair: (-pair[0], -pair[1]))
    return [pid for _, pid in scored]
