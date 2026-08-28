"""drop redundant indexes

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-28 19:25:45.854109

WRITTEN BY HAND, NOT BY --autogenerate. Autogenerate would have proposed these
three drops from the same difference, but the question a schema comparison
cannot answer is whether dropping them is SAFE, and that is what this file
records.

WHAT IT DROPS, AND WHAT ALREADY COVERS EACH ONE. Read off production's catalog
on 2026-08-28 (pg_index / pg_class / pg_constraint, LEFT JOIN to pg_constraint),
not off the commit message that created the situation:

    ix_follows_id                                 btree (id)
      covered by follows_pkey                     UNIQUE btree (id)
      -- IDENTICAL column list, total redundancy

    ix_quiz_answers_user_id                       btree (user_id)
      covered by uq_quiz_answer                   UNIQUE btree (user_id, post_id,
                                                                question_index)
      -- user_id is the LEADING column, so the wider index serves the same lookups

    ix_conversation_participants_conversation_id  btree (conversation_id)
      covered by uq_conversation_participant      UNIQUE btree (conversation_id,
                                                                user_id)
      -- conversation_id is the LEADING column, same reasoning

All three are non-unique and carry NO backing pg_constraint row, so nothing
depends on them and the drop cannot cascade. That zero is trustworthy because
the identical LEFT JOIN in the same result DID find the six constraints above
-- a real absence rather than a join matching nothing.

WHERE THEY CAME FROM. create_all built them from index=True flags that ada78e5
(2026-07-06) removed as redundant; that commit's "dropping the matching live-DB
indexes is a separate manual op" never ran, so the indexes outlived their
declarations. This is that op, 53 days later. The same
commit KEPT ix_quiz_answers_post_id and ix_conversation_participants_user_id,
and it was right to: post_id is a MIDDLE column of uq_quiz_answer and user_id is
the TRAILING column of uq_conversation_participant, so neither is covered by a
prefix. Do not extend this migration to them.

WHY THE DROPS ARE CONDITIONAL. A disaster recovery runs `alembic upgrade head`
against an empty database. 0001 never creates these three, so a bare
op.drop_index() would ERROR on precisely the run that matters most. The
conditional is required, not tidiness.

WHY IT PRINTS A COUNT AND DOES NOT ASSERT ONE. A conditional drop can succeed
having done nothing, which is the shape this repository keeps finding. But
"dropped 3 of 3" against production and "dropped 0 of 3" against a fresh
database are BOTH correct outcomes, so no floor can be asserted here without
breaking recovery. The number is printed instead, which is the most this
migration can honestly do; the assertion lives in scripts/schema_diff.py and
`alembic check`, which are run either side of it.

THE DOWNGRADE IS REAL AND RECREATES ALL THREE. It will not be used. Writing it
is what forced the question of whether the drop is reversible to be answered
rather than assumed, and the answer was measured: after `downgrade -1` on a
local rehearsal database, pg_get_indexdef returned text byte-identical to
production's for all three.
"""

from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


# (index name, table, columns, what already covers it)
REDUNDANT = [
    (
        "ix_follows_id",
        "follows",
        ["id"],
        "follows_pkey UNIQUE btree (id) -- identical column list",
    ),
    (
        "ix_quiz_answers_user_id",
        "quiz_answers",
        ["user_id"],
        "uq_quiz_answer UNIQUE btree (user_id, post_id, question_index)"
        " -- leading column",
    ),
    (
        "ix_conversation_participants_conversation_id",
        "conversation_participants",
        ["conversation_id"],
        "uq_conversation_participant UNIQUE btree (conversation_id, user_id)"
        " -- leading column",
    ),
]


def _present(inspector, table, name):
    return name in {ix["name"] for ix in inspector.get_indexes(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    dropped = 0
    for name, table, _columns, covered_by in REDUNDANT:
        if _present(inspector, table, name):
            op.drop_index(name, table_name=table)
            dropped += 1
            print("[0002] dropped {} on {} -- covered by {}".format(
                name, table, covered_by), flush=True)
        else:
            print("[0002] absent, nothing to drop: {} on {}".format(
                name, table), flush=True)
    print("[0002] dropped {} of {} redundant indexes".format(
        dropped, len(REDUNDANT)), flush=True)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    recreated = 0
    for name, table, columns, _covered_by in REDUNDANT:
        if _present(inspector, table, name):
            print("[0002] already present, nothing to recreate: {} on {}".format(
                name, table), flush=True)
        else:
            op.create_index(name, table, columns, unique=False)
            recreated += 1
            print("[0002] recreated {} on {}({})".format(
                name, table, ", ".join(columns)), flush=True)
    print("[0002] recreated {} of {} redundant indexes".format(
        recreated, len(REDUNDANT)), flush=True)
