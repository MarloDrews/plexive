from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Follow, User
from ..rate_limit import check_rate_limit
from ._shared import get_target_user

router = APIRouter(prefix="/users", tags=["follows"])


class FollowUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # The follow edge id: the before_id keyset cursor for the list endpoints
    # (the user rows themselves carry no id in this payload).
    follow_id: int
    username: str
    is_verified: int
    is_private: bool
    avatar_url: Optional[str] = None


def _follow_user_out(follow: Follow, user: User) -> FollowUserOut:
    return FollowUserOut(
        follow_id=follow.id,
        username=user.username,
        is_verified=user.is_verified,
        is_private=user.is_private,
        avatar_url=user.avatar_url,
    )


class ProfileOut(BaseModel):
    username: str
    is_verified: int
    is_private: bool
    bio: Optional[str]
    avatar_url: Optional[str]
    follower_count: int
    following_count: int
    post_count: int
    follow_status: Optional[str]


def _has_accepted_follow(viewer_id: int, target_id: int, db: Session) -> bool:
    """Whether viewer -> target is an accepted follow (distinct from the profile
    follow_status, which reports a pending row too)."""
    return db.query(Follow).filter(
        Follow.follower_id == viewer_id,
        Follow.following_id == target_id,
        Follow.status == "accepted",
    ).first() is not None


def _can_view_private_lists(current_user: Optional[User], target: User, db: Session) -> bool:
    """Whether the viewer may see the target's follower/following lists: public
    accounts always, a private account only for the owner or an accepted
    follower. Same gate for both list endpoints."""
    if not target.is_private:
        return True
    if current_user is not None and current_user.id == target.id:
        return True
    return current_user is not None and _has_accepted_follow(current_user.id, target.id, db)


def _find_pending_request(requester_id: int, target_id: int, db: Session) -> Follow:
    """The pending follow row from requester -> target, or 404. Shared by the
    accept and reject endpoints, which differ only in the action on the row."""
    follow = db.query(Follow).filter(
        Follow.follower_id == requester_id,
        Follow.following_id == target_id,
        Follow.status == "pending",
    ).first()
    if not follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending follow request from this user.")
    return follow


@router.post("/{username}/follow")
def follow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "follow", 60, 3600)
    target = get_target_user(username, db)

    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself.")

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == target.id,
    ).first()
    if existing:
        # A pending request is not "following" (BUG-020): tell the requester
        # what state they are actually in.
        detail = (
            "Follow request already pending."
            if existing.status == "pending"
            else "Already following."
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    follow_status = "pending" if target.is_private else "accepted"
    follow = Follow(follower_id=current_user.id, following_id=target.id, status=follow_status)
    db.add(follow)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent double-tap: both requests passed the pre-check; uq_follow
        # caught the second. Same answer as the pre-check, not a 500
        # (BE-015/M148).
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already following.")
    return {"status": follow_status}


@router.delete("/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "unfollow", 60, 3600)
    target = get_target_user(username, db)
    follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == target.id,
    ).first()
    if not follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not following this user.")
    db.delete(follow)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{username}/follow/accept")
def accept_follow_request(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "follow_accept", 60, 3600)
    # current_user is the target; {username} is the requester
    requester = get_target_user(username, db)
    follow = _find_pending_request(requester.id, current_user.id, db)
    follow.status = "accepted"
    db.commit()
    return {"status": "accepted"}


@router.delete("/{username}/follow/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_follow_request(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "follow_reject", 60, 3600)
    # current_user is the target; {username} is the requester
    requester = get_target_user(username, db)
    follow = _find_pending_request(requester.id, current_user.id, db)
    db.delete(follow)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _page_of_follows(query, before_id: Optional[int], limit: int) -> List[Follow]:
    """Newest-first keyset page over a Follow filter (before_id = follow_id of
    the last row the client already has). Shared by the three list endpoints."""
    limit = max(1, min(limit, 100))
    if before_id is not None:
        query = query.filter(Follow.id < before_id)
    return query.order_by(Follow.id.desc()).limit(limit).all()


@router.get("/{username}/followers", response_model=List[FollowUserOut])
def get_followers(
    username: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = get_target_user(username, db)

    if not _can_view_private_lists(current_user, target, db):
        return []

    follows = _page_of_follows(
        db.query(Follow).options(selectinload(Follow.follower)).filter(
            Follow.following_id == target.id,
            Follow.status == "accepted",
        ),
        before_id,
        limit,
    )
    return [_follow_user_out(f, f.follower) for f in follows]


@router.get("/{username}/following", response_model=List[FollowUserOut])
def get_following(
    username: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = get_target_user(username, db)

    if not _can_view_private_lists(current_user, target, db):
        return []

    follows = _page_of_follows(
        db.query(Follow).options(selectinload(Follow.following)).filter(
            Follow.follower_id == target.id,
            Follow.status == "accepted",
        ),
        before_id,
        limit,
    )
    return [_follow_user_out(f, f.following) for f in follows]


@router.get("/{username}/follow-requests")
def get_follow_requests(
    username: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username != username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    follows = _page_of_follows(
        db.query(Follow).options(selectinload(Follow.follower)).filter(
            Follow.following_id == current_user.id,
            Follow.status == "pending",
        ),
        before_id,
        limit,
    )
    return [
        {
            "follow_id": f.id,
            "username": f.follower.username,
            "is_verified": f.follower.is_verified,
            "avatar_url": f.follower.avatar_url,
            "created_at": f.created_at.isoformat(),
        }
        for f in follows
    ]


@router.get("/{username}/profile", response_model=ProfileOut)
def get_profile(
    username: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = get_target_user(username, db)

    # One round trip instead of four queries: the DB is remote, so every query
    # costs a full network round trip regardless of data size. The viewer's
    # follow_status folds in as a fourth subselect; :viewer is NULL when there is
    # no viewer or the viewer is the target (so that subselect matches no row).
    viewer_id = current_user.id if current_user is not None and current_user.id != target.id else None
    counts_row = db.execute(
        text(
            "SELECT"
            " (SELECT COUNT(*) FROM follows"
            "   WHERE following_id=:uid AND status='accepted') AS follower_count,"
            " (SELECT COUNT(*) FROM follows"
            "   WHERE follower_id=:uid AND status='accepted') AS following_count,"
            " (SELECT COUNT(*) FROM posts"
            "   WHERE author_id=:uid AND status='published') AS post_count,"
            " (SELECT status FROM follows"
            "   WHERE follower_id=:viewer AND following_id=:uid) AS follow_status"
        ),
        {"uid": target.id, "viewer": viewer_id},
    ).one()
    follower_count = counts_row.follower_count or 0
    following_count = counts_row.following_count or 0
    post_count = counts_row.post_count or 0

    # None when there is no viewer or the viewer is the target; otherwise the
    # follow row's status, or "none" when the viewer follows nobody here.
    follow_status: Optional[str] = None if viewer_id is None else (counts_row.follow_status or "none")

    return ProfileOut(
        username=target.username,
        is_verified=target.is_verified,
        is_private=target.is_private,
        bio=target.bio,
        avatar_url=target.avatar_url,
        follower_count=follower_count,
        following_count=following_count,
        post_count=post_count,
        follow_status=follow_status,
    )
