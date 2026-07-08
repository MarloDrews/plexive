from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..elo import apply_answer_timed, elo_summary
from ..models import User
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
