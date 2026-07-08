"""One-time manual script: add users.token_version for JWT revocation (M126).

create_all only adds new tables on an existing database, never new columns, so
the live users table needs this applied once by hand. Run manually from
backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_token_version.py

Idempotent (ADD COLUMN IF NOT EXISTS). The default 0 matches the "ver" claim
that older tokens report (0), so adding the column logs nobody out; only a
later password change bumps a user's version and revokes their old tokens.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0",
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
