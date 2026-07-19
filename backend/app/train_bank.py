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

import math
from typing import Optional

# difficulty: 1|2|3. kind: "choice" (answer_index), "numeric" (answer_value +
# min + max + step) or "map" (answer_lat + answer_lng, graded by great-circle
# distance). Numeric and map answers earn GRADED points (0..MAX_POINTS) that
# rise as the guess nears the answer (see the scoring helpers below); choice is
# all-or-nothing. "max" is now required on every numeric entry -- graded scoring
# measures the miss as a fraction of the slider's full range.
TRAIN_QUESTIONS: dict[str, dict] = {
    # -------- Difficulty 1 --------
    "geo-continents": {"difficulty": 1, "kind": "numeric", "answer_value": 7, "min": 1, "max": 12, "step": 1},
    "sci-water-state": {"difficulty": 1, "kind": "numeric", "answer_value": 100, "min": 0, "max": 200, "step": 5},
    "math-half-of-50": {"difficulty": 1, "kind": "numeric", "answer_value": 25, "min": 0, "max": 100, "step": 1},
    "lang-plural-mouse": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-sun-rise": {"difficulty": 1, "kind": "choice", "answer_index": 2},
    "sci-bee-makes": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "logic-days-week": {"difficulty": 1, "kind": "numeric", "answer_value": 7, "min": 1, "max": 14, "step": 1},
    "color-mix-primary": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 2 --------
    "geo-capital-australia": {"difficulty": 2, "kind": "choice", "answer_index": 2},
    "sci-planet-red": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-ww2-end": {"difficulty": 2, "kind": "numeric", "answer_value": 1945, "min": 1930, "max": 1960, "step": 1},
    "math-percent-of-200": {"difficulty": 2, "kind": "numeric", "answer_value": 30, "min": 0, "max": 100, "step": 5},
    "lang-synonym-rapid": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-largest-organ": {"difficulty": 2, "kind": "choice", "answer_index": 2},
    "geo-longest-river": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "logic-next-even": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 3 --------
    "sci-speed-of-light": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "hist-french-revolution": {"difficulty": 3, "kind": "numeric", "answer_value": 1789, "min": 1700, "max": 1850, "step": 1},
    "math-prime-check": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "sci-element-symbol-na": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "geo-country-most-population": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "lang-antonym-scarce": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-photosynthesis-gas": {"difficulty": 3, "kind": "choice", "answer_index": 2},
    "logic-clock-angle": {"difficulty": 3, "kind": "numeric", "answer_value": 90, "min": 0, "max": 180, "step": 15},
    # -------- Map picker (drop a pin; graded by distance from the target) ------
    "geo-map-eiffel": {"difficulty": 2, "kind": "map", "answer_lat": 48.8584, "answer_lng": 2.2945},
    "geo-map-pyramids": {"difficulty": 2, "kind": "map", "answer_lat": 29.9792, "answer_lng": 31.1342},
    "geo-map-kilimanjaro": {"difficulty": 3, "kind": "map", "answer_lat": -3.0674, "answer_lng": 37.3556},
    "geo-map-sydney-opera": {"difficulty": 2, "kind": "map", "answer_lat": -33.8568, "answer_lng": 151.2153},
    "geo-map-statue-liberty": {"difficulty": 2, "kind": "map", "answer_lat": 40.6892, "answer_lng": -74.0445},
    "geo-map-taj-mahal": {"difficulty": 3, "kind": "map", "answer_lat": 27.1751, "answer_lng": 78.0421},
}


# --- Graded scoring (numeric + map) --------------------------------------
#
# A near miss earns partial credit that rises as the guess approaches the answer,
# instead of the old all-or-nothing match. Points are an integer 0..MAX_POINTS:
# full marks at the exact answer, then halving over a fixed "half-life" of
# distance. Choice questions stay MAX_POINTS or 0.
#
# Mirrors frontend/src/lib/train/scoring.ts EXACTLY (same constants + rounding),
# so a client renders the same number the server grades. Round-half-up matches
# JS Math.round for the non-negative values here (Python's round is banker's).

MAX_POINTS = 100
# Numeric: points halve for every 10% of the slider's full range you are off.
NUMERIC_HALFLIFE_FRAC = 0.10
# Map: points halve for every 2000 km between your pin and the target.
MAP_HALFLIFE_KM = 2000.0
# Mean Earth radius (km) for the great-circle (haversine) distance.
_EARTH_RADIUS_KM = 6371.0088


def _round_half_up(x: float) -> int:
    """Round half up; x is always >= 0 here so floor(x + 0.5) matches JS
    Math.round (Python's built-in round is banker's rounding)."""
    return int(math.floor(x + 0.5))


def _decay_points(distance: float, half_life: float) -> int:
    """Graded points: MAX_POINTS at distance 0, halving every `half_life`."""
    if half_life <= 0:
        return MAX_POINTS if distance <= 0 else 0
    return _round_half_up(MAX_POINTS * 0.5 ** (distance / half_life))


def _numeric_points(chosen: float, answer: float, minimum: float, maximum: float) -> int:
    """Points for a numeric (slider) guess, by how far off it is as a fraction
    of the slider's full range."""
    span = maximum - minimum
    if not (span > 0):
        return MAX_POINTS if chosen == answer else 0
    frac = min(1.0, abs(chosen - answer) / span)
    return _decay_points(frac, NUMERIC_HALFLIFE_FRAC)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def _map_points(lat: float, lng: float, ans_lat: float, ans_lng: float) -> int:
    """Points for a map-pin guess, by great-circle distance from the target."""
    return _decay_points(_haversine_km(lat, lng, ans_lat, ans_lng), MAP_HALFLIFE_KM)


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


# --- Per-question time limit (Arena shot clock) --------------------------
#
# The Arena plays in lockstep: every player answers the SAME question within a
# per-question time limit, then the round resolves for everyone at once
# (routers/arena.py). The limit is longer for harder questions and for the kinds
# that take longer to answer (dropping a map pin, dialling a slider). Only the
# server needs this -- it runs the shot clock and sends the value to the clients
# in the round_start frame -- so it lives here, not in the frontend pool.
#
# A question may override the computed value with an explicit "seconds" key in
# TRAIN_QUESTIONS for a genuine one-off; otherwise the difficulty/kind formula
# below decides.

# Base seconds by difficulty (1|2|3): easier questions get less time.
DIFFICULTY_SECONDS = {1: 20, 2: 30, 3: 40}
# Extra seconds for kinds that take longer to answer than a tap.
KIND_SECONDS_BONUS = {"map": 15, "numeric": 5}
# Fallback if a question has an unexpected difficulty (should not happen).
DEFAULT_SECONDS = 30


def question_seconds(question_id: str) -> int:
    """The answer time limit for one question, in whole seconds. An explicit
    "seconds" on the bank entry wins; otherwise it is the difficulty base plus a
    per-kind bonus. Unknown ids fall back to DEFAULT_SECONDS so a stray id never
    hands out an unbounded round."""
    q = TRAIN_QUESTIONS.get(question_id)
    if q is None:
        return DEFAULT_SECONDS
    override = q.get("seconds")
    if isinstance(override, int) and override > 0:
        return override
    base = DIFFICULTY_SECONDS.get(q.get("difficulty"), DEFAULT_SECONDS)
    return base + KIND_SECONDS_BONUS.get(q.get("kind"), 0)


def grade(
    question_id: str,
    chosen_index: Optional[int] = None,
    chosen_value: Optional[float] = None,
    chosen_lat: Optional[float] = None,
    chosen_lng: Optional[float] = None,
) -> Optional[dict]:
    """Grade one Train/Arena answer against the bank.

    Returns {"difficulty": int, "points": int, "correct": bool} or None if
    question_id is unknown (the caller turns None into a 400 so garbage ids
    never score). `points` is 0..MAX_POINTS: choice is all-or-nothing, numeric
    and map earn graded partial credit (_numeric_points / _map_points). `correct`
    (full marks) is kept for callers that still score on a boolean -- the solo
    Train marathon (routers/train.py) and the tests.

    The lat/lng params default to None so the Train endpoint's existing
    three-argument call keeps working: a map question with no pin scores 0."""
    q = TRAIN_QUESTIONS.get(question_id)
    if q is None:
        return None
    kind = q["kind"]
    if kind == "numeric":
        points = 0 if chosen_value is None else _numeric_points(
            chosen_value, q["answer_value"], q["min"], q["max"]
        )
    elif kind == "map":
        points = 0 if (chosen_lat is None or chosen_lng is None) else _map_points(
            chosen_lat, chosen_lng, q["answer_lat"], q["answer_lng"]
        )
    else:
        points = MAX_POINTS if (chosen_index is not None and chosen_index == q["answer_index"]) else 0
    return {"difficulty": q["difficulty"], "points": points, "correct": points >= MAX_POINTS}
