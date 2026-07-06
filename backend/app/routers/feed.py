from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Follow, Post, User
from ..post_counts import attach_counts
from ..schemas import PostListOut
from ..scoring import score_posts
from ._shared import POST_EAGER, get_target_user

router = APIRouter()


def _fetch_posts(ids: Set[int], db: Session) -> List[Post]:
    if not ids:
        return []
    return (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.id.in_(ids))
        .all()
    )


def _recent_published_posts(
    db: Session, author_filter, limit: int, before_id: Optional[int]
) -> List[Post]:
    """The most recent published posts matching an author filter, newest first,
    keyset-paginated (before_id = id of the last post the client already has;
    ids follow insert order, so id-desc matches the old created_at-desc order
    while making the cursor exact). Shared by the following-feed and
    single-user-feed endpoints, which differ only in that filter."""
    query = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(author_filter, Post.status == "published")
    )
    if before_id is not None:
        query = query.filter(Post.id < before_id)
    return query.order_by(Post.id.desc()).limit(limit).all()


@router.get("/feed", response_model=List[PostListOut])
def get_feed(
    format: Optional[str] = None,
    interests: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    slugs: List[str] = [s.strip() for s in interests.split(",")] if interests else []

    # Query only Post.id (integer) here; the full rows (with the json-typed
    # feed_card/sections columns) are fetched separately by _fetch_posts.
    id_base = db.query(Post.id).filter(Post.status == "published")
    if format:
        id_base = id_base.filter(Post.format == format)

    # For You orders every published post (interests only affect ordering,
    # never inclusion) and returns the top page of the scored ranking.
    posts = _fetch_posts({row[0] for row in id_base.all()}, db)
    if not slugs:
        return attach_counts(score_posts(posts, [], db)[:limit], db)

    # Rank by tier: Tier 1 shares an interest with the user's selection, Tier 2
    # shares a co-tag with a Tier 1 post, Tier 3 is everything else. score_posts
    # gives Tier 1 the full interest bonus, Tier 2 half, Tier 3 none. Computed in
    # Python from the already-loaded interests, so no extra queries, and no post
    # is ever dropped.
    selected = set(slugs)
    tier_map: dict[int, int] = {}
    tier1_posts: List[Post] = []
    for p in posts:
        if any(i.slug in selected for i in p.interests):
            tier_map[p.id] = 1
            tier1_posts.append(p)

    related_slugs = {
        i.slug
        for p in tier1_posts
        for i in p.interests
        if i.slug not in selected
    }
    for p in posts:
        if p.id in tier_map:
            continue
        tier_map[p.id] = 2 if any(i.slug in related_slugs for i in p.interests) else 3

    return attach_counts(score_posts(posts, slugs, db, tier_map)[:limit], db)


@router.get("/feed/following", response_model=List[PostListOut])
def get_following_feed(
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    following_ids = [
        row.following_id
        for row in db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.status == "accepted",
        ).all()
    ]
    if not following_ids:
        return []
    posts = _recent_published_posts(db, Post.author_id.in_(following_ids), limit, before_id)
    return attach_counts(posts, db)


@router.get("/feed/user/{username}", response_model=List[PostListOut])
def get_user_feed(
    username: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    _current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    target = get_target_user(username, db)
    posts = _recent_published_posts(db, Post.author_id == target.id, limit, before_id)
    return attach_counts(posts, db)
