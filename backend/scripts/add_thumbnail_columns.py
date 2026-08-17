"""One-time manual script: add the posts thumbnail columns to the live DB.

Each post carries its own thumbnail: thumbnail_url is the public Supabase
Storage URL of the finished PNG, thumbnail_spec is the authoring instruction
that produced it (see app/thumbnails/generators.py). create_all only adds
missing TABLES, never missing COLUMNS (see the note in app/models.py), so the
live Supabase database needs both columns added by hand. Run manually from
backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_thumbnail_columns.py

Idempotent: ADD COLUMN IF NOT EXISTS, so it is safe to re-run. No backfill --
both columns stay NULL until a thumbnail spec is seeded and
scripts/generate_thumbnails.py runs.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

DDL = [
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_spec JSONB",
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

    print("done")


if __name__ == "__main__":
    main()
