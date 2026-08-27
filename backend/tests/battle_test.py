"""End-to-end battle websocket test for the M142 state machine.

Covers: challenge -> battle_start with a shared seed + battle_id on both
sides; mutual-challenge convergence onto ONE room (BUG-010); progress relay
stamped with the battle_id; stale-battle frames rejected (BUG-087); busy and
offline challenge outcomes with the reason field (BUG-041 copy fix); a
mid-battle challenger rejected (BUG-038); both finish frames tearing the room
down so finished players are challengeable again (ARCH-004/BUG-041);
disconnect and socket-takeover teardown notifying the abandoned partner
(BUG-039); not_in_battle errors carrying a machine-readable code (BUG-011);
score/index validation rejecting bool and out-of-range values (BUG-086).

Run with: .venv\\Scripts\\python.exe tests\\battle_test.py
"""

import faulthandler
import json
import os
import sys
import threading
from contextlib import ExitStack

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _throwaway_db  # noqa: F401, must run before any app import

os.environ.setdefault("JWT_SECRET", "battle-test-secret-battle-test-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

# A missing frame would otherwise park forever inside a blocking receive_json,
# with no output to show for it. Fail the run loudly instead, and leave a stack.
#
# 180s, and the binding constraint is LOCAL false positives rather than CI cost.
# In CI this watchdog earns little: timeout --signal=ABRT 300s under
# -X faulthandler already produces the same all-thread stack, so here it only
# makes that stack arrive sooner, and 180s out of a 300s per-suite budget and a
# 20-minute job ceiling costs nothing. Its unique value is local, where none of
# that instrumentation runs -- and local is where the margin is thin. 180s is
# about 5.7x the worst healthy run measured: 31.5s on a 12-core laptop
# deliberately oversubscribed with 12 concurrent test processes, against ~2.7s
# in CI. The dangerous direction is DOWN, exactly as for the 300s: a watchdog
# that fires on a slow-but-healthy run is a gate that gets switched off. At 90s
# the local margin was only 2.9x, which is why this is 180 and not 90.
#
# A hang here reports FAIL at 180s rather than TIMEOUT at 300s; the announcement
# below is what tells the reader which one it was.
_WATCHDOG_SECONDS = 180


def _watchdog_fire() -> None:
    print(
        f"\nWATCHDOG: battle_test.py hit its {_WATCHDOG_SECONDS}s limit and is presumed "
        "hung. This is the watchdog firing, NOT an assertion failing. Exiting 1, "
        "so the suite loop counts it as FAIL. All-thread stack follows.",
        # os._exit skips every cleanup path, and CI redirects stdout to a file,
        # where it is block-buffered: without this flush every ok: line above
        # dies with the process and the log shows the stack alone.
        flush=True,
    )
    faulthandler.dump_traceback()
    os._exit(1)


_watchdog = threading.Timer(_WATCHDOG_SECONDS, _watchdog_fire)
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
    return r.json()


def ws_auth(ws, token: str) -> dict:
    ws.send_text(json.dumps({"type": "auth", "token": token}))
    return ws.receive_json()


alice = register("battle.alice@example.com", "b_alice")
bob = register("battle.bob@example.com", "b_bob")
carol = register("battle.carol@example.com", "b_carol")
register("battle.dave@example.com", "b_dave")  # never connects: the offline target

with ExitStack() as stack:
    # Enter the client, do not merely construct it. An un-entered TestClient gives
    # every websocket_connect its own portal, its own event loop and its own
    # thread, so a relay from one user's handler into another user's socket is a
    # cross-loop wakeup that anyio can lose: the frame is delivered and the
    # receiving loop is never woken. Every socket must live on ONE event loop.
    # See docs/research/battle-hang-diagnosis-2026-08.md.
    stack.enter_context(client)

    ws_a = stack.enter_context(client.websocket_connect("/api/battle/ws"))
    ws_b = stack.enter_context(client.websocket_connect("/api/battle/ws"))
    check("alice auth_ok", ws_auth(ws_a, alice["access_token"])["type"] == "auth_ok")
    check("bob auth_ok", ws_auth(ws_b, bob["access_token"])["type"] == "auth_ok")

    # --- challenge pairs both sides with one shared seed and battle_id ---
    ws_a.send_text(json.dumps({"type": "challenge", "username": "b_bob"}))
    start_a = ws_a.receive_json()
    start_b = ws_b.receive_json()
    check("challenger receives battle_start", start_a["type"] == "battle_start")
    check("target receives battle_start", start_b["type"] == "battle_start")
    check("both sides share the seed", start_a["seed"] == start_b["seed"])
    check("both sides share the battle_id", start_a["battle_id"] == start_b["battle_id"])
    check("battle_id is non-empty", bool(start_a["battle_id"]))
    check("challenger told the opponent name", start_a["opponent"] == "b_bob")
    check("target told the challenger name", start_b["opponent"] == "b_alice")
    bid = start_a["battle_id"]

    # --- mutual challenge converges on the SAME room (BUG-010) ---
    ws_b.send_text(json.dumps({"type": "challenge", "username": "b_alice"}))
    again_b = ws_b.receive_json()
    again_a = ws_a.receive_json()
    check("counter-challenge reuses the battle_id", again_a["battle_id"] == bid and again_b["battle_id"] == bid)
    check("counter-challenge reuses the seed", again_a["seed"] == start_a["seed"])

    # --- progress relays to the partner, stamped with the battle_id ---
    ws_a.send_text(json.dumps({"type": "progress", "index": 0, "correct": True, "score": 1, "battle_id": bid}))
    prog = ws_b.receive_json()
    check("progress relayed as opponent_progress", prog["type"] == "opponent_progress" and prog["score"] == 1)
    check("relayed progress carries the battle_id", prog["battle_id"] == bid)

    # --- a frame from a battle that is over is dropped (BUG-087) ---
    ws_a.send_text(json.dumps({"type": "progress", "index": 1, "correct": True, "score": 2, "battle_id": "stale-id"}))
    err = ws_a.receive_json()
    check("stale battle_id rejected with code", err["type"] == "error" and err.get("code") == "stale_battle")

    # --- junk values are rejected, not relayed (BUG-086) ---
    ws_a.send_text(json.dumps({"type": "progress", "index": 0, "correct": True, "score": True, "battle_id": bid}))
    check("bool score rejected", ws_a.receive_json()["type"] == "error")
    ws_a.send_text(json.dumps({"type": "progress", "index": 99, "correct": True, "score": 1, "battle_id": bid}))
    check("out-of-range index rejected", ws_a.receive_json()["type"] == "error")

    # --- busy and mid-battle outcomes ---
    ws_c = stack.enter_context(client.websocket_connect("/api/battle/ws"))
    check("carol auth_ok", ws_auth(ws_c, carol["access_token"])["type"] == "auth_ok")
    ws_c.send_text(json.dumps({"type": "challenge", "username": "b_alice"}))
    busy = ws_c.receive_json()
    check("mid-battle target reads busy, not offline", busy["type"] == "opponent_unavailable" and busy.get("reason") == "busy")
    ws_a.send_text(json.dumps({"type": "challenge", "username": "b_carol"}))
    err = ws_a.receive_json()
    check("mid-battle challenger rejected with code", err["type"] == "error" and err.get("code") == "in_battle")

    # --- both finish frames end the room; finished players are free (ARCH-004) ---
    ws_a.send_text(json.dumps({"type": "finish", "score": 5, "battle_id": bid}))
    fin_b = ws_b.receive_json()
    check("finish relayed as opponent_finish", fin_b["type"] == "opponent_finish" and fin_b["score"] == 5)
    ws_b.send_text(json.dumps({"type": "finish", "score": 3, "battle_id": bid}))
    fin_a = ws_a.receive_json()
    check("second finish relayed too", fin_a["type"] == "opponent_finish" and fin_a["score"] == 3)

    ws_c.send_text(json.dumps({"type": "challenge", "username": "b_alice"}))
    start_c = ws_c.receive_json()
    start_a2 = ws_a.receive_json()
    check("finished player is challengeable again", start_c["type"] == "battle_start" and start_a2["type"] == "battle_start")
    check("new battle gets a new battle_id", start_c["battle_id"] != bid)
    bid2 = start_c["battle_id"]

    # --- disconnect tears the room down and notifies the survivor ---
    ws_c.close()
    left = ws_a.receive_json()
    check("survivor gets opponent_left on disconnect", left["type"] == "opponent_left")
    check("opponent_left names the ended battle", left.get("battle_id") == bid2)

    ws_a.send_text(json.dumps({"type": "progress", "index": 0, "correct": False, "score": 0}))
    err = ws_a.receive_json()
    check("progress outside a battle errors with code", err["type"] == "error" and err.get("code") == "not_in_battle")

    # --- socket takeover tears the room down and notifies the partner (BUG-039) ---
    ws_b.send_text(json.dumps({"type": "challenge", "username": "b_alice"}))
    start_b3 = ws_b.receive_json()
    start_a3 = ws_a.receive_json()
    check("fresh battle for the takeover case", start_b3["type"] == "battle_start" and start_a3["type"] == "battle_start")
    ws_b2 = stack.enter_context(client.websocket_connect("/api/battle/ws"))
    check("bob's second socket auths", ws_auth(ws_b2, bob["access_token"])["type"] == "auth_ok")
    left = ws_a.receive_json()
    check("takeover sends opponent_left to the partner", left["type"] == "opponent_left" and left.get("battle_id") == start_a3["battle_id"])

    # --- offline target reads offline (reason field) ---
    ws_a.send_text(json.dumps({"type": "challenge", "username": "b_dave"}))
    off = ws_a.receive_json()
    check("offline target reads offline", off["type"] == "opponent_unavailable" and off.get("reason") == "offline")

print(f"\nAll {PASS} battle checks passed.")
