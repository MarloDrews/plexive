"""One-time manual script: add the cosmetic accessory columns to users.

create_all only adds new tables on an existing database, never new columns, so
the live users table needs this applied once by hand. Run manually from
backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_accessory_columns.py

Idempotent (ADD COLUMN IF NOT EXISTS). Both columns are NULLABLE with no
default, and NULL means "default look", so adding them changes nothing that is
already on screen.

  users.avatar_frame_id -- the overlay circle drawn on the profile picture.
  users.badge_id        -- the Arena (ranked) waiting-room tile artwork.

No UI writes these yet. To equip an accessory, set the number by hand in the
Supabase table editor; the frontend maps it to artwork in
frontend/src/lib/accessories.ts (currently 1, 2 or 3 for each column). An id
with no matching design falls back to the default look rather than erroring.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame_id INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_id INTEGER",
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
