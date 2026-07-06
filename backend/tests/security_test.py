"""Security regression test against a throwaway database.

Run from anywhere:
    .venv\\Scripts\\python.exe tests\\security_test.py

Covers the fixes from the June 2026 security review: pending-post visibility
(comments/likes), event batch validation, username format, login rate
limiting, search query caps, and private-account follower list access.
Same throwaway-DB pattern as smoke_test.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 — must run before any app import

os.environ.setdefault("JWT_SECRET", "security-test-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Post  # noqa: E402

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


author = register("author@example.com", "author")
stranger = register("stranger@example.com", "stranger")

# A pending post, inserted directly (the API path requires full Books sections).
db = SessionLocal()
pending = Post(
    format="books", title="Pending draft", feed_card={}, sections=[],
    author_id=author["user"]["id"], status="pending", is_user_content=True,
)
db.add(pending)
db.commit()
pending_id = pending.id
db.close()

# --- pending-post visibility ---------------------------------------------------

r = client.get(f"/api/posts/{pending_id}/comments", headers=auth(stranger["access_token"]))
check("stranger cannot list comments on a pending post", r.status_code == 404, r.text)

r = client.get(f"/api/posts/{pending_id}/comments", headers=auth(author["access_token"]))
check("author can list comments on own pending post", r.status_code == 200, r.text)

r = client.post(f"/api/posts/{pending_id}/comments", json={"body": "sneaky"}, headers=auth(stranger["access_token"]))
check("stranger cannot comment on a pending post", r.status_code == 404, r.text)

r = client.get(f"/api/posts/{pending_id}/likes", headers=auth(stranger["access_token"]))
check("stranger cannot read likes of a pending post", r.status_code == 404, r.text)

r = client.get(f"/api/posts/{pending_id}/likes", headers=auth(author["access_token"]))
check("author can read likes of own pending post", r.status_code == 200, r.text)

# quiz/state must follow the same rule (no existence oracle for pending ids).
r = client.get(f"/api/quiz/state/{pending_id}", headers=auth(stranger["access_token"]))
check("stranger cannot read quiz state of a pending post", r.status_code == 404, r.text)

r = client.get(f"/api/quiz/state/{pending_id}", headers=auth(author["access_token"]))
check("author can read quiz state of own pending post", r.status_code == 200, r.text)

# --- events validation -----------------------------------------------------------

r = client.post("/api/events", json=[{"post_id": pending_id, "event_type": "view"}] * 51)
check("event batch larger than 50 rejected", r.status_code == 422, r.text)

r = client.post("/api/events", json=[{"post_id": 999999, "event_type": "like"}])
check("events for nonexistent posts dropped", r.status_code == 200 and r.json()["stored"] == 0, r.text)

# stored-count must not reveal whether a pending post id exists.
r = client.post("/api/events", json=[{"post_id": pending_id, "event_type": "view"}])
check("events give no existence oracle for pending posts", r.status_code == 200 and r.json()["stored"] == 0, r.text)

r = client.post("/api/events", json=[{"post_id": pending_id, "event_type": "view"}], headers=auth(author["access_token"]))
check("author events on own pending post still stored", r.status_code == 200 and r.json()["stored"] == 1, r.text)

# --- username format (forward-only) ----------------------------------------------

r = client.post("/api/auth/register", json={
    "email": "weird@example.com", "username": "a b/c<script>", "password": "password123",
})
check("register rejects invalid username format", r.status_code == 422, r.text)

r = client.post("/api/auth/register", json={
    "email": "weird@example.com", "username": "ab", "password": "password123",
})
check("register rejects too-short username", r.status_code == 422, r.text)

r = client.patch("/api/auth/me", json={"username": "x y z"}, headers=auth(stranger["access_token"]))
check("username change rejects invalid format", r.status_code == 422, r.text)

r = client.patch("/api/auth/me", json={"username": "stranger.2"}, headers=auth(stranger["access_token"]))
check("username change accepts valid format", r.status_code == 200, r.text)

# --- login rate limit -------------------------------------------------------------

for _ in range(10):
    client.post("/api/auth/login", json={"email": "victim@example.com", "password": "wrongwrong"})
r = client.post("/api/auth/login", json={"email": "victim@example.com", "password": "wrongwrong"})
check("login attempts rate limited per email", r.status_code == 429, r.text)

# --- search caps ------------------------------------------------------------------

r = client.get("/api/search", params={"q": "x" * 101})
check("overlong post search query returns nothing", r.status_code == 200 and r.json() == [], r.text)

r = client.get("/api/search/users", params={"q": "x" * 101})
check("overlong user search query returns nothing", r.status_code == 200 and r.json() == [], r.text)

# --- private account follower lists ------------------------------------------------

r = client.patch("/api/auth/me", json={"is_private": True}, headers=auth(author["access_token"]))
assert r.status_code == 200, r.text
r = client.post("/api/users/author/follow", headers=auth(stranger["access_token"]))
assert r.status_code == 200 and r.json()["status"] == "pending", r.text
r = client.post("/api/users/stranger.2/follow/accept", headers=auth(author["access_token"]))
assert r.status_code == 200, r.text

r = client.get("/api/users/author/followers", headers=auth(author["access_token"]))
check("private user sees own followers list", r.status_code == 200 and len(r.json()) == 1, r.text)

r = client.get("/api/users/author/followers")
check("anonymous cannot see private user's followers", r.status_code == 200 and r.json() == [], r.text)

# --- response shape: no sensitive fields -------------------------------------------

r = client.get("/api/users/author/profile")
profile = r.json()
check("public profile leaks no email or password hash",
      "email" not in profile and "password_hash" not in profile and "id" not in profile, str(profile))

r = client.get("/api/search/users", params={"q": "stranger"})
row = r.json()[0]
check("user search leaks no email or password hash",
      "email" not in row and "password_hash" not in row, str(row))

print(f"\nAll {PASS} security checks passed.")
