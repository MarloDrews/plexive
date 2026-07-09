"""Shared helpers for the API routers.

Small pieces that were copy-pasted across several routers live here so there is
one implementation to maintain. Behavior is intentionally identical to the
inline copies these replaced.
"""

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session, defer, joinedload, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from ..models import Follow, Post, User

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


def accepted_follow_exists(db: Session, follower_id: Optional[int], following_id: Optional[int]) -> bool:
    """Whether follower -> following is an accepted follow. Shared by the
    content-privacy gate; mirrors follows._has_accepted_follow."""
    if follower_id is None or following_id is None:
        return False
    return db.query(Follow.id).filter(
        Follow.follower_id == follower_id,
        Follow.following_id == following_id,
        Follow.status == "accepted",
    ).first() is not None


def can_view_post(post: Post, viewer: Optional[User], db: Session) -> bool:
    """The shared read-visibility rule for a single post row.

    - A non-published post is visible only to its author (existence hidden
      from everyone else).
    - A published post by a PRIVATE account is visible only to the author and
      accepted followers; a public or authorless post is visible to everyone.
    Reads post.author, so the caller should have it loaded (eager or lazy)."""
    viewer_id = viewer.id if viewer is not None else None
    if post.status != "published":
        return viewer_id is not None and post.author_id == viewer_id
    author = post.author
    if author is None or not author.is_private:
        return True
    if viewer_id is not None and post.author_id == viewer_id:
        return True
    return accepted_follow_exists(db, viewer_id, post.author_id)


def visible_posts_filter(viewer: Optional[User]):
    """A SQLAlchemy clause for LIST queries over Post: drop posts whose author is
    a private account, unless the viewer is that author or an accepted follower.
    Public and authorless posts always pass. Correlated EXISTS so it composes
    onto any query that already selects from Post; callers keep their own status
    filter. This is the query-side twin of can_view_post's privacy branch."""
    private_author = exists().where(
        and_(User.id == Post.author_id, User.is_private == True)
    )
    clause = ~private_author
    if viewer is not None:
        clause = or_(
            clause,
            Post.author_id == viewer.id,
            exists().where(
                and_(
                    Follow.follower_id == viewer.id,
                    Follow.following_id == Post.author_id,
                    Follow.status == "accepted",
                )
            ),
        )
    return clause


def can_view_user_posts(viewer: Optional[User], target: User, db: Session) -> bool:
    """Whether the viewer may see a user's published posts as a set (the
    single-user feed). Public account: always. Private account: owner or an
    accepted follower only."""
    if not target.is_private:
        return True
    if viewer is not None and viewer.id == target.id:
        return True
    return viewer is not None and accepted_follow_exists(db, viewer.id, target.id)


def get_visible_post(post_id: int, db: Session, current_user: Optional[User]) -> Post:
    """Fetch a post, enforcing the shared visibility rule: a non-published post
    is visible only to its author (so a pending post 404s for everyone else,
    hiding its existence), and a published post by a private account is visible
    only to the author and accepted followers. The single copy of the rule that
    the comments, events, quiz and post-detail endpoints share."""
    post = (
        db.query(Post)
        .options(joinedload(Post.author))
        .filter(Post.id == post_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    if not can_view_post(post, current_user, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    return post
