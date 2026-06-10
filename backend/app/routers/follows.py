from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Follow, Post, User

router = APIRouter(prefix="/users", tags=["follows"])


class FollowUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    is_verified: bool
    is_private: bool


class ProfileOut(BaseModel):
    username: str
    is_verified: bool
    is_private: bool
    bio: Optional[str]
    follower_count: int
    following_count: int
    post_count: int
    follow_status: Optional[str]


def _get_target(username: str, db: Session) -> User:
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


def _is_following(viewer_id: int, target_id: int, db: Session) -> bool:
    return db.query(Follow).filter(
        Follow.follower_id == viewer_id,
        Follow.following_id == target_id,
        Follow.status == "accepted",
    ).first() is not None


@router.post("/{username}/follow")
def follow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _get_target(username, db)

    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself.")

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == target.id,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already following.")

    follow_status = "pending" if target.is_private else "accepted"
    follow = Follow(follower_id=current_user.id, following_id=target.id, status=follow_status)
    db.add(follow)
    db.commit()
    return {"status": follow_status}


@router.delete("/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _get_target(username, db)
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
    # current_user is the target; {username} is the requester
    requester = _get_target(username, db)
    follow = db.query(Follow).filter(
        Follow.follower_id == requester.id,
        Follow.following_id == current_user.id,
        Follow.status == "pending",
    ).first()
    if not follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending follow request from this user.")
    follow.status = "accepted"
    db.commit()
    return {"status": "accepted"}


@router.delete("/{username}/follow/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_follow_request(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # current_user is the target; {username} is the requester
    requester = _get_target(username, db)
    follow = db.query(Follow).filter(
        Follow.follower_id == requester.id,
        Follow.following_id == current_user.id,
        Follow.status == "pending",
    ).first()
    if not follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending follow request from this user.")
    db.delete(follow)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{username}/followers", response_model=List[FollowUserOut])
def get_followers(
    username: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = _get_target(username, db)

    if target.is_private:
        if current_user is None or not _is_following(current_user.id, target.id, db):
            return []

    follows = db.query(Follow).filter(
        Follow.following_id == target.id,
        Follow.status == "accepted",
    ).all()
    return [FollowUserOut.model_validate(f.follower) for f in follows]


@router.get("/{username}/following", response_model=List[FollowUserOut])
def get_following(
    username: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    target = _get_target(username, db)

    if target.is_private:
        if current_user is None or not _is_following(current_user.id, target.id, db):
            return []

    follows = db.query(Follow).filter(
        Follow.follower_id == target.id,
        Follow.status == "accepted",
    ).all()
    return [FollowUserOut.model_validate(f.following) for f in follows]


@router.get("/{username}/follow-requests")
def get_follow_requests(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username != username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    follows = db.query(Follow).filter(
        Follow.following_id == current_user.id,
        Follow.status == "pending",
    ).all()
    return [
        {
            "username": f.follower.username,
            "is_verified": f.follower.is_verified,
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
    target = _get_target(username, db)

    follower_count = db.query(Follow).filter(
        Follow.following_id == target.id,
        Follow.status == "accepted",
    ).count()

    following_count = db.query(Follow).filter(
        Follow.follower_id == target.id,
        Follow.status == "accepted",
    ).count()

    post_count = db.query(Post).filter(
        Post.author_id == target.id,
        Post.status == "published",
    ).count()

    follow_status: Optional[str] = None
    if current_user is not None:
        if current_user.id == target.id:
            follow_status = None
        else:
            row = db.query(Follow).filter(
                Follow.follower_id == current_user.id,
                Follow.following_id == target.id,
            ).first()
            follow_status = row.status if row else "none"

    return ProfileOut(
        username=target.username,
        is_verified=target.is_verified,
        is_private=target.is_private,
        bio=target.bio,
        follower_count=follower_count,
        following_count=following_count,
        post_count=post_count,
        follow_status=follow_status,
    )
