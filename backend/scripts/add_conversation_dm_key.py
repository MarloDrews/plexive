"""One-time manual script: add conversations.dm_key + unique index (M145/BUG-036).

create_all only adds new tables on an existing database, never new columns, so
the live conversations table needs this applied once by hand. Run manually
from backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\add_conversation_dm_key.py

Idempotent. Steps:
1. ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_key VARCHAR.
2. Backfill: every direct message (is_group false) with exactly two
   participants gets the canonical "loUserId:hiUserId" key. If a pair already
   forked into several DMs (the race this migration closes), only the OLDEST
   conversation per pair gets the key; the later duplicates are left NULL and
   PRINTED for manual review/merge (the unique index would otherwise fail).
3. CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_dm_key (PostgreSQL
   treats NULLs as distinct, so keyless rows are unconstrained).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)
    with engine.begin() as conn:
        stmt = "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_key VARCHAR"
        print(stmt)
        conn.execute(text(stmt))

        # Keys already assigned (idempotent re-run) must stay claimed.
        assigned = {
            row.dm_key
            for row in conn.execute(
                text("SELECT dm_key FROM conversations WHERE dm_key IS NOT NULL")
            )
        }

        rows = conn.execute(
            text(
                "SELECT c.id AS conv_id, cp.user_id AS user_id"
                " FROM conversations c"
                " JOIN conversation_participants cp ON cp.conversation_id = c.id"
                " WHERE c.is_group = false AND c.dm_key IS NULL"
                " ORDER BY c.id"
            )
        ).all()
        participants = {}
        for row in rows:
            participants.setdefault(row.conv_id, []).append(row.user_id)

        backfilled = 0
        duplicates = []
        for conv_id in sorted(participants):
            users = participants[conv_id]
            if len(users) != 2:
                print(f"skip conversation {conv_id}: {len(users)} participants (not a 2-person DM)")
                continue
            key = f"{min(users)}:{max(users)}"
            if key in assigned:
                duplicates.append((conv_id, key))
                continue
            assigned.add(key)
            conn.execute(
                text("UPDATE conversations SET dm_key = :key WHERE id = :conv_id"),
                {"key": key, "conv_id": conv_id},
            )
            backfilled += 1

        stmt = "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_dm_key ON conversations (dm_key)"
        print(stmt)
        conn.execute(text(stmt))

    print(f"backfilled {backfilled} DM keys")
    if duplicates:
        print("DUPLICATE pair conversations left without a key; review and merge manually:")
        for conv_id, key in duplicates:
            print(f"  conversation {conv_id} duplicates pair {key}")
    print("done")


if __name__ == "__main__":
    main()
