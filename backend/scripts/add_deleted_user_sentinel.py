"""One-time manual script: create the deleted_user sentinel and backfill the
deleted-account lifecycle over already-soft-deleted rows (M150, decision 10).

Accounts deleted BEFORE this batch only got is_active=False: their email,
username, bio and avatar are still stored, their posts still carry their
authorship, and their follow rows still show up as dead entries. This applies
the same scramble_and_detach the DELETE /api/auth/me endpoint now runs:
published posts move to the sentinel, follow rows are removed, the row is
scrambled to deleted-<id> values.

Run manually from backend/ -- never imported or called by the app (requires
backend/.env with DATABASE_URL and JWT_SECRET, since importing the app's auth
module validates the secret):

    .venv\\Scripts\\python.exe scripts\\add_deleted_user_sentinel.py

Idempotent: the sentinel is get-or-create, and already-scrambled rows
(username deleted-<id>) are skipped.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app.account_lifecycle import (  # noqa: E402
    SENTINEL_EMAIL,
    get_or_create_sentinel,
    scramble_and_detach,
)
from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402

_SCRAMBLED_RE = re.compile(r"^deleted-\d+$")


def main():
    db = SessionLocal()
    try:
        sentinel = get_or_create_sentinel(db)
        db.commit()
        print(f"sentinel user id={sentinel.id} username={sentinel.username}")

        stale = (
            db.query(User)
            .filter(User.is_active == False, User.email != SENTINEL_EMAIL)
            .all()
        )
        processed = 0
        for user in stale:
            if _SCRAMBLED_RE.fullmatch(user.username or ""):
                continue  # already went through the lifecycle
            print(f"scrambling user id={user.id} (was {user.username!r})")
            scramble_and_detach(db, user)
            processed += 1
        db.commit()
        print(f"processed {processed} previously soft-deleted account(s)")
        print("done")
    finally:
        db.close()


if __name__ == "__main__":
    main()
