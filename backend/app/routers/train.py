import threading
import time
from bisect import bisect_right
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..elo import apply_answer_timed, elo_summary
from ..models import Follow, User
from ..rate_limit import check_rate_limit
from ..train_bank import grade

router = APIRouter(tags=["train"])


class TrainAnswerIn(BaseModel):
    # The player's answer for a specific bank question. Exactly one of
    # chosen_index / chosen_value applies, matching the question kind. Client
    # correctness is NO LONGER accepted -- the server grades from the bank.
    question_id: str
    chosen_index: Optional[int] = None
    chosen_value: Optional[float] = None
    answer_ms: int = Field(ge=0)


@router.post("/train/answer")
def answer_train_question(
    body: TrainAnswerIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply one Train marathon answer to the user's unified knowledge score.

    This updates the SAME `users.knowledge_rating` that post quizzes move, so the
    Train Elo and the profile Knowledge score are one number.

    Correctness and difficulty are decided SERVER-SIDE from the question bank
    (M120/SEC-007), so a client can no longer raise its own rating by asserting
    correct=true. Mock phase: the bank is app/train_bank.py, mirrored from the
    frontend pool until a real shared question backend exists.
    """
    check_rate_limit(current_user.id, "train_answer", 120, 60)

    graded = grade(body.question_id, body.chosen_index, body.chosen_value)
    if graded is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown question id."
        )

    delta = apply_answer_timed(
        db, current_user, graded["difficulty"], graded["correct"], body.answer_ms
    )
    db.commit()

    global_rating = elo_summary(current_user)
    return {
        "rating": global_rating,
        "delta": round(delta, 1),
        "global_rating": global_rating,
        "correct": graded["correct"],
    }


# --- Leaderboard ------------------------------------------------------------
#
# Ranks users by the unified knowledge score (users.knowledge_rating, the same
# number the Train marathon and post quizzes move). Two scopes:
#   - global: everyone, top N.
#   - friends: the caller plus the accounts they follow (accepted follows).
# knowledge_rating is NULL until a user's first scored answer, so those users
# are unranked (rating null) and sort last, letting an unplayed friend still
# appear in the friends board.

LEADERBOARD_LIMIT = 50   # top-N rows returned for the global board
FRIENDS_LIMIT = 100      # cap on followed accounts compared (bounds the query)

# The global board is identical for every caller (is_me is marked per-request),
# so one short-lived in-process snapshot serves all requests, matching the stats
# caches (ARCH-013 / the M138 single-worker invariant). The lock serializes the
# rebuild so an expiry does not run the scan in every waiting thread at once.
_LEADERBOARD_TTL_SECONDS = 30
_global_leaderboard_cache: tuple | None = None  # (monotonic_timestamp, snapshot)
_global_leaderboard_lock = threading.Lock()


def _compute_global_leaderboard(db: Session) -> dict:
    # Active, scored users, best first; id is a stable tie-break so equal ratings
    # keep a deterministic order across refetches. is_active drops deactivated
    # accounts and the deleted_user sentinel (M150/BUG-022), matching every other
    # leaderboard in the app.
    rows = (
        db.query(User.id, User.username, User.is_verified, User.knowledge_rating)
        .filter(User.is_active == True, User.knowledge_rating.isnot(None))
        .order_by(User.knowledge_rating.desc(), User.id.asc())
        .all()
    )
    top = [
        {
            "rank": i + 1,
            "user_id": r.id,
            "username": r.username,
            "is_verified": r.is_verified,
            "rating": round(r.knowledge_rating),
        }
        for i, r in enumerate(rows[:LEADERBOARD_LIMIT])
    ]
    # Ascending ratings for the caller's rank bisect (like stats.py); the caller's
    # own rating already sits on their loaded User row.
    ratings_asc = sorted(r.knowledge_rating for r in rows)
    return {"top": top, "ratings_asc": ratings_asc, "total": len(rows)}


def _global_leaderboard(db: Session) -> dict:
    global _global_leaderboard_cache
    cached = _global_leaderboard_cache
    if cached is not None and time.monotonic() - cached[0] < _LEADERBOARD_TTL_SECONDS:
        return cached[1]
    with _global_leaderboard_lock:
        cached = _global_leaderboard_cache
        if cached is not None and time.monotonic() - cached[0] < _LEADERBOARD_TTL_SECONDS:
            return cached[1]
        snapshot = _compute_global_leaderboard(db)
        _global_leaderboard_cache = (time.monotonic(), snapshot)
        return snapshot


def _friends_leaderboard(db: Session, current_user: User) -> dict:
    # Accepted accounts the caller follows, bounded so a heavily-following user
    # cannot turn this into an unbounded IN (...). The caller is always included.
    following_ids = [
        r.following_id
        for r in db.query(Follow.following_id)
        .filter(Follow.follower_id == current_user.id, Follow.status == "accepted")
        .limit(FRIENDS_LIMIT)
        .all()
    ]
    truncated = len(following_ids) >= FRIENDS_LIMIT
    ids = set(following_ids)
    ids.add(current_user.id)

    rows = (
        db.query(User.id, User.username, User.is_verified, User.knowledge_rating)
        .filter(User.id.in_(ids), User.is_active == True)
        .all()
    )
    # Sort in Python so NULL-rating ordering is identical on PostgreSQL and the
    # SQLite test DB (the two disagree on NULLS FIRST/LAST for ORDER BY DESC).
    # Scored users first (best rating first, id tie-break), unscored after by name.
    scored = sorted(
        (r for r in rows if r.knowledge_rating is not None),
        key=lambda r: (-r.knowledge_rating, r.id),
    )
    unscored = sorted(
        (r for r in rows if r.knowledge_rating is None),
        key=lambda r: r.username.lower(),
    )

    entries = []
    me = None
    for i, r in enumerate(scored):
        is_me = r.id == current_user.id
        entries.append({
            "rank": i + 1,
            "username": r.username,
            "is_verified": r.is_verified,
            "rating": round(r.knowledge_rating),
            "is_me": is_me,
        })
        if is_me:
            me = {"rank": i + 1, "rating": round(r.knowledge_rating), "username": r.username}
    for r in unscored:
        entries.append({
            "rank": None,
            "username": r.username,
            "is_verified": r.is_verified,
            "rating": None,
            "is_me": r.id == current_user.id,
        })

    return {"scope": "friends", "entries": entries, "me": me, "total": len(rows), "truncated": truncated}


@router.get("/train/leaderboard")
def get_leaderboard(
    scope: str = "global",
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Rank users by the unified knowledge score for the Train tab leaderboard.

    scope=global (default): the top LEADERBOARD_LIMIT scored users, plus the
    caller's own rank line (`me`) when they are logged in and scored, so a player
    outside the top N still sees where they stand. Served from a short-TTL
    in-process cache; open to guests (like /stats/global).

    scope=friends: the caller plus the accounts they follow, ranked among
    themselves; requires a logged-in caller (401 otherwise) and is rate limited.
    Unscored friends are listed with a null rating and no rank so they still
    appear.
    """
    if scope not in ("global", "friends"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown scope.")

    if scope == "friends":
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Log in to see the friends leaderboard.",
            )
        check_rate_limit(current_user.id, "train_leaderboard", 60, 60)
        return _friends_leaderboard(db, current_user)

    me_id = current_user.id if current_user is not None else None
    snap = _global_leaderboard(db)
    entries = [
        {
            "rank": e["rank"],
            "username": e["username"],
            "is_verified": e["is_verified"],
            "rating": e["rating"],
            "is_me": e["user_id"] == me_id,
        }
        for e in snap["top"]
    ]
    me = None
    if current_user is not None and current_user.knowledge_rating is not None:
        mine = current_user.knowledge_rating
        # Rank = 1 + how many scored users sit strictly above me (bisect_right
        # counts ratings <= mine, so total - that = those strictly greater).
        rank = 1 + (snap["total"] - bisect_right(snap["ratings_asc"], mine))
        me = {"rank": rank, "rating": round(mine), "username": current_user.username}
    return {
        "scope": "global",
        "entries": entries,
        "me": me,
        "total": snap["total"],
        "truncated": snap["total"] > LEADERBOARD_LIMIT,
    }
