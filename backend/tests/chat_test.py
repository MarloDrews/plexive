"""Chat end-to-end test against a throwaway database.

Run from anywhere:
    .venv\\Scripts\\python.exe tests\\chat_test.py

Covers: conversation creation rules (follow gate, private accounts, DM
dedupe, groups), message history authorization, and the WebSocket flow
(first-frame JWT auth, send/receive, live broadcast, non-participant and
unauthenticated rejection). Same throwaway-DB pattern as smoke_test.py.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 — must run before any app import

os.environ.setdefault("JWT_SECRET", "chat-test-secret")

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

PASS = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS
    assert condition, f"FAIL: {name} {detail}"
    PASS += 1
    print(f"ok: {name}")


def register(email: str, username: str) -> dict:
    r = client.post("/api/auth/register", json={
        "email": email, "username": username, "password": "password123",
    })
    assert r.status_code == 201, r.text
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def ws_auth(ws, token: str):
    ws.send_text(json.dumps({"type": "auth", "token": token}))
    return ws.receive_json()


alice = register("alice@example.com", "alice")
bob = register("bob@example.com", "bob")
carol = register("carol@example.com", "carol")
dave = register("dave@example.com", "dave")

# --- conversation creation rules -------------------------------------------

r = client.post("/api/chat/conversations", json={"usernames": ["bob"]}, headers=auth(alice["access_token"]))
check("dm blocked without any follow relationship", r.status_code == 403, r.text)

r = client.post("/api/users/bob/follow", headers=auth(alice["access_token"]))
assert r.status_code == 200 and r.json()["status"] == "accepted", r.text

r = client.post("/api/chat/conversations", json={"usernames": ["bob"]}, headers=auth(alice["access_token"]))
check("dm created after accepted follow", r.status_code == 201, r.text)
dm = r.json()
check("dm is not a group", dm["is_group"] is False)
check("dm name is the other user", dm["name"] == "bob")

r = client.post("/api/chat/conversations", json={"usernames": ["alice"]}, headers=auth(bob["access_token"]))
check("dm deduplicated for the same pair (either direction)", r.status_code == 201 and r.json()["id"] == dm["id"], r.text)

# Private account: carol goes private, dave requests, cannot message until accepted.
r = client.patch("/api/auth/me", json={"is_private": True}, headers=auth(carol["access_token"]))
assert r.status_code == 200, r.text
r = client.post("/api/users/carol/follow", headers=auth(dave["access_token"]))
assert r.status_code == 200 and r.json()["status"] == "pending", r.text
r = client.post("/api/chat/conversations", json={"usernames": ["carol"]}, headers=auth(dave["access_token"]))
check("pending follow does not allow messaging a private account", r.status_code == 403, r.text)
r = client.post("/api/users/dave/follow/accept", headers=auth(carol["access_token"]))
assert r.status_code == 200, r.text
r = client.post("/api/chat/conversations", json={"usernames": ["carol"]}, headers=auth(dave["access_token"]))
check("accepted follow allows messaging a private account", r.status_code == 201, r.text)

# Group: alice is connected to bob (follow) but not to dave yet.
r = client.post(
    "/api/chat/conversations",
    json={"usernames": ["bob", "dave"], "name": "study group"},
    headers=auth(alice["access_token"]),
)
check("group blocked when one member has no follow relationship", r.status_code == 403, r.text)

r = client.post("/api/users/alice/follow", headers=auth(dave["access_token"]))
assert r.status_code == 200, r.text
r = client.post(
    "/api/chat/conversations",
    json={"usernames": ["bob", "dave"], "name": "study group"},
    headers=auth(alice["access_token"]),
)
check("group created when all members are connected", r.status_code == 201, r.text)
group = r.json()
check("group flag and name set", group["is_group"] is True and group["name"] == "study group")
check("group has three participants", len(group["participants"]) == 3)

# --- history authorization ---------------------------------------------------

r = client.get(f"/api/chat/conversations/{dm['id']}/messages", headers=auth(alice["access_token"]))
check("participant can read empty history", r.status_code == 200 and r.json() == [], r.text)

r = client.get(f"/api/chat/conversations/{dm['id']}/messages", headers=auth(carol["access_token"]))
check("non-participant gets 404 on history", r.status_code == 404, r.text)

r = client.get(f"/api/chat/conversations/{dm['id']}/messages")
check("anonymous gets 401/403 on history", r.status_code in (401, 403), r.text)

# --- websocket: auth ----------------------------------------------------------

try:
    with client.websocket_connect("/api/chat/ws") as ws:
        ws.send_text(json.dumps({"type": "auth", "token": "not-a-jwt"}))
        ws.receive_json()
    bad_token_rejected = False
except WebSocketDisconnect as exc:
    bad_token_rejected = exc.code == 4401
check("websocket rejects an invalid token with 4401", bad_token_rejected)

try:
    with client.websocket_connect("/api/chat/ws") as ws:
        ws.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": "hi"}))
        ws.receive_json()
    no_auth_rejected = False
except WebSocketDisconnect as exc:
    no_auth_rejected = exc.code == 4401
check("websocket rejects a send before auth with 4401", no_auth_rejected)

# --- websocket: live send/receive --------------------------------------------

with client.websocket_connect("/api/chat/ws") as ws_alice, client.websocket_connect("/api/chat/ws") as ws_bob:
    check("alice auth_ok", ws_auth(ws_alice, alice["access_token"])["type"] == "auth_ok")
    check("bob auth_ok", ws_auth(ws_bob, bob["access_token"])["type"] == "auth_ok")

    ws_alice.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": "hello bob"}))

    echo = ws_alice.receive_json()
    check("sender receives the persisted echo", echo["type"] == "message" and echo["message"]["body"] == "hello bob")
    check("echo carries sender username", echo["message"]["sender_username"] == "alice")

    live = ws_bob.receive_json()
    check("other participant receives the message live", live["type"] == "message" and live["message"]["body"] == "hello bob")

    # Validation errors come back as error frames, nothing is persisted.
    ws_alice.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": ""}))
    check("empty body rejected", ws_alice.receive_json()["type"] == "error")
    ws_alice.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": "x" * 2001}))
    check("overlong body rejected", ws_alice.receive_json()["type"] == "error")
    ws_alice.send_text("this is not json")
    check("non-json frame rejected", ws_alice.receive_json()["type"] == "error")

# Non-participant: carol authenticates fine but cannot send into alice/bob's DM.
with client.websocket_connect("/api/chat/ws") as ws_carol:
    check("carol auth_ok", ws_auth(ws_carol, carol["access_token"])["type"] == "auth_ok")
    ws_carol.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": "let me in"}))
    resp = ws_carol.receive_json()
    check("non-participant send rejected", resp["type"] == "error" and "not found" in resp["detail"].lower(), str(resp))

# The rejected message must not have been persisted.
r = client.get(f"/api/chat/conversations/{dm['id']}/messages", headers=auth(alice["access_token"]))
bodies = [m["body"] for m in r.json()]
check("rejected message was not persisted", bodies == ["hello bob"], str(bodies))

# --- group broadcast ----------------------------------------------------------

with client.websocket_connect("/api/chat/ws") as ws_alice, \
     client.websocket_connect("/api/chat/ws") as ws_bob, \
     client.websocket_connect("/api/chat/ws") as ws_dave:
    ws_auth(ws_alice, alice["access_token"])
    ws_auth(ws_bob, bob["access_token"])
    ws_auth(ws_dave, dave["access_token"])

    ws_bob.send_text(json.dumps({"type": "send", "conversation_id": group["id"], "body": "group hello"}))
    for name, ws in (("bob (echo)", ws_bob), ("alice", ws_alice), ("dave", ws_dave)):
        data = ws.receive_json()
        check(f"group message delivered to {name}", data["type"] == "message" and data["message"]["body"] == "group hello")

# --- conversation list ---------------------------------------------------------

r = client.get("/api/chat/conversations", headers=auth(alice["access_token"]))
check("alice sees both conversations", r.status_code == 200 and len(r.json()) == 2, r.text)
check("most recent conversation first", r.json()[0]["id"] == group["id"])
check("list includes last message preview", r.json()[0]["last_message"]["body"] == "group hello")

r = client.get("/api/chat/conversations", headers=auth(carol["access_token"]))
check("carol sees only her own conversation", len(r.json()) == 1 and r.json()[0]["id"] != dm["id"])

# --- M145: group requests never silently degrade to a DM (decision 11) --------

r = client.post(
    "/api/chat/conversations",
    json={"usernames": ["alice", "bob", "bob"], "name": "Study group"},
    headers=auth(alice["access_token"]),
)
check("group collapsing to one recipient is a 400", r.status_code == 400, r.text)

r = client.post(
    "/api/chat/conversations",
    json={"usernames": ["bob"], "name": "Just us"},
    headers=auth(alice["access_token"]),
)
check("named DM request is a 400", r.status_code == 400, r.text)

# --- M145: the DM pair key is structurally unique (BUG-036) --------------------

from sqlalchemy.exc import IntegrityError  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Conversation  # noqa: E402

db = SessionLocal()
dm_row = db.query(Conversation).filter(Conversation.id == dm["id"]).first()
check("created DM carries the canonical pair key", bool(dm_row.dm_key) and ":" in dm_row.dm_key)
db.add(Conversation(is_group=False, dm_key=dm_row.dm_key, created_by=dm_row.created_by))
try:
    db.commit()
    forked = True
except IntegrityError:
    db.rollback()
    forked = False
check("second conversation for the same pair violates the unique key", not forked)
db.close()

# --- M141: the send broadcast echoes the client correlation tag ---------------

with client.websocket_connect("/api/chat/ws") as ws_alice:
    ws_auth(ws_alice, alice["access_token"])
    ws_alice.send_text(json.dumps({"type": "send", "conversation_id": dm["id"], "body": "tagged", "tag": "tmp-42"}))
    echo = ws_alice.receive_json()
    check("broadcast echoes the client tag", echo.get("tag") == "tmp-42", str(echo))

# --- M147: per-user socket cap + registry cleanup on disconnect ---------------

from app.routers.chat import manager as chat_manager  # noqa: E402

alice_id = ws_auth_user_id = None
with client.websocket_connect("/api/chat/ws") as w1:
    ws_auth_user_id = ws_auth(w1, alice["access_token"])["user_id"]
check(
    "registry entry removed when the socket disconnects",
    ws_auth_user_id not in chat_manager._connections,
)

sockets = []
from contextlib import ExitStack  # noqa: E402

with ExitStack() as stack:
    for i in range(chat_manager.MAX_SOCKETS_PER_USER + 1):
        ws = stack.enter_context(client.websocket_connect("/api/chat/ws"))
        ws_auth(ws, alice["access_token"])
        sockets.append(ws)
    registered = len(chat_manager._connections.get(ws_auth_user_id, []))
    check(
        "per-user sockets capped with oldest evicted",
        registered == chat_manager.MAX_SOCKETS_PER_USER,
        f"registered={registered}",
    )
check(
    "registry entry removed after all sockets close",
    ws_auth_user_id not in chat_manager._connections,
)

print(f"\nAll {PASS} chat checks passed.")
