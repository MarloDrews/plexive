from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Comment, Event, Post


def attach_counts(posts: List[Post], db: Session) -> List[Post]:
    """Attach like_count and comment_count as plain attributes for PostOut serialization.

    Counts for all posts are fetched in two grouped queries instead of two
    queries per post.
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
    return posts


def attach_counts_one(post: Post, db: Session) -> Post:
    return attach_counts([post], db)[0]
