"""Alembic environment for Plexive.

Three things this file exists to get right, each of which has a way of going
wrong quietly:

1. ONE DEFINITION OF WHERE THE DATABASE IS. alembic.ini deliberately carries no
   sqlalchemy.url. The URL comes from app.database.DATABASE_URL, which is
   literally the same variable the application reads, so the schema tool and the
   app can never disagree about which database they mean.

2. THE TARGET IS ANNOUNCED BEFORE ANY CONNECTION. app/database.py calls a bare
   load_dotenv(), which resolves backend/.env from ANY working directory (the
   same hazard tests/_throwaway_db.py was written to defeat). A bare alembic
   command in backend/ therefore connects to whatever that untracked file names,
   and would otherwise do it silently. _announce_target() prints the resolved
   host, port, database and user -- never the password -- to stderr first.

3. WRITES NEED AN EXPLICIT OPT-IN. A line nobody reads is not a guard, so the
   announcement is not the protection; PLEXIVE_DB_WRITE=1 is. upgrade,
   downgrade, stamp and merge refuse without it, and the check FAILS CLOSED: if
   the command name cannot be determined (alembic driven through its API rather
   than its CLI) the flag is required anyway.

   The guard keys on the command NAME only and does not try to reason about
   which invocations can really write, so "upgrade --sql" -- which only prints
   SQL -- also needs the flag. That is deliberate. A guard simple enough to be
   obviously correct is worth more than one that is clever about its exceptions.

This file must never import app.main: that module validates JWT_SECRET and
FRONTEND_ORIGIN at import and would make alembic fail for reasons that have
nothing to do with the schema. Importing app.models is safe -- it builds an
engine object but opens no connection and runs no DDL (app/database.py:41;
create_all lives in app/main.py:_run_startup_ddl and runs only from lifespan).
"""

import os
import sys
from logging.config import fileConfig
from urllib.parse import urlparse

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# --- the write guard -------------------------------------------------------

# Commands that can change a real database. "revision" is absent on purpose: it
# writes a FILE, and "revision --autogenerate" only reads the database.
#
# "check" IS ABSENT AND THAT IS NOT QUITE FREE. Measured 2026-08-28 on a fresh
# create_all database: `alembic check` CREATES an empty alembic_version table
# (12 tables -> 13), while `alembic current` and scripts/schema_diff.py leave it
# at 12. So one nominally read-only command does perform DDL.
#
# It stays out of this set because the row-less table it creates asserts nothing
# -- it records no revision -- and because putting the ongoing drift detector
# behind a write flag would make people stop running it. The real protection is
# ordering, not the flag: against an unstamped database `check` cannot work
# anyway (it exits 127, "Target database is not up to date"), so the first look
# at production is scripts/schema_diff.py, which is genuinely read-only.
WRITE_COMMANDS = {"upgrade", "downgrade", "stamp", "merge", "ensure_version"}

WRITE_OPT_IN = "PLEXIVE_DB_WRITE"


def _command_name():
    """The alembic subcommand being run, or None if it cannot be determined.

    alembic's CLI stores the dispatch target on config.cmd_opts.cmd as a tuple
    whose first element is the command function. Nothing public exposes the
    name, so this reads that structure defensively and returns None rather than
    raising if a future version changes it -- None is treated as "unknown",
    which the caller handles by requiring the opt-in.
    """
    cmd = getattr(getattr(config, "cmd_opts", None), "cmd", None)
    if cmd is None:
        return None
    fn = cmd[0] if isinstance(cmd, (tuple, list)) and cmd else cmd
    return getattr(fn, "__name__", None)


def _enforce_write_opt_in():
    name = _command_name()
    known_read_only = name is not None and name not in WRITE_COMMANDS
    if known_read_only:
        return
    if os.environ.get(WRITE_OPT_IN) == "1":
        return
    shown = name or "unknown (alembic invoked through its API, not the CLI)"
    sys.exit(
        "REFUSED: " + shown + " can write to the database and "
        + WRITE_OPT_IN + " is not set.\n"
        "  Live database operations are deliberate here. If you mean it, re-run as:\n"
        "      " + WRITE_OPT_IN + "=1 .venv/Scripts/alembic.exe "
        + (name or "<command>") + " ...\n"
        "  Nothing was connected to and nothing was changed."
    )


# --- the target announcement ------------------------------------------------


def _redacted(url):
    """host/port/database/user of a database URL, with no password in it.

    Built from the parsed parts rather than by substituting the password out of
    the original string, so there is no pattern for a password to escape.
    """
    try:
        parts = urlparse(url)
    except ValueError:
        return "unparseable URL (not shown, it may contain a password)"
    path = parts.path or ""
    return (
        "scheme={} host={} port={} db={} user={} (password redacted)".format(
            parts.scheme, parts.hostname, parts.port, path.lstrip("/"), parts.username
        )
    )


def _announce_target(url, mode):
    """One line naming the database, before anything touches it.

    Same reasoning as main.py's _announce_gate(): a setting that is invisible
    until it goes wrong is the one that goes wrong.
    """
    print("[alembic] " + mode + " target: " + _redacted(url), file=sys.stderr, flush=True)


_enforce_write_opt_in()

# Imported AFTER the guard so a refused command does not even build an engine.
from app import database as app_database  # noqa: E402
from app import models as app_models  # noqa: E402,F401 -- registers every table on Base.metadata

target_metadata = app_database.Base.metadata

DATABASE_URL = app_database.DATABASE_URL


# --- what autogenerate is allowed to see ------------------------------------

# The comparison policy (which tables are deliberately unmanaged, whether types
# and server defaults are compared) lives in alembic/policy.py, which
# scripts/schema_diff.py imports too. One definition, so the migration tool and
# the drift report cannot disagree about what counts as a difference.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from policy import compare_opts  # noqa: E402

COMPARE_OPTS = compare_opts(target_metadata)


def run_migrations_offline():
    _announce_target(DATABASE_URL, "offline")
    context.configure(
        url=DATABASE_URL,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **COMPARE_OPTS,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    _announce_target(DATABASE_URL, "online")
    config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, **COMPARE_OPTS)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
