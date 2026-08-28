# Schema drift: what the models declare vs what production has

2026-08-28. Written while introducing Alembic (`backend/alembic/`).

**Status: MEASURED AND RECONCILED, 2026-08-28.** The measurement is section 6: nine
differences, none alarming, resolved as six declaration fixes and three deliberate
survivors. Production was right in every case and nothing was applied to the
database. Sections 1-5 are kept as they were WRITTEN BEFORE the measurement, so the
prediction can still be read against the result; 6a scores it row by row.

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
**constraint** in `models.py` (line 285 when this was written; the declaration had
moved to :300 by the time it was measured, which is why a line number in a research
document is worth less than the symbol name). Same guarantee, different object, different
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
- nine column-level `index=True` indexes (this said "ten" and listed nine until
  2026-08-28; the list is right and the count was wrong): `ix_posts_format`, `ix_posts_status`,
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
database has no revision at all.

**And it does not merely fail to answer the question — it changes the thing being
asked about.** `alembic check` CREATES the `alembic_version` table on an
unstamped database, as part of failing. Measured on three identical fresh
`create_all` databases of 12 tables each:

| command | result | tables after |
|---|---|---|
| `alembic check` | exit 127, refuses | **13** — it wrote `alembic_version` |
| `alembic current` | works | 12 |
| `scripts/schema_diff.py` | works | 12 |

So the one Alembic command whose name says *read* performs DDL, and it performs
it on precisely the database whose untouched state is the evidence. That is what
the `PLEXIVE_DB_WRITE` guard in `alembic/env.py` exists for, and it is why
`check` is documented there as deliberately outside the guarded set with the
measurement written next to the decision.

**The order is therefore established rather than cautious:** `alembic stamp head`
asserts that the database matches the baseline. Running it before the comparison
would destroy the only chance to find out whether that assertion is true, and
running `alembic check` first writes to the database you have not yet dumped.

`scripts/schema_diff.py` uses `alembic.autogenerate.compare_metadata`, which
never consults `alembic_version`, works unstamped, and writes nothing.

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
| Extra table | `remove_table` | benign | A table the database has and the models do not describe. **Never drop on this evidence.** Leave it, or add it to `UNMANAGED_TABLES` in `alembic/policy.py` with a written reason. |
| Extra column | `remove_column` | benign | **Never drop on this evidence** — it may hold the only copy of something. Re-declare it in `models.py`, or record it as unmanaged. |
| Extra index | `remove_index` | benign | An index the database has and the models do not declare. **Do not guess how it got there** -- this table used to say "someone added it by hand", the tool's help text said the same, and it was wrong for all three of the ones actually found (section 6d). Establish the origin with `git log -S '<name>' --all`, then declare it or drop it in a migration. |
| Different type | `modify_type` | review | Was expected here (2a), and all four were reconciled on 2026-08-28, so a new one is NEW. Fix the **models** to match production. Never apply an autogenerated `ALTER TYPE` to a populated column unread: it rewrites the table. |
| Different nullability | `modify_nullable` | review | If production is the looser side, existing rows may already violate what the models assume. |
| Different default | `modify_default` | benign | Expected (2c). Only shown with `--server-defaults`. |
| **Anything resembling a rename** | drop + add | **NEVER APPLY** | Autogenerate cannot detect renames and destroys the old column's data. Replace with `op.alter_column(..., new_column_name=...)`. |

## 6. The measurement

**Taken 2026-08-28 at `29730c7`, clean tree, read-only, after the first backup.**

    compared 12 tables declared in models.py against 13 tables in the database
    not compared (deliberately unmanaged, alembic/policy.py): user_elo
    differences: 9

    MISSING FROM THE DATABASE
      [review] None on conversations(dm_key)  [add_constraint]
    EXTRA IN THE DATABASE
      [benign] ix_conversation_participants_conversation_id on conversation_participants(conversation_id)  [remove_index]
      [benign] uq_conversations_dm_key on conversations(dm_key)  [remove_index]
      [benign] ix_follows_id on follows(id)  [remove_index]
      [benign] ix_quiz_answers_user_id on quiz_answers(user_id)  [remove_index]
    DIFFERENT
      [review] posts.tags: JSONB -> JSON  [modify_type]
      [review] posts.connections: JSONB -> JSON  [modify_type]
      [review] posts.thumbnail_url: TEXT -> VARCHAR  [modify_type]
      [review] posts.thumbnail_spec: JSONB -> JSON  [modify_type]

    9 difference(s), 0 of them ALARMING

### 6a. Per row, against the section 2 prediction

| Predicted | Held? |
|---|---|
| 2a, four type differences | **Yes, and all four were reported.** The `VARCHAR`/`TEXT` row was predicted as possibly not even appearing; it did appear, so alembic's `compare_type` distinguishes them even though PostgreSQL does not. |
| 2b, `dm_key` constraint-vs-index | **Yes**, and it cost TWO of the nine, not one: an `add_constraint` and a `remove_index` for one object. |
| 2c, server defaults | Not exercised. `compare_server_default` is off by default and the run did not pass `--server-defaults`. |
| 2d, `user_elo` | **Yes.** Hidden, and named in the "not compared" line. |
| **2e, the genuinely open question** | **ANSWERED, AND THE ANSWER IS THE GOOD ONE.** Zero ALARMING entries: every column and index in 2e that no script ever applied is present in production. This is what the measurement was actually for. |

### 6b. The reconciliation, same day

The nine were resolved as **six declaration fixes and three deliberate survivors**.
Production was right in every case; nothing was applied to the database.

- The four `modify_type` rows: `models.py` now declares
  `JSON().with_variant(JSONB(), "postgresql")` on `tags`, `connections` and
  `thumbnail_spec`, and `Text` on `thumbnail_url`. The variant rather than a bare
  `JSONB` because all 16 suites run on SQLite (`tests/_throwaway_db.py:24`), which
  cannot render `JSONB`.
- The two `dm_key` rows: one object, confirmed below, now declared as
  `Index("uq_conversations_dm_key", "dm_key", unique=True)`.
- The three remaining indexes: see 6c. They stay.

Re-run at the same session, same command, models reconciled:

    compared 12 tables declared in models.py against 13 tables in the database
    not compared (deliberately unmanaged, alembic/policy.py): user_elo
    differences: 3

    EXTRA IN THE DATABASE
      [benign] ix_conversation_participants_conversation_id on conversation_participants(conversation_id)  [remove_index]
      [benign] ix_follows_id on follows(id)  [remove_index]
      [benign] ix_quiz_answers_user_id on quiz_answers(user_id)  [remove_index]

    3 difference(s), 0 of them ALARMING

That re-run is also the measurement that settles the one real technical risk in the
change. `with_variant` had to compare EQUAL to a reflected `jsonb` column under
alembic 1.19.1 / SQLAlchemy 2.0.50, and the four `modify_type` rows disappearing
against production's own columns is that proof, taken against the real thing rather
than against a local stand-in.

### 6c. `dm_key` was one object seen from two sides, and here is what decided it

Read off the live catalog, 2026-08-28, read-only. A rolled-back duplicate INSERT was
not needed and was not run.

    index_name              | uniq | pk | constraint_name | contype
    conversations_pkey      | t    | t  | conversations_pkey | p
    uq_conversations_dm_key | t    | f  | (none)             | -

`uq_conversations_dm_key` is `indisunique` with **no backing `pg_constraint` row**.
The `conversations_pkey` line in the same result is the control that makes that zero
trustworthy: the identical `LEFT JOIN` does find a constraint where one exists, so
`(none)` is a real absence rather than a join that matches nothing. Production
enforces the uniqueness with a bare `CREATE UNIQUE INDEX`
(`scripts/add_conversation_dm_key.py:81`); `models.py` declared an inline
auto-named unique CONSTRAINT. Same guarantee, different object kind, different name
-- which is why alembic reported it once as missing and once as extra.

### 6d. The three that stay, and why they are not "added by hand"

**The brief for this work said these were added by hand. They were not**, and the
correction matters more than the indexes do.

`git show ada78e5` (2026-07-06, *"refactor(models): drop redundant index flags"*):

> Follow.id (already PK-indexed), QuizAnswer.user_id and
> ConversationParticipant.conversation_id (each the leading column of a unique
> constraint, already covered) carried a redundant index=True. Model declaration
> only; **dropping the matching live-DB indexes is a separate manual op.**

`create_all` had built all three from those `index=True` flags -- which is why the
names match SQLAlchemy's `ix_<table>_<column>` auto-naming exactly. The commit
removed the flags and the separate manual op was never run, so the live indexes
outlived their declarations. Two independent searches confirm the negative: no
script in `backend/scripts/` creates any of the three names, and
`git log -S '<name>' --all` returns nothing for each.

They are therefore **not** re-declared in `models.py` -- that would reverse a
decision already made, and write three known-redundant indexes into the baseline so
that every fresh database and every disaster recovery builds them. They are also not
hidden in `alembic/policy.py`, for the reason recorded there: an exception list is
where a difference goes to stop being noticed, and unlike `user_elo` these are
pending an action rather than permanent.

**So the detector does not start clean.** `alembic check` will report exactly these
three until a `DROP INDEX` migration runs. That is acceptable only because the
migration is the immediate next step after the stamp, and it stops being acceptable
if it sits.

### 6e. Where the "added by hand" claim came from

From this tool's own help text. `scripts/schema_diff.py` printed, under every
`remove_index`, *"An index someone added by hand."* -- an assertion about ORIGIN
that a schema comparison cannot make. It was read as fact and carried into a brief
as fact.

That is a variant of the `## Rules` entry worth naming, because it is not a checker
that reported nothing. The detector worked perfectly: it found the three indexes and
grouped them correctly. What was wrong was the **explanatory prose wrapped around a
correct finding**, which is trusted exactly because the finding around it is right.
`ADVICE` now states what the difference IS and points at `git log -S` for the
origin; `remove_table` and `remove_column` were rewritten for the same defect, both
having opened with "Legacy."

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

## 8. Established since this document was written

Measured 2026-08-28 on a **local PostgreSQL 17.11**, against disposable databases
created and dropped for the purpose. Nothing in this section touched Supabase.

- **The Supabase project is on the free tier**, confirmed in the dashboard. Free
  performs no automatic backups at all, so `tools/backup_supabase.sh` is the only
  copy that exists.

- **The Supabase server is PostgreSQL 17.6** and the client here is 17.11, which
  is the safe direction. The rule is exact rather than folklore, and it is worth
  stating because the first real run should not be where anyone finds out:
  `_check_database_version()` in `pg_backup_db.c` aborts only when

      remoteversion != PG_VERSION_NUM
        && (remoteversion < minRemoteVersion || remoteversion > maxRemoteVersion)

  and `pg_dump.c` sets `minRemoteVersion = 90200`, `maxRemoteVersion =
  (PG_VERSION_NUM / 100) * 100 + 99`. For a 17.11 client that ceiling is
  **170099**, so every 17.x server passes; 17.6 is 170006. The refusal is on the
  **major** version, not the minor, and a 17.11 client raises no objection at all
  against 17.6.

- **The round trip works.** Fixture of 6 tables and 92 rows, RLS plus one policy
  on one of them: `backup_supabase.sh` -> `dropdb` -> `createdb` -> `pg_restore`
  returned row counts IDENTICAL to the manifest across all 6 tables, with RLS and
  the policy back. Run under `plexive_verify`, **`rolsuper` false**, and that is
  load-bearing: a superuser restore would have established almost nothing, since
  superusers bypass the ownership check entirely, so a green result would have
  been equally consistent with "ownership was correct" and "ownership was never
  checked".

- **The non-owner restore loses row-level security, and how loudly depends on the
  path.** Measured in the Supabase role shape (`rolsuper` false, `rolbypassrls`
  true, which is what Supabase's `postgres` reports). A table the restoring role
  does not own comes back with **RLS off, no policy and no rows**; the control
  table it does own comes back intact in the same run.

  | restore path | exit | RLS restored | visible |
  |---|---|---|---|
  | `pg_restore` (custom format) | **1**, `errors ignored on restore: 9` | no | every failure printed with its command |
  | `psql -f <schema>.sql` (the plain companion) | **0** | no | 7 errors on stderr only |
  | `psql -v ON_ERROR_STOP=1 -f` | **3** | no | stops at the first failure |

  So "comes back with RLS off and still reports success" is real, but it is a
  property of the **plain-SQL path without `ON_ERROR_STOP`**, not of restoring in
  general. `pg_restore` does report.

- **A role that is neither superuser, `BYPASSRLS`, nor the table's owner cannot
  back the table up at all.** `pg_dump` issues every `COPY` with
  `row_security = off`, and PostgreSQL then ERRORS rather than dumping a visible
  subset, aborting part-way and leaving a truncated file. `backup_supabase.sh`
  now refuses first, naming the blocking tables. Supabase's `postgres` has
  `rolbypassrls` true, so this does not bite production today -- but that is a
  property of Supabase's current role configuration, not a guarantee.

## 9. Still not established

- **Row-level security state in production.** Everything above is local.
  `tools/backup_supabase.sh` records it in its manifest; that manifest is still
  the first written record of it, and it has not been run against Supabase.
- **That a real Supabase restore behaves as the local one did.** The mechanism is
  now measured, the destination is not.
- **Whether the baseline renders identically under the PostgreSQL dialect.**
  SETTLED, and it does. Regenerated 2026-08-28 against an empty disposable
  PostgreSQL 17.11 with the existing revision parked aside: the operational body
  is **byte-identical**, 213 lines, zero differing lines. The file is kept, not
  replaced.

  The stronger measurement is the one next to it, because it tests the thing that
  actually depends on the rendering. `alembic upgrade head` against an empty
  PostgreSQL database succeeded, and the schema it built matched `models.py`:
  `schema_diff.py` reported `compared 12 tables ... differences: 0`, and
  `alembic check` -- which is valid there, since `upgrade head` stamps it --
  reported `No new upgrade operations detected`.

  **Which half of this work that affects is worth being precise about.** Section
  6's drift comparison uses `compare_metadata` against live metadata and never
  reads the baseline at all, so it was unaffected either way. What a
  SQLite-shaped baseline would have affected is `upgrade head` on a fresh
  database -- which is precisely what a disaster recovery runs. So this mattered
  for RECOVERY, not for the measurement.

## 10. An open modelling question, and a claim that was wrong

### 10a. What the types actually are

Measured 2026-08-28 by applying `0001_baseline.py` with `upgrade head` to an
empty PostgreSQL 17.11 database and reading `information_schema.columns`:

| PostgreSQL type | columns |
|---|---|
| `integer` | 38 |
| `character varying` (no length) | **21** |
| `timestamp without time zone` | **10** |
| `boolean` | 8 |
| `json` | 5 |
| `text` | 2 |
| `double precision` | **2** |

The two `double precision` columns are `users.knowledge_rating` and
`quiz_answers.rating_delta`. There are **no `numeric` columns anywhere** in the
schema.

**All of this comes from `models.py`, not from the migration.** It renders 21
`String` columns without length, 10 `Column(DateTime)` with `timezone=True` on
none of them, and `Column(Float)` on the two rating columns, which is
`double precision` on PostgreSQL. Autogenerate renders from the model metadata
rather than from whatever database it was pointed at, which is why the SQLite-
and PostgreSQL-generated baselines came out **byte-identical over 213 lines**.
`create_all` produces the same types, so this is what the application has always
built.

### 10b. It is a modelling question, and it has never been decided

Nobody has ever asked whether unbounded `VARCHAR` and naive timestamps are
intended here. They are recorded as an open question in their own right,
separate from anything about migrations. **Naive timestamps are the half worth
naming**: a product with its users in one timezone today and a launch aimed
wider is exactly where that surfaces later and expensively.

**But both halves were measured before being written down, and both are benign,
so this is recorded as SMALL rather than as a lurking defect.**

*Unbounded `VARCHAR` versus `TEXT`* -- no practical difference in PostgreSQL,
measured rather than asserted: both report `atttypmod = -1` (no length limit) and
`typlen = -1`, both carry storage class `x` (TOAST-able), both accepted a
100,000-character value, and an implicit `varchar -> text` cast exists. This is
also why section 2a predicts production's `TEXT` columns may not even be reported
as a difference.

*Naive timestamps* -- they are **UTC by construction**, through one helper.
`app/time_utils.py:14-16`:

    def utcnow() -> datetime:
        """Current UTC time as a NAIVE datetime, matching every stored timestamp."""
        return datetime.now(timezone.utc).replace(tzinfo=None)

Every `Column(DateTime, default=...)` in `models.py` uses it, and there are
**zero bare `datetime.now()` calls in `app/`**, so no local-time value can reach
a column. The only timezone-aware datetime in the application is `auth.py:89`,
a JWT expiry, which is not stored in a column.

So no stored timestamp is ambiguous today. What a naive column still cannot do
is carry an offset, so a future feature that needs one would have to convert at
the edges. That is the whole of the residue -- and it is also the shape of the
future work, which is the reason this is worth a line at all rather than
nothing: **a later move to `timestamptz` starts at the EDGES, not in the
schema.** Because every stored value is already UTC, the column type change is
the small half; what has to be decided is where an offset enters and leaves the
system -- request parsing, serialisation, and anything that renders a local time
to a user.

### 10d. `posts.feed_card` is `json`, not `jsonb`, and nobody decided that

Measured on production 2026-08-28, `pg_attribute` / `format_type`:

| column | production | models.py |
|---|---|---|
| `posts.feed_card` | `json` | `JSON` |
| `posts.sections` | `json` | `JSON` |
| `posts.tags` | `jsonb` | `JSON` -> now `JSON().with_variant(JSONB(), "postgresql")` |
| `posts.connections` | `jsonb` | same |
| `posts.thumbnail_spec` | `jsonb` | same |

`feed_card` and `sections` agree on both sides, which is why they never appeared as
drift. **But the agreement is an accident of mechanism, not a decision.** Those two
came with the table from `create_all`, which renders `Column(JSON)` as PostgreSQL
`json`; the three `jsonb` columns were added later by hand-written scripts that typed
`JSONB` themselves. Two different mechanisms, two different types, in one table, and
nobody ever compared them.

**It is left alone deliberately, and this is the one place in the reconciliation where
the type choice has behaviour attached rather than being metadata.** `feed_card` is the
only JSON column the application actually queries: `routers/search.py:130-131` runs
`cast(Post.feed_card, Text).ilike(...)`. Casting `jsonb` to text yields NORMALIZED
JSON -- keys reordered, insignificant whitespace stripped -- while casting `json`
yields the stored text verbatim. So switching it would silently change which search
strings match, particularly any that span a key boundary. That is a search decision to
be taken on its own evidence, not a schema tidy-up to be taken because the neighbouring
columns look different.

Worth stating plainly since it cuts the other way too: `feed_card` is exactly the
column where `jsonb` would have BOUGHT something. It is searched with a full-scan
`ILIKE` over a text cast today, and `jsonb` is what would make containment operators
and a GIN index available. The reason not to move it is the cast semantics above, not
that the current type is better.

### 10c. A claim made in this conversation that was NOT supported

It was said during this batch that the SQLite-generated baseline had produced
**wrong types** -- specifically twelve unbounded `VARCHAR`, three Elo columns as
`NUMERIC` instead of `DOUBLE PRECISION`, and eleven naive timestamps -- and that
regenerating against PostgreSQL had fixed them.

**None of that is supported by the artifacts.** The counts are 21, 10 and 2, not
12, 11 and 3; the two rating columns are `double precision` already, so the
`NUMERIC` claim is the reverse of what the database contains; and no repair took
place, because the regenerated baseline is byte-identical to the committed one.

It is written down rather than quietly dropped because a research document that
silently loses a claim it once carried is worse than one that says which claim
was wrong: the next reader is otherwise left wondering whether they misremembered
it. The claim came from inferring a repair from a plausible reading of an earlier
report rather than from an artifact, which is the same failure shape as the rest
of this document -- a conclusion that was never measured, reading exactly like one
that was.
