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
    # post_difficulty comes from arbitrary feed_card JSON; an unhashable value
    # (list/dict) would raise inside dict.get, so fall back to the medium rating.
    try:
        return DIFFICULTY_RATING.get(post_difficulty, DIFFICULTY_RATING[2])
    except TypeError:
        return DIFFICULTY_RATING[2]


def expected_score(user_rating: float, q_rating: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((q_rating - user_rating) / 400.0))


def time_factor(answer_ms: int) -> float:
    if answer_ms <= FAST_MS:
        return 1.0
    if answer_ms >= SLOW_MS:
        return 0.0
    return (SLOW_MS - answer_ms) / (SLOW_MS - FAST_MS)


def _update(db: Session, user: User, post_difficulty, correct: bool, time_bonus: float) -> float:
    """Core Elo update against the user's single rating. Returns the delta the
    rating ACTUALLY moved (after the floor clamp, BUG-078), so stored and
    displayed deltas always sum to the rating.

    Re-reads the row under a row lock first (BUG-028/M144): two concurrent
    scored answers (rapid Train play, two tabs) would otherwise both read the
    same rating and the last commit would silently drop one delta and one
    answered_count increment. The lock holds until the caller commits;
    SQLite (tests) ignores FOR UPDATE, where its single-writer file lock
    covers the same race.

    `time_bonus` is the extra fraction (0..TIME_BONUS_MAX) added to a correct
    gain; pass 0 for plain (post-quiz) scoring. Caller commits.
    """
    db.refresh(user, with_for_update=True)
    rating = user.knowledge_rating if user.knowledge_rating is not None else START_RATING
    k = K_PROVISIONAL if user.knowledge_answered_count < PROVISIONAL_ANSWERS else K_STABLE
    expected = expected_score(rating, question_rating(post_difficulty))
    actual = 1.0 if correct else 0.0
    base = k * (actual - expected)
    delta = base * (1.0 + time_bonus) if correct else base
    new_rating = max(FLOOR_RATING, rating + delta)
    user.knowledge_rating = new_rating
    user.knowledge_answered_count += 1
    return new_rating - rating


def apply_answer(db: Session, user: User, post_difficulty, correct: bool) -> float:
    """Post-quiz scoring (no time bonus). Returns the rating delta. Caller commits."""
    return _update(db, user, post_difficulty, correct, time_bonus=0.0)


def apply_answer_timed(db: Session, user: User, difficulty, correct: bool, answer_ms: int) -> float:
    """Train marathon scoring: core delta plus a speed bonus on correct answers."""
    bonus = TIME_BONUS_MAX * time_factor(answer_ms) if correct else 0.0
    return _update(db, user, difficulty, correct, time_bonus=bonus)


def match_delta(
    rating: float,
    answered_count: int,
    score: float,
    opponents: list[tuple[float, float]],
) -> float:
    """One player's rating change from a finished Arena match (placement-based).

    A free-for-all is scored as the round-robin it effectively is: the player
    meets every opponent once, taking 1 / 0.5 / 0 for a higher / equal / lower
    score, and the usual Elo expectation is taken against that opponent's
    rating. The pairwise deltas are averaged (not summed) so a 4-player match
    moves a rating about as much as one duel would -- otherwise Arena would
    swing ratings three times faster than every other scored surface.

    `opponents` is (rating, score) per opponent, all snapshotted BEFORE any
    rating in the match is written, so the result does not depend on the order
    the four players are updated in.
    """
    if not opponents:
        return 0.0
    k = K_PROVISIONAL if answered_count < PROVISIONAL_ANSWERS else K_STABLE
    total = 0.0
    for opp_rating, opp_score in opponents:
        if score > opp_score:
            actual = 1.0
        elif score == opp_score:
            actual = 0.5
        else:
            actual = 0.0
        total += actual - expected_score(rating, opp_rating)
    return k * total / len(opponents)


def apply_match(db: Session, entries: list[tuple[User, float]]) -> dict[int, tuple[float, float]]:
    """Apply one finished Arena match to every participant's knowledge_rating.

    `entries` is (user, score) per player. Returns {user_id: (new_rating,
    effective_delta)}; the delta is post-floor-clamp (BUG-078) so a stored or
    displayed delta always reconciles with the rating.

    Rows are locked in ascending user id order: four players finishing at once
    is the normal case here, and two matches sharing a player would otherwise
    be free to grab the same rows in opposite orders and deadlock. Ratings are
    read into a snapshot before any write, so every player is scored against
    the ratings that entered the match. Caller commits.
    """
    ordered = sorted(entries, key=lambda e: e[0].id)
    for user, _ in ordered:
        db.refresh(user, with_for_update=True)

    snapshot = {
        user.id: (
            user.knowledge_rating if user.knowledge_rating is not None else START_RATING,
            user.knowledge_answered_count,
            score,
        )
        for user, score in ordered
    }

    out: dict[int, tuple[float, float]] = {}
    for user, score in ordered:
        rating, answered, _ = snapshot[user.id]
        opponents = [
            (opp_rating, opp_score)
            for uid, (opp_rating, _, opp_score) in snapshot.items()
            if uid != user.id
        ]
        delta = match_delta(rating, answered, score, opponents)
        new_rating = max(FLOOR_RATING, rating + delta)
        user.knowledge_rating = new_rating
        # A rated match counts as one scored event toward the provisional K
        # window, the same way a single question does.
        user.knowledge_answered_count += 1
        out[user.id] = (new_rating, new_rating - rating)
    return out


def elo_summary(user: User) -> int | None:
    """The user's single knowledge rating, rounded, or None before the first
    scored answer.

    Takes the already-loaded User row: every caller holds one, so the old
    by-id variant paid a redundant SELECT per scored answer / elo view. The
    per-format breakdown died with the move to the unified score on the user
    row; responses no longer carry a formats dict.
    """
    rating = user.knowledge_rating
    return round(rating) if rating is not None else None
