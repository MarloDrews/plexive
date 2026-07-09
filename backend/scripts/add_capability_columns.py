"""One-time manual script: split the verified flag into two capabilities (M116).

create_all only adds NEW tables on an existing database, never new columns to
an existing table, so the live users table needs these applied once by hand.
Run manually from backend/ -- this script is never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_capability_columns.py

What it does (idempotent, safe to re-run):
  1. Adds users.can_publish and users.is_admin (BOOLEAN NOT NULL DEFAULT FALSE).
  2. Back-fills can_publish = TRUE for every currently-verified user
     (is_verified >= 1) so their publishing behavior does not change.
  3. Grants is_admin = TRUE and can_publish = TRUE to the owner account only
     (by email), seeding the first admin out of band.

After this, the cosmetic is_verified badge no longer grants publish or admin
rights; those are the two new columns.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

OWNER_EMAIL = "marlo07drews@gmail.com"

# ADD COLUMN IF NOT EXISTS is PostgreSQL syntax; the live DB is Supabase Postgres.
DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE",
]

BACKFILL = [
    # Preserve current publishing behavior: everyone verified today keeps
    # auto-publish through the new capability.
    "UPDATE users SET can_publish = TRUE WHERE is_verified >= 1",
    # Seed the sole admin (also ensure the owner can publish).
    ("UPDATE users SET is_admin = TRUE, can_publish = TRUE WHERE email = :email", {"email": OWNER_EMAIL}),
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
        for stmt in BACKFILL:
            if isinstance(stmt, tuple):
                sql, params = stmt
                print(sql, params)
                conn.execute(text(sql), params)
            else:
                print(stmt)
                conn.execute(text(stmt))
    print("done")


if __name__ == "__main__":
    main()
