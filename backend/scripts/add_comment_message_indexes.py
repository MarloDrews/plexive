"""One-time manual script: add the batch-4 comment/message indexes.

create_all only creates indexes on FRESH databases (it skips tables that
already exist), so the live Supabase database needs them applied once by
hand. Run manually from backend/ -- this script is never imported or called
by the app:

    .venv\\Scripts\\python.exe scripts\\add_comment_message_indexes.py

Idempotent: CREATE INDEX IF NOT EXISTS, safe to re-run. Index names match
the definitions in app/models.py so fresh databases (tests, future setups)
end up identical.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import create_engine, text  # noqa: E402

INDEXES = [
    # comment lists: WHERE post_id=? ORDER BY created_at (avoids the post-scan sort)
    "CREATE INDEX IF NOT EXISTS ix_comments_post_id_created_at ON comments (post_id, created_at)",
    # chat history: WHERE conversation_id=? ORDER BY / keyset on id
    "CREATE INDEX IF NOT EXISTS ix_messages_conversation_id_id ON messages (conversation_id, id)",
]


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")
    engine = create_engine(url)
    with engine.begin() as conn:
        for stmt in INDEXES:
            print(stmt)
            conn.execute(text(stmt))
    print("done")


if __name__ == "__main__":
    main()
