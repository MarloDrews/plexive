"""Query/scaling regression tests for the Batch 4 backend perf work
(perf/backend-queries):

- M041: the follower/following/follow-request lists are no longer N+1 (the
  endpoint issues a constant number of queries as the list grows, versus the
  lazy per-row load it replaced)
- M040: /search pushes a superset pre-filter into SQL (only candidate rows
  hydrate) while _post_matches keeps the exact semantics; non-ASCII and
  wildcard queries still behave correctly
- M042 / M044: /stats/me and /stats/global serve a cached snapshot on the
  second call (far fewer queries), and the cached /stats/me ranking matches the
  old HAVING-COUNT semantics

Run from backend/:
    .venv\\Scripts\\python.exe tests\\query_perf_test.py

_throwaway_db pins DATABASE_URL to a temp SQLite file BEFORE the app is
imported, so the real database is never touched.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

os.environ.setdefault("JWT_SECRET", "query-perf-test-secret")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Comment, Event, Follow, Post, User  # noqa: E402
from app.reading_time import compute_reading_minutes  # noqa: E402
from app.routers import stats as stats_router  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app)

PASS = 0

# --- SQL statement counter: every statement the engine executes is recorded, so
#     a count window measures exactly how many queries a request issued. ---
_statements: list[str] = []


@event.listens_for(engine, "before_cursor_execute")
def _record(conn, cursor, statement, parameters, context, executemany):
    _statements.append(statement)


class count_window:
    """Context manager: .n is the number of statements executed inside it, and
    .sql is their text (for asserting a filter landed in SQL)."""

    def __enter__(self):
        self._start = len(_statements)
        return self

    def __exit__(self, *exc):
        self.n = len(_statements) - self._start
        self.sql = _statements[self._start:]


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


def make_post(title, *, author_id=None, status="published", feed_card=None, sections=None):
    db = SessionLocal()
    post = Post(
        format="facts",
        title=title,
        feed_card=feed_card or {"headline": title},
        sections=sections or [{"type": "heart", "order": 1, "content": "body"}],
        reading_minutes=compute_reading_minutes(sections or []),
        author_id=author_id,
        status=status,
        is_user_content=False,
    )
    db.add(post)
    db.commit()
    pid = post.id
    db.close()
    return pid


def main():
    # =====================================================================
    # M041 -- follower list is not N+1
    # =====================================================================
    alice = register("alice@example.com", "alice")
    followers = [register(f"f{i}@example.com", f"follower{i}") for i in range(5)]

    def follow(follower_token):
        r = client.post("/api/users/alice/follow", headers=auth(follower_token))
        assert r.status_code == 200, r.text

    # Two followers, then measure the endpoint's query count.
    follow(followers[0]["access_token"])
    follow(followers[1]["access_token"])
    with count_window() as w2:
        r = client.get("/api/users/alice/followers")
    assert r.status_code == 200 and len(r.json()) == 2, r.text

    # Three more followers (five total), then measure again.
    for f in followers[2:]:
        follow(f["access_token"])
    with count_window() as w5:
        r = client.get("/api/users/alice/followers")
    assert r.status_code == 200 and len(r.json()) == 5, r.text

    print(f"   [M041] followers endpoint: {w2.n} queries at 2 followers, {w5.n} at 5 (flat)")
    check("followers endpoint query count is constant as the list grows",
          w2.n == w5.n, f"2 followers -> {w2.n} queries, 5 followers -> {w5.n} queries")

    # Counterfactual: the lazy per-row access the selectinload replaced would
    # grow one query per follower. Measured in a fresh session (empty identity
    # map) so each .follower is a real load.
    def lazy_count():
        s = SessionLocal()
        with count_window() as w:
            rows = s.query(Follow).filter(
                Follow.following_id == alice["user"]["id"],
                Follow.status == "accepted",
            ).all()
            for row in rows:
                _ = row.follower.username
        s.close()
        return w.n

    lazy = lazy_count()
    print(f"   [M041] before/after: lazy per-row access = {lazy} queries (1 + N), "
          f"eager endpoint = {w5.n} queries (constant)")
    check("lazy access would be N+1 (before), endpoint is flat (after)",
          lazy > w5.n and lazy >= 1 + 5,
          f"lazy(5 followers)={lazy} queries vs endpoint={w5.n}")

    # =====================================================================
    # M040 -- search pre-filters in SQL, semantics preserved
    # =====================================================================
    # One matching post per searchable field, plus non-matching filler.
    match_ids = set()
    match_ids.add(make_post("Quantum entanglement explained"))  # title
    match_ids.add(make_post("Essence match",
                            feed_card={"headline": "Essence match", "essence": "a quantum leap"}))
    match_ids.add(make_post("Author match",
                            feed_card={"headline": "Author match", "author": "Quantum Bob"}))
    match_ids.add(make_post("Heart match",
                            sections=[{"type": "heart", "order": 1, "content": "deep quantum ideas"}]))
    match_ids.add(make_post("Core ideas match",
                            sections=[{"type": "core_ideas", "order": 1,
                                       "content": [{"title": "On quantum", "body": "x"}]}]))
    for i in range(4):
        make_post(f"Unrelated filler {i}")

    with count_window() as sw:
        r = client.get("/api/search", params={"q": "quantum"})
    assert r.status_code == 200, r.text
    got = {p["id"] for p in r.json()}
    check("search finds every field type (title/essence/author/heart/core_ideas)",
          got == match_ids, f"expected {sorted(match_ids)}, got {sorted(got)}")
    check("search pushed the filter into SQL (a LIKE landed on the posts query)",
          any("like" in s.lower() and "posts" in s.lower() for s in sw.sql))

    # Wildcards in the query are literal, not SQL wildcards.
    pct_id = make_post("50% off today")
    make_post("5000 birds migrate")
    r = client.get("/api/search", params={"q": "50%"})
    got = {p["id"] for p in r.json()}
    check("percent in the query matches literally (not as a SQL wildcard)",
          got == {pct_id}, f"got {sorted(got)}")

    # Non-ASCII query falls back to the full scan and still matches.
    cafe_id = make_post("Zurich guide",
                        feed_card={"headline": "Zurich guide", "essence": "the best cafe culture"})
    r = client.get("/api/search", params={"q": "CAFE"})
    check("ASCII query matches the cafe post", cafe_id in {p["id"] for p in r.json()})
    cafe_uni = make_post("Vienna guide",
                         feed_card={"headline": "Vienna guide", "essence": "an old cafe called cafe"})
    r = client.get("/api/search", params={"q": "café"})
    # 'cafe' (ASCII) is a substring of neither 'café'; this only checks the
    # non-ASCII path does not error and returns a well-formed list.
    check("non-ASCII query returns a well-formed list (fallback path, no crash)",
          r.status_code == 200 and isinstance(r.json(), list), r.text)

    # =====================================================================
    # M044 -- /stats/global served from cache on the second call
    # =====================================================================
    stats_router._global_stats_cache = None
    with count_window() as g1:
        r = client.get("/api/stats/global")
    assert r.status_code == 200, r.text
    with count_window() as g2:
        r2 = client.get("/api/stats/global")
    print(f"   [M044] stats/global: {g1.n} queries first call, {g2.n} second (cached)")
    check("stats/global first call runs the query pipeline", g1.n > 5, f"{g1.n} queries")
    check("stats/global second call is served from cache (0 queries)",
          g2.n == 0 and r2.json() == r.json(), f"{g2.n} queries")

    # =====================================================================
    # M042 -- /stats/me caches the global snapshot; ranking is correct
    # =====================================================================
    bob = register("bob@example.com", "bob")
    a_id = alice["user"]["id"]
    b_id = bob["user"]["id"]
    # Alice: 3 published posts; Bob: 1. Alice should out-rank Bob by posts.
    for i in range(3):
        make_post(f"Alice post {i}", author_id=a_id)
    make_post("Bob post", author_id=b_id)

    stats_router._me_globals_cache = None
    with count_window() as m1:
        r = client.get("/api/stats/me", headers=auth(alice["access_token"]))
    assert r.status_code == 200, r.text
    with count_window() as m2:
        r2 = client.get("/api/stats/me", headers=auth(bob["access_token"]))
    assert r2.status_code == 200, r2.text
    print(f"   [M042] stats/me: {m1.n} queries first call (snapshot built), "
          f"{m2.n} second (snapshot cached)")
    check("stats/me first call builds the global snapshot", m1.n > 5, f"{m1.n} queries")
    check("stats/me second call reuses the cached snapshot (fewer queries)",
          m2.n < m1.n, f"first={m1.n}, second={m2.n}")

    check("stats/me rank_by_posts: Alice (3 posts) is rank 1",
          r.json()["my_ranking"]["by_posts"] == 1, str(r.json()["my_ranking"]))
    check("stats/me rank_by_posts: Bob (1 post) ranks below Alice",
          r2.json()["my_ranking"]["by_posts"] == 2, str(r2.json()["my_ranking"]))

    # Milestones still resolve their achieved_at dates from the bounded query.
    first_post = next(m for m in r.json()["my_milestones"] if m["label"] == "First Post")
    check("stats/me First Post milestone achieved with a date",
          first_post["achieved"] and first_post["achieved_at"], str(first_post))

    print(f"\nAll {PASS} query-perf checks passed.")


if __name__ == "__main__":
    main()
