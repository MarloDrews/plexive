from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Post
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
