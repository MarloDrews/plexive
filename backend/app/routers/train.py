from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..elo import apply_answer_timed, elo_summary
from ..models import User
from ..rate_limit import check_rate_limit

router = APIRouter(tags=["train"])


class TrainAnswerIn(BaseModel):
    difficulty: int = Field(ge=1, le=3)
    correct: bool
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

    SECURITY CAVEAT (mock phase): correctness is decided CLIENT-SIDE and trusted
    here, because there is no server-side Train question bank yet. This mirrors
    the existing note in mobile/src/types/train.ts. When a real Train backend
    exists, correctness MUST be decided server-side (as /quiz/answer already does)
    and `correct` must no longer be taken from the client.
    """
    check_rate_limit(current_user.id, "train_answer", 120, 60)

    delta = apply_answer_timed(
        db, current_user, body.difficulty, body.correct, body.answer_ms
    )
    db.commit()

    global_rating = elo_summary(db, current_user.id)
    return {
        "rating": global_rating,
        "delta": round(delta, 1),
        "global_rating": global_rating,
    }
