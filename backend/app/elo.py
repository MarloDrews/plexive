"""Elo-style knowledge score.

Each user has ONE unified knowledge rating (the profile "Knowledge score" and the
Train Elo are the same number), stored on `users.knowledge_rating` and starting at
1000 on the first scored answer. Every quiz/Train question acts as an opponent
whose rating is derived from difficulty: 1 -> 800, 2 -> 1000, 3 -> 1200.

Standard Elo update: R' = R + K * (S - E) where S is 1 (correct) or 0 (wrong)
and E = 1 / (1 + 10^((Q - R) / 400)) is the expected score against a question
rated Q. Wrong answers therefore always cost points, so guessing has a cost.

K is 32 for a user's first 30 scored answers (ratings converge quickly while
provisional) and 16 afterwards (stable scores move slowly). Ratings are floored
at 100 so a losing streak can never produce absurd negative numbers.

The Train marathon layers a time bonus on top of a correct gain (faster correct
answers earn more); it only ever ADDS to a correct delta. This mirrors the
client-side simulator in mobile/src/lib/train/elo.ts so the number behaves the
same wherever it is updated.
"""

from sqlalchemy.orm import Session

from .models import User

START_RATING = 1000.0
FLOOR_RATING = 100.0
K_PROVISIONAL = 32.0
K_STABLE = 16.0
PROVISIONAL_ANSWERS = 30

DIFFICULTY_RATING = {1: 800.0, 2: 1000.0, 3: 1200.0}

# Train time bonus (mirrors mobile/src/lib/train/elo.ts): full bonus at/under
# FAST_MS, none at/over SLOW_MS, linear in between. Only sweetens a correct gain.
FAST_MS = 3000
SLOW_MS = 15000
TIME_BONUS_MAX = 0.5


def question_rating(post_difficulty) -> float:
    return DIFFICULTY_RATING.get(post_difficulty, DIFFICULTY_RATING[2])


def expected_score(user_rating: float, q_rating: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((q_rating - user_rating) / 400.0))


def time_factor(answer_ms: int) -> float:
    if answer_ms <= FAST_MS:
        return 1.0
    if answer_ms >= SLOW_MS:
        return 0.0
    return (SLOW_MS - answer_ms) / (SLOW_MS - FAST_MS)


def _update(user: User, post_difficulty, correct: bool, time_bonus: float) -> float:
    """Core Elo update against the user's single rating. Returns the delta.

    `time_bonus` is the extra fraction (0..TIME_BONUS_MAX) added to a correct
    gain; pass 0 for plain (post-quiz) scoring. Caller commits.
    """
    rating = user.knowledge_rating if user.knowledge_rating is not None else START_RATING
    k = K_PROVISIONAL if user.knowledge_answered_count < PROVISIONAL_ANSWERS else K_STABLE
    expected = expected_score(rating, question_rating(post_difficulty))
    actual = 1.0 if correct else 0.0
    base = k * (actual - expected)
    delta = base * (1.0 + time_bonus) if correct else base
    user.knowledge_rating = max(FLOOR_RATING, rating + delta)
    user.knowledge_answered_count += 1
    return delta


def apply_answer(db: Session, user: User, post_difficulty, correct: bool) -> float:
    """Post-quiz scoring (no time bonus). Returns the rating delta. Caller commits."""
    return _update(user, post_difficulty, correct, time_bonus=0.0)


def apply_answer_timed(db: Session, user: User, difficulty, correct: bool, answer_ms: int) -> float:
    """Train marathon scoring: core delta plus a speed bonus on correct answers."""
    bonus = TIME_BONUS_MAX * time_factor(answer_ms) if correct else 0.0
    return _update(user, difficulty, correct, time_bonus=bonus)


def elo_summary(db: Session, user_id: int) -> int | None:
    """The user's single knowledge rating, rounded, or None before the first
    scored answer.

    The per-format breakdown died with the move to the unified score on the
    user row; responses no longer carry a formats dict (the always-empty
    compatibility dict is gone from the contract).
    """
    user = db.query(User).filter(User.id == user_id).first()
    rating = user.knowledge_rating if user else None
    return round(rating) if rating is not None else None
