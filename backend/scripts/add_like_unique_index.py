"""One-time manual script: make like dedup structural (M119).

Prepares the live events table for the partial unique index that guarantees at
most one like per (user, post), then creates it. create_all adds the index on
fresh databases only, so the live Supabase database needs this applied once by
hand. Run manually from backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_like_unique_index.py

DESTRUCTIVE, by design and once only:
  1. DELETE anonymous like rows (user_id IS NULL). Per the events decision,
     anonymous likes no longer count; these stored rows are exactly the
     untrustworthy counts being removed.
  2. DELETE duplicate authenticated like rows, keeping the lowest id per
     (user_id, post_id), so the unique index can be created.
  3. CREATE the partial unique index uq_events_user_like.

Idempotent after the first run: the deletes match nothing and CREATE INDEX IF
NOT EXISTS is a no-op. Review the printed counts before trusting a re-run.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

STEPS = [
    # 1. Anonymous likes no longer count (M119): drop them.
    "DELETE FROM events WHERE event_type = 'like' AND user_id IS NULL",
    # 2. Collapse authenticated like duplicates to the earliest row per pair.
    """
    DELETE FROM events e
    USING events keep
    WHERE e.event_type = 'like'
      AND keep.event_type = 'like'
      AND e.user_id = keep.user_id
      AND e.post_id = keep.post_id
      AND e.id > keep.id
    """,
    # 3. The structural guarantee.
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_events_user_like
    ON events (user_id, post_id)
    WHERE event_type = 'like' AND user_id IS NOT NULL
    """,
]


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)
    with engine.begin() as conn:
        for stmt in STEPS:
            print(stmt.strip().splitlines()[0])
            result = conn.execute(text(stmt))
            if result.rowcount is not None and result.rowcount >= 0:
                print(f"  rows affected: {result.rowcount}")
    print("done")


if __name__ == "__main__":
    main()
