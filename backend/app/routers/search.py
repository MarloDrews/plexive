from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Text, cast, or_
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..database import get_db
from ..models import Follow, Post, User
from ..post_counts import attach_counts
from ..rate_limit import check_rate_limit
from ..schemas import PostListOut
from ._shared import POST_EAGER

router = APIRouter()

# Search scans posts in Python; cap query length and per-client volume.
QUERY_MAX_CHARS = 100


def _limit_search(request: Request, user: Optional[User], key: str) -> None:
    identity = user.id if user else f"ip:{request.client.host if request.client else 'unknown'}"
    check_rate_limit(identity, key, 60, 60)


def _sql_prefilter_ok(q_lower: str) -> bool:
    """Whether the coarse SQL pre-filter below is a faithful superset for this
    query. The pre-filter matches the JSON columns as raw text, so it is only
    safe when the query text survives JSON serialization and SQL lowercasing
    identically to the Python matcher: ASCII only (SQLite lower() is ASCII-only),
    and no characters JSON escapes ("/backslash). Otherwise we scan as before --
    correctness never depends on the pre-filter, only row count does.
    """
    return q_lower.isascii() and '"' not in q_lower and "\\" not in q_lower


def _like_pattern(q_lower: str) -> str:
    """A contains-pattern with LIKE wildcards in the query escaped so they match
    literally (paired with escape='\\' on the ilike calls)."""
    escaped = q_lower.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _lower(value) -> str:
    """Lowercase a value only when it is a string, else "" -- so a non-string
    feed_card/idea field cannot raise inside the Python matcher."""
    return value.lower() if isinstance(value, str) else ""


def _post_matches(post: Post, q_lower: str) -> bool:
    """
    Python-side exact match across the JSON schema. The SQL pre-filter in
    search_posts narrows the candidate rows (a superset); this is the exact
    re-check that removes its false positives, so the matched semantics are
    unchanged. Revisit with PostgreSQL full-text search once even the narrowed
    scan makes the post count noticeable.
    """
    # Seed/legacy rows are arbitrary JSON; every value read here is guarded with
    # isinstance so a non-string field or a non-dict section/idea is skipped
    # rather than crashing the whole search (.lower()/.get on the wrong type).
    if isinstance(post.title, str) and q_lower in post.title.lower():
        return True

    fc = post.feed_card if isinstance(post.feed_card, dict) else {}
    if q_lower in _lower(fc.get("essence")):
        return True
    if q_lower in _lower(fc.get("author")):
        return True

    for section in (post.sections or []):
        if not isinstance(section, dict):
            continue
        stype = section.get("type")
        content = section.get("content")
        if stype == "heart" and isinstance(content, str):
            if q_lower in content.lower():
                return True
        elif stype == "core_ideas" and isinstance(content, list):
            for idea in content:
                if not isinstance(idea, dict):
                    continue
                if q_lower in _lower(idea.get("title")):
                    return True
                if q_lower in _lower(idea.get("body")):
                    return True

    return False


@router.get("/search", response_model=List[PostListOut])
def search_posts(
    request: Request,
    q: str = "",
    format: Optional[str] = None,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if not q.strip() or len(q) > QUERY_MAX_CHARS:
        return []
    limit = max(1, min(limit, 50))
    _limit_search(request, current_user, "search_posts")

    q_lower = q.strip().lower()

    query = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.status == "published")
    )
    if format:
        query = query.filter(Post.format == format)

    # Coarse SQL pre-filter: fetch only rows whose title or (JSON-as-text)
    # feed_card/sections contain the query, instead of hydrating the whole
    # published corpus. It is a superset of the exact matcher (feed_card text
    # carries essence/author; sections text carries heart/core_ideas), so
    # _post_matches below still decides the final set. Skipped for queries the
    # pre-filter cannot faithfully bound (see _sql_prefilter_ok).
    if _sql_prefilter_ok(q_lower):
        pattern = _like_pattern(q_lower)
        query = query.filter(
            or_(
                Post.title.ilike(pattern, escape="\\"),
                cast(Post.feed_card, Text).ilike(pattern, escape="\\"),
                cast(Post.sections, Text).ilike(pattern, escape="\\"),
            )
        )

    candidates = query.order_by(Post.created_at.desc()).all()

    matched = [p for p in candidates if _post_matches(p, q_lower)]

    # Title matches first, then recency. Recency is preserved by Python's
    # stable sort over the earlier ORDER BY created_at DESC, so the key holds
    # only the title-match rank.
    matched.sort(key=lambda p: 0 if q_lower in p.title.lower() else 1)

    results = matched[:limit]
    return attach_counts(results, db)


@router.get("/search/users")
def search_users(
    request: Request,
    q: str = "",
    limit: int = 20,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    q = q.strip()
    if not q or len(q) > QUERY_MAX_CHARS:
        return []
    limit = max(1, min(limit, 50))
    _limit_search(request, current_user, "search_users")

    matches = (
        db.query(User)
        .filter(User.is_active == True, User.username.ilike(f"%{q}%"))
        .limit(limit)
        .all()
    )
    # Prefix matches first, then alphabetical.
    matches.sort(key=lambda u: (0 if u.username.lower().startswith(q.lower()) else 1, u.username.lower()))

    follow_lookup: dict[int, str] = {}
    if current_user is not None and matches:
        rows = db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.following_id.in_([u.id for u in matches]),
        ).all()
        follow_lookup = {r.following_id: r.status for r in rows}

    return [
        {
            "username": u.username,
            "is_verified": u.is_verified,
            "is_private": u.is_private,
            "bio": u.bio,
            "avatar_url": u.avatar_url,
            "is_self": current_user is not None and u.id == current_user.id,
            "follow_status": (
                None if current_user is None or u.id == current_user.id
                else follow_lookup.get(u.id, "none")
            ),
        }
        for u in matches
    ]
