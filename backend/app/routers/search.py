from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..auth import get_optional_user
from ..database import get_db
from ..models import Follow, Post, User
from ..post_counts import attach_counts
from ..schemas import PostOut

router = APIRouter()


def _post_matches(post: Post, q_lower: str) -> bool:
    """
    Python-side search across the new JSON schema.
    SQLite JSON path queries are limited, so we fetch candidate posts
    (filtered by title LIKE for a first pass) and verify the rest in Python.
    Trade-off: full table scan for non-title matches at current small scale.
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


@router.get("/search", response_model=List[PostOut])
def search_posts(
    q: str = "",
    format: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if not q.strip():
        return []

    q_lower = q.strip().lower()

    query = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.status == "published")
    )
    if format:
        query = query.filter(Post.format == format)

    candidates = query.order_by(Post.created_at.desc()).all()

    matched = [p for p in candidates if _post_matches(p, q_lower)]

    # Title matches first, then recency (already ordered by created_at desc).
    matched.sort(
        key=lambda p: (0 if q_lower in p.title.lower() else 1, 0)
    )

    results = matched[:50]
    return attach_counts(results, db)


@router.get("/search/users")
def search_users(
    q: str = "",
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    q = q.strip()
    if not q:
        return []

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
