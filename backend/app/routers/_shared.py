"""Shared helpers for the API routers.

Small pieces that were copy-pasted across several routers live here so there is
one implementation to maintain. Behavior is intentionally identical to the
inline copies these replaced.
"""

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, defer, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from ..models import Post, User

# Eager-load a post's interests and author. Both are load-bearing:
# PostOut.interests and the author_* properties would otherwise lazy-load per
# post, an N+1 against the remote DB. Use as `.options(*POST_EAGER)`.
POST_EAGER = (selectinload(Post.interests), selectinload(Post.author))

# List-endpoint variant: sections is by far the largest column and no list view
# renders it (PostListOut serializes sections as []), so list queries skip it
# at the DB. MUST be paired with blank_sections() on the loaded rows.
POST_LIST_EAGER = (*POST_EAGER, defer(Post.sections))


def blank_sections(posts: List[Post]) -> List[Post]:
    """Populate the deferred sections attribute with [] so serialization never
    touches the DB: Pydantic getattrs .sections even though PostListOut drops
    it, which would otherwise fire one lazy SELECT per post.
    set_committed_value writes the loaded state directly -- no dirty flag, no
    autoflush, nothing to accidentally persist."""
    for p in posts:
        set_committed_value(p, "sections", [])
    return posts


def get_target_user(username: str, db: Session, detail: str = "User not found.") -> User:
    """Look up an active user by username, or raise 404. The single copy of the
    lookup that four routers reimplemented."""
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return user


def get_visible_post(post_id: int, db: Session, current_user: Optional[User]) -> Post:
    """Fetch a post, enforcing the shared visibility rule: a non-published post
    is visible only to its author (so a pending post 404s for everyone else,
    hiding its existence). The single copy of the rule that the comments, events,
    quiz and post-detail endpoints share."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    if post.status != "published" and (current_user is None or post.author_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    return post
