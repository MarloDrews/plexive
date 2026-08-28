# Schema drift: what the models declare vs what production has

2026-08-28. Written while introducing Alembic (`backend/alembic/`).

**Status: the prediction below is complete; the measurement is not taken.** Nothing
in this batch connected to Supabase. Section 4 is the exact command to produce the
measurement, and section 6 is the empty space to paste it into.

---

## 1. Why nobody knows

The schema was built by `Base.metadata.create_all` (`backend/app/main.py:110`,
inside `_run_startup_ddl`, called only from `lifespan`). That creates missing
**tables** and never adds a **column** to an existing table. Everything beyond it
is 17 hand-written scripts in `backend/scripts/`, each run once by a person
against the live database, with no ledger of which ran or when.

So production's schema is:

    whatever existed historically
      + create_all for NEW TABLES ONLY, on every boot
      + 17 scripts, applied by hand, in an unrecorded order

There has never been a way to ask whether that equals `models.py`.

## 2. The prediction

Derived by reading all 17 scripts against `models.py` on 2026-08-28, **before**
any measurement. It is written down first so the measurement can confirm or
refute it rather than merely be interpreted afterwards.

### 2a. Type differences (expected, benign)

| Column | Script issued | `models.py` declares |
|---|---|---|
| `posts.tags` | `JSONB NOT NULL DEFAULT '[]'::jsonb` (`add_graph_columns.py:29`) | `JSON`, `default=list` |
| `posts.connections` | `JSONB NOT NULL DEFAULT '[]'::jsonb` (`add_graph_columns.py:30`) | `JSON`, `default=list` |
| `posts.thumbnail_spec` | `JSONB` (`add_thumbnail_columns.py:32`) | `JSON` |
| `posts.thumbnail_url` | `TEXT` (`add_thumbnail_columns.py:31`) | `String` |

`VARCHAR` without a length and `TEXT` are the same type to PostgreSQL, so the
last row may not even be reported. `JSON` vs `JSONB` is a real difference and is
**not** worth an `ALTER TYPE` on populated columns: fix the models instead.

### 2b. Constraint-shape difference

`conversations.dm_key` is a named unique **index** `uq_conversations_dm_key` in
production (`add_conversation_dm_key.py:81`) and an inline auto-named unique
**constraint** in `models.py:285`. Same guarantee, different object, different
name. Anything looking it up by name disagrees between the two.

### 2c. Server defaults (only visible with `--server-defaults`)

`users.can_publish`, `users.is_admin`, `users.token_version`,
`users.knowledge_answered_count`, `posts.tags`, `posts.connections` all carry a
PostgreSQL `DEFAULT` in production. `models.py` uses Python-side `default=`
throughout and never `server_default=`, so a database built fresh from the models
has no `DEFAULT` clause at all. A raw-SQL `INSERT` that omits those columns
therefore succeeds in production and fails or NULLs on a fresh database.

### 2d. A table production has and the models do not

`user_elo`, the legacy per-format Elo table replaced by `users.knowledge_rating`.
`models.py:252-254` records it as deliberately left in place. It is listed in
`backend/alembic/policy.py` as unmanaged, so it is **hidden by default** and
shown by `--include-unmanaged`.

### 2e. The genuinely open question

These are declared in `models.py` and **no script ever applied them**. They exist
in production only if their table was created after the declaration:

- `posts.is_user_content`, `users.is_private`, `users.is_verified`, `users.bio`,
  `users.avatar_url`, `follows.status`, `quiz_answers.rating_delta`
- ten column-level `index=True` indexes: `ix_posts_format`, `ix_posts_status`,
  `ix_posts_created_at`, `ix_posts_author_id`, `ix_users_email`,
  `ix_quiz_answers_post_id`, `ix_conversation_participants_user_id`,
  `ix_messages_conversation_id`, `ix_messages_created_at`

**This is the part the measurement is actually for.** If any of them is missing,
it appears as an ALARMING entry and the stamp must not happen yet.

## 3. Why `alembic check` cannot answer this, and what does

`alembic check` is the obvious candidate and it does not work here. Measured on a
disposable SQLite database in the state production is in — schema present,
never stamped:

    $ alembic check
    ERROR [alembic.util.messaging] Target database is not up to date.
    FAILED: Target database is not up to date.
    exit code 127

Autogenerate requires the database to be at the head revision, and an unstamped
database has no revision at all. **The order therefore matters and is not a
preference:** `alembic stamp head` asserts that the database matches the
baseline. Running it before the comparison would destroy the only chance to find
out whether that assertion is true.

A second measurement, on three identical fresh `create_all` databases of 12
tables each:

| command | result | tables after |
|---|---|---|
| `alembic check` | exit 127, refuses | **13** — it creates `alembic_version` |
| `alembic current` | works | 12 |
| `scripts/schema_diff.py` | works | 12 |

So the nominally read-only `alembic check` performs DDL on an unstamped
database. `scripts/schema_diff.py` uses `alembic.autogenerate.compare_metadata`,
which never consults `alembic_version`, works unstamped, and writes nothing.

After a successful stamp, `alembic check` becomes the ongoing drift detector.

## 4. The command

From `backend/`, read-only, safe against production:

    .venv\Scripts\python.exe scripts\schema_diff.py

Optional:

    .venv\Scripts\python.exe scripts\schema_diff.py --server-defaults
    .venv\Scripts\python.exe scripts\schema_diff.py --include-unmanaged

It prints the target host (never the password), how many tables it compared on
each side, and the differences grouped by what is true of the schema.

**It reports; it does not gate.** It exits non-zero only when it could not do its
job — no tables in `Base.metadata`, or no tables in the database — because a
comparison that ran against nothing reports zero differences, and zero
differences is the reassuring answer.

## 5. What each kind of difference means

Alembic names differences after the migration operation it would generate, which
reads **backwards** to a human: its `remove_column` means the column is in the
**database** and not in the models. Printing that at a person is how a column
gets dropped by someone who thought it was the safe direction. `schema_diff.py`
groups by the human statement and puts alembic's op name in brackets.

| Report | alembic op | Severity | What to do |
|---|---|---|---|
| Missing table | `add_table` | **ALARMING** | The app expects a table that is not there. Do not stamp. |
| Missing column | `add_column` | **ALARMING** | The app writes a column production lacks. Run the matching `scripts/add_*.py`, or write a real migration, then re-run. Do not stamp. |
| Missing index | `add_index` | benign | Costs speed, not correctness. Worth adding; does not block a stamp. Called out explicitly because a benign category the detector cannot see is worse than an alarming one it can — nobody would think to check. Injection-tested (section 7). |
| Missing constraint | `add_constraint` | review | Check whether existing rows would satisfy it before adding. |
| Extra table | `remove_table` | benign | **Never drop on this evidence.** Leave it, or add it to `UNMANAGED_TABLES` in `alembic/policy.py` with a written reason. |
| Extra column | `remove_column` | benign | **Never drop on this evidence** — it may hold the only copy of something. Re-declare it in `models.py`, or record it as unmanaged. |
| Extra index | `remove_index` | benign | Someone added it by hand. Declare it in `models.py` if it should be permanent. |
| Different type | `modify_type` | review | Expected here (2a). Fix the **models** to match production. Never apply an autogenerated `ALTER TYPE` to a populated column unread: it rewrites the table. |
| Different nullability | `modify_nullable` | review | If production is the looser side, existing rows may already violate what the models assume. |
| Different default | `modify_default` | benign | Expected (2c). Only shown with `--server-defaults`. |
| **Anything resembling a rename** | drop + add | **NEVER APPLY** | Autogenerate cannot detect renames and destroys the old column's data. Replace with `op.alter_column(..., new_column_name=...)`. |

## 6. The measurement

*(Empty. Paste the full output of section 4's command here, with the date it was
run and the `git rev-parse HEAD` it was run at. Then note, per row, whether the
prediction in section 2 held.)*

    (not yet taken -- nothing in this batch connected to Supabase)

## 7. How the detector was shown not to be blind

A report that finds nothing and a report that cannot see are the same output, and
the same output is the reassuring one. So the detector was tested against a
database with four deliberate drifts injected, on a disposable SQLite database
built by `alembic upgrade head`:

| Injected | Reported as | Heading |
|---|---|---|
| `ALTER TABLE users DROP COLUMN bio` | `[ALARMING] users.bio type=VARCHAR [add_column]` | MISSING FROM THE DATABASE |
| `DROP INDEX ix_posts_created_at` | `[benign] ix_posts_created_at on posts(created_at) [add_index]` | MISSING FROM THE DATABASE |
| `CREATE TABLE stray_table (...)` | `[benign] table stray_table [remove_table]` | EXTRA IN THE DATABASE |
| `CREATE TABLE user_elo (...)` | correctly **hidden**, named in "not compared (deliberately unmanaged)"; appears as a 4th difference under `--include-unmanaged` | — |

Three differences by default, four with `--include-unmanaged`, each under its own
heading. And the clean direction: the same database before injection reported
`compared 12 tables declared in models.py against 13 tables in the database` and
`differences: 0` — a zero next to a count, rather than a zero on its own.

## 8. Not established

- **Whether the Supabase project is on the free tier.** Free performs no
  automatic backups at all. Establish it in the dashboard; do not assume it.
- **The PostgreSQL major version of the Supabase server**, which decides which
  `pg_dump` to install.
- **Whether the baseline renders identically under the PostgreSQL dialect.** It
  was generated against a disposable SQLite database because no PostgreSQL was
  available on the machine. `models.py` uses only generic SQLAlchemy types, so
  the rendering should not differ — but *should not* is not *does not*, and this
  is the one claim in this document resting on reasoning rather than a
  measurement. Regenerate against a disposable PostgreSQL and diff the two files
  before relying on the baseline for anything but a stamp.
- **Row-level security state in production.** `tools/backup_supabase.sh` records
  it in its manifest; that manifest is the first written record of it.
