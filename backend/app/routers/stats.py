from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, text
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..elo import format_ratings, global_rating
from ..models import Comment, Event, Post, QuizAnswer, User

router = APIRouter(tags=["stats"])

FORMATS = ["books", "facts", "people", "concepts", "questions", "stories", "academy"]

# PostgreSQL extract('dow'): 0=Sun, 1=Mon, ..., 6=Sat
# Remap to Mon=0, Tue=1, ..., Sun=6
_WD_REMAP = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}
_WD_LABELS_ORDER = [("Mon", 1), ("Tue", 2), ("Wed", 3), ("Thu", 4), ("Fri", 5), ("Sat", 6), ("Sun", 0)]


def _month(col):
    return func.to_char(col, "YYYY-MM")


def _weekday(col):
    return func.extract("dow", col)


def _hour(col):
    return func.extract("hour", col)


def _date(col):
    return func.to_char(col, "YYYY-MM-DD")


def _last_n_months(n: int) -> List[str]:
    today = datetime.utcnow()
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


def _milestone_date(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt[:10]
    return dt.strftime("%Y-%m-%d")


@router.get("/stats/global")
def get_global_stats(db: Session = Depends(get_db)):
    # --- Overview ---
    total_posts = db.query(func.count(Post.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_comments = db.query(func.count(Comment.id)).scalar() or 0
    total_likes = (
        db.query(func.count(Event.id)).filter(Event.event_type == "like").scalar() or 0
    )
    avg_posts_per_user = round(total_posts / total_users, 2) if total_users > 0 else 0.0

    # --- Top creators by posts ---
    top_creators_by_posts = [
        {"username": r.username, "is_verified": r.is_verified, "post_count": r.cnt}
        for r in db.query(User.username, User.is_verified, func.count(Post.id).label("cnt"))
        .join(Post, Post.author_id == User.id)
        .filter(Post.status == "published")
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
        .filter(Event.duration_ms.isnot(None))
        .group_by(User.id)
        .order_by(func.avg(Event.duration_ms).desc())
        .limit(10)
        .all()
    ]

    # --- Top creators per format (top 3 per format) ---
    top_creators_per_format = {}
    for fmt in FORMATS:
        top_creators_per_format[fmt] = [
            {"username": r.username, "post_count": r.cnt}
            for r in db.query(User.username, func.count(Post.id).label("cnt"))
            .join(Post, Post.author_id == User.id)
            .filter(Post.format == fmt, Post.status == "published")
            .group_by(User.id)
            .order_by(func.count(Post.id).desc())
            .limit(3)
            .all()
        ]

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
    posts_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Post.created_at).label("period"),
            func.count(Post.id).label("cnt"),
        )
        .group_by(_month(Post.created_at))
        .all()
    ])

    users_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(User.created_at).label("period"),
            func.count(User.id).label("cnt"),
        )
        .group_by(_month(User.created_at))
        .all()
    ])

    comments_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Comment.created_at).label("period"),
            func.count(Comment.id).label("cnt"),
        )
        .group_by(_month(Comment.created_at))
        .all()
    ])

    likes_over_time = _fill_months([
        {"period": r.period, "count": r.cnt}
        for r in db.query(
            _month(Event.created_at).label("period"),
            func.count(Event.id).label("cnt"),
        )
        .filter(Event.event_type == "like")
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

    # --- Activity by weekday ---
    wd_lookup = {
        int(r.wd): r.cnt
        for r in db.query(
            _weekday(Post.created_at).label("wd"),
            func.count(Post.id).label("cnt"),
        )
        .group_by(_weekday(Post.created_at))
        .all()
    }
    activity_by_weekday = [
        {"weekday": label, "count": wd_lookup.get(pg_wd, 0)}
        for label, pg_wd in _WD_LABELS_ORDER
    ]

    # --- Activity by hour ---
    hr_lookup = {
        int(r.hr): r.cnt
        for r in db.query(
            _hour(Post.created_at).label("hr"),
            func.count(Post.id).label("cnt"),
        )
        .group_by(_hour(Post.created_at))
        .all()
    }
    activity_by_hour = [{"hour": h, "count": hr_lookup.get(h, 0)} for h in range(24)]

    # --- Activity heatmap (7 x 24 = 168 entries) ---
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

    # --- Post quality over time ---
    # One query: likes grouped by the creation month of the liked post
    _likes_by_post_month = {
        r.period: r.cnt
        for r in db.query(
            _month(Post.created_at).label("period"),
            func.count(Event.id).label("cnt"),
        )
        .join(Event, and_(Event.post_id == Post.id, Event.event_type == "like"))
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

    # --- Pending vs published ---
    published_count = (
        db.query(func.count(Post.id)).filter(Post.status == "published").scalar() or 0
    )
    pending_count = (
        db.query(func.count(Post.id)).filter(Post.status == "pending").scalar() or 0
    )

    # --- Comment activity by user ---
    comment_activity_by_user = [
        {"username": r.username, "comment_count": r.cnt}
        for r in db.query(User.username, func.count(Comment.id).label("cnt"))
        .join(Comment, Comment.user_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Comment.id).desc())
        .limit(10)
        .all()
    ]

    return {
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


@router.get("/stats/me")
def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user.id

    # --- Overview ---
    posts_created = db.query(func.count(Post.id)).filter(Post.author_id == uid).scalar() or 0
    posts_published = (
        db.query(func.count(Post.id))
        .filter(Post.author_id == uid, Post.status == "published")
        .scalar() or 0
    )
    posts_pending = (
        db.query(func.count(Post.id))
        .filter(Post.author_id == uid, Post.status == "pending")
        .scalar() or 0
    )
    likes_received = (
        db.query(func.count(Event.id))
        .join(Post, Post.id == Event.post_id)
        .filter(Event.event_type == "like", Post.author_id == uid)
        .scalar() or 0
    )
    comments_received = (
        db.query(func.count(Comment.id))
        .join(Post, Post.id == Comment.post_id)
        .filter(Post.author_id == uid)
        .scalar() or 0
    )

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

    # --- My activity by weekday ---
    my_wd_lookup = {
        int(r.wd): r.cnt
        for r in db.query(
            _weekday(Post.created_at).label("wd"),
            func.count(Post.id).label("cnt"),
        )
        .filter(Post.author_id == uid)
        .group_by(_weekday(Post.created_at))
        .all()
    }
    my_activity_by_weekday = [
        {"weekday": label, "count": my_wd_lookup.get(pg_wd, 0)}
        for label, pg_wd in _WD_LABELS_ORDER
    ]

    # --- My activity by hour ---
    my_hr_lookup = {
        int(r.hr): r.cnt
        for r in db.query(
            _hour(Post.created_at).label("hr"),
            func.count(Post.id).label("cnt"),
        )
        .filter(Post.author_id == uid)
        .group_by(_hour(Post.created_at))
        .all()
    }
    my_activity_by_hour = [{"hour": h, "count": my_hr_lookup.get(h, 0)} for h in range(24)]

    # --- My activity heatmap ---
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

    # --- My comments written ---
    my_comments_written = (
        db.query(func.count(Comment.id)).filter(Comment.user_id == uid).scalar() or 0
    )

    # --- Posts I liked (saved posts live in localStorage, counted client-side) ---
    posts_liked = (
        db.query(func.count(func.distinct(Event.post_id)))
        .filter(Event.event_type == "like", Event.user_id == uid)
        .scalar() or 0
    )

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
    my_elo = {
        "global_rating": global_rating(db, uid),
        "formats": format_ratings(db, uid),
    }
    quiz_answered = (
        db.query(func.count(QuizAnswer.id)).filter(QuizAnswer.user_id == uid).scalar() or 0
    )
    quiz_correct = (
        db.query(func.count(QuizAnswer.id))
        .filter(QuizAnswer.user_id == uid, QuizAnswer.is_correct == True)
        .scalar() or 0
    )
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

    # --- My ranking (raw SQL for grouped subqueries) ---
    rank_by_posts = (
        db.execute(
            text(
                "SELECT COUNT(*) FROM ("
                "  SELECT author_id, COUNT(*) as cnt FROM posts"
                "  WHERE status='published' AND author_id IS NOT NULL"
                "  GROUP BY author_id HAVING COUNT(*) > :my_count"
                ") AS sub"
            ),
            {"my_count": posts_published},
        ).scalar() or 0
    ) + 1

    rank_by_likes = (
        db.execute(
            text(
                "SELECT COUNT(*) FROM ("
                "  SELECT p.author_id, COUNT(e.id) as cnt FROM events e"
                "  JOIN posts p ON p.id = e.post_id"
                "  WHERE e.event_type='like' AND p.author_id IS NOT NULL"
                "  GROUP BY p.author_id HAVING COUNT(e.id) > :my_count"
                ") AS sub"
            ),
            {"my_count": likes_received},
        ).scalar() or 0
    ) + 1

    total_users_count = db.query(func.count(User.id)).scalar() or 0

    # --- Engagement score: (likes*3 + comments*2 + posts*5), normalized 0-100 ---
    my_raw = (likes_received * 3) + (comments_received * 2) + (posts_published * 5)
    max_score = (
        db.execute(
            text(
                "SELECT MAX(score) FROM ("
                "  SELECT u.id,"
                "    (COALESCE(lc.cnt,0)*3 + COALESCE(cc.cnt,0)*2 + COALESCE(pc.cnt,0)*5) as score"
                "  FROM users u"
                "  LEFT JOIN (SELECT p.author_id, COUNT(e.id) as cnt FROM events e"
                "    JOIN posts p ON p.id=e.post_id WHERE e.event_type='like'"
                "    GROUP BY p.author_id) lc ON lc.author_id=u.id"
                "  LEFT JOIN (SELECT p.author_id, COUNT(c.id) as cnt FROM comments c"
                "    JOIN posts p ON p.id=c.post_id GROUP BY p.author_id) cc ON cc.author_id=u.id"
                "  LEFT JOIN (SELECT author_id, COUNT(id) as cnt FROM posts"
                "    WHERE status='published' GROUP BY author_id) pc ON pc.author_id=u.id"
                ") AS sub"
            )
        ).scalar()
        or 0
    )
    my_engagement_score = (
        round(min((my_raw / max_score) * 100, 100.0), 1) if max_score > 0 else 0.0
    )

    # --- My streak ---
    date_rows = (
        db.query(_date(Post.created_at).label("d"))
        .filter(Post.author_id == uid, Post.status == "published")
        .distinct()
        .order_by(_date(Post.created_at))
        .all()
    )
    date_list = sorted({r.d for r in date_rows})
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
        today = datetime.utcnow().date()
        if last_date >= today - timedelta(days=1):
            current_streak = 1
            for i in range(len(dates) - 1, 0, -1):
                if (dates[i] - dates[i - 1]).days == 1:
                    current_streak += 1
                else:
                    break

    # --- My milestones ---
    pub_dates = (
        db.query(Post.created_at)
        .filter(Post.author_id == uid, Post.status == "published")
        .order_by(Post.created_at)
        .all()
    )
    pub_list = [r.created_at for r in pub_dates]

    first_like_row = (
        db.query(Event.created_at)
        .join(Post, Post.id == Event.post_id)
        .filter(Event.event_type == "like", Post.author_id == uid)
        .order_by(Event.created_at)
        .first()
    )
    first_comment_row = (
        db.query(Comment.created_at)
        .join(Post, Post.id == Comment.post_id)
        .filter(Post.author_id == uid)
        .order_by(Comment.created_at)
        .first()
    )

    milestones = [
        {
            "label": "First Post",
            "achieved": len(pub_list) >= 1,
            "achieved_at": _milestone_date(pub_list[0]) if len(pub_list) >= 1 else None,
        },
        {
            "label": "5 Posts",
            "achieved": len(pub_list) >= 5,
            "achieved_at": _milestone_date(pub_list[4]) if len(pub_list) >= 5 else None,
        },
        {
            "label": "10 Posts",
            "achieved": len(pub_list) >= 10,
            "achieved_at": _milestone_date(pub_list[9]) if len(pub_list) >= 10 else None,
        },
        {
            "label": "25 Posts",
            "achieved": len(pub_list) >= 25,
            "achieved_at": _milestone_date(pub_list[24]) if len(pub_list) >= 25 else None,
        },
        {
            "label": "50 Posts",
            "achieved": len(pub_list) >= 50,
            "achieved_at": _milestone_date(pub_list[49]) if len(pub_list) >= 50 else None,
        },
        {
            "label": "First Like Received",
            "achieved": first_like_row is not None,
            "achieved_at": _milestone_date(first_like_row.created_at) if first_like_row else None,
        },
        {
            "label": "First Comment Received",
            "achieved": first_comment_row is not None,
            "achieved_at": _milestone_date(first_comment_row.created_at) if first_comment_row else None,
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
