from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy.orm import Session, selectinload

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Comment, User
from ..rate_limit import check_rate_limit
from ._shared import get_visible_post

router = APIRouter(tags=["comments"])


class CommentIn(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment body cannot be empty.")
        if len(v) > 2000:
            raise ValueError("Comment body must be at most 2000 characters.")
        return v


class CommentOut(BaseModel):
    id: int
    post_id: int
    username: str
    is_verified: int
    avatar_url: str | None = None
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def flatten_user(cls, data):
        if hasattr(data, "user"):
            return {
                "id": data.id,
                "post_id": data.post_id,
                "username": data.user.username,
                "is_verified": data.user.is_verified,
                "avatar_url": data.user.avatar_url,
                "body": data.body,
                "created_at": data.created_at,
            }
        return data


@router.get("/posts/{post_id}/comments")
def list_comments(
    post_id: int,
    count: bool = Query(False),
    before_id: int | None = None,
    limit: int = 50,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    get_visible_post(post_id, db, current_user)
    if count:
        n = db.query(Comment).filter(Comment.post_id == post_id).count()
        return {"count": n}
    # Keyset pagination (chat's before_id pattern): before_id = id of the
    # oldest comment the client already has; id-desc matches the old
    # created_at-desc insert order while making the cursor exact.
    limit = max(1, min(limit, 100))
    query = (
        db.query(Comment)
        .filter(Comment.post_id == post_id)
        .options(selectinload(Comment.user))
    )
    if before_id is not None:
        query = query.filter(Comment.id < before_id)
    comments = query.order_by(Comment.id.desc()).limit(limit).all()
    return [CommentOut.model_validate(c) for c in comments]


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    post_id: int,
    body: CommentIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "create_comment", 30, 300)
    get_visible_post(post_id, db, current_user)

    comment = Comment(post_id=post_id, user_id=current_user.id, body=body.body)
    db.add(comment)
    db.commit()

    # Re-query with user relationship loaded for serialization
    comment = (
        db.query(Comment)
        .options(selectinload(Comment.user))
        .filter(Comment.id == comment.id)
        .first()
    )
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own comments.")
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
