from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Comment, Event, Post
from .reading_time import compute_reading_minutes


def primary_category_name(post: Post):
    """Display name of the post's primary category, its first tag (tags[0]).

    Read from the post's own eager-loaded interests (Interest.name) so the card
    eyebrow and the interest chips label the same slug identically -- single
    source, they cannot disagree. Returns None when the post has no tags or
    tags[0] does not map to one of its interests (an empty/odd-tag post).
    """
    # tags is arbitrary JSON on seed/legacy rows: a non-list (e.g. a dict) would
    # raise on tags[0], and this runs for every row on every list response.
    tags = post.tags if isinstance(post.tags, list) else []
    if not tags:
        return None
    primary = tags[0]
    for interest in post.interests:
        if interest.slug == primary:
            return interest.name
    return None


def attach_counts(posts: List[Post], db: Session) -> List[Post]:
    """Attach like_count, comment_count and primary_category_name as plain
    attributes for PostOut serialization.

    Counts for all posts are fetched in two grouped queries instead of two
    queries per post. reading_minutes is a stored column computed on write
    (posts.py / seed.py); the fallback below only fires for rows written before
    the column existed and not yet backfilled by scripts/add_reading_minutes.py.
    primary_category_name is resolved from the already-loaded interests, so it
    costs no extra query.
    """
    if not posts:
        return posts
    ids = [p.id for p in posts]
    likes = dict(
        db.query(Event.post_id, func.count(Event.id))
        .filter(Event.post_id.in_(ids), Event.event_type == "like")
        .group_by(Event.post_id)
        .all()
    )
    comments = dict(
        db.query(Comment.post_id, func.count(Comment.id))
        .filter(Comment.post_id.in_(ids))
        .group_by(Comment.post_id)
        .all()
    )
    for p in posts:
        p.like_count = likes.get(p.id, 0)
        p.comment_count = comments.get(p.id, 0)
        if p.reading_minutes is None:
            # Transitional: pre-column row not yet backfilled. Never committed
            # here (read path), so the ORM change is discarded with the session.
            p.reading_minutes = compute_reading_minutes(p.sections)
        p.primary_category_name = primary_category_name(p)
    return posts


def attach_counts_one(post: Post, db: Session) -> Post:
    return attach_counts([post], db)[0]
