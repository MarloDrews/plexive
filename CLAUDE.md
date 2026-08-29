# Plexive

Open source social media app that replaces doomscrolling with valuable content.

## Rules
- All code comments in English
- No emojis in code or comments
- I am a beginner, briefly explain what you are doing and why
- `.claude/skills/execution-discipline/SKILL.md` carries the execution discipline for this repository and applies to every task that changes a file, including the rule on staying inside the current task's scope
- After every change, update ARCHITECTURE.md. One line per new or changed item. No explanations beyond what is already there — just add or update the relevant entry. Never let it grow into prose.
- A change that makes existing documentation false must correct it in the same commit or the same batch, even when that falls outside the stated scope. This covers ARCHITECTURE.md, CLAUDE.md and the CI notes. Scope boundaries exist to prevent creep, not to preserve known-false text.
- A step that watches for a condition reports its own failure. A broken checker and a checker that found nothing produce identical output, and the identical output is the reassuring one, which is why every gate here asserts on a count. The INVERSE is a separate defect and is not the same rule: a check that reds on correct work teaches people to ignore red. Nineteen occurrences, the nineteenth kept distinct from the other eighteen for exactly that reason: `docs/RULE_HISTORY.md` under "## Rule: a step that watches for a condition reports its own failure".

Marlo decides what the product is: which features exist, how it presents itself, the positioning, the
values and the money. He does not evaluate technical choices and is not asked to. A technical question is
settled from evidence in the session, or routed to a named specialist, and the report says which of the two
happened.

## Content Model

ALL FOUR OF THE FILES THIS SECTION USED TO NAME ARE GONE FROM THIS REPOSITORY as of 2026-08-29 (batch C, see Content Methodology below). Do not search for them here; they are in the private content repository, at the SAME paths relative to its root:

- Full schema spec: `docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md`
- Books skeleton: `docs/content-structure/skeletons/books_skeleton.jsonc`
- Books example: `docs/content-structure/examples/books_example.json`
- Style guide: `docs/content-structure/STYLE_GUIDE_LONGFORM.md`

The authoritative description of the shape a post takes is therefore `backend/app/models.py` plus `frontend/src/types/post.ts` and `SectionRenderer.tsx`, which are here and which the code actually executes. The spec is the intent; those are the fact.

SVG security: `is_user_content=false` (seed/official) uses `dangerouslySetInnerHTML`; `is_user_content=true` (user submissions) uses a base64 `<img>` data URL. This applies in `SectionRenderer` (CoreIdeasSection, TakeawaySection) and `PostCard`.

## Git Workflow

`main` is protected by a ruleset: the `android-build`, `backend-checks` and `frontend-checks` status checks are required and force pushes are blocked. A commit therefore cannot be pushed straight to `main`, because a fresh commit has no check result yet.

Changes reach `main` this way: branch off `main`, push the branch, open a pull request, let the three checks go green on it, then merge. This is not a review requirement; the same person may open and merge the pull request.

The merge is a MERGE COMMIT made with GitHub's "Merge pull request" button, never a squash, a rebase or a local `git merge` followed by a push: the ruleset requires a check to have reported on the commit, and all three run once per pull request, so a branch pushed on its own produces no run at all. The title obeys the same conventional-commit rule as any other commit, `chore(merge): merge <branch> into main`; Dependabot's titles are already conventional and are not rewritten. Which forms have actually been observed here: `docs/RULE_HISTORY.md` under "## Rule: changes reach `main` through a pull request, and the merge is a merge commit".

Branches are named `<type>/<short-kebab-description>`, with the type drawn from the commit-type vocabulary; `spike/` and `integration/` say what a branch is FOR and exempt it from nothing. Dependabot names its own `dependabot/<ecosystem>/<path>/<package>-<version>`, and those are not ours to name or to rename. A merged branch is DELETED, remote and local, by whoever merged the pull request, as part of the same batch. Confirm ancestry first rather than trusting the "Merged" badge, which is not the same claim: `git merge-base --is-ancestor <branch> origin/main`, or `git branch --merged origin/main` to list the safe ones in one go. The prefix vocabulary in use, and why the badge is not enough: `docs/RULE_HISTORY.md` under "## Rule: branches are named `<type>/<short-kebab-description>`" and "## Rule: a merged branch is deleted, after confirming ancestry rather than trusting the badge".

CONFIRM CHECK RESULTS AGAINST THE HEAD SHA, NOT AGAINST WHATEVER `watch` RETURNS, and read the JOB IDS as well as the conclusions, since identical ids across two different heads is the tell and the only part of that output that distinguishes a fresh green from a stale one. The measurement behind this: `docs/RULE_HISTORY.md` under "## Rule: confirm check results against the head SHA".

    SHA=$(git rev-parse HEAD)
    gh api "repos/:owner/:repo/commits/$SHA/check-runs" --paginate \
      --jq '.check_runs[] | select(.name=="android-build" or .name=="backend-checks" or .name=="frontend-checks") | "\(.name) \(.status) \(.conclusion) job \(.id)"'

## CI

Three required checks, one per codebase, one job each: `android-build`, `backend-checks`, `frontend-checks`. There are five workflow files; those three are the gates, and `codeql.yml` and `dependency-submission.yml` are deliberately not. `android-build.yml` sets `distribution: corretto` because `mobile-kmp/gradle/gradle-daemon-jvm.properties` pins `toolchainVendor=AMAZON`, so changing either one means changing the other. Everything else is in `docs/CI_NOTES.md`: why each trigger is scoped as it is, under "## Workflows, triggers and which three are gates"; why every check asserts on a count, under "## Conventions every job follows"; the `battle_test.py` hangs and their diagnosis, under "## The backend suite loop and the `battle_test.py` hangs"; the derivation of the 300 s and 180 s timeouts, under "## Timeouts, watchdogs and where their numbers come from"; the standing requirement to take a before-number against an untouched tree, under "## Taking a before-number"; the pinning policy, under "## Route counts, pinning and mirroring production"; and where the four floors sit, under "## The four count floors in `backend-checks.yml`".

## Schema Migrations

Alembic landed 2026-08-28 (`backend/alembic/`, `backend/alembic.ini`). It is CONFIGURED, RECONCILED AND STAMPED. `alembic stamp head` ran against production on 2026-08-28; `public.alembic_version` holds one row, `0001`, measured read-only the same day. The gap this paragraph used to describe -- configured but deliberately unstamped -- is closed, and the ledger is live.

THREE INDEXES STAY, AND THE DETECTOR THEREFORE DOES NOT START CLEAN. `ix_follows_id`, `ix_quiz_answers_user_id` and `ix_conversation_participants_conversation_id` are in production and not in the models. They were NOT added by hand, which is what the drift report's own help text claimed and what a work brief then repeated as fact: `create_all` built them from `index=True` flags that `ada78e5` (2026-07-06) removed as redundant, and that commit's "dropping the matching live-DB indexes is a separate manual op" never happened. Re-declaring them would reverse that decision and write three redundant indexes into every fresh database; hiding them in `alembic/policy.py` would park a pending action inside an exception list, which is where a difference goes to stop being noticed. THAT MIGRATION NOW EXISTS: `alembic/versions/0002_drop_redundant_indexes.py`, reviewed, rehearsed locally in both directions, and NOT YET APPLIED. Until it is applied, `scripts/schema_diff.py` reports exactly these three; `alembic check` reports nothing at all, because it requires the database to be AT HEAD rather than merely stamped, and production sits at `0001` while head is `0002` (exit 127, `Target database is not up to date.`, measured 2026-08-28). A FOURTH entry from `schema_diff.py` is new drift.

THE ORDER IS LOAD-BEARING AND IT IS THE OPPOSITE OF THE OBVIOUS ONE. `alembic stamp head` ASSERTS that the database matches the baseline. Running it first would destroy the only chance to find out whether that assertion is true, and it is cheap to run, which is exactly what makes it tempting. So: back up, compare, read, and only then stamp.

ALEMBIC'S DIFF NAMES READ BACKWARDS TO A HUMAN and this is a trap worth naming rather than discovering. `remove_column` does not mean a column was removed from the models; it means the column is in the DATABASE and not in the models, so the migration would drop it. Read at speed, that is how a column gets dropped by somebody who thought it was the safe direction. `schema_diff.py` therefore groups by what is true of the schema -- MISSING FROM THE DATABASE / EXTRA IN THE DATABASE / DIFFERENT -- and keeps alembic's op name in brackets.

`scripts/schema_diff.py` is the detector that always answers; `alembic check` needs the database AT HEAD, and on an unstamped one it performs DDL rather than reporting. The numbered live-command order is in `docs/SERVER.md` under "Schema-Migrationen (Alembic)". The 17 pre-alembic scripts STAY, and `RUN_STARTUP_DDL=0` on the Pi is the outstanding live-config change. Workings: `docs/research/schema-drift-2026-08.md`; the reconciliation and the guards in `env.py`: `docs/RULE_HISTORY.md` under "## Rule: alembic is the schema ledger, and the stamp comes last".

## Backups

`tools/backup_supabase.sh`, added 2026-08-28. Supabase's free tier performs NO automatic backups, so this is the only copy.

A SESSION THAT TOUCHES THE DATABASE OR THE SCHEMA CHECKS THE BACKUP AGE FIRST: `bash tools/check_backup_age.sh`. No gate can see a laptop, so this line is the reminder -- it is the closest thing to an automated one that exists here.

THE AGE CHECK IS THE PART THAT MATTERS MORE THAN THE SCHEDULE. A forgotten backup is noticed the moment anyone looks; a scheduled one that has been failing for two months looks exactly like a working one until it is needed. `tools/check_backup_age.sh` reports the age of the newest manifest across FOUR situations with four exit codes, deliberately not merged: 0 current, 1 STALE, 2 NO BACKUPS AT ALL (the loudest, not the quietest), 3 current but never reached OneDrive. THRESHOLD 16 DAYS = 7 (weekly) + 7 (one occurrence lost outright, since StartWhenAvailable cannot fire on a machine that is off) + 2 (a weekend nobody would act in). The dangerous direction is DOWN, as with the 300 s and 180 s CI timeouts: a check that reds on a healthy-but-delayed backup gets switched off, and this one has no gate behind it. It reads METADATA ONLY -- Files On-Demand means reading a manifest would download it, while `stat` on a dehydrated placeholder returns the true mtime and size, measured.

Output is `C:\Users\marlo\OneDrive\plexive-backups`, written weekly by a Windows Task Scheduler entry running `tools/backup_scheduled.sh`. MANIFESTS ARE NEVER PRUNED: the sequence is the only schema and growth history anyone keeps. `pg_dump` must match the server's MAJOR version -- establish the server's first with `psql "$DATABASE_URL" -tAc "show server_version"`, then install that major -- and a role that is neither superuser, `BYPASSRLS`, nor the table's owner cannot back that table up at all. After any real restore, in this order: restore with `pg_restore` or `psql -v ON_ERROR_STOP=1` and never bare `psql -f`, read the exit code, compare `pg_tables.rowsecurity` and `pg_policies` against the manifest, then compare row counts. RLS before rows, because a restore missing rows is obvious and a restore missing RLS is not. The OneDrive sync state, the verified round trip and the rest: `docs/RULE_HISTORY.md` under "## Rule: a session that touches the database or the schema checks the backup age first".

## Repository Security Settings

These are repository settings, not files, so nothing in the tree records them and `git log` will not show them changing. Enabled 2026-08-27, all free because the repository is public.

Code scanning uses the ADVANCED setup, meaning `.github/workflows/codeql.yml`, and GitHub's default setup is deliberately left `not-configured`; the two are mutually exclusive, so enabling default setup would disable the workflow. What is on, what is deliberately off, how push protection was verified to block rather than merely to be configured, and the `mobile-kmp/` dependency-graph gap with its 50-alert triage: `docs/RULE_HISTORY.md` under "## Rule: repository security settings are not recorded in the tree" and "### From `## Repository Security Settings`: `mobile-kmp/` dependency scanning and alert triage", plus `docs/research/mobile-kmp-alert-triage-2026-08.md`.

## Closed Beta

THE TWO HALVES ARE NOT EQUAL PARTNERS, and this is the thing to understand before touching either. The frontend holds NO application content. Every `page.tsx` is a client component, there are zero server-side API calls, no service token and no forwarded token; `plexive.org` ships a prerendered empty shell and the browser fetches everything from `api.plexive.org` directly. So **the backend gate is what closed the product**. The web gate covers a shell. Anyone reasoning about "is it closed" should reason about the API.

Two file-name traps, both of which produce a gate that silently does not exist. The Next 16 convention is `proxy.ts`, NOT `middleware.ts`, which was deprecated and renamed in v16.0.0. And `proxy.ts` exports NO `config.matcher`: without one it runs on every request including `/_next/static`, `/_next/image` and `public/`, whereas the negative-lookahead matcher everyone copies excludes exactly those and leaves the shell, its JS and its CSS readable. Both were verified from outside, not reasoned about.

`api.plexive.org` is closed by `ClosedBetaMiddleware` in `backend/app/main.py`, a pure-ASGI layer keyed on `CLOSED_BETA=1`. That variable is read at import, so a forgotten one on the Pi means the gate silently does not exist, and open is the state this fixes. The backend therefore ANNOUNCES ITSELF at startup in both directions (`[closed-beta] gate ON` / `gate OFF`), so `journalctl -u deepscroll-backend | grep closed-beta` answers "is it actually on" without anyone remembering to probe from outside. It is deliberately NOT fail-closed: refusing to boot over a missing optional flag is a worse failure than the one it guards. The frontend gate is the opposite and DOES fail closed, because there an unset variable only shows a password box, while a typo in a Vercel variable name would otherwise reopen the site silently.

Deliberately still open: `GET /health`, `POST /api/auth/login`, `POST /api/auth/google` and `OPTIONS` preflight. `/openapi.json`, `/docs` and `/redoc` are NOT exempt: the routes are removed outright, so they are 404 even with a valid token. Registration is closed TWICE, by the gate and by the handler, and those stay two decisions on purpose. THE BETA USERNAME IS `beta` AND THE PASSWORD IS HELD OUTSIDE THIS REPOSITORY -- ask for the password rather than searching for it, and if a tester reports the prompt rejecting credentials they are certain are right, CHECK WHICH CLIENT THEY USED before asking them to retype anything. Lifting `CLOSED_BETA` would restore fifteen anonymous endpoints at once and silently, so whether publicly readable post URLs come back is a PRODUCT DECISION and not a default. That, the WebSocket scope, the owner-lockout trap and the Android follow-up: `docs/RULE_HISTORY.md` under "### From `## Closed Beta`".

## Content Methodology

Moved OUT of this repository on 2026-08-28, into the private content repository, which holds them at the SAME paths relative to its root -- the convention the Content Model section above already uses: `docs/content-structure/BULK_GENERATION_PROMPTS.md`, `docs/content-structure/HUMAN_TEXTURE_STANDARD.md`, `tools/texture_check.py`, `tools/pipeline_prompts/` and `tools/_dump_prose.py`. THE POINTER FILE ITSELF IS GONE: it was `docs/content-structure/README.md`, which left in batch C, and the whole directory was removed on 2026-08-29, so this paragraph is now the only pointer here. It still names no URL, deliberately. Nothing in `backend/`, `frontend/`, `mobile-kmp/` or `.github/workflows/` ever read any of them, so no gate, build or fork is affected; the file-count and ruff floors are scoped to `backend/` and never saw `tools/` at all.

THE RUNNERS LEFT TOO, so nothing here produces or publishes content any more: a batch stops at `integration/<format>-all` in the content repository, and reaching readers is SEEDING -- `PLEXIVE_CONTENT_REPO=<content repo> python backend/seed.py` from a checkout of this repository. `backend/content_repo.py` is the only thing here that reads that variable; it ASSERTS ON A COUNT of the files it resolves rather than on a directory existing, because an empty directory makes `seed.py` report a successful seed having written nothing. The 8 frontend gold tests SKIP when the variable is unset, which is the state CI is in, and that lost coverage is a decision rather than an oversight. The four batches, with their measurements: `docs/RULE_HISTORY.md` under "## Rule: content methodology is private, the release runners went with it".

## Local Tooling

`grep -c $'\r'` DOES NOT COUNT CARRIAGE RETURNS. It counts matching LINES, so on a file where every line ends CRLF it returns the line count, and on a file with none it returns 0 -- both of which look like a correct answer. Use a byte count instead, which cannot lie: compare `git cat-file blob :<file> | wc -c` against the working tree's `wc -c`, or count `\r` directly (`python -c "print(open(f,'rb').read().count(b'\r'))"`). Relevant here because `core.autocrlf=true` is set system-wide, so a file git CHECKED OUT is CRLF in the working tree while its blob is LF, and a file just written by an editor is whatever the editor wrote until git next touches it. Any claim about a file's line endings therefore has to say WHICH of the three it is about, and for the question that usually matters -- what a Linux host receives -- the answer is the index, which is LF. See the fourteenth occurrence in `docs/RULE_HISTORY.md` under "## Rule: a step that watches for a condition reports its own failure".

`jq` is NOT installed on this machine and is not on PATH: a bare `jq` in a pipeline fails with `command not found`. `gh api --jq`, `gh pr checks --jq` and `gh pr list --jq` all work, because `gh` carries its own jq implementation and never shells out to the binary. So anything reading the GitHub API uses `gh`'s built-in, and anything else written to run HERE does without jq. THAT IS ABOUT THIS MACHINE AND NOT ABOUT CI: the two bare `jq` calls in `.github/workflows/codeql.yml` are correct and stay, because jq is a property of the `ubuntu-24.04` runner image rather than of this repository. Why that is narrower than "it works in CI": `docs/RULE_HISTORY.md` under "## Rule: local tooling on this machine diverges from CI and from the Pi".

Other divergences on this machine, each with its measurement in `docs/RULE_HISTORY.md` under "## Rule: local tooling on this machine diverges from CI and from the Pi": `psql.exe` ends every row with CRLF, which turns a captured multi-row value into a bash arithmetic syntax error; a `pgpass.conf` that is silently ignored produces the same prompt as none at all, so write it with `Set-Content -Encoding ASCII` and verify it by running a query; `sys.stdin.isatty()` returns True for `NUL`, so drive a non-interactive path with a PIPE and not `< /dev/null`; and `core.autocrlf=true` is set in the SYSTEM gitconfig, which is why `.gitattributes` pins `.claude/skills/**/SKILL.md` to `eol=lf`.

Stderr going somewhere nobody is looking does not count as reporting, and neither does `2>/dev/null`.
