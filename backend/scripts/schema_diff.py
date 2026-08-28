"""Read-only report: how the live schema differs from what models.py declares.

WHY THIS EXISTS RATHER THAN `alembic check`. `alembic check` refuses to run
against a database that has never been stamped -- autogenerate requires the
database to be at the head revision, and an unstamped database has no revision
at all. That is a trap, not an inconvenience: it would force `alembic stamp
head` first, and stamping ASSERTS that the database matches the baseline. Doing
that before comparing would destroy the only chance to find out whether it
actually does.

This script uses alembic.autogenerate.compare_metadata, which compares a live
connection against Base.metadata and never consults alembic_version. It works on
an unstamped database, which is exactly the state production is in today.

Measured 2026-08-28 on three identical fresh create_all databases (12 tables
each), which is the second reason to reach for this one first:

    alembic check       -> exits 127 "Target database is not up to date."
                           AND leaves 13 tables: it CREATES alembic_version.
    alembic current     -> 12 tables, no write.
    this script         -> 12 tables, no write.

So the nominally read-only `alembic check` performs DDL on a database that has
never been stamped, and this script does not.

After a successful stamp, `alembic check` becomes the ongoing drift detector and
this stays the one that still works whenever the ledger itself is in doubt.

READING THE OUTPUT. Alembic names its differences after the migration operation
it would generate, which reads BACKWARDS to a human: its "remove_column" means
the column is in the DATABASE and not in the models. Printing that at a person
is how a column gets dropped by someone who thought it was the safe direction.
So this report groups by what is true of the schema, and puts alembic's own op
name in brackets afterwards.

Run manually from backend/, never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\schema_diff.py

    .venv\\Scripts\\python.exe scripts\\schema_diff.py --server-defaults
    .venv\\Scripts\\python.exe scripts\\schema_diff.py --include-unmanaged

Read-only: no DDL, no INSERT/UPDATE/DELETE, no stamping. Safe to run any time,
including against production. It opens one connection, reflects, prints, and
closes.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from urllib.parse import urlparse  # noqa: E402

from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from sqlalchemy import create_engine, inspect  # noqa: E402

# The comparison policy is shared with alembic/env.py so the report and the
# migration tool cannot disagree about what counts as a difference.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic"))

from policy import UNMANAGED_TABLES, compare_opts  # noqa: E402

from app import models as app_models  # noqa: E402,F401 -- registers every table on Base.metadata
from app.database import Base  # noqa: E402


# How each alembic diff op maps onto a statement about the schema, and how
# worried to be. The op name is alembic's; the heading is the human one.
MISSING = "MISSING FROM THE DATABASE -- models.py declares it, production does not have it"
EXTRA = "EXTRA IN THE DATABASE -- production has it, models.py does not declare it"
DIFFERENT = "DIFFERENT -- the same object, defined differently on each side"

GROUPS = {
    "add_table": (MISSING, "ALARMING"),
    "add_column": (MISSING, "ALARMING"),
    "add_index": (MISSING, "benign"),
    "add_constraint": (MISSING, "review"),
    "add_fk": (MISSING, "review"),
    "remove_table": (EXTRA, "benign"),
    "remove_column": (EXTRA, "benign"),
    "remove_index": (EXTRA, "benign"),
    "remove_constraint": (EXTRA, "benign"),
    "remove_fk": (EXTRA, "benign"),
    "modify_type": (DIFFERENT, "review"),
    "modify_nullable": (DIFFERENT, "review"),
    "modify_default": (DIFFERENT, "benign"),
    "modify_comment": (DIFFERENT, "benign"),
}

ADVICE = {
    "add_table": "The app expects a table that is not there. Do not stamp. Find out why.",
    "add_column": "The app writes a column production does not have. Do not stamp: run the\n"
                  "      matching scripts/add_*.py, or write a real migration, then re-run this.",
    "add_index": "An index the models declare and production lacks. Costs speed, not\n"
                 "      correctness. Worth adding, but it does not block a stamp.",
    "add_constraint": "A constraint production does not enforce. Check whether existing rows\n"
                      "      would even satisfy it before adding.",
    "add_fk": "A foreign key production does not enforce. Check existing rows first.",
    "remove_table": "Legacy. NEVER drop it on this evidence. Either leave it, or add it to\n"
                    "      UNMANAGED_TABLES in alembic/policy.py with a written reason.",
    "remove_column": "Legacy, or a column dropped from the models but not the database.\n"
                     "      NEVER drop it on this evidence -- it may hold the only copy of something.\n"
                     "      Re-declare it in models.py, or record it as deliberately unmanaged.",
    "remove_index": "An index someone added by hand. Harmless. Declare it in models.py if it\n"
                    "      should be permanent.",
    "remove_constraint": "A constraint production enforces and the models do not know about.",
    "remove_fk": "A foreign key production enforces and the models do not know about.",
    "modify_type": "Expected here for JSON vs JSONB (scripts/add_graph_columns.py created\n"
                   "      posts.tags and posts.connections as JSONB while models.py says JSON) and\n"
                   "      for String vs TEXT, which PostgreSQL treats identically. Fix the MODELS to\n"
                   "      match production. Never apply an autogenerated ALTER TYPE to a populated\n"
                   "      column without reading it: it rewrites the table.",
    "modify_nullable": "One side allows NULL and the other does not. If production is the looser\n"
                       "      side, existing rows may already violate what the models assume.",
    "modify_default": "A server-side DEFAULT that models.py expresses as a Python-side default=.\n"
                      "      Expected, and only shown with --server-defaults.",
    "modify_comment": "Cosmetic.",
}


def _redacted(url):
    """host/database/user of a database URL, never the password."""
    try:
        parts = urlparse(url)
    except ValueError:
        return "unparseable URL (not shown, it may contain a password)"
    return "host={} port={} db={} user={}".format(
        parts.hostname, parts.port, (parts.path or "").lstrip("/"), parts.username
    )


def _op_of(diff):
    """The alembic op name of one diff entry.

    compare_metadata returns tuples, except for column modifications, which come
    back as a LIST of tuples describing the same column. Both shapes carry the op
    name in the first slot of a tuple.
    """
    if isinstance(diff, list):
        return diff[0][0] if diff and diff[0] else "unknown"
    return diff[0] if diff else "unknown"


def _describe(diff):
    """One readable line for a diff entry: what object, and where."""
    if isinstance(diff, list):
        parts = []
        for entry in diff:
            op, _schema, table, column = entry[0], entry[1], entry[2], entry[3]
            old, new = entry[-2], entry[-1]
            parts.append("{}.{}: {} -> {}  [{}]".format(table, column, old, new, op))
        return "; ".join(parts)

    op = diff[0]
    if op in ("add_table", "remove_table"):
        return "table {}  [{}]".format(diff[1].name, op)
    if op in ("add_column", "remove_column"):
        return "{}.{}  type={}  [{}]".format(diff[2], diff[3].name, diff[3].type, op)
    if op in ("add_index", "remove_index", "add_constraint", "remove_constraint"):
        obj = diff[1]
        name = getattr(obj, "name", "<unnamed>")
        table = getattr(getattr(obj, "table", None), "name", "?")
        cols = ""
        try:
            cols = "(" + ", ".join(c.name for c in obj.columns) + ")"
        except Exception:
            pass
        return "{} on {}{}  [{}]".format(name, table, cols, op)
    return "{}  [{}]".format(diff[1:], op)


def main():
    server_defaults = "--server-defaults" in sys.argv
    include_unmanaged = "--include-unmanaged" in sys.argv

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in backend/.env)")

    # Named before anything connects, for the same reason alembic/env.py does it:
    # app/database.py's bare load_dotenv() resolves backend/.env from any working
    # directory, so which database this is talking to is not obvious from the
    # command line.
    print("target: " + _redacted(url))
    print("mode:   read-only (no DDL, no writes, no stamp)")
    if server_defaults:
        print("        --server-defaults: server DEFAULT clauses are compared too")
    if include_unmanaged:
        print("        --include-unmanaged: showing " + ", ".join(sorted(UNMANAGED_TABLES)))
    print()

    engine = create_engine(url)
    opts = compare_opts(
        Base.metadata,
        server_defaults=server_defaults,
        include_unmanaged=include_unmanaged,
    )

    with engine.connect() as conn:
        db_tables = sorted(inspect(conn).get_table_names())
        context = MigrationContext.configure(conn, opts=opts)
        diffs = compare_metadata(context, Base.metadata)

    metadata_tables = sorted(Base.metadata.tables)

    # Assert on a count. A comparison that ran against nothing reports no
    # differences, and no differences is the reassuring answer -- which is
    # exactly the shape this repository keeps finding. Zero is only meaningful
    # next to how much was actually compared.
    print("compared {} tables declared in models.py against {} tables in the database".format(
        len(metadata_tables), len(db_tables)))
    if not metadata_tables:
        sys.exit("FATAL: Base.metadata has no tables -- the models did not import; nothing was compared")
    if not db_tables:
        sys.exit("FATAL: the database has no tables -- wrong database, or an empty one; nothing was compared")

    if not include_unmanaged:
        hidden = sorted(UNMANAGED_TABLES.intersection(db_tables))
        if hidden:
            print("not compared (deliberately unmanaged, alembic/policy.py): " + ", ".join(hidden))

    print("differences: {}".format(len(diffs)))
    print()

    if not diffs:
        print("no differences -- the database matches what models.py declares")
        print()
        print("That is the clean case. `alembic stamp head` is now a true statement")
        print("about this database rather than an assertion nobody checked.")
        print("done")
        return

    buckets = {}
    for diff in diffs:
        op = _op_of(diff)
        heading, severity = GROUPS.get(op, (DIFFERENT, "review"))
        buckets.setdefault(heading, []).append((op, severity, diff))

    alarming = 0
    for heading in (MISSING, EXTRA, DIFFERENT):
        entries = buckets.get(heading)
        if not entries:
            continue
        print("=" * 78)
        print(heading)
        print("=" * 78)
        seen_ops = []
        for op, severity, diff in entries:
            if severity == "ALARMING":
                alarming += 1
            print("  [{}] {}".format(severity, _describe(diff)))
            if op not in seen_ops:
                seen_ops.append(op)
        for op in seen_ops:
            print()
            print("  what to do about {}:".format(op))
            print("      " + ADVICE.get(op, "No guidance recorded for this kind."))
        print()

    print("=" * 78)
    print("{} difference(s), {} of them ALARMING".format(len(diffs), alarming))
    if alarming:
        print()
        print("DO NOT RUN `alembic stamp head` YET. Stamping asserts that this database")
        print("matches the baseline, and the entries above say it does not. Resolve them")
        print("first, then re-run this report until only benign entries remain.")
    else:
        print()
        print("Nothing alarming. Every entry above is a benign or reviewable difference.")
        print("Read them once, decide, then `alembic stamp head` is safe to run.")
    print()
    print("This report changed nothing. Paste it into")
    print("docs/research/schema-drift-2026-08.md next to the prediction.")
    print("done")


if __name__ == "__main__":
    main()
