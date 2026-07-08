import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..graph_edges import on_post_written
from ..models import Post, User
from ..rate_limit import check_rate_limit
from ..schemas import PostOut, PublicUserOut
from ._shared import POST_EAGER

router = APIRouter(prefix="/admin", tags=["admin"])

# Admin actions are rare and high-trust; log every one (actor, target, action)
# so there is a record of who verified whom / released what. A dedicated audit
# table is deferred; this is the launch-minimum trail.
audit_logger = logging.getLogger("app.admin.audit")


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Gate admin endpoints on the is_admin capability (M116). The cosmetic
    is_verified badge no longer grants any admin power, so verification is not
    transitive: only an admin can verify others or release pending posts."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin capability required.",
        )
    return current_user


@router.patch("/users/{user_id}/verify", response_model=PublicUserOut)
def verify_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "admin_verify", 30, 3600)
    # Only an active user can be verified, and the badge level never decreases
    # (max with the existing level) so verifying a level-2 user does not
    # downgrade them (BUG-074).
    target = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    target.is_verified = max(target.is_verified, 1)
    db.commit()
    db.refresh(target)
    audit_logger.info(
        "verify: actor=%s target=%s level=%s", current_user.id, target.id, target.is_verified
    )
    # Public projection: no email or internal id of another user leaks (SEC-002).
    return target


@router.patch("/posts/{post_id}/release", response_model=PostOut)
def release_post(
    post_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Release a pending post: publish it and (re)derive its graph edges. The
    admin-only moderation action that decouples publishing from the verified
    badge (M116) -- pending posts by users without can_publish are released
    here rather than by any verified user."""
    check_rate_limit(current_user.id, "admin_release", 60, 3600)
    post = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.id == post_id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")
    if post.status != "published":
        post.status = "published"
        db.commit()
        # Rebuild this post's outgoing edges and activate incoming latent ones,
        # now that it is a live node.
        on_post_written(db, post)
    audit_logger.info("release: actor=%s post=%s", current_user.id, post.id)
    # Re-query with the eager options so serialization does not lazy-load after
    # the commit expired the row's relationships.
    return db.query(Post).options(*POST_EAGER).filter(Post.id == post_id).first()
