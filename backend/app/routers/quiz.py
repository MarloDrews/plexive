from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..elo import apply_answer, elo_summary
from ..models import Post, QuizAnswer, User
from ..rate_limit import check_rate_limit
from ._shared import get_target_user, get_visible_post

router = APIRouter(tags=["quiz"])


class QuizAnswerIn(BaseModel):
    post_id: int
    question_index: int
    chosen_index: int


def _get_quiz_items(post: Post) -> list[dict]:
    for section in (post.sections or []):
        if section.get("type") == "quiz":
            return section.get("content") or []
    return []


def _elo_payload(db: Session, user_id: int, fmt: str, delta: float) -> dict:
    # The score is now a single unified rating, so `rating` and `global_rating`
    # are the same number; `format` is kept for response-shape compatibility.
    global_rating, _ = elo_summary(db, user_id)
    return {
        "format": fmt,
        "rating": global_rating,
        "delta": round(delta, 1),
        "global_rating": global_rating,
    }


@router.post("/quiz/answer")
def answer_quiz_question(
    body: QuizAnswerIn,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    post = get_visible_post(body.post_id, db, current_user)

    items = _get_quiz_items(post)
    if not 0 <= body.question_index < len(items):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid question index.")
    if body.chosen_index not in (0, 1, 2, 3):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid option index.")

    item = items[body.question_index]
    correct_index = item.get("answer_index")
    # Correctness is decided here, server-side; answer_index never reaches the client.
    correct = body.chosen_index == correct_index

    result = {
        "correct": correct,
        "correct_index": correct_index,
        "explanation": item.get("explanation"),
        "already_answered": False,
        "scored": False,
        "elo": None,
    }

    if current_user is None:
        return result

    check_rate_limit(current_user.id, "quiz_answer", 60, 60)

    existing = db.query(QuizAnswer).filter(
        QuizAnswer.user_id == current_user.id,
        QuizAnswer.post_id == post.id,
        QuizAnswer.question_index == body.question_index,
    ).first()
    if existing:
        # Replay of an answered question: report the stored attempt, never re-score.
        result["correct"] = existing.is_correct
        result["already_answered"] = True
        result["scored"] = existing.rating_delta != 0.0
        result["elo"] = _elo_payload(db, current_user.id, post.format, 0.0)
        return result

    # Authors know their own answers, so their own posts never move their Elo.
    is_own_post = post.author_id == current_user.id
    delta = 0.0
    if not is_own_post:
        difficulty = (post.feed_card or {}).get("post_difficulty")
        delta = apply_answer(db, current_user, difficulty, correct)
        result["scored"] = True

    db.add(QuizAnswer(
        user_id=current_user.id,
        post_id=post.id,
        question_index=body.question_index,
        chosen_index=body.chosen_index,
        is_correct=correct,
        rating_delta=delta,
    ))
    db.commit()

    result["elo"] = _elo_payload(db, current_user.id, post.format, delta)
    return result


@router.get("/quiz/state/{post_id}")
def get_quiz_state(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = get_visible_post(post_id, db, current_user)

    items = _get_quiz_items(post)
    answers = db.query(QuizAnswer).filter(
        QuizAnswer.user_id == current_user.id,
        QuizAnswer.post_id == post_id,
    ).all()

    out = []
    for a in answers:
        if not 0 <= a.question_index < len(items):
            continue
        item = items[a.question_index]
        out.append({
            "question_index": a.question_index,
            "chosen_index": a.chosen_index,
            "correct": a.is_correct,
            "correct_index": item.get("answer_index"),
            "explanation": item.get("explanation"),
        })
    return {"answers": out}


@router.get("/users/{username}/elo")
def get_user_elo(username: str, db: Session = Depends(get_db)):
    user = get_target_user(username, db)
    global_rating, formats = elo_summary(db, user.id)
    return {
        "global_rating": global_rating,
        "formats": formats,
    }
