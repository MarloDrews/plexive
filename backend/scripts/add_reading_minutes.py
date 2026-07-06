"""One-time manual script: add posts.reading_minutes to the live DB and backfill it.

Reading time is now computed on write (posts.py create, seed.py upsert) and
stored on the post row so list endpoints stop re-walking the sections JSON per
request. create_all only adds missing TABLES, never missing COLUMNS (see the
note in app/models.py), so the live Supabase database needs the column added by
hand. Run manually from backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_reading_minutes.py

Idempotent: ADD COLUMN IF NOT EXISTS, and the backfill only touches rows where
reading_minutes is still NULL, so it is safe to re-run.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

# Reuse the exact write-path function -- never a second copy of the word count.
from app.models import Post  # noqa: E402
from app.reading_time import compute_reading_minutes  # noqa: E402

DDL = [
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS reading_minutes INTEGER",
]


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)

    with engine.begin() as conn:
        for stmt in DDL:
            print(stmt)
            conn.execute(text(stmt))

    # Backfill only where the column is still NULL.
    with Session(engine) as db:
        pending = db.query(Post).filter(Post.reading_minutes.is_(None)).all()
        for post in pending:
            post.reading_minutes = compute_reading_minutes(post.sections)
        db.commit()
        print(f"backfilled reading_minutes for {len(pending)} rows")

    print("done")


if __name__ == "__main__":
    main()
