"""One-time manual script: add Google sign-in support to the users table.

create_all only adds new tables on an existing database, never new columns or
constraint changes, so the live users table needs this applied once by hand.
Run manually from backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_google_auth_columns.py

Idempotent. It does three things:

  users.google_sub          -- the Google account "sub" id for accounts that
                               sign in with Google. NULL for password accounts.
  unique index on google_sub -- one account per Google identity.
  password_hash DROP NOT NULL -- Google accounts have no password.

Existing password accounts are unaffected: google_sub stays NULL and their
password_hash keeps its value.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)",
    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",
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
