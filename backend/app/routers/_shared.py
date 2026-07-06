"""Shared helpers for the API routers.

Small pieces that were copy-pasted across several routers live here so there is
one implementation to maintain. Behavior is intentionally identical to the
inline copies these replaced.
"""

from sqlalchemy.orm import selectinload

from ..models import Post

# Eager-load a post's interests and author. Both are load-bearing:
# PostOut.interests and the author_* properties would otherwise lazy-load per
# post, an N+1 against the remote DB. Use as `.options(*POST_EAGER)`.
POST_EAGER = (selectinload(Post.interests), selectinload(Post.author))
