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

from sqlalchemy import func  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Event, Interest, Post  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

# One interest so create_post's slug validation has something to accept.
_seed_db = SessionLocal()
if not _seed_db.query(Interest).filter_by(slug="philosophy").first():
    _seed_db.add(Interest(name="Philosophy", slug="philosophy"))
    _seed_db.commit()
_seed_db.close()

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

# --- private account CONTENT privacy (M117) --------------------------------------
# author is private (set above) and stranger (now "stranger.2") is an accepted
# follower. A published post by a private author must be reachable only to the
# owner and accepted followers, and must be absent from For You and search.
db = SessionLocal()
private_post = Post(
    format="facts", title="Private author secret fact",
    feed_card={"essence": "a uniquely findable phrase zqxjk"}, sections=[],
    author_id=author["user"]["id"], status="published", is_user_content=True,
)
db.add(private_post)
db.commit()
priv_id = private_post.id
db.close()

outsider = register("outsider@example.com", "outsider")

# by id
r = client.get(f"/api/posts/{priv_id}")
check("anon cannot fetch a private author's post by id", r.status_code == 404, r.text)
r = client.get(f"/api/posts/{priv_id}", headers=auth(outsider["access_token"]))
check("non-follower cannot fetch a private author's post by id", r.status_code == 404, r.text)
r = client.get(f"/api/posts/{priv_id}", headers=auth(stranger["access_token"]))
check("accepted follower can fetch a private author's post by id", r.status_code == 200, r.text)
r = client.get(f"/api/posts/{priv_id}", headers=auth(author["access_token"]))
check("owner can fetch own private post by id", r.status_code == 200, r.text)

# single-user feed
r = client.get("/api/feed/user/author", headers=auth(outsider["access_token"]))
check("non-follower gets no private-author posts in the single-user feed",
      r.status_code == 200 and all(p["id"] != priv_id for p in r.json()), r.text)
r = client.get("/api/feed/user/author", headers=auth(stranger["access_token"]))
check("accepted follower sees the private author's single-user feed",
      r.status_code == 200 and any(p["id"] == priv_id for p in r.json()), r.text)

# For You
r = client.get("/api/feed", headers=auth(outsider["access_token"]))
check("private author's post absent from For You for a non-follower",
      r.status_code == 200 and all(p["id"] != priv_id for p in r.json()), r.text)
r = client.get("/api/feed", headers=auth(author["access_token"]))
check("owner sees own private post in For You",
      r.status_code == 200 and any(p["id"] == priv_id for p in r.json()), r.text)

# search
r = client.get("/api/search", params={"q": "zqxjk"}, headers=auth(outsider["access_token"]))
check("private author's post absent from search for a non-follower",
      r.status_code == 200 and all(p["id"] != priv_id for p in r.json()), r.text)
r = client.get("/api/search", params={"q": "zqxjk"}, headers=auth(stranger["access_token"]))
check("accepted follower can find the private author's post in search",
      r.status_code == 200 and any(p["id"] == priv_id for p in r.json()), r.text)
r = client.get("/api/search", params={"q": "zqxjk"})
check("private author's post absent from search for anon",
      r.status_code == 200 and all(p["id"] != priv_id for p in r.json()), r.text)

# --- verified badge no longer grants publish or admin (M116) ---------------------
# A fresh user with only the cosmetic badge (is_verified) must NOT be able to
# publish immediately or verify others; those are the can_publish / is_admin
# capabilities now.
badge_only = register("badge@example.com", "badgeonly")
db = SessionLocal()
from app.models import User as _User  # noqa: E402
bu = db.query(_User).filter(_User.id == badge_only["user"]["id"]).first()
bu.is_verified = 2  # badge only, no can_publish, no is_admin
db.commit()
db.close()

# badge-only user's post lands in pending (can_publish is False). A facts post
# with a body validates without the full Books section set.
facts_payload = {
    "format": "facts",
    "title": "Badge only fact",
    "feed_card": {"headline": "Badge only fact", "essence": "e"},
    "sections": [{"type": "heart", "order": 1, "content": "Some body text here."}],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=facts_payload, headers=auth(badge_only["access_token"]))
check("badge-only user's post is created", r.status_code == 201, r.text)
check("badge alone does not grant immediate publish (post is pending)",
      r.status_code == 201 and r.json()["status"] == "pending", r.text)

# badge-only user cannot verify others (admin capability required)
r = client.patch(f"/api/admin/users/{stranger['user']['id']}/verify",
                 headers=auth(badge_only["access_token"]))
check("badge alone does not grant admin verify (403)", r.status_code == 403, r.text)

# an admin CAN verify, the response carries no email/id, and level is not downgraded
db = SessionLocal()
# promote a separate account to admin for the positive path
admin_user = register("adminuser@example.com", "adminuser")
au = db.query(_User).filter(_User.id == admin_user["user"]["id"]).first()
au.is_admin = True
# make the target a level-2 user to prove verify does not downgrade
target2 = db.query(_User).filter(_User.id == outsider["user"]["id"]).first()
target2.is_verified = 2
db.commit()
db.close()

r = client.patch(f"/api/admin/users/{outsider['user']['id']}/verify",
                 headers=auth(admin_user["access_token"]))
body = r.json()
check("admin verify succeeds", r.status_code == 200, r.text)
check("verify response is a public projection (no email/id)",
      "email" not in body and "id" not in body, str(body))
check("verify does not downgrade a level-2 user", body.get("is_verified") == 2, str(body))

# --- events lockdown (M119) ------------------------------------------------------
# A published, public post to like/view against.
db = SessionLocal()
public_post = Post(
    format="facts", title="Public likeable fact",
    feed_card={"essence": "e"}, sections=[],
    author_id=admin_user["user"]["id"], status="published", is_user_content=True,
)
db.add(public_post)
db.commit()
pub_post_id = public_post.id
db.close()

# anonymous like is rejected, not stored
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "like"}])
check("anonymous like is rejected (not stored)",
      r.status_code == 200 and r.json()["stored"] == 0 and r.json()["rejected"] == 1, r.text)
r = client.get(f"/api/posts/{pub_post_id}/likes")
check("anonymous like did not increment the count", r.json()["count"] == 0, r.text)

# anonymous view is still accepted
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "view"}])
check("anonymous view is still stored", r.status_code == 200 and r.json()["stored"] == 1, r.text)

# unknown event_type is rejected by the schema
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "boost"}])
check("unknown event_type rejected by the allowlist", r.status_code == 422, r.text)

# duration_ms above int32 is clamped, not a 500
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "view", "duration_ms": 5_000_000_000}])
check("oversized duration_ms is clamped, not a 500", r.status_code == 200 and r.json()["stored"] == 1, r.text)
db = SessionLocal()
max_dur = db.query(func.max(Event.duration_ms)).scalar()
db.close()
check("stored duration_ms is within the clamp", max_dur is not None and max_dur <= 4 * 60 * 60 * 1000, str(max_dur))

# authenticated like counts once even when submitted twice (structural dedup)
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "like"}], headers=auth(stranger["access_token"]))
check("authenticated like stored once", r.status_code == 200 and r.json()["stored"] == 1, r.text)
r = client.post("/api/events", json=[{"post_id": pub_post_id, "event_type": "like"}], headers=auth(stranger["access_token"]))
check("repeat authenticated like is deduped", r.status_code == 200 and r.json()["stored"] == 0, r.text)
r = client.get(f"/api/posts/{pub_post_id}/likes", headers=auth(stranger["access_token"]))
check("like count reflects exactly one like", r.json()["count"] == 1 and r.json()["liked"] is True, r.text)

# --- train correctness is server-side (M120) -------------------------------------
trainer = register("trainer@example.com", "trainer")
# A wrong choice answer must grade as incorrect even though the client used to
# assert correctness; the body no longer carries a `correct` field at all.
r = client.post("/api/train/answer",
                json={"question_id": "geo-sun-rise", "chosen_index": 0, "answer_ms": 1000},
                headers=auth(trainer["access_token"]))
check("train wrong answer graded incorrect server-side",
      r.status_code == 200 and r.json()["correct"] is False, r.text)
# A correct choice answer grades correct.
r = client.post("/api/train/answer",
                json={"question_id": "sci-planet-red", "chosen_index": 1, "answer_ms": 1000},
                headers=auth(trainer["access_token"]))
check("train correct answer graded correct server-side",
      r.status_code == 200 and r.json()["correct"] is True, r.text)
# A correct numeric answer grades correct via the step-scaled match.
r = client.post("/api/train/answer",
                json={"question_id": "geo-continents", "chosen_value": 7, "answer_ms": 1000},
                headers=auth(trainer["access_token"]))
check("train numeric answer graded correct server-side",
      r.status_code == 200 and r.json()["correct"] is True, r.text)
# An unknown question id cannot score.
r = client.post("/api/train/answer",
                json={"question_id": "does-not-exist", "chosen_index": 0, "answer_ms": 1000},
                headers=auth(trainer["access_token"]))
check("train unknown question id rejected", r.status_code == 400, r.text)

print(f"\nAll {PASS} security checks passed.")
