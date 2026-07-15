"""Deleted-account lifecycle (M150, decision 10).

On account deletion nothing personal may remain and the email/username must be
freed for re-registration (BUG-021), while the user's PUBLISHED long-form
content stays: it is the product's value. Only the identity link is severed by
re-attributing those posts to a neutral, inactive sentinel account. Follow
rows are removed entirely so no dead entries linger in follower lists, counts
or the follow-request queue (BUG-019/BUG-022).

One implementation shared by the DELETE /api/auth/me endpoint and the one-time
backfill in scripts/add_deleted_user_sentinel.py.
"""

import re
import secrets

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import Follow, Post, User

SENTINEL_EMAIL = "deleted-user@system.invalid"
SENTINEL_USERNAME = "deleted_user"

# Usernames the lifecycle owns: the sentinel itself and the deleted-<id>
# scramble pattern. register/patch_me refuse them so nobody can squat the
# placeholder identity or collide with a future scramble.
_RESERVED_USERNAME_RE = re.compile(r"^deleted([_-].*)?$", re.IGNORECASE)


def is_reserved_username(username: str) -> bool:
    return bool(_RESERVED_USERNAME_RE.fullmatch(username))


def get_or_create_sentinel(db: Session) -> User:
    """The neutral placeholder author severed posts are attributed to.

    Inactive on purpose: it can never log in, its profile 404s like any
    deactivated account, and the stats queries' is_active filters keep it out
    of every leaderboard. Race-safe via the unique email: a concurrent
    creation loses the flush and adopts the winner's row. Call this BEFORE
    mutating anything else in the session; the loser path rolls back.
    """
    sentinel = db.query(User).filter(User.email == SENTINEL_EMAIL).first()
    if sentinel is not None:
        return sentinel
    sentinel = User(
        email=SENTINEL_EMAIL,
        username=SENTINEL_USERNAME,
        password_hash=hash_password(secrets.token_hex(32)),
        is_active=False,
    )
    db.add(sentinel)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        sentinel = db.query(User).filter(User.email == SENTINEL_EMAIL).first()
        if sentinel is None:
            raise
    return sentinel


def scramble_and_detach(db: Session, user: User) -> None:
    """Apply decision 10 to one account. The caller commits.

    - Published posts move to the sentinel author: content stays public, the
      personal link is gone. Graph edges key on post ids, so they are
      untouched. Pending drafts stay on the scrambled row, where the
      author-only visibility rule hides them from everyone forever.
    - Every follow edge involving the user is deleted, in both directions and
      any status, so lists, counts and request queues hold no dead entries.
    - email/username are scrambled to id-based values (freeing the originals),
      bio, avatar and cosmetic accessories are cleared, and the password hash is
      replaced with the hash of a random secret so the stored value derives from
      nothing the person ever typed.
    - is_active goes False and token_version is bumped: every token dies and
      live websockets fail their next per-frame revalidation.
    """
    sentinel = get_or_create_sentinel(db)
    db.query(Post).filter(
        Post.author_id == user.id, Post.status == "published"
    ).update({Post.author_id: sentinel.id}, synchronize_session=False)
    db.query(Follow).filter(
        or_(Follow.follower_id == user.id, Follow.following_id == user.id)
    ).delete(synchronize_session=False)
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.username = f"deleted-{user.id}"
    user.bio = None
    user.avatar_url = None
    user.avatar_frame_id = None
    user.badge_id = None
    user.password_hash = hash_password(secrets.token_hex(32))
    user.is_active = False
    user.token_version = (user.token_version or 0) + 1
