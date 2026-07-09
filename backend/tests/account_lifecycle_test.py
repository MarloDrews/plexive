"""End-to-end deleted-account lifecycle test (M150, decision 10).

After DELETE /api/auth/me:
- no personal data remains on the row (email/username scrambled, bio/avatar
  cleared, password hash replaced) and the old email/username are free for
  re-registration (BUG-021);
- the user's PUBLISHED posts survive, attributed to the deleted_user sentinel
  (content stays, identity link severed);
- the profile 404s, the account is gone from user search, and every follow
  edge involving it is removed (lists, counts, request queue: BUG-019/022);
- deactivated accounts and the sentinel never chart in stats leaderboards;
- the reserved lifecycle usernames cannot be registered.

Also freezes the BUG-020 pair: going public bulk-accepts pending follow
requests, and re-following while a request is pending reports "pending", not
"already following".

Run with: .venv\\Scripts\\python.exe tests\\account_lifecycle_test.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _throwaway_db  # noqa: F401, must run before any app import

os.environ.setdefault("JWT_SECRET", "lifecycle-test-secret-lifecycle-test")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Follow, User  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

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


def auth(payload: dict) -> dict:
    return {"Authorization": f"Bearer {payload['access_token']}"}


BOOKS_FEED_CARD = {
    "type": "books",
    "title": "The Vanishing Author",
    "author": "A. Writer",
    "essence": "A book that outlives its poster.",
}


def make_published_post(user_payload: dict) -> int:
    """Publish a post directly through the DB layer (create_post's section
    validation needs a full books skeleton; authorship mechanics are what this
    test is about, not the content schema)."""
    from app.graph_edges import on_post_written
    from app.models import Post

    db = SessionLocal()
    try:
        author = db.query(User).filter(User.username == user_payload["user"]["username"]).first()
        post = Post(
            format="books",
            title=BOOKS_FEED_CARD["title"],
            feed_card=BOOKS_FEED_CARD,
            sections=[],
            status="published",
            is_user_content=True,
            author_id=author.id,
        )
        db.add(post)
        db.flush()
        on_post_written(db, post)
        db.commit()
        return post.id
    finally:
        db.close()


# --- setup: author + follower + a private account ------------------------------

author = register("lifecycle.author@example.com", "lc_author")
follower = register("lifecycle.follower@example.com", "lc_follower")
private = register("lifecycle.private@example.com", "lc_private")
requester = register("lifecycle.requester@example.com", "lc_requester")

r = client.patch("/api/auth/me", json={"is_private": True}, headers=auth(private))
assert r.status_code == 200, r.text

# follower follows the author (accepted, public account) and the author follows back
assert client.post("/api/users/lc_author/follow", headers=auth(follower)).status_code == 200
assert client.post("/api/users/lc_follower/follow", headers=auth(author)).status_code == 200

post_id = make_published_post(author)
r = client.get(f"/api/posts/{post_id}")
check("published post visible before deletion", r.status_code == 200)
check("post attributed to the author before deletion", r.json()["author_username"] == "lc_author")

# --- BUG-020: pending request states -------------------------------------------

r = client.post("/api/users/lc_private/follow", headers=auth(requester))
check("follow on a private account is pending", r.json().get("status") == "pending")
r = client.post("/api/users/lc_private/follow", headers=auth(requester))
check(
    "re-follow while pending reports the pending state",
    r.status_code == 400 and "pending" in r.json()["detail"].lower(),
    r.text,
)
r = client.patch("/api/auth/me", json={"is_private": False}, headers=auth(private))
check("going public succeeds", r.status_code == 200)
r = client.get("/api/users/lc_private/profile", headers=auth(requester))
check("going public accepted the pending request", r.json()["follow_status"] == "accepted", r.text)

# --- reserved lifecycle usernames ----------------------------------------------

r = client.post(
    "/api/auth/register",
    json={"email": "squatter@example.com", "username": "deleted_user", "password": "password123"},
)
check("sentinel username cannot be registered", r.status_code == 422)
r = client.post(
    "/api/auth/register",
    json={"email": "squatter@example.com", "username": "deleted-99", "password": "password123"},
)
check("scramble-pattern username cannot be registered", r.status_code == 422)

# --- the deletion itself --------------------------------------------------------

# A pending follow request from a soon-deleted account must not become a
# zombie in the target's queue (BUG-019): author requests to follow... the
# private account went public above, so use a fresh private target.
zombie_target = register("lifecycle.zombie@example.com", "lc_zombie")
assert client.patch("/api/auth/me", json={"is_private": True}, headers=auth(zombie_target)).status_code == 200
assert client.post("/api/users/lc_zombie/follow", headers=auth(author)).status_code == 200

r = client.request(
    "DELETE", "/api/auth/me",
    json={"current_password": "password123"},
    headers=auth(author),
)
check("account deletion succeeds", r.status_code == 204, r.text)

r = client.get("/api/auth/me", headers=auth(author))
check("deleted account's token is dead", r.status_code == 401)
r = client.post("/api/auth/login", json={"email": "lifecycle.author@example.com", "password": "password123"})
check("deleted account cannot log in", r.status_code == 401)

# personal data gone from the row itself
db = SessionLocal()
row = db.query(User).filter(User.username.like("deleted-%")).first()
check("row scrambled to the deleted-<id> pattern", row is not None and row.username == f"deleted-{row.id}")
check("email scrambled", row.email == f"deleted-{row.id}@deleted.invalid")
check("bio and avatar cleared", row.bio is None and row.avatar_url is None)
check("row deactivated", row.is_active is False or row.is_active == 0)
follow_rows = db.query(Follow).filter(
    (Follow.follower_id == row.id) | (Follow.following_id == row.id)
).count()
check("all follow edges involving the account removed", follow_rows == 0)
db.close()

# content stays, identity severed
r = client.get(f"/api/posts/{post_id}")
check("published post still readable after deletion", r.status_code == 200)
check("post now attributed to the sentinel", r.json()["author_username"] == "deleted_user", r.text)
r = client.get("/api/feed?limit=100")
check("post still in the For You feed", any(p["id"] == post_id for p in r.json()))

# account hidden everywhere
check("profile 404s", client.get("/api/users/lc_author/profile").status_code == 404)
check("sentinel profile 404s too", client.get("/api/users/deleted_user/profile").status_code == 404)
r = client.get("/api/search/users?q=lc_author", headers=auth(follower))
check("old username gone from user search", all(u["username"] != "lc_author" for u in r.json()))
r = client.get("/api/users/lc_follower/followers", headers=auth(follower))
check("follower list holds no dead entry", all(u["username"] != "lc_author" for u in r.json()))
r = client.get("/api/users/lc_zombie/follow-requests", headers=auth(zombie_target))
check("no zombie follow request in the queue (BUG-019)", r.json() == [], r.text)

# email and username are free again (BUG-021)
reborn = register("lifecycle.author@example.com", "lc_author")
check("same email re-registers after deletion", "access_token" in reborn)

# stats never chart the sentinel or deactivated accounts
r = client.get("/api/stats/global")
names = [c["username"] for c in r.json()["top_creators_by_posts"]]
check("sentinel absent from leaderboards", "deleted_user" not in names, str(names))
check("scrambled account absent from leaderboards", not any(n.startswith("deleted-") for n in names), str(names))

print(f"\nAll {PASS} account-lifecycle checks passed.")
