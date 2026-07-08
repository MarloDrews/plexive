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
from app.rate_limit import _counters as _rl_counters  # noqa: E402


def reset_rate_limits():
    # The register (10/hr) and login (per-IP) limits accumulate across the many
    # accounts this suite creates; clear the in-memory counters between sections
    # that need a fresh budget (never during the block that asserts a limit).
    _rl_counters.clear()

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

# --- anonymous quiz answer withholds the key (M121) ------------------------------
# A published post with a real quiz item authored by an admin (can publish).
db = SessionLocal()
quiz_post = Post(
    format="facts", title="Quiz post",
    feed_card={"essence": "e"},
    sections=[{"type": "quiz", "order": 1, "content": [
        {"question": "Q?", "options": ["a", "b", "c", "d"], "answer_index": 2, "explanation": "because c"},
    ]}],
    author_id=admin_user["user"]["id"], status="published", is_user_content=True,
)
db.add(quiz_post)
db.commit()
quiz_post_id = quiz_post.id
db.close()

# anonymous caller gets their own correctness but NOT the correct index or explanation
r = client.post("/api/quiz/answer", json={"post_id": quiz_post_id, "question_index": 0, "chosen_index": 0})
body = r.json()
check("anon quiz answer returns own correctness", r.status_code == 200 and body["correct"] is False, r.text)
check("anon quiz answer withholds correct_index", body["correct_index"] is None, str(body))
check("anon quiz answer withholds explanation", body["explanation"] is None, str(body))

# an authenticated caller still gets the key + explanation
r = client.post("/api/quiz/answer", json={"post_id": quiz_post_id, "question_index": 0, "chosen_index": 0},
                headers=auth(trainer["access_token"]))
body = r.json()
check("authed quiz answer reveals correct_index", body["correct_index"] == 2, str(body))
check("authed quiz answer reveals explanation", body["explanation"] == "because c", str(body))

# --- image_url upload-prefix enforced for all formats (M122) ----------------------
# A non-books (facts) post with an external image_url must be rejected, proving
# the check is no longer books-only.
external_img_payload = {
    "format": "facts",
    "title": "External image fact",
    "feed_card": {"headline": "External image fact", "essence": "e"},
    "sections": [{
        "type": "core_ideas", "order": 1,
        "content": [{"title": "t", "body": "b", "image_url": "https://evil.example/x.png"}],
    }],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=external_img_payload, headers=auth(admin_user["access_token"]))
check("non-books external image_url rejected (M122)", r.status_code == 422, r.text)

# --- source/wikipedia URL scheme allowlist (M123) --------------------------------
js_source_payload = {
    "format": "facts",
    "title": "Bad source scheme",
    "feed_card": {"headline": "Bad source scheme", "essence": "e"},
    "sections": [{
        "type": "sources", "order": 1,
        "content": [{"label": "x", "url": "javascript:alert(1)", "type": "article"}],
    }],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=js_source_payload, headers=auth(admin_user["access_token"]))
check("source url with a javascript: scheme rejected (M123)", r.status_code == 422, r.text)

ok_source_payload = {
    "format": "facts",
    "title": "Good source scheme",
    "feed_card": {"headline": "Good source scheme", "essence": "e"},
    "sections": [{
        "type": "sources", "order": 1,
        "content": [{"label": "x", "url": "https://example.org/a", "type": "article"}],
    }],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=ok_source_payload, headers=auth(admin_user["access_token"]))
check("source url with an https scheme accepted (M123)", r.status_code == 201, r.text)

# --- token revocation on password change (M126) ----------------------------------
reset_rate_limits()
pw_user = register("pwchange@example.com", "pwchanger")
old_token = pw_user["access_token"]
# a second concurrent session for the same account
r = client.post("/api/auth/login", json={"email": "pwchange@example.com", "password": "password123"})
second_token = r.json()["access_token"]
check("token valid before password change",
      client.get("/api/auth/me", headers=auth(old_token)).status_code == 200)

r = client.patch("/api/auth/me",
                 json={"current_password": "password123", "new_password": "newpassword123"},
                 headers=auth(old_token))
check("password change returns a fresh token",
      r.status_code == 200 and bool(r.json().get("access_token")), r.text)
fresh_token = r.json()["access_token"]
check("old token revoked after password change",
      client.get("/api/auth/me", headers=auth(old_token)).status_code == 401)
check("other session token revoked after password change",
      client.get("/api/auth/me", headers=auth(second_token)).status_code == 401)
check("fresh token still valid after password change",
      client.get("/api/auth/me", headers=auth(fresh_token)).status_code == 200)

# --- content size caps (M127) ----------------------------------------------------
big_body = "x" * (5 * 1024 * 1024 + 200_000)  # just over the 5 MB sections cap
big_payload = {
    "format": "facts",
    "title": "Too big",
    "feed_card": {"headline": "Too big", "essence": "e"},
    "sections": [{"type": "heart", "order": 1, "content": big_body}],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=big_payload, headers=auth(admin_user["access_token"]))
check("oversized sections rejected (M127)", r.status_code == 422, r.text)

# --- create_post daily slot only after validation passes (BUG-081/M130) ----------
reset_rate_limits()
bad_slug_payload = {
    "format": "facts", "title": "Bad slug",
    "feed_card": {"headline": "Bad slug", "essence": "e"},
    "sections": [{"type": "heart", "order": 1, "content": "body"}],
    "interests": ["nonexistent-slug"],
}
for _ in range(20):
    r = client.post("/api/posts", json=bad_slug_payload, headers=auth(admin_user["access_token"]))
    assert r.status_code == 400, r.text
good_after_fail = {
    "format": "facts", "title": "Valid after failures",
    "feed_card": {"headline": "Valid after failures", "essence": "e"},
    "sections": [{"type": "heart", "order": 1, "content": "body"}],
    "interests": ["philosophy"],
}
r = client.post("/api/posts", json=good_after_fail, headers=auth(admin_user["access_token"]))
check("failed create_post validation does not burn the daily slot (BUG-081)",
      r.status_code == 201, r.text)

# --- streaming body cap without a Content-Length (M131/SEC-022) -------------------
# Drive the ASGI middleware directly with a chunked body (no Content-Length) so
# the streamed-byte cap is exercised, not just the header fast-reject.
import asyncio as _asyncio  # noqa: E402
from app.main import BodySizeLimitMiddleware, MAX_BODY_BYTES  # noqa: E402


async def _drive_body_limit(total_bytes):
    app_reached = {"v": False}

    async def app(scope, receive, send):
        app_reached["v"] = True
        while True:
            m = await receive()
            if not m.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = BodySizeLimitMiddleware(app, MAX_BODY_BYTES)
    remaining = {"v": total_bytes}
    chunk = 1024 * 1024

    async def receive():
        if remaining["v"] <= 0:
            return {"type": "http.request", "body": b"", "more_body": False}
        n = min(chunk, remaining["v"])
        remaining["v"] -= n
        return {"type": "http.request", "body": b"x" * n, "more_body": remaining["v"] > 0}

    status = {"v": None}

    async def send(message):
        if message["type"] == "http.response.start":
            status["v"] = message["status"]

    await mw({"type": "http", "headers": []}, receive, send)
    return status["v"], app_reached["v"]


over_status, over_reached = _asyncio.run(_drive_body_limit(MAX_BODY_BYTES + 5 * 1024 * 1024))
check("chunked body over the cap is rejected 413, app never reached (M131)",
      over_status == 413 and over_reached is False, f"status={over_status} reached={over_reached}")
under_status, under_reached = _asyncio.run(_drive_body_limit(1024))
check("small chunked body passes through to the app (M131)",
      under_status == 200 and under_reached is True, f"status={under_status} reached={under_reached}")

# --- SVG sanitize consistency (M133/SEC-025, SEC-027) ------------------------
from app.routers.posts import _sanitize_json_svgs as _sanitize_fc  # noqa: E402
from app.sanitize import sanitize_svg_text as _sanitize_svg  # noqa: E402

# SEC-027: <use> is no longer whitelisted, so it is stripped from any SVG.
_use_svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
    '<defs><rect id="r" width="4" height="4"/></defs>'
    '<use href="#r"/></svg>'
)
check("<use> element is stripped from sanitized SVG (M133/SEC-027)",
      "<use" not in _sanitize_svg(_use_svg))

# SEC-025: feed_card SVG fields are re-sanitized just like the sections array.
# A script smuggled into cover.svg is removed by the create-time pass.
_fc = {"title": "T", "cover": {"svg": (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
    '<script>alert(1)</script><rect width="4" height="4"/></svg>'
)}}
_clean_fc = _sanitize_fc(_fc)
check("feed_card cover SVG is re-sanitized at create time (M133/SEC-025)",
      "<script" not in _clean_fc["cover"]["svg"], _clean_fc["cover"]["svg"])


# --- image decode hardening (M132/SEC-023, BUG-015/016/017) ------------------
import io as _io  # noqa: E402
from PIL import Image as _PILImage  # noqa: E402
from app import sanitize as _sanitize  # noqa: E402


class _Upload:
    """Minimal stand-in for FastAPI's UploadFile: validate_image only touches
    the sync .file.read() of the underlying spooled file."""

    def __init__(self, data: bytes):
        self.file = _io.BytesIO(data)


def _png_bytes(img) -> bytes:
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# Decompression-bomb guard: temporarily lower the pixel cap and feed an image
# whose header dimensions exceed it. Rejection must happen before the decode.
_orig_cap = _sanitize.MAX_IMAGE_PIXELS
try:
    _sanitize.MAX_IMAGE_PIXELS = 100
    try:
        _sanitize.validate_image(_Upload(_png_bytes(_PILImage.new("RGB", (50, 50)))))
        _bomb_rejected = False
    except ValueError:
        _bomb_rejected = True
finally:
    _sanitize.MAX_IMAGE_PIXELS = _orig_cap
check("oversized image dimensions rejected before decode (M132)", _bomb_rejected)

# Transparency preserved for PNG: a fully transparent RGBA input stays RGBA
# instead of being flattened onto a black background (BUG-016).
_rgba = _PILImage.new("RGBA", (16, 16), (255, 0, 0, 0))
_out, _mt = _sanitize.validate_image(_Upload(_png_bytes(_rgba)))
_reopened = _PILImage.open(_io.BytesIO(_out))
check("PNG transparency is preserved, not flattened to black (M132)",
      _mt == "image/png" and _reopened.mode == "RGBA", f"mode={_reopened.mode}")

# EXIF orientation is baked in so the stored image is upright (BUG-017): a
# 40x20 landscape tagged orientation=6 (rotate 90) is stored transposed as 20x40.
_land = _PILImage.new("RGB", (40, 20), (0, 128, 0))
_exif = _PILImage.Exif()
_exif[0x0112] = 6
_jbuf = _io.BytesIO()
_land.save(_jbuf, format="JPEG", exif=_exif.tobytes())
_out2, _mt2 = _sanitize.validate_image(_Upload(_jbuf.getvalue()))
_re2 = _PILImage.open(_io.BytesIO(_out2))
check("EXIF orientation is applied so stored size is transposed (M132)",
      _re2.size == (20, 40), f"size={_re2.size}")

# A file with a valid magic prefix but a corrupt body raises ValueError (which
# the endpoint turns into a 400), never an unhandled 500 (BUG-015).
try:
    _sanitize.validate_image(_Upload(b"\x89PNG\r\n\x1a\n" + b"garbage" * 4))
    _corrupt_rejected = False
except ValueError:
    _corrupt_rejected = True
check("corrupt image body raises ValueError, not an unhandled error (M132)",
      _corrupt_rejected)

print(f"\nAll {PASS} security checks passed.")
