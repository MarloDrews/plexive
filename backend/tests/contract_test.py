"""Contract tests for the Batch 3 API changes (perf/api-contract):

- reading_minutes computed on write, stored on the row, identical on list and
  detail responses (list endpoints no longer walk the sections JSON)
- feed: seeded session-stable ordering + keyset cursor paging (no skips, no
  duplicates, vanished anchor ends the feed), limit clamped
- before_id/limit keyset paging on the sibling feeds, /posts/mine, comments
  and the follow lists (rows carry follow_id as the cursor)
- /search limit param
- contract removals: PostOut.connections gone, elo formats dict gone
- validation gaps: duplicate section types rejected, quiz items without a
  valid answer_index never score, emails case-insensitive

Run from anywhere:
    .venv\\Scripts\\python.exe tests\\contract_test.py

_throwaway_db pins DATABASE_URL to a temp SQLite file BEFORE the app is
imported, so the real database is never touched.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 — must run before any app import

os.environ.setdefault("JWT_SECRET", "contract-test-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Interest, Post, User  # noqa: E402
from app.reading_time import compute_reading_minutes  # noqa: E402

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


def seed_post(title: str, sections, author_id=None, status="published") -> int:
    """Insert a post directly (the pre-column legacy path would leave
    reading_minutes NULL; here it is stored like the write paths do)."""
    db = SessionLocal()
    post = Post(
        format="facts",
        title=title,
        feed_card={"headline": title},
        sections=sections,
        reading_minutes=compute_reading_minutes(sections),
        author_id=author_id,
        status=status,
        is_user_content=False,
    )
    db.add(post)
    db.commit()
    post_id = post.id
    db.close()
    return post_id


def heart(words: int, order: int = 1) -> dict:
    return {"type": "heart", "order": order, "content": "word " * words}


def feed_ids(url: str, headers: dict | None = None) -> list:
    r = client.get(url, headers=headers)
    assert r.status_code == 200, r.text
    return [p["id"] for p in r.json()]


def main():
    # --- setup: users + one interest slug for API-created posts ---
    alice = register("alice@example.com", "alice")
    bob = register("bob@example.com", "bob")
    carol = register("carol@example.com", "carol")
    a_h = auth(alice["access_token"])
    b_h = auth(bob["access_token"])
    c_h = auth(carol["access_token"])

    db = SessionLocal()
    db.add(Interest(name="Physics", slug="physics"))
    # Publishing is gated by can_publish now, not the verified badge (M116);
    # grant it so alice's posts auto-publish as this contract expects.
    db.query(User).filter(User.id == alice["user"]["id"]).update(
        {"is_verified": 1, "can_publish": True}
    )
    db.commit()
    db.close()

    # =====================================================================
    # reading_minutes: computed on write, stored, same on list and detail
    # =====================================================================
    sections = [
        heart(460, order=1),
        {"type": "sources", "order": 2,
         "content": [{"label": "Wikipedia", "url": "https://example.org", "type": "wikipedia"}]},
    ]
    r = client.post("/api/posts", headers=a_h, json={
        "format": "facts", "title": "Reading Time Post",
        "feed_card": {"headline": "Reading Time Post"},
        "sections": sections, "interests": ["physics"],
    })
    check("create post", r.status_code == 201, r.text)
    created = r.json()
    api_post_id = created["id"]
    expected_minutes = compute_reading_minutes(sections)
    check("expected minutes = 2 (460 words / 230 wpm)", expected_minutes == 2)
    check("create response carries stored reading_minutes",
          created["reading_minutes"] == expected_minutes, str(created["reading_minutes"]))

    db = SessionLocal()
    stored = db.query(Post.reading_minutes).filter(Post.id == api_post_id).scalar()
    db.close()
    check("reading_minutes stored on the row", stored == expected_minutes, str(stored))

    detail = client.get(f"/api/posts/{api_post_id}").json()
    check("detail reading_minutes matches", detail["reading_minutes"] == expected_minutes)
    feed_entry = next(p for p in client.get("/api/feed?seed=rm").json() if p["id"] == api_post_id)
    check("feed reading_minutes matches detail (sections dropped)",
          feed_entry["reading_minutes"] == expected_minutes and feed_entry["sections"] == [])

    # =====================================================================
    # contract removals
    # =====================================================================
    check("connections absent from detail", "connections" not in detail)
    check("connections absent from feed rows", "connections" not in feed_entry)
    r = client.get("/api/users/alice/elo")
    check("elo response has no formats dict",
          r.status_code == 200 and "formats" not in r.json(), r.text)
    r = client.get("/api/stats/me", headers=a_h)
    check("stats/me my_elo has no formats dict",
          r.status_code == 200 and "formats" not in r.json()["my_elo"], r.text)

    # =====================================================================
    # feed: seeded stable ordering + keyset cursor walk
    # =====================================================================
    for i in range(11):
        seed_post(f"Corpus {i}", [heart(230)])
    seed_post("Pending never listed", [heart(230)], status="pending")

    full = feed_ids("/api/feed?seed=abc&limit=100")
    again = feed_ids("/api/feed?seed=abc&limit=100")
    check("same seed reproduces the same order", full == again)
    other = feed_ids("/api/feed?seed=zzz&limit=100")
    check("different seed orders differently", other != full and sorted(other) == sorted(full))

    walked, cursor = [], None
    for _ in range(20):
        url = "/api/feed?seed=abc&limit=5" + (f"&cursor={cursor}" if cursor else "")
        page = feed_ids(url)
        if not page:
            break
        check_page = len(page) <= 5
        assert check_page
        walked += page
        cursor = page[-1]
    check("cursor walk = the full ranking, no skips, no duplicates", walked == full)
    check("pending post never in the feed",
          all("Pending" not in p["title"] for p in client.get("/api/feed?seed=abc&limit=100").json()))
    check("vanished cursor anchor ends the feed",
          feed_ids("/api/feed?seed=abc&limit=5&cursor=999999") == [])
    check("feed limit respected", len(feed_ids("/api/feed?seed=abc&limit=3")) == 3)

    # =====================================================================
    # before_id keyset on the sibling feeds and /posts/mine
    # =====================================================================
    r = client.post("/api/posts", headers=a_h, json={
        "format": "facts", "title": "Second Alice Post",
        "feed_card": {"headline": "Second Alice Post"},
        "sections": [heart(10)], "interests": ["physics"],
    })
    assert r.status_code == 201, r.text

    user_feed = feed_ids("/api/feed/user/alice")
    check("user feed newest first", user_feed == sorted(user_feed, reverse=True))
    page1 = feed_ids("/api/feed/user/alice?limit=1")
    page2 = feed_ids(f"/api/feed/user/alice?limit=1&before_id={page1[-1]}")
    check("user feed before_id pages without overlap", page1 + page2 == user_feed[:2])

    r = client.get("/api/posts/mine", headers=a_h, params={"limit": 1})
    check("posts/mine limit + PostListOut sections []",
          r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["sections"] == [])
    mine1 = r.json()[0]["id"]
    r = client.get("/api/posts/mine", headers=a_h, params={"limit": 1, "before_id": mine1})
    check("posts/mine before_id pages", r.status_code == 200 and r.json()[0]["id"] < mine1)

    r = client.post(f"/api/users/alice/follow", headers=b_h)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/users/alice/follow", headers=c_h)
    assert r.status_code == 200, r.text
    following = feed_ids("/api/feed/following?limit=1", headers=b_h)
    check("following feed limit", len(following) == 1)
    following2 = feed_ids(f"/api/feed/following?limit=100&before_id={following[0]}", headers=b_h)
    check("following feed before_id excludes the anchor",
          following[0] not in following2 and all(i < following[0] for i in following2))

    # =====================================================================
    # follow lists: follow_id cursor + paging
    # =====================================================================
    r = client.get("/api/users/alice/followers")
    rows = r.json()
    check("followers carry follow_id", r.status_code == 200 and all("follow_id" in x for x in rows))
    check("two followers, newest first", [x["username"] for x in rows] == ["carol", "bob"])
    p1 = client.get("/api/users/alice/followers", params={"limit": 1}).json()
    p2 = client.get("/api/users/alice/followers",
                    params={"limit": 1, "before_id": p1[0]["follow_id"]}).json()
    check("followers before_id pages without overlap",
          [p1[0]["username"], p2[0]["username"]] == ["carol", "bob"])

    # =====================================================================
    # comments: before_id keyset
    # =====================================================================
    for i in range(3):
        r = client.post(f"/api/posts/{api_post_id}/comments", headers=b_h,
                        json={"body": f"comment {i}"})
        assert r.status_code == 201, r.text
    all_comments = client.get(f"/api/posts/{api_post_id}/comments").json()
    check("comments newest first", [c["body"] for c in all_comments] ==
          ["comment 2", "comment 1", "comment 0"])
    c1 = client.get(f"/api/posts/{api_post_id}/comments", params={"limit": 2}).json()
    c2 = client.get(f"/api/posts/{api_post_id}/comments",
                    params={"limit": 2, "before_id": c1[-1]["id"]}).json()
    check("comments before_id pages without overlap",
          [c["body"] for c in c1 + c2] == ["comment 2", "comment 1", "comment 0"])
    check("comment count mode unchanged",
          client.get(f"/api/posts/{api_post_id}/comments?count=true").json() == {"count": 3})

    # =====================================================================
    # search limit param
    # =====================================================================
    r = client.get("/api/search", params={"q": "Corpus", "limit": 2})
    check("search limit respected", r.status_code == 200 and len(r.json()) == 2, r.text)
    r = client.get("/api/search", params={"q": "Corpus"})
    check("search default returns all matches", len(r.json()) == 11)

    # =====================================================================
    # validation gaps
    # =====================================================================
    r = client.post("/api/posts", headers=a_h, json={
        "format": "facts", "title": "Duplicate Sections",
        "feed_card": {"headline": "Duplicate Sections"},
        "sections": [heart(10, order=1), heart(10, order=2)],
        "interests": ["physics"],
    })
    check("duplicate section types rejected",
          r.status_code == 422 and "duplicate section type" in r.text, r.text)

    # A legacy/broken quiz item without answer_index must never cost rating.
    broken_id = seed_post("Broken Quiz", [{
        "type": "quiz", "order": 1,
        "content": [{"question": "Q?", "options": ["a", "b", "c", "d"]}],
    }], author_id=alice["user"]["id"])
    before = client.get("/api/users/bob/elo").json()["global_rating"]
    r = client.post("/api/quiz/answer", headers=b_h,
                    json={"post_id": broken_id, "question_index": 0, "chosen_index": 0})
    d = r.json()
    check("broken quiz item answers unscored",
          r.status_code == 200 and d["scored"] is False and d["correct"] is False, r.text)
    after = client.get("/api/users/bob/elo").json()["global_rating"]
    check("broken quiz item leaves the rating untouched", before == after, f"{before} -> {after}")

    # Emails are case-insensitive: mixed-case register, lowercase login,
    # duplicate register under different casing rejected.
    r = client.post("/api/auth/register", json={
        "email": "MiXeD@Example.com", "username": "mixedcase", "password": "password123",
    })
    check("mixed-case register ok", r.status_code == 201, r.text)
    check("email stored lowercase", r.json()["user"]["email"] == "mixed@example.com")
    r = client.post("/api/auth/login", json={
        "email": "mixed@example.com", "password": "password123",
    })
    check("lowercase login finds the mixed-case account", r.status_code == 200, r.text)
    r = client.post("/api/auth/login", json={
        "email": "MIXED@EXAMPLE.COM", "password": "password123",
    })
    check("uppercase login finds it too", r.status_code == 200, r.text)
    r = client.post("/api/auth/register", json={
        "email": "mixed@EXAMPLE.com", "username": "mixedcase2", "password": "password123",
    })
    check("re-register under different casing rejected", r.status_code == 400, r.text)

    print(f"\nAll {PASS} contract checks passed.")


if __name__ == "__main__":
    main()
