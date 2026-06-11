"""Read-only check: report the live type of every column the ORM declares
as Boolean. Companion to _fix_bool_columns.py, changes nothing."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import engine

from _fix_bool_columns import BOOL_COLUMNS

with engine.connect() as conn:
    for table, column in BOOL_COLUMNS:
        row = conn.execute(
            text(
                "SELECT data_type, column_default FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).fetchone()
        if row is None:
            print(f"{table}.{column}: NOT FOUND")
        else:
            print(f"{table}.{column}: {row[0]} (default: {row[1]})")
