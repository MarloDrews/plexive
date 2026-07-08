from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..database import get_db
from ..models import Event, Post, User
from ..rate_limit import check_rate_limit
from ..schemas import EventIn
from ._shared import get_visible_post, visible_posts_filter

router = APIRouter()


@router.post("/events")
def create_events(
    events: List[EventIn],
    request: Request,
    db: Session = Depends(get_db),
    optional_user: Optional[User] = Depends(get_optional_user),
):
    # Perf angle only: bound the otherwise-unlimited growth of the events table,
    # which feeds the feed-scoring and stats scans. The abuse lockdown (require
    # auth, dedup, clamp) is M119 in the security batch -- this file is shared
    # with it. The frontend queue flushes at most ~12 batches/min, so 120/min
    # per identity is generous headroom.
    identity = optional_user.id if optional_user else (
        f"ip:{request.client.host if request.client else 'unknown'}"
    )
    check_rate_limit(identity, "create_events", 120, 60)

    # The frontend queue flushes at 5 events; anything near this cap is abuse.
    if len(events) > 50:
        raise HTTPException(status_code=422, detail="Too many events in one batch.")

    # Drop events that reference nonexistent posts instead of storing garbage.
    # Only posts visible to this caller count, so the stored-count response
    # cannot be used as an existence oracle for pending post ids.
    requested_ids = {e.post_id for e in events}
    valid_ids = set()
    if requested_ids:
        query = db.query(Post.id).filter(Post.id.in_(requested_ids))
        if optional_user:
            # Own posts (any status) plus published posts the caller may see,
            # so a private author's post is not a target for non-followers and
            # the stored-count response stays useless as an existence oracle.
            query = query.filter(
                (Post.author_id == optional_user.id)
                | ((Post.status == "published") & visible_posts_filter(optional_user))
            )
        else:
            query = query.filter(
                Post.status == "published", visible_posts_filter(None)
            )
        valid_ids = {row[0] for row in query.all()}

    # Dedup likes against stored events with one IN query for the whole
    # batch instead of one existence check per like event.
    already_liked_ids: set[int] = set()
    if optional_user:
        like_candidate_ids = {
            e.post_id for e in events
            if e.event_type == "like" and e.post_id in valid_ids
        }
        if like_candidate_ids:
            already_liked_ids = {
                row[0]
                for row in db.query(Event.post_id).filter(
                    Event.post_id.in_(like_candidate_ids),
                    Event.event_type == "like",
                    Event.user_id == optional_user.id,
                ).all()
            }

    # Unlike: an authed user retracting a like that already reached the server.
    # Delete their like row(s) for the post so GET /likes decrements; the unlike
    # itself is not stored as a row (only "like" rows count).
    if optional_user:
        unlike_ids = {
            e.post_id for e in events
            if e.event_type == "unlike" and e.post_id in valid_ids
        }
        if unlike_ids:
            db.query(Event).filter(
                Event.post_id.in_(unlike_ids),
                Event.event_type == "like",
                Event.user_id == optional_user.id,
            ).delete(synchronize_session=False)

    new_events = []
    batch_liked_post_ids: set[int] = set()
    for e in events:
        if e.post_id not in valid_ids:
            continue
        if e.event_type == "unlike":
            continue  # handled above by the delete; never stored as a row
        if e.event_type == "like" and optional_user:
            # Dedup within this batch as well as against stored events
            if e.post_id in batch_liked_post_ids or e.post_id in already_liked_ids:
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
    # Pending posts are author-only everywhere else; like info follows the same rule.
    get_visible_post(post_id, db, optional_user)

    # Count and the caller's liked-state in one round trip; MAX(CASE...)
    # over zero rows yields NULL, i.e. liked=False on posts with no likes.
    if optional_user:
        row = (
            db.query(
                func.count(Event.id),
                func.max(case((Event.user_id == optional_user.id, 1), else_=0)),
            )
            .filter(Event.post_id == post_id, Event.event_type == "like")
            .one()
        )
        count, liked = row[0] or 0, bool(row[1])
    else:
        count = (
            db.query(func.count(Event.id))
            .filter(Event.post_id == post_id, Event.event_type == "like")
            .scalar()
        ) or 0
        liked = False

    return {"count": count, "liked": liked}
