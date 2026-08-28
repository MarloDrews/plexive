"""What autogenerate and the drift report are allowed to see.

ONE definition, imported by both alembic/env.py and scripts/schema_diff.py, so
the migration tool and the drift report can never disagree about what counts as
a difference. Same reasoning as app/graph_edges._latent_allowed, which is the
single place the person-only latency rule lives precisely so its two callers
cannot drift apart.
"""

# Tables that exist in the live database ON PURPOSE and are not described by
# models.py. Without this every autogenerate and every "alembic check" proposes
# dropping them, and a standing proposal to drop a table is the kind of thing
# that eventually gets applied by someone in a hurry.
#
#   user_elo -- the legacy per-format Elo table, replaced by the single
#               users.knowledge_rating column. models.py:252-254 records that it
#               is "left in the database for now (non-destructive) but is no
#               longer modeled or used".
#
# This hides a real object, so scripts/schema_diff.py --include-unmanaged turns
# the exclusion off: something hidden with no way to look at it is something
# that gets forgotten.
UNMANAGED_TABLES = {"user_elo"}


def include_object(object_, name, type_, reflected, compare_to):
    """Alembic include_object hook: drop the deliberately unmanaged tables."""
    if type_ == "table" and name in UNMANAGED_TABLES:
        return False
    return True


def include_everything(object_, name, type_, reflected, compare_to):
    """The --include-unmanaged variant: hide nothing at all."""
    return True


# compare_type=True so a drifted column type is reported. This database is
# expected to have some: scripts/add_graph_columns.py created posts.tags and
# posts.connections as JSONB while models.py declares generic JSON.
#
# compare_server_default is OFF by default. models.py uses Python-side default=
# throughout and never server_default=, while several scripts/add_*.py issued
# DEFAULT clauses, so switching it on reports a difference for each of them on
# every run. A drift detector that is permanently red is one nobody reads.
# scripts/schema_diff.py --server-defaults turns it on for a deliberate look.
#
# include_schemas=False keeps reflection to the default schema. A Supabase
# database also carries auth, storage, extensions and realtime schemas that this
# application does not own; with include_schemas=True autogenerate would propose
# dropping all of them.
def compare_opts(target_metadata, server_defaults=False, include_unmanaged=False):
    return dict(
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=server_defaults,
        include_schemas=False,
        include_object=include_everything if include_unmanaged else include_object,
    )
