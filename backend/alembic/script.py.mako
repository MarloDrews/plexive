"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

REVIEW THIS FILE BY HAND BEFORE RUNNING IT. If it was produced by
--autogenerate, it is a candidate, not a migration.

  AUTOGENERATE CANNOT DETECT A RENAME. A renamed column or table is rendered as
  a drop plus an add. Applied, that silently destroys the data in the old one.
  If you renamed something, replace both operations with a single
  op.alter_column(..., new_column_name=...) or op.rename_table(...).

Two more things autogenerate gets wrong in THIS repository specifically:

  - Partial indexes. models.py:144-151 declares uq_events_user_like with a
    postgresql_where predicate. Alembic 1.19.1 DID render that predicate
    correctly when creating the index from the metadata (measured 2026-08-28
    while generating 0001_baseline.py), so this is a check rather than a known
    defect. Still read it: an index op that has lost its WHERE clause turns a
    partial unique index into a total one, which rejects rows the application
    expects to be able to write.

  - Type changes on populated columns. An ALTER TYPE rewrites the table. Never
    apply one you have not read, and never on production without a fresh dump
    (tools/backup_supabase.sh).
"""

from alembic import op
import sqlalchemy as sa  # noqa: F401 -- used by most but not all migrations
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
