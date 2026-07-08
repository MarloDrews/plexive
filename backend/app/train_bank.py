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
