"""Server-side Train question bank and grading (M120/SEC-007).

Correctness for POST /api/train/answer is decided HERE, not taken from the
client, so a player can no longer raise their knowledge_rating by asserting
correct=true. This mirrors how /quiz/answer already grades server-side.

Mock phase: this is a hand-mirrored copy of the frontend pool
(frontend/src/lib/train/mockQuestions.ts) -- the same ids, difficulties and
answers. Keep the two in sync until a real shared question backend exists; the
frontend still SELECTS questions from its local pool and computes its own
display feedback, but the SCORE now comes from this server-side grade. Only the
grading-relevant fields are kept (id, difficulty, kind, and the answer); prompts
and options live on the client.
"""

from typing import Optional

# difficulty: 1|2|3. kind: "choice" (answer_index) or "numeric" (answer_value +
# min + step, graded with the same step-scaled match the slider uses).
TRAIN_QUESTIONS: dict[str, dict] = {
    # -------- Difficulty 1 --------
    "geo-continents": {"difficulty": 1, "kind": "numeric", "answer_value": 7, "min": 1, "step": 1},
    "sci-water-state": {"difficulty": 1, "kind": "numeric", "answer_value": 100, "min": 0, "step": 5},
    "math-half-of-50": {"difficulty": 1, "kind": "numeric", "answer_value": 25, "min": 0, "step": 1},
    "lang-plural-mouse": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-sun-rise": {"difficulty": 1, "kind": "choice", "answer_index": 2},
    "sci-bee-makes": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "logic-days-week": {"difficulty": 1, "kind": "numeric", "answer_value": 7, "min": 1, "step": 1},
    "color-mix-primary": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 2 --------
    "geo-capital-australia": {"difficulty": 2, "kind": "choice", "answer_index": 2},
    "sci-planet-red": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-ww2-end": {"difficulty": 2, "kind": "numeric", "answer_value": 1945, "min": 1930, "step": 1},
    "math-percent-of-200": {"difficulty": 2, "kind": "numeric", "answer_value": 30, "min": 0, "step": 5},
    "lang-synonym-rapid": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-largest-organ": {"difficulty": 2, "kind": "choice", "answer_index": 2},
    "geo-longest-river": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "logic-next-even": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 3 --------
    "sci-speed-of-light": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "hist-french-revolution": {"difficulty": 3, "kind": "numeric", "answer_value": 1789, "min": 1700, "step": 1},
    "math-prime-check": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "sci-element-symbol-na": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "geo-country-most-population": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "lang-antonym-scarce": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-photosynthesis-gas": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "logic-clock-angle": {"difficulty": 3, "kind": "numeric", "answer_value": 90, "min": 0, "step": 15},
}


def _numeric_match(chosen: float, answer: float, minimum: float, step: float) -> bool:
    """Step-scaled numeric match, mirroring frontend/src/lib/train/numeric.ts.
    Every bank answer sits exactly on the min + k*step grid, so no half-rounding
    ambiguity arises between Python's round and JS Math.round here."""
    if not (step > 0):
        return chosen == answer
    return round((chosen - minimum) / step) == round((answer - minimum) / step)


# --- Seeded duel sequence -------------------------------------------------
#
# The Arena (and Battle) clients derive their question sequence locally from a
# server-issued seed: they seed an identical PRNG and shuffle their own copy of
# the pool (frontend/src/lib/battle/seededQuestions.ts). Arena is RATED, so the
# server must know which question sits at each index to grade an answer without
# trusting the client -- that means reproducing the client's shuffle exactly.
#
# Parity rests on two things, both asserted by backend/tests/arena_test.py:
#   1. TRAIN_QUESTIONS is in the SAME ORDER as the frontend `mockQuestions`
#      array (dicts preserve insertion order), so index i means the same
#      question on both sides before the shuffle.
#   2. The math below is a faithful port of mulberry32 + the Fisher-Yates in
#      frontend/src/lib/prng.ts and battle/seededQuestions.ts.
# Changing either side without the other silently desyncs grading, so don't.

_MASK32 = 0xFFFFFFFF


def _i32(x: int) -> int:
    """JS ToInt32: reinterpret the low 32 bits as signed."""
    x &= _MASK32
    return x - 0x100000000 if x & 0x80000000 else x


def _imul(a: int, b: int) -> int:
    """Math.imul on u32 bit patterns, returning u32 bits."""
    return (_i32(a) * _i32(b)) & _MASK32


def _mulberry32(seed: int):
    """Port of mulberry32 from frontend/src/lib/prng.ts. Kept in u32 space
    throughout; JS's int32 coercions are bit-identical to masking here."""
    a = seed & _MASK32

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _MASK32
        t = _imul(a ^ (a >> 15), (1 | a) & _MASK32)
        t = ((t + _imul(t ^ (t >> 7), (61 | t) & _MASK32)) & _MASK32) ^ t
        return ((t ^ (t >> 14)) & _MASK32) / 4294967296

    return rand


def sequence_ids(seed: int, count: int) -> list[str]:
    """The ordered question ids for one duel, identical to the sequence the
    clients derive from the same seed (seededShuffle then slice to count)."""
    out = list(TRAIN_QUESTIONS.keys())
    rand = _mulberry32(seed)
    for i in range(len(out) - 1, 0, -1):
        j = int(rand() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out[:count]


def grade(question_id: str, chosen_index: Optional[int], chosen_value: Optional[float]) -> Optional[dict]:
    """Grade one Train answer against the bank.

    Returns {"difficulty": int, "correct": bool} or None if question_id is
    unknown (the caller turns None into a 400 so garbage ids never score)."""
    q = TRAIN_QUESTIONS.get(question_id)
    if q is None:
        return None
    if q["kind"] == "numeric":
        if chosen_value is None:
            correct = False
        else:
            correct = _numeric_match(chosen_value, q["answer_value"], q["min"], q.get("step", 1))
    else:
        correct = chosen_index is not None and chosen_index == q["answer_index"]
    return {"difficulty": q["difficulty"], "correct": correct}
