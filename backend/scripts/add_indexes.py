"""One-time manual script: add the perf-audit indexes to the existing database.

create_all only creates indexes on FRESH databases (it skips tables that
already exist), so the live Supabase database needs them applied once by
hand. Run manually from backend/ -- this script is never imported or called
by the app:

    .venv\\Scripts\\python.exe scripts\\add_indexes.py

Idempotent: CREATE INDEX IF NOT EXISTS, safe to re-run. Index names match
the definitions in app/models.py so fresh databases (tests, future setups)
end up identical.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

INDEXES = [
    # like counts, like dedup, likes-by-format: WHERE post_id=? AND event_type=?
    "CREATE INDEX IF NOT EXISTS ix_events_post_id_event_type ON events (post_id, event_type)",
    # per-user event queries (likes given, activity)
    "CREATE INDEX IF NOT EXISTS ix_events_user_id ON events (user_id)",
    # feed scoring: WHERE created_at >= now() - 30 days
    "CREATE INDEX IF NOT EXISTS ix_events_created_at ON events (created_at)",
    # comment lists and counts: WHERE post_id=?
    "CREATE INDEX IF NOT EXISTS ix_comments_post_id ON comments (post_id)",
    # follower counts: WHERE following_id=? AND status='accepted'
    # (follower_id lookups are already served by the uq_follow constraint)
    "CREATE INDEX IF NOT EXISTS ix_follows_following_id_status ON follows (following_id, status)",
]


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)
    with engine.begin() as conn:
        for stmt in INDEXES:
            print(stmt)
            conn.execute(text(stmt))
    print("done")


if __name__ == "__main__":
    main()
