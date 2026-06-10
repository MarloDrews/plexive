from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Follow, Interest, Post, User
from ..post_counts import attach_counts
from ..schemas import PostOut
from ..scoring import score_posts

router = APIRouter()

FEED_MIN = 10


def _fetch_posts(ids: Set[int], db: Session) -> List[Post]:
    if not ids:
        return []
    return (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.id.in_(ids))
        .all()
    )


@router.get("/feed", response_model=List[PostOut])
def get_feed(
    format: Optional[str] = None,
    interests: Optional[str] = None,
    db: Session = Depends(get_db),
):
    slugs: List[str] = [s.strip() for s in interests.split(",")] if interests else []

    # Query only Post.id (integer) so DISTINCT has no equality-operator issue
    # with the json-typed feed_card/sections columns.
    id_base = db.query(Post.id).filter(Post.status == "published")
    if format:
        id_base = id_base.filter(Post.format == format)

    if not slugs:
        ids = {row[0] for row in id_base.all()}
        posts = _fetch_posts(ids, db)
        return attach_counts(score_posts(posts, [], db), db)

    # Tier 1: posts tagged with any of the user's selected interests
    tier1_ids: Set[int] = {
        row[0]
        for row in id_base.join(Post.interests)
                          .filter(Interest.slug.in_(slugs))
                          .distinct()
                          .all()
    }
    tier_map = {i: 1 for i in tier1_ids}

    # Tier 2: posts co-tagged with interests found in Tier 1 posts
    tier2_ids: Set[int] = set()
    tier1_posts: List[Post] = []
    if len(tier1_ids) < FEED_MIN:
        tier1_posts = _fetch_posts(tier1_ids, db)
        related_slugs = {
            i.slug
            for p in tier1_posts
            for i in p.interests
            if i.slug not in slugs
        }
        if related_slugs:
            tier2_ids = {
                row[0]
                for row in id_base.join(Post.interests)
                                  .filter(Interest.slug.in_(related_slugs))
                                  .filter(Post.id.notin_(tier1_ids))
                                  .distinct()
                                  .all()
            }
        tier_map.update({i: 2 for i in tier2_ids})

    # Tier 3: any remaining published posts
    tier3_ids: Set[int] = set()
    if len(tier1_ids) + len(tier2_ids) < FEED_MIN:
        tier12_ids = tier1_ids | tier2_ids
        tier3_ids = {row[0] for row in id_base.filter(Post.id.notin_(tier12_ids)).all()}
        tier_map.update({i: 3 for i in tier3_ids})

    # Fetch full post objects in one query (avoid re-fetching tier1 if already loaded)
    missing_ids = (tier2_ids | tier3_ids) - {p.id for p in tier1_posts}
    extra_posts = _fetch_posts(missing_ids, db)
    posts_by_id = {p.id: p for p in tier1_posts + extra_posts}

    tier1 = [posts_by_id[i] for i in tier1_ids if i in posts_by_id]
    tier2 = [posts_by_id[i] for i in tier2_ids if i in posts_by_id]
    tier3 = [posts_by_id[i] for i in tier3_ids if i in posts_by_id]

    ranked = score_posts(tier1 + tier2 + tier3, slugs, db, tier_map)
    return attach_counts(ranked, db)


@router.get("/feed/following", response_model=List[PostOut])
def get_following_feed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    following_ids = [
        row.following_id
        for row in db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.status == "accepted",
        ).all()
    ]
    if not following_ids:
        return []
    posts = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.author_id.in_(following_ids), Post.status == "published")
        .order_by(Post.created_at.desc())
        .limit(50)
        .all()
    )
    return attach_counts(posts, db)


@router.get("/feed/user/{username}", response_model=List[PostOut])
def get_user_feed(
    username: str,
    _current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    posts = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.author_id == target.id, Post.status == "published")
        .order_by(Post.created_at.desc())
        .limit(50)
        .all()
    )
    return attach_counts(posts, db)
