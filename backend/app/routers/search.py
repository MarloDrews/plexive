from typing import List, Optional

from fastapi import APIRouter, Depends, Request
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


def _post_matches(post: Post, q_lower: str) -> bool:
    """
    Python-side search across the JSON schema: all published posts are
    fetched and matched in Python. Acceptable at current small scale;
    revisit with PostgreSQL full-text search or JSON-path filters once the
    post count makes the full fetch noticeable.
    """
    if q_lower in post.title.lower():
        return True

    fc = post.feed_card or {}
    if q_lower in (fc.get("essence") or "").lower():
        return True
    if q_lower in (fc.get("author") or "").lower():
        return True

    for section in (post.sections or []):
        stype = section.get("type")
        content = section.get("content")
        if stype == "heart" and isinstance(content, str):
            if q_lower in content.lower():
                return True
        elif stype == "core_ideas" and isinstance(content, list):
            for idea in content:
                if q_lower in (idea.get("title") or "").lower():
                    return True
                if q_lower in (idea.get("body") or "").lower():
                    return True

    return False


@router.get("/search", response_model=List[PostListOut])
def search_posts(
    request: Request,
    q: str = "",
    format: Optional[str] = None,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if not q.strip() or len(q) > QUERY_MAX_CHARS:
        return []
    _limit_search(request, current_user, "search_posts")

    q_lower = q.strip().lower()

    query = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.status == "published")
    )
    if format:
        query = query.filter(Post.format == format)

    candidates = query.order_by(Post.created_at.desc()).all()

    matched = [p for p in candidates if _post_matches(p, q_lower)]

    # Title matches first, then recency. Recency is preserved by Python's
    # stable sort over the earlier ORDER BY created_at DESC, so the key holds
    # only the title-match rank.
    matched.sort(key=lambda p: 0 if q_lower in p.title.lower() else 1)

    results = matched[:50]
    return attach_counts(results, db)


@router.get("/search/users")
def search_users(
    request: Request,
    q: str = "",
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    q = q.strip()
    if not q or len(q) > QUERY_MAX_CHARS:
        return []
    _limit_search(request, current_user, "search_users")

    matches = (
        db.query(User)
        .filter(User.is_active == True, User.username.ilike(f"%{q}%"))
        .limit(20)
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
