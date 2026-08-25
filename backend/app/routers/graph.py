from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..database import get_db
from ..graph_view import build_graph
from ..models import User
from ..rate_limit import check_rate_limit
from ..schemas import GraphResponse

router = APIRouter(tags=["graph"])


@router.get("/graph", response_model=GraphResponse)
def get_graph(
    request: Request,
    # Optional auth so the Net view renders logged-out (no green state, just the
    # network); a logged-in viewer additionally sees their private posts.
    viewer: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """The Net view's whole-corpus post graph: every published, viewer-visible
    post as a node, plus edges guaranteed to form ONE connected component."""
    identity = viewer.id if viewer is not None else (
        f"ip:{request.client.host if request.client else 'unknown'}"
    )
    check_rate_limit(identity, "graph", 30, 60)
    return build_graph(db, viewer)
