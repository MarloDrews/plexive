from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user, get_optional_user_id
from ..database import get_db
from ..models import Follow, Interest, Post, User, post_interests
from ..post_counts import attach_counts
from ..rate_limit import check_rate_limit
from ..schemas import PostListOut
from ..scoring import rank_post_ids
from ._shared import POST_LIST_EAGER, blank_sections, get_target_user

router = APIRouter()


def _fetch_posts(ids: List[int], db: Session) -> List[Post]:
    """Rows for a ranked page of ids (eager interests + author, sections
    deferred and blanked -- these are list responses), returned in the given
    order (IN gives no ordering guarantee)."""
    if not ids:
        return []
    rows = (
        db.query(Post)
        .options(*POST_LIST_EAGER)
        .filter(Post.id.in_(ids))
        .all()
    )
    by_id = {p.id: p for p in blank_sections(rows)}
    return [by_id[i] for i in ids if i in by_id]


def _recent_published_posts(
    db: Session, author_filter, limit: int, before_id: Optional[int]
) -> List[Post]:
    """The most recent published posts matching an author filter, newest first,
    keyset-paginated (before_id = id of the last post the client already has;
    ids follow insert order, so id-desc matches the old created_at-desc order
    while making the cursor exact). Shared by the following-feed and
    single-user-feed endpoints, which differ only in that filter. Sections are
    deferred and blanked -- these are list responses."""
    query = (
        db.query(Post)
        .options(*POST_LIST_EAGER)
        .filter(author_filter, Post.status == "published")
    )
    if before_id is not None:
        query = query.filter(Post.id < before_id)
    return blank_sections(query.order_by(Post.id.desc()).limit(limit).all())


@router.get("/feed", response_model=List[PostListOut])
def get_feed(
    request: Request,
    format: Optional[str] = None,
    interests: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[int] = None,
    seed: Optional[str] = None,
    user_id: Optional[int] = Depends(get_optional_user_id),
    db: Session = Depends(get_db),
):
    """The For You feed: every published post is ranked (interests only affect
    ordering, never inclusion), one page of full rows is returned.

    seed: the client's per-session salt. Combined with the caller's user id it
    seeds the score jitter, so the ranking is stable while a user pages through
    one session and reshuffles on the next visit.
    cursor: id of the last post the client already has. Under the same seed the
    ranking is deterministic, so the next page starts right after that id and
    pages can neither skip nor duplicate. Engagement aggregates are read live,
    so extreme mid-session swings can still nudge scores; the jitter, interest
    and tier terms, which dominate, are fixed by the seed.
    """
    limit = max(1, min(limit, 100))
    identity = user_id if user_id is not None else (
        f"ip:{request.client.host if request.client else 'unknown'}"
    )
    check_rate_limit(identity, "feed", 60, 60)
    slugs: List[str] = [s.strip() for s in interests.split(",")] if interests else []

    # Scoring inputs only (id, format, interest slugs), never full rows: the
    # whole corpus is ranked but only the returned page pays the json-typed
    # feed_card/sections columns and the ORM hydration.
    id_base = db.query(Post.id, Post.format).filter(Post.status == "published")
    slug_base = (
        db.query(post_interests.c.post_id, Interest.slug)
        .join(Interest, Interest.id == post_interests.c.interest_id)
        .join(Post, Post.id == post_interests.c.post_id)
        .filter(Post.status == "published")
    )
    if format:
        id_base = id_base.filter(Post.format == format)
        slug_base = slug_base.filter(Post.format == format)

    post_slugs: Dict[int, Set[str]] = {}
    for pid, slug in slug_base.all():
        post_slugs.setdefault(pid, set()).add(slug)
    records = [(pid, fmt, post_slugs.get(pid, set())) for pid, fmt in id_base.all()]

    # Rank by tier: Tier 1 shares an interest with the user's selection, Tier 2
    # shares a co-tag with a Tier 1 post, Tier 3 is everything else. rank_post_ids
    # gives Tier 1 the full interest bonus, Tier 2 half, Tier 3 none. Computed in
    # Python from the slug map, so no extra queries, and no post is ever dropped.
    tier_map: Optional[Dict[int, int]] = None
    if slugs:
        selected = set(slugs)
        tier_map = {}
        tier1_ids: List[int] = []
        for pid, _fmt, pslugs in records:
            if pslugs & selected:
                tier_map[pid] = 1
                tier1_ids.append(pid)
        related_slugs: Set[str] = set()
        for pid in tier1_ids:
            related_slugs |= post_slugs.get(pid, set())
        related_slugs -= selected
        for pid, _fmt, pslugs in records:
            if pid not in tier_map:
                tier_map[pid] = 2 if pslugs & related_slugs else 3

    # The jitter seed is user id + per-session salt, so the same salt still
    # gives different users different orders. No salt = no seed = per-request
    # random jitter (the pre-pagination behavior for clients that never page).
    effective_seed = f"{user_id if user_id is not None else 'anon'}:{seed}" if seed else None
    ordered_ids = rank_post_ids(records, slugs, db, tier_map, effective_seed)

    if cursor is not None:
        try:
            start = ordered_ids.index(cursor) + 1
        except ValueError:
            # The anchor vanished (unpublished mid-session): end the feed
            # rather than guessing a position and duplicating items.
            return []
        page_ids = ordered_ids[start:start + limit]
    else:
        page_ids = ordered_ids[:limit]

    return attach_counts(_fetch_posts(page_ids, db), db)


@router.get("/feed/following", response_model=List[PostListOut])
def get_following_feed(
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    # Column-only query: whole Follow rows would be hydrated just to read one id.
    following_ids = [
        fid
        for (fid,) in db.query(Follow.following_id).filter(
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
