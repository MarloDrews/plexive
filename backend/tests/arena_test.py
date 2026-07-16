"""End-to-end Arena websocket test: the ranked 1v1v1v1 free-for-all.

Covers: the client/server question-sequence parity that server-side grading
rests on; four queued players matched into ONE match with a shared seed;
server-side grading (a client cannot assert its own correctness, M120/SEC-007);
sequence position owned by the server (replayed / skipped / out-of-range index
rejected); opponent_progress relay; placement standings with ties sharing a
placement; placement-based rating deltas written to knowledge_rating; queue
guards (double queue, queueing mid-match) and cancel; the waiting-room roster
re-broadcast to everyone queued on every join and leave.

Run with: venv\\Scripts\\python.exe tests\\arena_test.py
"""

import json
import os
import sys
import threading
import time
from contextlib import ExitStack

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _throwaway_db  # noqa: F401, must run before any app import

os.environ.setdefault("JWT_SECRET", "arena-test-secret-arena-test-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.train_bank import TRAIN_QUESTIONS, grade, sequence_ids  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

# A missing frame would otherwise park forever inside a blocking receive_json,
# with no output to show for it. Fail the run loudly instead.
_watchdog = threading.Timer(90, lambda: os._exit(1))
_watchdog.daemon = True
_watchdog.start()

PASS = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS
    if not condition:
        raise AssertionError(f"FAIL: {name} {detail}")
    PASS += 1
    print(f"ok: {name}")


def register(email: str, username: str) -> dict:
    r = client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    # The register response carries the token, not the username; keep the name
    # alongside it so the checks below can talk about players by name.
    return {**r.json(), "username": username}


def ws_auth(ws, token: str) -> dict:
    ws.send_text(json.dumps({"type": "auth", "token": token}))
    return ws.receive_json()


def answer_frame(match_id: str, qid: str, index: int, correct: bool) -> dict:
    """An answer frame for question `qid`, deliberately full marks or zero.

    Scoring is now graded (a near miss earns partial points), so "wrong" here
    means a MAXIMAL miss that scores exactly 0, keeping the score-spread math
    below a clean multiple of MAX_POINTS: numeric far outside the slider range
    (clamps to the worst miss), map at the antipode (~20000 km away)."""
    q = TRAIN_QUESTIONS[qid]
    frame = {"type": "answer", "match_id": match_id, "index": index}
    kind = q["kind"]
    if kind == "numeric":
        if correct:
            frame["chosen_value"] = q["answer_value"]
        else:
            frame["chosen_value"] = q["answer_value"] + 10 * (q["max"] - q["min"]) + 100
    elif kind == "map":
        if correct:
            frame["chosen_lat"] = q["answer_lat"]
            frame["chosen_lng"] = q["answer_lng"]
        else:
            frame["chosen_lat"] = -q["answer_lat"]
            lng = q["answer_lng"]
            frame["chosen_lng"] = lng - 180 if lng >= 0 else lng + 180
    else:
        frame["chosen_index"] = q["answer_index"] if correct else q["answer_index"] + 1
    return frame


def drain_until(ws, wanted: str, timeout: float = 12.0) -> dict:
    """Next frame of type `wanted`, skipping unrelated relay traffic."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        frame = ws.receive_json()
        if frame.get("type") == wanted:
            return frame
        if frame.get("type") == "error":
            raise AssertionError(f"unexpected error frame while awaiting {wanted}: {frame}")
    raise AssertionError(f"timed out waiting for {wanted}")


# --- sequence parity ------------------------------------------------------
# Server-side grading is only correct if the server's sequence is the client's
# sequence. The exact JS<->Python agreement is pinned by a fixed vector here;
# the frontend math lives in lib/prng.ts + lib/battle/seededQuestions.ts.
check("sequence is deterministic", sequence_ids(12345, 7) == sequence_ids(12345, 7))
check("sequence length honours count", len(sequence_ids(42, 7)) == 7)
check("sequence differs by seed", sequence_ids(1, 7) != sequence_ids(2, 7))
check("sequence draws from the bank", all(q in TRAIN_QUESTIONS for q in sequence_ids(7, 7)))
check("sequence has no repeats", len(set(sequence_ids(99, 7))) == 7)
# Vector captured from the real frontend math (node, mulberry32 + seededShuffle
# over mockQuestions in file order). If this breaks, client and server disagree
# about what question index N is and every rated grade is wrong.
check(
    "JS parity vector (seed 12345)",
    sequence_ids(12345, 7) == [
        "sci-bee-makes", "lang-synonym-rapid", "geo-map-eiffel", "logic-clock-angle",
        "geo-continents", "math-half-of-50", "geo-sun-rise",
    ],
    str(sequence_ids(12345, 7)),
)

# --- graded scoring (numeric + map partial credit) ------------------------
# A near miss earns partial points that rise as the guess nears the answer; an
# exact answer is full marks, a maximal miss is zero. grade() mirrors the
# frontend scoring (frontend/src/lib/train/scoring.ts) so the client renders the
# same number the server grades.
check("choice right is full marks", grade("geo-sun-rise", chosen_index=2)["points"] == 100)
check("choice wrong is zero", grade("geo-sun-rise", chosen_index=0)["points"] == 0)
check("numeric exact is full marks", grade("sci-water-state", chosen_value=100)["points"] == 100)
_near_num = grade("sci-water-state", chosen_value=110)  # 10 off on a 0..200 slider
check("numeric near miss is partial", 0 < _near_num["points"] < 100, str(_near_num))
check("numeric far miss is zero", grade("sci-water-state", chosen_value=99999)["points"] == 0)
check("map exact is full marks", grade("geo-map-eiffel", chosen_lat=48.8584, chosen_lng=2.2945)["points"] == 100)
_near_map = grade("geo-map-eiffel", chosen_lat=45.0, chosen_lng=5.0)  # a few hundred km off
check("map near miss is partial", 0 < _near_map["points"] < 100, str(_near_map))
check("map antipode is zero", grade("geo-map-eiffel", chosen_lat=-48.8584, chosen_lng=-177.7055)["points"] == 0)

users = [
    register("arena.alice@example.com", "a_alice"),
    register("arena.bob@example.com", "a_bob"),
    register("arena.carol@example.com", "a_carol"),
    register("arena.dave@example.com", "a_dave"),
]

# `with client:` is load-bearing, not tidiness: it runs the app lifespan, and
# the Arena matchmaker is a lifespan background task. Without it nothing ever
# pairs and every socket waits on a match_start that cannot come.
with client, ExitStack() as stack:
    sockets = [stack.enter_context(client.websocket_connect("/api/arena/ws")) for _ in users]
    for ws, u in zip(sockets, users):
        check(f"{u['username']} auth_ok", ws_auth(ws, u["access_token"])["type"] == "auth_ok")

    # --- queueing ---------------------------------------------------------
    for ws in sockets:
        ws.send_text(json.dumps({"type": "queue"}))
    queued = [drain_until(ws, "queued") for ws in sockets]
    check("all four queued", all(q["type"] == "queued" for q in queued))
    check("queued reports the lobby size needed", queued[0]["needed"] == 4)
    check("unrated player queues at the start rating", queued[0]["rating"] == 1000)

    # --- the matchmaker forms one match for all four ----------------------
    starts = [drain_until(ws, "match_start") for ws in sockets]
    seeds = {s["seed"] for s in starts}
    ids = {s["match_id"] for s in starts}
    check("all four land in one match", len(ids) == 1, str(ids))
    check("all four share the seed", len(seeds) == 1, str(seeds))
    check("match_start lists every player", len(starts[0]["players"]) == 4)
    check(
        "match_start names all four",
        {p["username"] for p in starts[0]["players"]} == {u["username"] for u in users},
    )
    match_id = starts[0]["match_id"]
    seed = starts[0]["seed"]
    qids = sequence_ids(seed, 7)

    # --- the server owns sequence position --------------------------------
    sockets[0].send_text(json.dumps(answer_frame(match_id, qids[3], 3, True)))
    err = drain_until(sockets[0], "error")
    check("answering out of order rejected", err.get("code") == "bad_index")

    sockets[0].send_text(json.dumps({"type": "answer", "match_id": "not-a-match", "index": 0, "chosen_index": 0}))
    err = drain_until(sockets[0], "error")
    check("stale match_id rejected", err.get("code") == "stale_match")

    sockets[0].send_text(json.dumps({"type": "answer", "match_id": match_id, "index": 99, "chosen_index": 0}))
    err = drain_until(sockets[0], "error")
    check("out-of-range index rejected", err["type"] == "error")

    # --- grading is server-side -------------------------------------------
    # A deliberately wrong answer must come back correct:false. There is no
    # `correct` or `score` field a client could send instead (contrast Battle,
    # which relays a client-computed correct for its unrated duel).
    sockets[0].send_text(json.dumps(answer_frame(match_id, qids[0], 0, False)))
    res = drain_until(sockets[0], "answer_result")
    check("wrong answer graded false by the server", res["correct"] is False)
    check("wrong answer awards no points", res["awarded"] == 0)
    check("wrong answer does not score", res["score"] == 0)

    sockets[0].send_text(json.dumps(answer_frame(match_id, qids[1], 1, True)))
    res = drain_until(sockets[0], "answer_result")
    check("right answer graded true by the server", res["correct"] is True)
    check("right answer awards full points", res["awarded"] == 100)
    check("right answer scores the points total", res["score"] == 100)

    # An answer relays to the other three.
    prog = drain_until(sockets[1], "opponent_progress")
    check("progress relayed to opponents", prog["username"] == "a_alice")
    check("relayed progress carries the match_id", prog["match_id"] == match_id)

    # --- play the match out to distinct scores ----------------------------
    # alice already has 1/2 answered (wrong, right). Target finals:
    # alice 6, bob 7, carol 3, dave 3  -> bob 1st, alice 2nd, carol/dave tie 3rd.
    targets = {0: 6, 1: 7, 2: 3, 3: 3}
    progress = {0: 2, 1: 0, 2: 0, 3: 0}
    correct_so_far = {0: 1, 1: 0, 2: 0, 3: 0}

    for p in range(4):
        while progress[p] < 7:
            i = progress[p]
            want_right = correct_so_far[p] < targets[p]
            sockets[p].send_text(json.dumps(answer_frame(match_id, qids[i], i, want_right)))
            res = drain_until(sockets[p], "answer_result")
            if want_right:
                correct_so_far[p] += 1
            check_ok = res["correct"] is want_right
            if not check_ok:
                raise AssertionError(f"player {p} index {i}: expected correct={want_right}, got {res}")
            progress[p] += 1

    check("scores land on the intended spread", correct_so_far == {0: 6, 1: 7, 2: 3, 3: 3})

    # --- results ----------------------------------------------------------
    results = [drain_until(ws, "match_result") for ws in sockets]
    standings = results[0]["standings"]
    check("result lists all four", len(standings) == 4)
    by_name = {s["username"]: s for s in standings}
    check("winner is 1st", by_name["a_bob"]["placement"] == 1)
    check("runner-up is 2nd", by_name["a_alice"]["placement"] == 2)
    check("ties share a placement", by_name["a_carol"]["placement"] == 3 and by_name["a_dave"]["placement"] == 3)
    check("scores reported as graded points", by_name["a_bob"]["score"] == 700 and by_name["a_carol"]["score"] == 300)
    check("winner gains rating", by_name["a_bob"]["delta"] > 0)
    check("last place loses rating", by_name["a_dave"]["delta"] < 0)
    check("tied players get the same delta", by_name["a_carol"]["delta"] == by_name["a_dave"]["delta"])
    check("every player is told which row is theirs", sum(1 for s in standings if s["is_me"]) == 1)
    check(
        "each socket sees itself flagged",
        [next(s["username"] for s in r["standings"] if s["is_me"]) for r in results]
        == [u["username"] for u in users],
    )

    # --- ratings actually persisted --------------------------------------
    db = SessionLocal()
    try:
        rows = {u.username: u for u in db.query(User).filter(User.username.in_([x["username"] for x in users])).all()}
        check("winner's rating rose above start", rows["a_bob"].knowledge_rating > 1000)
        check("last place's rating fell below start", rows["a_dave"].knowledge_rating < 1000)
        check(
            "reported rating matches the DB",
            round(rows["a_bob"].knowledge_rating) == by_name["a_bob"]["rating"],
        )
        check("a rated match counts one scored event", rows["a_bob"].knowledge_answered_count == 1)
    finally:
        db.close()

    # --- queue guards -----------------------------------------------------
    sockets[0].send_text(json.dumps({"type": "queue"}))
    check("re-queue after a finished match is allowed", drain_until(sockets[0], "queued")["type"] == "queued")

    # --- the waiting-room roster ------------------------------------------
    # Fewer than ARENA_PLAYERS are queued from here on, so nothing pairs and the
    # roster holds still long enough to assert on.
    roster = drain_until(sockets[0], "queue_update")
    check("queue_update names who is waiting", [p["username"] for p in roster["players"]] == ["a_alice"], str(roster))
    check("queue_update counts the queue", roster["waiting"] == 1, str(roster))
    check("roster carries the avatar the tile renders", "avatar_url" in roster["players"][0], str(roster))
    sockets[1].send_text(json.dumps({"type": "queue"}))
    roster = drain_until(sockets[0], "queue_update")
    check(
        "a join reaches the players already waiting",
        sorted(p["username"] for p in roster["players"]) == ["a_alice", "a_bob"],
        str(roster),
    )
    sockets[1].send_text(json.dumps({"type": "cancel"}))
    roster = drain_until(sockets[0], "queue_update")
    check(
        "a leave reaches the players still waiting",
        [p["username"] for p in roster["players"]] == ["a_alice"],
        str(roster),
    )

    sockets[0].send_text(json.dumps({"type": "queue"}))
    err = drain_until(sockets[0], "error")
    check("double queue rejected", err.get("code") == "already_queued")
    sockets[0].send_text(json.dumps({"type": "cancel"}))
    check("cancel leaves the queue", drain_until(sockets[0], "queue_cancelled")["type"] == "queue_cancelled")

print(f"\n{PASS} checks passed")
