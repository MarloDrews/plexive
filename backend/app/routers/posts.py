from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..graph_edges import on_post_written, resolved_read_next
from ..graph_identity import post_identity_key
from ..models import Interest, Post
from ..post_counts import attach_counts, attach_counts_one, primary_category_name
from ..rate_limit import check_rate_limit
from ..reading_time import compute_reading_minutes
from ..sanitize import sanitize_svg_text
from ..schemas import PostCreate, PostListOut, PostOut
from ._shared import POST_EAGER, POST_LIST_EAGER, blank_sections, can_view_post

router = APIRouter()


def _sanitize_sections_svgs(sections: list) -> list:
    """Re-sanitize any visual_svg strings found anywhere in the sections array."""
    sanitized = []
    for section in sections:
        section = dict(section) if not isinstance(section, dict) else section.copy()
        content = section.get("content")
        if isinstance(content, dict):
            content = content.copy()
            if "visual_svg" in content and content["visual_svg"]:
                content["visual_svg"] = sanitize_svg_text(str(content["visual_svg"]))
            section["content"] = content
        elif isinstance(content, list):
            new_items = []
            for item in content:
                if isinstance(item, dict) and "visual_svg" in item and item["visual_svg"]:
                    item = item.copy()
                    item["visual_svg"] = sanitize_svg_text(str(item["visual_svg"]))
                new_items.append(item)
            section["content"] = new_items
        sanitized.append(section)
    return sanitized


# IMPORTANT: /posts/mine must be registered before /posts/{post_id} so FastAPI
# does not treat the literal string "mine" as an integer post_id.
@router.get("/posts/mine", response_model=List[PostListOut])
def get_my_posts(
    before_id: Optional[int] = None,
    limit: int = 50,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Keyset pagination on the id (before_id = id of the last post the client
    # already has); id-desc matches the old created_at-desc insert order.
    # PostListOut with deferred+blanked sections: the my-posts page renders
    # only row-level fields, never section bodies.
    limit = max(1, min(limit, 100))
    query = (
        db.query(Post)
        .options(*POST_LIST_EAGER)
        .filter(Post.author_id == current_user.id)
    )
    if before_id is not None:
        query = query.filter(Post.id < before_id)
    posts = blank_sections(query.order_by(Post.id.desc()).limit(limit).all())
    return attach_counts(posts, db)


@router.post("/posts", response_model=PostOut, status_code=201)
def create_post(
    data: PostCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate every interest slug exists (one IN query instead of one
    # query per slug; the first unknown slug in request order is reported,
    # matching the old per-slug loop)
    found = {
        i.slug: i
        for i in db.query(Interest).filter(Interest.slug.in_(data.interests)).all()
    }
    interest_objects = []
    for slug in data.interests:
        interest = found.get(slug)
        if interest is None:
            raise HTTPException(status_code=400, detail=f"Unknown interest slug: {slug!r}")
        interest_objects.append(interest)

    # Convert sections to dicts, then re-sanitize SVGs (defense-in-depth)
    sections_list = [s.model_dump() for s in data.sections]
    try:
        sections_list = _sanitize_sections_svgs(sections_list)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid SVG in sections: {exc}")

    # Record the daily slot only AFTER validation passes (BUG-081/M130): a client
    # bug looping on a 400 must not exhaust the 20/day budget and lock a user out
    # of posting for a day.
    check_rate_limit(current_user.id, "create_post", 20, 86400)

    post = Post(
        format=data.format,
        title=data.title,
        identity_key=post_identity_key(data.format, data.feed_card),
        feed_card=data.feed_card,
        sections=sections_list,
        reading_minutes=compute_reading_minutes(sections_list),
        author_id=current_user.id,
        is_user_content=True,
        # Publishing is gated by the can_publish capability (M116), no longer by
        # the cosmetic verified badge. Users verified before the split were
        # granted can_publish in the migration, so behavior is unchanged.
        status="published" if current_user.can_publish else "pending",
    )
    post.interests = interest_objects
    db.add(post)
    db.commit()
    db.refresh(post)
    post_id = post.id

    # Derive this post's graph edges and activate any latent edges pointing at it
    # (only when it is published; a pending submission casts none).
    on_post_written(db, post)

    post = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.id == post_id)
        .first()
    )
    # A just-created post has zero likes and comments by construction and its
    # reading_minutes is already stored, so the two grouped count queries of
    # attach_counts_one would be pure waste; attach the values directly.
    post.like_count = 0
    post.comment_count = 0
    post.primary_category_name = primary_category_name(post)
    return post


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    current_user=Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    post = (
        db.query(Post)
        .options(*POST_EAGER)
        .filter(Post.id == post_id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    # Shared visibility rule over the already eager-loaded row (author included
    # in POST_EAGER, so can_view_post reads it without a re-query): a pending
    # post is author-only, and a private account's post is author-or-follower.
    if not can_view_post(post, current_user, db):
        raise HTTPException(status_code=404, detail="Post not found")

    # Resolved "read next" set so the frontend resolves nothing itself.
    post.read_next = resolved_read_next(db, post)
    return attach_counts_one(post, db)
