"""One-time manual script: lowercase stored user emails on the live DB.

Register and login now normalize emails to lowercase (EmailStr only lowercases
the domain, so accounts registered with a capitalized local part could no
longer log in). This normalizes the existing rows to match. Run manually from
backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\lowercase_emails.py

Idempotent: only touches rows whose email is not already lowercase. If two
accounts would collide on the same lowercased address, BOTH are left unchanged
and reported for a human to resolve (deciding which account survives is not
this script's call).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models import User  # noqa: E402


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)

    with Session(engine) as db:
        users = db.query(User).all()
        taken = {u.email for u in users}
        changed = 0
        collisions = []
        for u in users:
            lowered = u.email.lower()
            if lowered == u.email:
                continue
            if lowered in taken:
                collisions.append((u.id, u.email, lowered))
                continue
            taken.discard(u.email)
            taken.add(lowered)
            u.email = lowered
            changed += 1
        db.commit()
        print(f"lowercased {changed} email(s)")
        if collisions:
            print(f"\nWARNING: {len(collisions)} collision(s) left unchanged -- resolve by hand:")
            for user_id, email, lowered in collisions:
                print(f"  user id {user_id}: {email!r} collides with existing {lowered!r}")

    print("done")


if __name__ == "__main__":
    main()
