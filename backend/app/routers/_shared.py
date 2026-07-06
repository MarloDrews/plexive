"""Shared helpers for the API routers.

Small pieces that were copy-pasted across several routers live here so there is
one implementation to maintain. Behavior is intentionally identical to the
inline copies these replaced.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..models import Post, User

# Eager-load a post's interests and author. Both are load-bearing:
# PostOut.interests and the author_* properties would otherwise lazy-load per
# post, an N+1 against the remote DB. Use as `.options(*POST_EAGER)`.
POST_EAGER = (selectinload(Post.interests), selectinload(Post.author))


def get_target_user(username: str, db: Session, detail: str = "User not found.") -> User:
    """Look up an active user by username, or raise 404. The single copy of the
    lookup that four routers reimplemented."""
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return user
