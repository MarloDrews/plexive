from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..database import get_db
from ..models import Event, Post, User
from ..schemas import EventIn

router = APIRouter()


@router.post("/events")
def create_events(
    events: List[EventIn],
    db: Session = Depends(get_db),
    optional_user: Optional[User] = Depends(get_optional_user),
):
    new_events = []
    batch_liked_post_ids: set[int] = set()
    for e in events:
        if e.event_type == "like" and optional_user:
            # Dedup within this batch as well as against stored events
            if e.post_id in batch_liked_post_ids:
                continue
            already_liked = (
                db.query(Event)
                .filter(
                    Event.post_id == e.post_id,
                    Event.event_type == "like",
                    Event.user_id == optional_user.id,
                )
                .first()
            )
            if already_liked:
                continue
            batch_liked_post_ids.add(e.post_id)
        new_events.append(Event(
            post_id=e.post_id,
            event_type=e.event_type,
            duration_ms=e.duration_ms,
            user_id=optional_user.id if optional_user else None,
        ))
    db.add_all(new_events)
    db.commit()
    return {"stored": len(new_events)}


@router.get("/posts/{post_id}/likes")
def get_likes(
    post_id: int,
    db: Session = Depends(get_db),
    optional_user: Optional[User] = Depends(get_optional_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")

    count = (
        db.query(Event)
        .filter(Event.post_id == post_id, Event.event_type == "like")
        .count()
    )
    liked = False
    if optional_user:
        liked = (
            db.query(Event)
            .filter(
                Event.post_id == post_id,
                Event.event_type == "like",
                Event.user_id == optional_user.id,
            )
            .first()
        ) is not None

    return {"count": count, "liked": liked}
