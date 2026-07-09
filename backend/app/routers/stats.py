import threading
import time
from bisect import bisect_right
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, func, text
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import engine, get_db
from ..elo import elo_summary
from ..models import Comment, Event, Post, QuizAnswer, User
from ..rate_limit import check_rate_limit
from ..time_utils import utcnow

router = APIRouter(tags=["stats"])

FORMATS = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]

# PostgreSQL extract('dow') and SQLite strftime('%w') both use 0=Sun ... 6=Sat.
# Remap to Mon=0, Tue=1, ..., Sun=6
_WD_REMAP = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}
_WD_LABELS_ORDER = [("Mon", 1), ("Tue", 2), ("Wed", 3), ("Thu", 4), ("Fri", 5), ("Sat", 6), ("Sun", 0)]

# Production runs on PostgreSQL; the test suites run on a throwaway SQLite
# file, which has no to_char/extract. Both branches return identical string
# or integer-castable values.
_IS_SQLITE = engine.dialect.name == "sqlite"


def _month(col):
    if _IS_SQLITE:
        return func.strftime("%Y-%m", col)
    return func.to_char(col, "YYYY-MM")


def _weekday(col):
    if _IS_SQLITE:
        return func.strftime("%w", col)
    return func.extract("dow", col)


def _hour(col):
    if _IS_SQLITE:
        return func.strftime("%H", col)
    return func.extract("hour", col)


def _day(col):
    # "YYYY-MM-DD" string on both dialects (for distinct-date streak queries).
    if _IS_SQLITE:
        return func.strftime("%Y-%m-%d", col)
    return func.to_char(col, "YYYY-MM-DD")


def _last_n_months(n: int) -> List[str]:
    today = utcnow()
    months = []
    for i in range(n - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        months.append(f"{y:04d}-{m:02d}")
    return months


def _fill_months(rows: list, n: int = 12) -> List[dict]:
    """Fill missing months with count=0 for the last n months."""
    lookup = {r["period"]: r["count"] for r in rows}
    return [{"period": m, "count": lookup.get(m, 0)} for m in _last_n_months(n)]


def _series_cutoff(n: int = 12) -> datetime:
    """First day of the earliest month in the last-n-months window. The over-time
    series only keep these months anyway (via _fill_months); bounding the query
    on created_at lets the created_at indexes prune instead of scanning all time,
    with an identical result."""
    earliest = _last_n_months(n)[0]  # "YYYY-MM"
    year, month = earliest.split("-")
    return datetime(int(year), int(month), 1)


def _milestone_date(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt[:10]
    return dt.strftime("%Y-%m-%d")


# The global stats payload is identical for every caller, so one in-process
# snapshot serves all requests for its lifetime (the data lives in a remote
# DB and the endpoint costs ~16 round trips). Cache reads and the swap below
# are single assignments of one tuple, safe under FastAPI's threadpool
# without a lock.
_GLOBAL_STATS_TTL_SECONDS = 60
_global_stats_cache: tuple | None = None  # (monotonic_timestamp, payload)
# Serializes the rebuild so a cache expiry does not run the pipeline in every
# waiting thread at once. Per-process (like the cache itself); see ARCH-013 /
# the M138 single-worker deployment invariant (backend/railway.toml).
_global_stats_lock = threading.Lock()


@router.get("/stats/global")
def get_global_stats(db: Session = Depends(get_db)):
    global _global_stats_cache
    cached = _global_stats_cache
    if cached is not None and time.monotonic() - cached[0] < _GLOBAL_STATS_TTL_SECONDS:
        return cached[1]

    # On expiry, one thread rebuilds under the lock while the rest wait and then
    # re-check and read the fresh snapshot (no ~18-query stampede).
    with _global_stats_lock:
        cached = _global_stats_cache
        if cached is not None and time.monotonic() - cached[0] < _GLOBAL_STATS_TTL_SECONDS:
            return cached[1]
        payload = _compute_global_stats(db)
        _global_stats_cache = (time.monotonic(), payload)
        return payload


def _compute_global_stats(db: Session) -> dict:
    # --- Overview ---
    # One round trip instead of four scalar queries: the DB is remote, so
    # every query costs a full network round trip regardless of data size.
    overview_row = db.execute(
        text(
            "SELECT"
            " (SELECT COUNT(*) FROM posts) AS total_posts,"
            " (SELECT COUNT(*) FROM users WHERE is_active) AS total_users,"
            " (SELECT COUNT(*) FROM comments) AS total_comments,"
            " (SELECT COUNT(*) FROM events WHERE event_type='like') AS total_likes"
        )
    ).one()
    total_posts = overview_row.total_posts or 0
    total_users = overview_row.total_users or 0
    total_comments = overview_row.total_comments or 0
    total_likes = overview_row.total_likes or 0
    avg_posts_per_user = round(total_posts / total_users, 2) if total_users > 0 else 0.0

    # --- Top creators by posts ---
    # All four leaderboards filter User.is_active (M150/BUG-022): deactivated
    # accounts and the deleted_user sentinel (which inherits severed posts)
    # must never chart.
    top_creators_by_posts = [
        {"username": r.username, "is_verified": r.is_verified, "post_count": r.cnt}
        for r in db.query(User.username, User.is_verified, func.count(Post.id).label("cnt"))
        .join(Post, Post.author_id == User.id)
        .filter(Post.status == "published", User.is_active == True)
        .group_by(User.id)
        .order_by(func.count(Post.id).desc())
        .limit(10)
        .all()
    ]

    # --- Top creators by likes received ---
    top_creators_by_likes = [
        {"username": r.username, "is_verified": r.is_verified, "like_count": r.cnt}
        for r in db.query(User.username, User.is_verified, func.count(Event.id).label("cnt"))
        .join(Post, Post.author_id == User.id)
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .filter(Post.status == "published", User.is_active == True)
        .group_by(User.id)
        .order_by(func.count(Event.id).desc())
        .limit(10)
        .all()
    ]

    # --- Top creators by comments received ---
    top_creators_by_comments = [
        {"username": r.username, "is_verified": r.is_verified, "comment_count": r.cnt}
        for r in db.query(User.username, User.is_verified, func.count(Comment.id).label("cnt"))
        .join(Post, Post.author_id == User.id)
        .join(Comment, Comment.post_id == Post.id)
        .filter(Post.status == "published", User.is_active == True)
        .group_by(User.id)
        .order_by(func.count(Comment.id).desc())
        .limit(10)
        .all()
    ]

    # --- Top creators by avg read time ---
    top_creators_by_avg_read_time = [
        {
            "username": r.username,
            "is_verified": r.is_verified,
            "avg_duration_ms": round(r.avg_ms or 0.0, 2),
        }
        for r in db.query(User.username, User.is_verified, func.avg(Event.duration_ms).label("avg_ms"))
        .join(Post, Post.author_id == User.id)
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "view"))
        .filter(Event.duration_ms.isnot(None), Post.status == "published", User.is_active == True)
        .group_by(User.id)
        .order_by(func.avg(Event.duration_ms).desc())
        .limit(10)
        .all()
    ]

    # --- Top creators per format (top 3 per format) ---
    # One grouped query instead of one query per format; the top-3 slice
    # happens in Python (creator counts are small).
    per_format_rows = (
        db.query(Post.format, User.username, func.count(Post.id).label("cnt"))
        .join(User, Post.author_id == User.id)
        .filter(Post.status == "published", User.is_active == True)
        .group_by(Post.format, User.id)
        .order_by(Post.format, func.count(Post.id).desc())
        .all()
    )
    top_creators_per_format = {fmt: [] for fmt in FORMATS}
    for r in per_format_rows:
        bucket = top_creators_per_format.get(r.format)
        if bucket is not None and len(bucket) < 3:
            bucket.append({"username": r.username, "post_count": r.cnt})

    # --- Top posts by likes ---
    top_posts_by_likes = [
        {
            "post_id": r.id,
            "title": r.title,
            "format": r.format,
            "author": r.username or "Deepscroll",
            "like_count": r.cnt,
        }
        for r in db.query(
            Post.id, Post.title, Post.format, User.username, func.count(Event.id).label("cnt")
        )
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .outerjoin(User, Post.author_id == User.id)
        .group_by(Post.id, Post.title, Post.format, User.username)
        .order_by(func.count(Event.id).desc())
        .limit(10)
        .all()
    ]

    # --- Over-time series ---
    # Bounded to the last 12 months so the created_at indexes prune instead of
    # scanning all-time data; _fill_months keeps only those months regardless.
    series_cutoff = _series_cutoff(12)
    posts_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Post.created_at).label("period"),
            func.count(Post.id).label("cnt"),
        )
        .filter(Post.created_at >= series_cutoff)
        .group_by(_month(Post.created_at))
        .all()
    ])

    users_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(User.created_at).label("period"),
            func.count(User.id).label("cnt"),
        )
        .filter(User.created_at >= series_cutoff)
        .group_by(_month(User.created_at))
        .all()
    ])

    comments_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Comment.created_at).label("period"),
            func.count(Comment.id).label("cnt"),
        )
        .filter(Comment.created_at >= series_cutoff)
        .group_by(_month(Comment.created_at))
        .all()
    ])

    likes_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Event.created_at).label("period"),
            func.count(Event.id).label("cnt"),
        )
        .filter(Event.event_type == "like", Event.created_at >= series_cutoff)
        .group_by(_month(Event.created_at))
        .all()
    ])

    # --- By-format breakdowns ---
    def _by_format(query_rows):
        lookup = {r[0]: r[1] for r in query_rows}
        return {fmt: lookup.get(fmt, 0) for fmt in FORMATS}

    posts_by_format = _by_format(
        db.query(Post.format, func.count(Post.id)).group_by(Post.format).all()
    )
    comments_by_format = _by_format(
        db.query(Post.format, func.count(Comment.id))
        .join(Comment, Comment.post_id == Post.id)
        .group_by(Post.format)
        .all()
    )
    likes_by_format = _by_format(
        db.query(Post.format, func.count(Event.id))
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .group_by(Post.format)
        .all()
    )

    # --- Activity heatmap (7 x 24 = 168 entries) ---
    # The weekday and hour series below are marginals of this one query,
    # so they are derived in Python instead of re-querying. Left all-time on
    # purpose: the heatmap answers "when do people post, ever", so a date bound
    # would change its meaning (unlike the monthly series above).
    hm_lookup = {
        (int(r.wd), int(r.hr)): r.cnt
        for r in db.query(
            _weekday(Post.created_at).label("wd"),
            _hour(Post.created_at).label("hr"),
            func.count(Post.id).label("cnt"),
        )
        .group_by(
            _weekday(Post.created_at),
            _hour(Post.created_at),
        )
        .all()
    }
    activity_heatmap = [
        {"weekday": _WD_REMAP[sw], "hour": hr, "count": hm_lookup.get((sw, hr), 0)}
        for sw in range(7)
        for hr in range(24)
    ]

    # --- Activity by weekday (sum of heatmap rows) ---
    wd_lookup = {}
    for (sw, _hr), cnt in hm_lookup.items():
        wd_lookup[sw] = wd_lookup.get(sw, 0) + cnt
    activity_by_weekday = [
        {"weekday": label, "count": wd_lookup.get(pg_wd, 0)}
        for label, pg_wd in _WD_LABELS_ORDER
    ]

    # --- Activity by hour (sum of heatmap columns) ---
    hr_lookup = {}
    for (_sw, hr), cnt in hm_lookup.items():
        hr_lookup[hr] = hr_lookup.get(hr, 0) + cnt
    activity_by_hour = [{"hour": h, "count": hr_lookup.get(h, 0)} for h in range(24)]

    # --- Post quality over time ---
    # One query: likes grouped by the creation month of the liked post. Bounded
    # to the last 12 months (post_quality_over_time only reads those, from
    # posts_over_time) so the scan prunes on the post created_at index.
    _likes_by_post_month = {
        r.period: r.cnt
        for r in db.query(
            _month(Post.created_at).label("period"),
            func.count(Event.id).label("cnt"),
        )
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .filter(Post.created_at >= series_cutoff)
        .group_by(_month(Post.created_at))
        .all()
    }
    # posts_over_time already has the post counts for the last 12 months
    post_quality_over_time = [
        {
            "period": entry["period"],
            "avg_likes_per_post": round(
                _likes_by_post_month.get(entry["period"], 0) / entry["count"], 2
            ) if entry["count"] > 0 else 0.0,
        }
        for entry in posts_over_time
    ]

    # --- Pending vs published (one grouped query) ---
    status_lookup = {
        r.status: r.cnt
        for r in db.query(Post.status, func.count(Post.id).label("cnt"))
        .group_by(Post.status)
        .all()
    }
    published_count = status_lookup.get("published", 0)
    pending_count = status_lookup.get("pending", 0)

    # --- Comment activity by user ---
    comment_activity_by_user = [
        {"username": r.username, "comment_count": r.cnt}
        for r in db.query(User.username, func.count(Comment.id).label("cnt"))
        .join(Comment, Comment.user_id == User.id)
        .filter(User.is_active == True)
        .group_by(User.id)
        .order_by(func.count(Comment.id).desc())
        .limit(10)
        .all()
    ]

    payload = {
        "overview": {
            "total_posts": total_posts,
            "total_users": total_users,
            "total_comments": total_comments,
            "total_likes": total_likes,
            "avg_posts_per_user": avg_posts_per_user,
        },
        "top_creators_by_posts": top_creators_by_posts,
        "top_creators_by_likes": top_creators_by_likes,
        "top_creators_by_comments": top_creators_by_comments,
        "top_creators_by_avg_read_time": top_creators_by_avg_read_time,
        "top_creators_per_format": top_creators_per_format,
        "top_posts_by_likes": top_posts_by_likes,
        "posts_over_time": posts_over_time,
        "users_over_time": users_over_time,
        "comments_over_time": comments_over_time,
        "likes_over_time": likes_over_time,
        "posts_by_format": posts_by_format,
        "comments_by_format": comments_by_format,
        "likes_by_format": likes_by_format,
        "activity_by_weekday": activity_by_weekday,
        "activity_by_hour": activity_by_hour,
        "activity_heatmap": activity_heatmap,
        "post_quality_over_time": post_quality_over_time,
        "pending_vs_published": {"published": published_count, "pending": pending_count},
        "comment_activity_by_user": comment_activity_by_user,
    }
    return payload


# The ranking distributions, user count and max engagement score in /stats/me
# depend on every user, not the caller, so they are cached in-process (short TTL,
# like /stats/global) and only the caller's rank/score are derived per request.
_ME_GLOBALS_TTL_SECONDS = 60
_me_globals_cache: tuple | None = None  # (monotonic_timestamp, snapshot)
_me_globals_lock = threading.Lock()


def _compute_me_globals(db: Session) -> dict:
    # Deactivated accounts and the deleted_user sentinel are excluded from the
    # denominator and the distributions (M150/BUG-022): the sentinel inherits
    # every severed post, which would otherwise skew the rankings.
    total_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    # Per-author published-post counts and received-like counts, ascending, so a
    # caller's rank is a bisect against the distribution instead of a per-request
    # grouped ranking subquery.
    post_counts = sorted(
        row.cnt
        for row in db.query(func.count(Post.id).label("cnt"))
        .join(User, User.id == Post.author_id)
        .filter(Post.status == "published", User.is_active == True)
        .group_by(Post.author_id)
        .all()
    )
    like_counts = sorted(
        row.cnt
        for row in db.query(func.count(Event.id).label("cnt"))
        .join(Post, Post.id == Event.post_id)
        .join(User, User.id == Post.author_id)
        .filter(Event.event_type == "like", User.is_active == True)
        .group_by(Post.author_id)
        .all()
    )
    max_engagement_score = db.execute(
        text(
            "SELECT MAX(score) FROM ("
            "  SELECT u.id,"
            "    (COALESCE(lc.cnt,0)*3 + COALESCE(cc.cnt,0)*2 + COALESCE(pc.cnt,0)*5) AS score"
            "  FROM users u"
            "  LEFT JOIN (SELECT p.author_id, COUNT(e.id) AS cnt FROM events e"
            "    JOIN posts p ON p.id=e.post_id WHERE e.event_type='like'"
            "    GROUP BY p.author_id) lc ON lc.author_id=u.id"
            "  LEFT JOIN (SELECT p.author_id, COUNT(c.id) AS cnt FROM comments c"
            "    JOIN posts p ON p.id=c.post_id GROUP BY p.author_id) cc ON cc.author_id=u.id"
            "  LEFT JOIN (SELECT author_id, COUNT(id) AS cnt FROM posts"
            "    WHERE status='published' GROUP BY author_id) pc ON pc.author_id=u.id"
            "  WHERE u.is_active"
            ") AS ms"
        )
    ).scalar() or 0
    return {
        "total_users": total_users,
        "max_engagement_score": max_engagement_score,
        "post_counts": post_counts,
        "like_counts": like_counts,
    }


def _me_globals(db: Session) -> dict:
    global _me_globals_cache
    cached = _me_globals_cache
    if cached is not None and time.monotonic() - cached[0] < _ME_GLOBALS_TTL_SECONDS:
        return cached[1]
    with _me_globals_lock:
        cached = _me_globals_cache
        if cached is not None and time.monotonic() - cached[0] < _ME_GLOBALS_TTL_SECONDS:
            return cached[1]
        snapshot = _compute_me_globals(db)
        _me_globals_cache = (time.monotonic(), snapshot)
        return snapshot


@router.get("/stats/me")
def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # /stats/me runs many aggregate queries against the remote DB per call; a
    # modest per-user limit keeps it from being a cheap resource-exhaustion
    # vector on the single worker (M130/SEC-020).
    check_rate_limit(current_user.id, "stats_me", 30, 60)
    uid = current_user.id

    # --- Overview ---
    # One round trip instead of seven scalar queries: the DB is remote, so
    # every query costs a full network round trip regardless of data size.
    me_row = db.execute(
        text(
            "SELECT"
            " (SELECT COUNT(*) FROM posts WHERE author_id=:uid) AS posts_created,"
            " (SELECT COUNT(*) FROM posts WHERE author_id=:uid AND status='published') AS posts_published,"
            " (SELECT COUNT(*) FROM posts WHERE author_id=:uid AND status='pending') AS posts_pending,"
            " (SELECT COUNT(*) FROM events e JOIN posts p ON p.id=e.post_id"
            "   WHERE e.event_type='like' AND p.author_id=:uid) AS likes_received,"
            " (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id=c.post_id"
            "   WHERE p.author_id=:uid) AS comments_received,"
            " (SELECT COUNT(*) FROM comments WHERE user_id=:uid) AS my_comments_written,"
            " (SELECT COUNT(DISTINCT post_id) FROM events"
            "   WHERE event_type='like' AND user_id=:uid) AS posts_liked"
        ),
        {"uid": uid},
    ).one()
    posts_created = me_row.posts_created or 0
    posts_published = me_row.posts_published or 0
    posts_pending = me_row.posts_pending or 0
    likes_received = me_row.likes_received or 0
    comments_received = me_row.comments_received or 0

    # --- My posts over time (all time, not capped to 12 months) ---
    my_posts_over_time = sorted(
        [
            {"period": r.period, "count": r.cnt}
            for r in db.query(
                _month(Post.created_at).label("period"),
                func.count(Post.id).label("cnt"),
            )
            .filter(Post.author_id == uid)
            .group_by(_month(Post.created_at))
            .all()
        ],
        key=lambda x: x["period"],
    )

    # --- My likes received over time ---
    my_likes_received_over_time = sorted(
        [
            {"period": r.period, "count": r.cnt}
            for r in db.query(
                _month(Event.created_at).label("period"),
                func.count(Event.id).label("cnt"),
            )
            .join(Post, Post.id == Event.post_id)
            .filter(Event.event_type == "like", Post.author_id == uid)
            .group_by(_month(Event.created_at))
            .all()
        ],
        key=lambda x: x["period"],
    )

    # --- My comments received over time ---
    my_comments_received_over_time = sorted(
        [
            {"period": r.period, "count": r.cnt}
            for r in db.query(
                _month(Comment.created_at).label("period"),
                func.count(Comment.id).label("cnt"),
            )
            .join(Post, Post.id == Comment.post_id)
            .filter(Post.author_id == uid)
            .group_by(_month(Comment.created_at))
            .all()
        ],
        key=lambda x: x["period"],
    )

    # --- My posts by format ---
    my_format_lookup = {
        r.format: r.cnt
        for r in db.query(Post.format, func.count(Post.id).label("cnt"))
        .filter(Post.author_id == uid)
        .group_by(Post.format)
        .all()
    }
    my_posts_by_format = {fmt: my_format_lookup.get(fmt, 0) for fmt in FORMATS}

    # --- My activity heatmap ---
    # Weekday and hour series are marginals of this one query, derived in
    # Python instead of re-querying.
    my_hm_lookup = {
        (int(r.wd), int(r.hr)): r.cnt
        for r in db.query(
            _weekday(Post.created_at).label("wd"),
            _hour(Post.created_at).label("hr"),
            func.count(Post.id).label("cnt"),
        )
        .filter(Post.author_id == uid)
        .group_by(
            _weekday(Post.created_at),
            _hour(Post.created_at),
        )
        .all()
    }
    my_activity_heatmap = [
        {"weekday": _WD_REMAP[sw], "hour": hr, "count": my_hm_lookup.get((sw, hr), 0)}
        for sw in range(7)
        for hr in range(24)
    ]

    my_wd_lookup = {}
    my_hr_lookup = {}
    for (sw, hr), cnt in my_hm_lookup.items():
        my_wd_lookup[sw] = my_wd_lookup.get(sw, 0) + cnt
        my_hr_lookup[hr] = my_hr_lookup.get(hr, 0) + cnt
    my_activity_by_weekday = [
        {"weekday": label, "count": my_wd_lookup.get(pg_wd, 0)}
        for label, pg_wd in _WD_LABELS_ORDER
    ]
    my_activity_by_hour = [{"hour": h, "count": my_hr_lookup.get(h, 0)} for h in range(24)]

    # --- My top posts by likes ---
    my_top_posts_by_likes = [
        {"post_id": r.id, "title": r.title, "format": r.format, "like_count": r.cnt}
        for r in db.query(Post.id, Post.title, Post.format, func.count(Event.id).label("cnt"))
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .filter(Post.author_id == uid)
        .group_by(Post.id)
        .order_by(func.count(Event.id).desc())
        .limit(5)
        .all()
    ]

    # --- My top posts by comments ---
    my_top_posts_by_comments = [
        {"post_id": r.id, "title": r.title, "format": r.format, "comment_count": r.cnt}
        for r in db.query(Post.id, Post.title, Post.format, func.count(Comment.id).label("cnt"))
        .join(Comment, Comment.post_id == Post.id)
        .filter(Post.author_id == uid)
        .group_by(Post.id)
        .order_by(func.count(Comment.id).desc())
        .limit(5)
        .all()
    ]

    # --- My avg read time per format ---
    my_avg_read_time_per_format = [
        {"format": r.format, "avg_duration_ms": round(r.avg_ms or 0.0, 2)}
        for r in db.query(Post.format, func.avg(Event.duration_ms).label("avg_ms"))
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "view"))
        .filter(Post.author_id == uid, Event.duration_ms.isnot(None))
        .group_by(Post.format)
        .all()
    ]

    # --- My avg read time over time ---
    my_avg_read_time_over_time = sorted(
        [
            {"period": r.period, "avg_duration_ms": round(r.avg_ms or 0.0, 2)}
            for r in db.query(
                _month(Event.created_at).label("period"),
                func.avg(Event.duration_ms).label("avg_ms"),
            )
            .join(Post, Post.id == Event.post_id)
            .filter(
                Event.event_type == "view",
                Post.author_id == uid,
                Event.duration_ms.isnot(None),
            )
            .group_by(_month(Event.created_at))
            .all()
        ],
        key=lambda x: x["period"],
    )

    # --- My comments written / posts I liked (from the overview select) ---
    my_comments_written = me_row.my_comments_written or 0
    posts_liked = me_row.posts_liked or 0

    # --- My likes given by format ---
    my_likes_given_by_format = [
        {"format": r.format, "count": r.cnt}
        for r in db.query(Post.format, func.count(Event.id).label("cnt"))
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
        .filter(Event.user_id == uid)
        .group_by(Post.format)
        .all()
    ]

    # --- My knowledge score (Elo) ---
    my_elo = {"global_rating": elo_summary(current_user)}
    quiz_row = db.query(
        func.count(QuizAnswer.id).label("answered"),
        func.coalesce(func.sum(case((QuizAnswer.is_correct == True, 1), else_=0)), 0).label("correct"),
    ).filter(QuizAnswer.user_id == uid).one()
    quiz_answered = quiz_row.answered or 0
    quiz_correct = quiz_row.correct or 0
    my_quiz = {
        "answered": quiz_answered,
        "correct": quiz_correct,
        "accuracy": round(quiz_correct / quiz_answered * 100, 1) if quiz_answered else 0.0,
    }

    # --- My comments written by format ---
    my_comments_written_by_format = [
        {"format": r.format, "count": r.cnt}
        for r in db.query(Post.format, func.count(Comment.id).label("cnt"))
        .join(Comment, Comment.post_id == Post.id)
        .filter(Comment.user_id == uid)
        .group_by(Post.format)
        .all()
    ]

    # --- My ranking and engagement ceiling (from the cached global snapshot) ---
    # The ranking distributions, user count and max engagement score are
    # caller-independent, so they come from the short-TTL cache; my rank is a
    # bisect (count of authors strictly above me, matching the old HAVING
    # COUNT > :mine), matching the previous ranked_above_by_* semantics exactly.
    me_globals = _me_globals(db)
    total_users_count = me_globals["total_users"]
    post_counts = me_globals["post_counts"]
    like_counts = me_globals["like_counts"]
    rank_by_posts = 1 + (len(post_counts) - bisect_right(post_counts, posts_published))
    rank_by_likes = 1 + (len(like_counts) - bisect_right(like_counts, likes_received))

    # First-interaction timestamps are genuinely per-user, so they stay a small
    # live query (one round trip, two scalar subselects).
    firsts_row = db.execute(
        text(
            "SELECT"
            " (SELECT MIN(e.created_at) FROM events e JOIN posts p ON p.id=e.post_id"
            "   WHERE e.event_type='like' AND p.author_id=:uid) AS first_like_at,"
            " (SELECT MIN(c.created_at) FROM comments c JOIN posts p ON p.id=c.post_id"
            "   WHERE p.author_id=:uid) AS first_comment_at"
        ),
        {"uid": uid},
    ).one()

    # --- Engagement score: (likes*3 + comments*2 + posts*5), normalized 0-100 ---
    my_raw = (likes_received * 3) + (comments_received * 2) + (posts_published * 5)
    max_score = me_globals["max_engagement_score"] or 0
    my_engagement_score = (
        round(min((my_raw / max_score) * 100, 100.0), 1) if max_score > 0 else 0.0
    )

    # --- My published-post dates, without loading the whole history ---
    # Streak needs only distinct days; milestones need only the first 50 posts
    # (the largest ordinal), so both queries stay bounded for prolific authors.
    date_list = sorted(
        row[0]
        for row in db.query(_day(Post.created_at))
        .filter(Post.author_id == uid, Post.status == "published")
        .distinct()
        .all()
    )
    milestone_dates = [
        row.created_at
        for row in db.query(Post.created_at)
        .filter(Post.author_id == uid, Post.status == "published")
        .order_by(Post.created_at)
        .limit(50)
        .all()
    ]

    # --- My streak (consecutive distinct post dates) ---
    current_streak = 0
    best_streak = 0

    if date_list:
        dates = [datetime.strptime(d, "%Y-%m-%d").date() for d in date_list]
        streak = 1
        best_streak = 1
        for i in range(1, len(dates)):
            if (dates[i] - dates[i - 1]).days == 1:
                streak += 1
                best_streak = max(best_streak, streak)
            else:
                streak = 1

        last_date = dates[-1]
        today = utcnow().date()
        if last_date >= today - timedelta(days=1):
            current_streak = 1
            for i in range(len(dates) - 1, 0, -1):
                if (dates[i] - dates[i - 1]).days == 1:
                    current_streak += 1
                else:
                    break

    # --- My milestones ---
    # posts_published is the true total (the achieved flags); milestone_dates
    # carries the ordinal timestamps up to the 50-post milestone.
    milestones = [
        {
            "label": "First Post",
            "achieved": posts_published >= 1,
            "achieved_at": _milestone_date(milestone_dates[0]) if posts_published >= 1 else None,
        },
        {
            "label": "5 Posts",
            "achieved": posts_published >= 5,
            "achieved_at": _milestone_date(milestone_dates[4]) if posts_published >= 5 else None,
        },
        {
            "label": "10 Posts",
            "achieved": posts_published >= 10,
            "achieved_at": _milestone_date(milestone_dates[9]) if posts_published >= 10 else None,
        },
        {
            "label": "25 Posts",
            "achieved": posts_published >= 25,
            "achieved_at": _milestone_date(milestone_dates[24]) if posts_published >= 25 else None,
        },
        {
            "label": "50 Posts",
            "achieved": posts_published >= 50,
            "achieved_at": _milestone_date(milestone_dates[49]) if posts_published >= 50 else None,
        },
        {
            "label": "First Like Received",
            "achieved": firsts_row.first_like_at is not None,
            "achieved_at": _milestone_date(firsts_row.first_like_at),
        },
        {
            "label": "First Comment Received",
            "achieved": firsts_row.first_comment_at is not None,
            "achieved_at": _milestone_date(firsts_row.first_comment_at),
        },
        {
            "label": "Verified",
            "achieved": current_user.is_verified,
            "achieved_at": None,
        },
        {
            "label": "100 Likes Received",
            "achieved": likes_received >= 100,
            "achieved_at": None,
        },
    ]

    return {
        "overview": {
            "posts_created": posts_created,
            "posts_published": posts_published,
            "posts_pending": posts_pending,
            "likes_received": likes_received,
            "comments_received": comments_received,
            "posts_saved": -1,
            "posts_liked": posts_liked,
        },
        "my_posts_over_time": my_posts_over_time,
        "my_likes_received_over_time": my_likes_received_over_time,
        "my_comments_received_over_time": my_comments_received_over_time,
        "my_posts_by_format": my_posts_by_format,
        "my_activity_by_weekday": my_activity_by_weekday,
        "my_activity_by_hour": my_activity_by_hour,
        "my_activity_heatmap": my_activity_heatmap,
        "my_top_posts_by_likes": my_top_posts_by_likes,
        "my_top_posts_by_comments": my_top_posts_by_comments,
        "my_avg_read_time_per_format": my_avg_read_time_per_format,
        "my_avg_read_time_over_time": my_avg_read_time_over_time,
        "my_comments_written": my_comments_written,
        "my_comments_written_by_format": my_comments_written_by_format,
        "my_ranking": {
            "by_posts": rank_by_posts,
            "by_likes": rank_by_likes,
            "total_users": total_users_count,
        },
        "my_engagement_score": my_engagement_score,
        "my_streak": {
            "current_days": current_streak,
            "best_days": best_streak,
        },
        "my_milestones": milestones,
        "my_likes_given_by_format": my_likes_given_by_format,
        "my_elo": my_elo,
        "my_quiz": my_quiz,
    }
