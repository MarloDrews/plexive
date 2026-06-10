from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import Interest, Post
from ..post_counts import attach_counts, attach_counts_one
from ..rate_limit import check_rate_limit
from ..sanitize import sanitize_svg_text
from ..schemas import PostCreate, PostOut

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
@router.get("/posts/mine", response_model=List[PostOut])
def get_my_posts(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    posts = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.author_id == current_user.id)
        .order_by(Post.created_at.desc())
        .all()
    )
    return attach_counts(posts, db)


@router.post("/posts", response_model=PostOut, status_code=201)
def create_post(
    data: PostCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "create_post", 20, 86400)

    # Validate every interest slug exists
    interest_objects = []
    for slug in data.interests:
        interest = db.query(Interest).filter(Interest.slug == slug).first()
        if interest is None:
            raise HTTPException(status_code=400, detail=f"Unknown interest slug: {slug!r}")
        interest_objects.append(interest)

    # Convert sections to dicts, then re-sanitize SVGs (defense-in-depth)
    sections_list = [s.model_dump() for s in data.sections]
    try:
        sections_list = _sanitize_sections_svgs(sections_list)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid SVG in sections: {exc}")

    post = Post(
        format=data.format,
        title=data.title,
        feed_card=data.feed_card,
        sections=sections_list,
        author_id=current_user.id,
        is_user_content=True,
        status="published" if current_user.is_verified else "pending",
    )
    post.interests = interest_objects
    db.add(post)
    db.commit()
    db.refresh(post)
    post_id = post.id

    post = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.id == post_id)
        .first()
    )
    return attach_counts_one(post, db)


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    current_user=Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    post = (
        db.query(Post)
        .options(selectinload(Post.interests), selectinload(Post.author))
        .filter(Post.id == post_id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.status == "pending":
        if current_user is None or post.author_id != current_user.id:
            raise HTTPException(status_code=404, detail="Post not found")

    return attach_counts_one(post, db)
