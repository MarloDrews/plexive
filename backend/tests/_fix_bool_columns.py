"""One-off helper: convert integer columns to boolean in the live PostgreSQL DB.

The tables were originally migrated from SQLite, where booleans are stored as
integers. The ORM models declare these columns as Boolean, so psycopg2 sends
true/false literals and PostgreSQL rejects the insert with
"column X is of type integer but expression is of type boolean"
(this broke POST /api/auth/register, June 2026).

Idempotent: only alters columns whose live type is not already boolean.
Run with:
    .venv\\Scripts\\python.exe tests\\_fix_bool_columns.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import engine

# Every column declared as Boolean in app/models.py.
BOOL_COLUMNS = [
    ("posts", "is_user_content"),
    ("users", "is_active"),
    ("users", "is_verified"),
    ("users", "is_private"),
    ("quiz_answers", "is_correct"),
    ("conversations", "is_group"),
]


def main() -> None:
    with engine.begin() as conn:
        for table, column in BOOL_COLUMNS:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": column},
            ).fetchone()
            if row is None:
                print(f"{table}.{column}: not found, skipped")
                continue
            if row[0] == "boolean":
                print(f"{table}.{column}: already boolean")
                continue
            # USING converts existing values; DEFAULT must be dropped first
            # because an integer default cannot survive the type change.
            conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT"))
            conn.execute(
                text(
                    f"ALTER TABLE {table} ALTER COLUMN {column} "
                    f"TYPE boolean USING {column}::boolean"
                )
            )
            print(f"{table}.{column}: {row[0]} -> boolean")


if __name__ == "__main__":
    main()
