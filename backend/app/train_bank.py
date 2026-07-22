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

The pool is 100 HARD questions (the earlier easy starter pool was removed), so
the three tiers read as hard (1) / harder (2) / expert (3). The tier still drives
the Elo opponent rating and the Arena shot clock, so the spread is kept.
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
    # -------- Difficulty 1: hard --------
    "sci-krebs-location": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "hist-westphalia-year": {"difficulty": 1, "kind": "numeric", "answer_value": 1648, "min": 1500, "max": 1800, "step": 1},
    "lit-ulysses-author": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-avogadro-exponent": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-deepest-trench": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "math-derivative-lnx": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "econ-gini-meaning": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-dna-base-pair-adenine": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "hist-magna-carta-year": {"difficulty": 1, "kind": "numeric", "answer_value": 1215, "min": 1100, "max": 1400, "step": 1},
    "lang-algebra-origin": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-carbon14-halflife": {"difficulty": 1, "kind": "numeric", "answer_value": 5730, "min": 1000, "max": 12000, "step": 10},
    "music-bach-period": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "cs-quicksort-average": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-doubly-landlocked": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-ph-hcl": {"difficulty": 1, "kind": "numeric", "answer_value": 2, "min": 0, "max": 14, "step": 0.5},
    "art-guernica-painter": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-quartz-mohs": {"difficulty": 1, "kind": "numeric", "answer_value": 7, "min": 1, "max": 10, "step": 1},
    "lang-medieval-lingua-franca": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-hormuz-connects": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "sci-neutral-particle": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "hist-moonwalkers-count": {"difficulty": 1, "kind": "numeric", "answer_value": 12, "min": 0, "max": 30, "step": 1},
    "phil-categorical-imperative": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "cs-tcp-osi-layer": {"difficulty": 1, "kind": "numeric", "answer_value": 4, "min": 1, "max": 7, "step": 1},
    "sci-universal-blood-donor": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "geo-most-time-zones": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "hist-hundred-years-war-length": {"difficulty": 1, "kind": "numeric", "answer_value": 116, "min": 50, "max": 150, "step": 1},
    "lit-1984-published": {"difficulty": 1, "kind": "numeric", "answer_value": 1949, "min": 1930, "max": 1970, "step": 1},
    "sci-atomic-number-7": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    "math-factorial-seven": {"difficulty": 1, "kind": "numeric", "answer_value": 5040, "min": 0, "max": 10000, "step": 10},
    "geo-largest-lake": {"difficulty": 1, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 2: harder --------
    "sci-uncertainty-pair": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-versailles-year": {"difficulty": 2, "kind": "numeric", "answer_value": 1919, "min": 1900, "max": 1950, "step": 1},
    "cs-hash-collision-chaining": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-mitochondria-ancestor": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "geo-fourteen-borders": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "math-euler-identity": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "lit-churchill-nobel": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-speed-of-sound": {"difficulty": 2, "kind": "numeric", "answer_value": 343, "min": 0, "max": 1000, "step": 1},
    "hist-constantinople-fell": {"difficulty": 2, "kind": "numeric", "answer_value": 1453, "min": 1300, "max": 1600, "step": 1},
    "econ-stagflation": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-enzyme-suffix": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "geo-atacama-country": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "cs-acid-isolation": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-receding-galaxies": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-rosetta-scripts": {"difficulty": 2, "kind": "numeric", "answer_value": 3, "min": 1, "max": 6, "step": 1},
    "lang-cyrillic-namesake": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "math-golden-ratio": {"difficulty": 2, "kind": "numeric", "answer_value": 1.618, "min": 0, "max": 5, "step": 0.001},
    "sci-largest-internal-organ": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-bronze-alloy": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "geo-prime-meridian": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "sci-planck-magnitude": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "cs-rsa-hardness": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "hist-cuban-missile-crisis": {"difficulty": 2, "kind": "numeric", "answer_value": 1962, "min": 1945, "max": 1990, "step": 1},
    "lit-divine-comedy-parts": {"difficulty": 2, "kind": "numeric", "answer_value": 3, "min": 1, "max": 6, "step": 1},
    "sci-scurvy-vitamin": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "geo-longest-land-border": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    "math-birthday-paradox": {"difficulty": 2, "kind": "numeric", "answer_value": 23, "min": 2, "max": 100, "step": 1},
    "sci-red-cell-lifespan": {"difficulty": 2, "kind": "numeric", "answer_value": 120, "min": 1, "max": 365, "step": 5},
    "hist-gutenberg-press": {"difficulty": 2, "kind": "numeric", "answer_value": 1440, "min": 1300, "max": 1600, "step": 5},
    "lang-esperanto-creator": {"difficulty": 2, "kind": "choice", "answer_index": 1},
    # -------- Difficulty 3: expert --------
    "cs-utf8-max-bytes": {"difficulty": 3, "kind": "numeric", "answer_value": 4, "min": 1, "max": 8, "step": 1},
    "sci-most-abundant-noble-gas": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "geo-nile-basin-countries": {"difficulty": 3, "kind": "numeric", "answer_value": 11, "min": 1, "max": 20, "step": 1},
    "math-riemann-critical-line": {"difficulty": 3, "kind": "numeric", "answer_value": 0.5, "min": 0, "max": 2, "step": 0.1},
    "hist-defenestration-prague": {"difficulty": 3, "kind": "numeric", "answer_value": 1618, "min": 1500, "max": 1700, "step": 1},
    "cs-halting-problem": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-cmb-temperature": {"difficulty": 3, "kind": "numeric", "answer_value": 2.7, "min": 0, "max": 10, "step": 0.1},
    "lit-lost-time-author": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "math-eulers-number": {"difficulty": 3, "kind": "numeric", "answer_value": 2.718, "min": 0, "max": 5, "step": 0.001},
    "sci-dna-unwinding-enzyme": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "geo-highest-capital": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "hist-rome-sacked-410": {"difficulty": 3, "kind": "numeric", "answer_value": 410, "min": 200, "max": 700, "step": 5},
    "phil-veil-of-ignorance": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-fermi-paradox": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "cs-millennium-prize": {"difficulty": 3, "kind": "numeric", "answer_value": 1000000, "min": 0, "max": 5000000, "step": 100000},
    "sci-strongest-force": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "lang-finnish-family": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "math-reals-uncountable": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "hist-first-circumnavigation": {"difficulty": 3, "kind": "numeric", "answer_value": 1522, "min": 1450, "max": 1600, "step": 1},
    "sci-molar-volume-stp": {"difficulty": 3, "kind": "numeric", "answer_value": 22.4, "min": 0, "max": 50, "step": 0.1},
    "geo-major-tectonic-plates": {"difficulty": 3, "kind": "numeric", "answer_value": 7, "min": 1, "max": 20, "step": 1},
    "econ-keynes-recession": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-crispr-enzyme": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "lit-waste-land-author": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "cs-turing-award": {"difficulty": 3, "kind": "choice", "answer_index": 1},
    "sci-absolute-zero-celsius": {"difficulty": 3, "kind": "numeric", "answer_value": -273.15, "min": -300, "max": 0, "step": 0.05},
    "hist-suez-crisis": {"difficulty": 3, "kind": "numeric", "answer_value": 1956, "min": 1930, "max": 1980, "step": 1},
    "sci-lanthanide-count": {"difficulty": 3, "kind": "numeric", "answer_value": 15, "min": 5, "max": 30, "step": 1},
    # -------- Map picker (drop a pin; graded by distance from the target) ------
    "geo-map-machu-picchu": {"difficulty": 2, "kind": "map", "answer_lat": -13.1631, "answer_lng": -72.545},
    "geo-map-petra": {"difficulty": 3, "kind": "map", "answer_lat": 30.3285, "answer_lng": 35.4444},
    "geo-map-angkor-wat": {"difficulty": 3, "kind": "map", "answer_lat": 13.4125, "answer_lng": 103.867},
    "geo-map-easter-island": {"difficulty": 3, "kind": "map", "answer_lat": -27.1127, "answer_lng": -109.3497},
    "geo-map-timbuktu": {"difficulty": 3, "kind": "map", "answer_lat": 16.7666, "answer_lng": -3.0026},
    "geo-map-ushuaia": {"difficulty": 3, "kind": "map", "answer_lat": -54.8019, "answer_lng": -68.303},
    "geo-map-reykjavik": {"difficulty": 2, "kind": "map", "answer_lat": 64.1466, "answer_lng": -21.9426},
    "geo-map-cape-good-hope": {"difficulty": 2, "kind": "map", "answer_lat": -34.3568, "answer_lng": 18.474},
    "geo-map-everest": {"difficulty": 2, "kind": "map", "answer_lat": 27.9881, "answer_lng": 86.925},
    "geo-map-vladivostok": {"difficulty": 3, "kind": "map", "answer_lat": 43.1155, "answer_lng": 131.8855},
    "geo-map-astana": {"difficulty": 3, "kind": "map", "answer_lat": 51.1694, "answer_lng": 71.4491},
    "geo-map-galapagos": {"difficulty": 3, "kind": "map", "answer_lat": -0.75, "answer_lng": -90.3167},
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
