# Plexive

Open source social media app that replaces doomscrolling with valuable content.

## Rules
THIS FILE IS CLOSED: a session adds nothing to it, and the one exception is correcting a sentence its
own change made false, which the rule below already requires. Something new enters only through a
register entry establishing that it applies in EVERY session without condition, which is what this
file is for; the container table from the sorting of all 42 rules says where a rule that fails that
test belongs instead. IT IS NOT ENFORCEMENT AND MUST NOT BE READ AS ANY: it cannot stop a session
adding, and `claude_md_rules` and `claude_md_unconditional_rules` see a count and nothing else, so a
session that adds a rule and raises its ceiling in one commit passes both. What those ceilings buy is
that the addition is visible in a diff and has to be defended, which is the limit
`tools/surface-budget.json` states about itself in `_what_a_ceiling_cannot_see`.

- All code comments in English
- I am a beginner, briefly explain what you are doing and why
- `.claude/skills/execution-discipline/SKILL.md` carries the execution discipline for this repository and applies to every task that changes a file, including the rule on staying inside the current task's scope
- After every change, update ARCHITECTURE.md. One entry per new or changed item, earning its place on what it rules out or where it points, not on what it describes. No explanations beyond what is already there — just add or update the relevant entry. Never let it grow into prose.
- A change that makes existing documentation false must correct it in the same commit or the same batch, even when that falls outside the stated scope. This covers ARCHITECTURE.md, CLAUDE.md and the CI notes. Scope boundaries exist to prevent creep, not to preserve known-false text.
- A step that watches for a condition reports its own failure, which is why every gate here asserts on a count. The INVERSE is a separate defect and is not the same rule: a check that reds on correct work teaches people to ignore red. The record is the enumerated list in `docs/RULE_HISTORY.md` under "## Rule: a step that watches for a condition reports its own failure", where the inverse is the LAST entry and is kept apart from the rest for exactly that reason, and where the list states what it does not cover.

Marlo decides what the product is: which features exist, how it presents itself, the positioning, the
values and the money. He does not evaluate technical choices and is not asked to. A technical question is
settled from evidence in the session, or routed to a named specialist, and the report says which of the two
happened.

## Content Model

ALL FOUR OF THE FILES THIS SECTION USED TO NAME ARE GONE FROM THIS REPOSITORY as of 2026-08-29, in batch C (`a243959`). THE 2026-08-28 DATE UNDER Content Methodology BELOW IS A DIFFERENT AND EARLIER REMOVAL, batch A: two events, not one event under two dates. Do not search for them here; they are in the private content repository, at the SAME paths relative to its root:

- Full schema spec: `docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md`
- Books skeleton: `docs/content-structure/skeletons/books_skeleton.jsonc`
- Books example: `docs/content-structure/examples/books_example.json`
- Style guide: `docs/content-structure/STYLE_GUIDE_LONGFORM.md`

The authoritative description of the shape a post takes is therefore `backend/app/models.py` plus `frontend/src/types/post.ts` and `SectionRenderer.tsx`, which are here and which the code actually executes. The spec is the intent; those are the fact.

SVG security: `is_user_content=false` (seed/official) uses `dangerouslySetInnerHTML`; `is_user_content=true` (user submissions) uses a base64 `<img>` data URL.

## Git Workflow

`main` is protected by a ruleset: the `android-build`, `backend-checks` and `frontend-checks` status checks are required and force pushes are blocked. A commit therefore cannot be pushed straight to `main`, because a fresh commit has no check result yet.

Changes reach `main` this way: branch off `main`, push the branch, open a pull request, let the three checks go green on it, then merge. This is not a review requirement; the same person may open and merge the pull request.

The merge is a MERGE COMMIT made with GitHub's "Merge pull request" button, never a squash, a rebase or a local `git merge` followed by a push. The title obeys the same conventional-commit rule as any other commit, `chore(merge): merge <branch> into main`; Dependabot's titles are already conventional and are not rewritten. Which forms have actually been observed here: `docs/RULE_HISTORY.md` under "## Rule: changes reach `main` through a pull request, and the merge is a merge commit".

Branches are named `<type>/<short-kebab-description>`, with the type drawn from the commit-type vocabulary; `spike/` and `integration/` say what a branch is FOR and exempt it from nothing. Dependabot names its own `dependabot/<ecosystem>/<path>/<package>-<version>`, and those are not ours to name or to rename. A merged branch is DELETED, remote and local, by whoever merged the pull request, as part of the same batch. Confirm ancestry first rather than trusting the "Merged" badge: `git merge-base --is-ancestor <branch> origin/main`, or `git branch --merged origin/main` to list the safe ones in one go. The prefix vocabulary in use, and why the badge is not enough: `docs/RULE_HISTORY.md` under "## Rule: branches are named `<type>/<short-kebab-description>`" and "## Rule: a merged branch is deleted, after confirming ancestry rather than trusting the badge".

CONFIRM CHECK RESULTS AGAINST THE HEAD SHA, NOT AGAINST WHATEVER `watch` RETURNS, and read the JOB IDS as well as the conclusions. The measurement behind this: `docs/RULE_HISTORY.md` under "## Rule: confirm check results against the head SHA".

    SHA=$(git rev-parse HEAD)
    gh api "repos/:owner/:repo/commits/$SHA/check-runs" --paginate \
      --jq '.check_runs[] | select(.name=="android-build" or .name=="backend-checks" or .name=="frontend-checks") | "\(.name) \(.status) \(.conclusion) job \(.id)"'

## CI

Three required checks, one per codebase, one job each: `android-build`, `backend-checks`, `frontend-checks`. There are five workflow files; those three are the gates, and `codeql.yml` and `dependency-submission.yml` are deliberately not. `android-build.yml` sets `distribution: corretto` because `mobile-kmp/gradle/gradle-daemon-jvm.properties` pins `toolchainVendor=AMAZON`, so changing either one means changing the other. Everything else is in `docs/CI_NOTES.md`: why each trigger is scoped as it is, under "## Workflows, triggers and which three are gates"; why every check asserts on a count and what the four kinds of count are, under "## Conventions every job follows"; the `battle_test.py` hangs and their diagnosis, under "## The backend suite loop and the `battle_test.py` hangs"; the derivation of the 300 s and 180 s timeouts, under "## Timeouts, watchdogs and where their numbers come from"; the standing requirement to take a before-number against an untouched tree, under "## Taking a before-number"; the pinning policy, and why `pip-audit` was removed on 2026-08-31 rather than wired into a gate, under "## Route counts, pinning and mirroring production"; and where each file's own floors sit, under "## The count floors and the two ratchets in `backend-checks.yml`", "## The three count floors in `frontend-checks.yml`" and "## The floors in `android-build.yml`". THE COUNTS ARE OF FOUR KINDS AND MAKING THEM UNIFORM IS THE MISTAKE: collapse detectors sit well below the observed count, deletion detectors sit exactly on it, RATCHETS fail when a number goes UP, have no lower bound and no equality check at all, and never come down except by hand in the same commit as the batch that fixes findings, and CEILINGS fail when a number goes up and are read from `tools/surface-budget.json` by the surface budget step. A CEILING IS NOT A RATCHET AND MUST NOT BE ADDED TO THE LIST BELOW; that file's `_what_this_is` states the difference. THERE ARE FOUR RATCHETS AND THEY ARE LISTED HERE ONCE: `MAX_ERRORS=88` (ESLint) in `frontend-checks.yml`, `MAX_LINT_FINDINGS=3` (AGP lint) in `android-build.yml`, and `MAX_RUFF_FINDINGS=37` and `MAX_MYPY_ERRORS=201` in `backend-checks.yml`.

WHAT THE THREE CHECKS ACTUALLY RUN, read from the workflow files at `7d2a0c0` rather than from any earlier description of them, because they are not what anyone would guess and all three changed in the week to 2026-08-31. Each job sets a `working-directory`, so every command below is relative to it.

`backend-checks`, `working-directory: backend`, `timeout-minutes: 20`, with a `postgres:17` service container that exists for the schema ledger step alone:

    python -m pip install --upgrade pip
    time python -m pip install -r requirements.txt -r requirements-dev.txt
    python -m compileall -q "${PYFILES[@]}"          # over find . -name '*.py', floor 60
    python - <<'PY' ... from app.main import app     # App boots, floor MIN_PATHS=20
    python -m pip install ruff==0.16.4
    ruff check --select E4,E7,E9,F --output-format=json . > "$RUNNER_TEMP/ruff.json"
    ruff check --select F .
    python -m pip install mypy==2.3.1
    python -m mypy --cache-dir "$RUNNER_TEMP/mypy-cache" .
    PLEXIVE_DB_WRITE=1 alembic upgrade head
    alembic current | tee "$RUNNER_TEMP/alembic-current.txt"
    alembic check
    timeout --signal=ABRT --kill-after=10s "${SUITE_TIMEOUT}s" python -X faulthandler "$f"

The last line runs once per file in `ls tests/*_test.py`; there is no pytest anywhere in this repository's CI. Ruff runs TWICE with different selections and different meanings: the first is the `MAX_RUFF_FINDINGS=37` ratchet, the second is `F` at an absolute zero.

`frontend-checks`, `working-directory: frontend`:

    npm ci
    npm test                                          # package.json: node --import tsx --test
    npx --no-install eslint --format json -o "$RUNNER_TEMP/eslint.json"
    npx --no-install eslint --print-config "$A11Y_PROBE"
    npm run build                                     # package.json: next build

`android-build`, `working-directory: mobile-kmp`, one Gradle invocation for all three tasks:

    ./gradlew :androidApp:assembleDebug :shared:testAndroidHostTest :androidApp:lintDebug       --no-build-cache       --no-configuration-cache       --console=plain 2>&1 | tee "$RUNNER_TEMP/gradle.log"

Every step after these parses the output and asserts on a count; the assertions are the larger half of all three files and are described in `docs/CI_NOTES.md`, not here.

`.claude/rules/` IS GATED BY `backend-checks`. A rules file carrying no `paths:` key loads globally at CLAUDE.md priority. The step counts files under `.claude/rules/` with no `paths:` key and fails above zero. The measurement, why it sits in this job, and why the frontmatter is parsed rather than grepped: `docs/CI_NOTES.md` under "## The count floors and the two ratchets in `backend-checks.yml`".

THE GOVERNANCE SURFACE AS A WHOLE HAS A CEILING, in `tools/surface-budget.json`, read by the surface budget step in the same job and for the same reason. It holds one number per container, TWENTY-THREE OF THEM, and the list is written out here because a reader who builds it from a summary and comes up short cannot tell a missing container from a miscount -- `CLAUDE.md` bytes, lines, sections, rules and unconditional rules; files under `.claude/rules/`; hook events, matchers, commands and scripts; allow, deny and ask rules; skills, commands, subagents, plugins and MCP servers; workflow files, jobs, steps and named thresholds; correct-work cases -- and fails when any of them exceeds it. RAISING A CEILING IS NORMAL; doing it in the same commit as the growth is the point. Three containers are OUTSIDE THE TREE and cannot be gated -- the GitHub ruleset, the gitignored `.claude/settings.local.json` and `~/.claude/settings.json` -- and the step prints them as FOUR ROWS, because the ruleset contributes two numbers, its rules and its required contexts. Each row carries its recorded value and the command that re-checks it by hand. WHAT A CEILING CANNOT SEE AT ALL is a container EMPTYING: a ceiling fires upward only, which is true of all 23, and `tools/surface-budget.json` says so in `_what_a_ceiling_cannot_see`. The derivation, the replay and what it would have blocked: `docs/CI_NOTES.md` under "## The surface budget, the fourth kind of count", and `plexive-docs/research/surface-budget-2026-08-31.md`.

## Schema Migrations

Alembic landed 2026-08-28 (`backend/alembic/`, `backend/alembic.ini`). It is CONFIGURED, RECONCILED AND STAMPED. `alembic stamp head` ran against production on 2026-08-28; `public.alembic_version` holds one row, `0001`, measured read-only the same day. The gap this paragraph used to describe -- configured but deliberately unstamped -- is closed, and the ledger is live.

THREE INDEXES STAY, AND THE DETECTOR THEREFORE DOES NOT START CLEAN. `ix_follows_id`, `ix_quiz_answers_user_id` and `ix_conversation_participants_conversation_id` are in production and not in the models. They were NOT added by hand, which is what the drift report's own help text claimed and what a work brief then repeated as fact: `create_all` built them from `index=True` flags that `ada78e5` (2026-07-06) removed as redundant, and that commit's "dropping the matching live-DB indexes is a separate manual op" never happened. Re-declaring them would reverse that decision and write three redundant indexes into every fresh database; hiding them in `alembic/policy.py` would park a pending action inside an exception list, which is where a difference goes to stop being noticed. THAT MIGRATION NOW EXISTS: `alembic/versions/0002_drop_redundant_indexes.py`, reviewed, rehearsed locally in both directions, and NOT YET APPLIED. Until it is applied, `scripts/schema_diff.py` reports exactly these three; `alembic check` AGAINST PRODUCTION reports nothing at all, because it requires the database to be AT HEAD rather than merely stamped, and production sits at `0001` while head is `0002` (exit 127, `Target database is not up to date.`, measured 2026-08-28). A FOURTH entry from `schema_diff.py` is new drift.

`alembic check` DOES RUN IN CI SINCE 2026-08-31, and it is a different question from the production one, which is why the sentence above now says "against production". `backend-checks.yml` builds an empty `postgres:17` service container, runs `alembic upgrade head` against it and then `alembic check`, so what is gated is that THE MIGRATIONS PRODUCE THE SCHEMA `models.py` DESCRIBES. It is exactly clean on a fresh container -- `0001` never creates the three redundant indexes and `0002` prints "dropped 0 of 3" and drops nothing, which is the recovery case its own docstring was written for. A green `backend-checks` therefore says nothing whatever about whether production has drifted; only `scripts/schema_diff.py` run by hand answers that, and the three indexes are still there.

THE ORDER IS LOAD-BEARING AND IT IS THE OPPOSITE OF THE OBVIOUS ONE. `alembic stamp head` ASSERTS that the database matches the baseline. Running it first would destroy the only chance to find out whether that assertion is true, and it is cheap to run, which is exactly what makes it tempting. So: back up, compare, read, and only then stamp.

ALEMBIC'S DIFF NAMES READ BACKWARDS TO A HUMAN and this is a trap worth naming rather than discovering. `remove_column` does not mean a column was removed from the models; it means the column is in the DATABASE and not in the models, so the migration would drop it. Read at speed, that is how a column gets dropped by somebody who thought it was the safe direction. `schema_diff.py` therefore groups by what is true of the schema -- MISSING FROM THE DATABASE / EXTRA IN THE DATABASE / DIFFERENT -- and keeps alembic's op name in brackets.

`scripts/schema_diff.py` is the detector that always answers; `alembic check` needs the database AT HEAD, and on an unstamped one it performs DDL rather than reporting. The numbered live-command order is in `docs/SERVER.md` under "Schema-Migrationen (Alembic)". The 17 pre-alembic scripts STAY, and `RUN_STARTUP_DDL=0` on the Pi is the outstanding live-config change. Workings: `docs/research/schema-drift-2026-08.md`; the reconciliation and the guards in `env.py`: `docs/RULE_HISTORY.md` under "## Rule: alembic is the schema ledger, and the stamp comes last".

## Backups

`tools/backup_supabase.sh`, added 2026-08-28. Supabase's free tier performs NO automatic backups, so this is the only copy.

A SESSION THAT TOUCHES THE DATABASE OR THE SCHEMA CHECKS THE BACKUP AGE FIRST: `bash tools/check_backup_age.sh`. No gate can see a laptop, so this line is the reminder -- it is the closest thing to an automated one that exists here.

THE AGE CHECK IS THE PART THAT MATTERS MORE THAN THE SCHEDULE. A forgotten backup is noticed the moment anyone looks; a scheduled one that has been failing for two months looks exactly like a working one until it is needed. `tools/check_backup_age.sh` reports the age of the newest manifest across FOUR situations with four exit codes, deliberately not merged: 0 current, 1 STALE, 2 NO BACKUPS AT ALL (the loudest, not the quietest), 3 current but never reached OneDrive. THRESHOLD 16 DAYS = 7 (weekly) + 7 (one occurrence lost outright, since StartWhenAvailable cannot fire on a machine that is off) + 2 (a weekend nobody would act in). The dangerous direction is DOWN, as with the 300 s and 180 s CI timeouts: a check that reds on a healthy-but-delayed backup gets switched off, and this one has no gate behind it. It reads METADATA ONLY -- Files On-Demand means reading a manifest would download it, while `stat` on a dehydrated placeholder returns the true mtime and size, measured.

Output is `C:\Users\marlo\OneDrive\plexive-backups`, written weekly by a Windows Task Scheduler entry running `tools/backup_scheduled.sh`. MANIFESTS ARE NEVER PRUNED. `pg_dump` must match the server's MAJOR version -- establish the server's first with `psql "$DATABASE_URL" -tAc "show server_version"`, then install that major -- and a role that is neither superuser, `BYPASSRLS`, nor the table's owner cannot back that table up at all. After any real restore, in this order: restore with `pg_restore` or `psql -v ON_ERROR_STOP=1` and never bare `psql -f`, read the exit code, compare `pg_tables.rowsecurity` and `pg_policies` against the manifest, then compare row counts. RLS before rows. The OneDrive sync state, the verified round trip and the rest: `docs/RULE_HISTORY.md` under "## Rule: a session that touches the database or the schema checks the backup age first".

## Repository Security Settings

These are repository settings, not files, so nothing in the tree records them and `git log` will not show them changing. Enabled 2026-08-27, all free because the repository is public.

Code scanning uses the ADVANCED setup, meaning `.github/workflows/codeql.yml`, and GitHub's default setup is deliberately left `not-configured`. What is on, what is deliberately off, how push protection was verified to block rather than merely to be configured, and the `mobile-kmp/` dependency-graph gap with its 50-alert triage: `docs/RULE_HISTORY.md` under "## Rule: repository security settings are not recorded in the tree" and "### From `## Repository Security Settings`: `mobile-kmp/` dependency scanning and alert triage", plus `docs/research/mobile-kmp-alert-triage-2026-08.md`.

## Closed Beta

THE TWO HALVES ARE NOT EQUAL PARTNERS, and this is the thing to understand before touching either. The frontend holds NO application content. A `page.tsx` here is either a client component or a thin server wrapper that renders one, so no page makes a server-side API call, and there is no service token and no forwarded token; `plexive.org` ships a prerendered empty shell and the browser fetches everything from `api.plexive.org` directly. So **the backend gate is what closed the product**. The web gate covers a shell. Anyone reasoning about "is it closed" should reason about the API.

Two file-name traps, both of which produce a gate that silently does not exist. The Next 16 convention is `proxy.ts`, NOT `middleware.ts`, which was deprecated and renamed in v16.0.0. And `proxy.ts` exports NO `config.matcher`: without one it runs on every request including `/_next/static`, `/_next/image` and `public/`, whereas the negative-lookahead matcher everyone copies excludes exactly those and leaves the shell, its JS and its CSS readable. Both were verified from outside, not reasoned about.

`api.plexive.org` is closed by `ClosedBetaMiddleware` in `backend/app/main.py`, a pure-ASGI layer keyed on `CLOSED_BETA=1`. That variable is read at import, so a forgotten one on the Pi means the gate silently does not exist. The backend therefore ANNOUNCES ITSELF at startup in both directions (`[closed-beta] gate ON` / `gate OFF`), so `journalctl -u deepscroll-backend | grep closed-beta` answers "is it actually on" without anyone remembering to probe from outside. It is deliberately NOT fail-closed; `backend/app/auth.py` carries that reasoning beside the flag. The frontend gate is the opposite and DOES fail closed, because there an unset variable only shows a password box, while a typo in a Vercel variable name would otherwise reopen the site silently.

Deliberately still open: `GET /health`, `POST /api/auth/login`, `POST /api/auth/google` and `OPTIONS` preflight. `/openapi.json`, `/docs` and `/redoc` are NOT exempt: the routes are removed outright, so they are 404 even with a valid token. Registration is closed TWICE, by the gate and by the handler, and those stay two decisions on purpose. THE BETA USERNAME IS `beta` AND THE PASSWORD IS HELD OUTSIDE THIS REPOSITORY -- ask for the password rather than searching for it, and if a tester reports the prompt rejecting credentials they are certain are right, CHECK WHICH CLIENT THEY USED before asking them to retype anything. Lifting `CLOSED_BETA` would restore fifteen anonymous endpoints at once and silently, so whether publicly readable post URLs come back is a PRODUCT DECISION and not a default. That, the WebSocket scope, the owner-lockout trap and the Android follow-up: `docs/RULE_HISTORY.md` under "### From `## Closed Beta`".

## Content Methodology

Moved OUT of this repository on 2026-08-28 -- batch A (`f05f8bc`), the earlier of the two removals and NOT the batch C one dated 2026-08-29 in Content Model above -- into the private content repository, which holds them at the SAME paths relative to its root -- the convention the Content Model section above already uses: `docs/content-structure/BULK_GENERATION_PROMPTS.md`, `docs/content-structure/HUMAN_TEXTURE_STANDARD.md`, `tools/texture_check.py`, `tools/pipeline_prompts/` and `tools/_dump_prose.py`. THE POINTER FILE ITSELF IS GONE: it was `docs/content-structure/README.md`, which left in batch C, and no tracked file has remained under `docs/content-structure/` since batch D, so this paragraph is now the only pointer here. The directory itself is still on disk, holding gitignored batch artefacts that `git status` does not report. It still names no URL, deliberately. Nothing in `backend/`, `frontend/`, `mobile-kmp/` or `.github/workflows/` ever read any of them, so no gate, build or fork is affected; the file-count and ruff floors are scoped to `backend/` and never saw `tools/` at all.

THE RUNNERS LEFT TOO, so nothing here produces or publishes content any more: a batch stops at `integration/<format>-all` in the content repository, and reaching readers is SEEDING -- `PLEXIVE_CONTENT_REPO=<content repo> python backend/seed.py` from a checkout of this repository. `backend/content_repo.py` is the only thing here that reads that variable; it ASSERTS ON A COUNT of the files it resolves rather than on a directory existing. The 8 frontend gold tests SKIP when the variable is unset, which is the state CI is in. The four batches, with their measurements: `docs/RULE_HISTORY.md` under "## Rule: content methodology is private, the release runners went with it".

## Local Tooling

`grep -c $'\r'` DOES NOT COUNT CARRIAGE RETURNS. It counts matching LINES, so on a file where every line ends CRLF it returns the line count, and on a file with none it returns 0 -- both of which look like a correct answer. Use a byte count instead, which cannot lie: compare `git cat-file blob :<file> | wc -c` against the working tree's `wc -c`, or count `\r` directly (`python -c "print(open(f,'rb').read().count(b'\r'))"`). Relevant here because `core.autocrlf=true` is set system-wide, so a file git CHECKED OUT is CRLF in the working tree while its blob is LF, and a file just written by an editor is whatever the editor wrote until git next touches it. Any claim about a file's line endings therefore has to say WHICH of the three it is about, and for the question that usually matters -- what a Linux host receives -- the answer is the index, which is LF. See the fourteenth occurrence in `docs/RULE_HISTORY.md` under "## Rule: a step that watches for a condition reports its own failure".

`jq` is NOT installed on this machine and is not on PATH: a bare `jq` in a pipeline fails with `command not found`. `gh api --jq`, `gh pr checks --jq` and `gh pr list --jq` all work, because `gh` carries its own jq implementation and never shells out to the binary. So anything reading the GitHub API uses `gh`'s built-in, and anything else written to run HERE does without jq. THAT IS ABOUT THIS MACHINE AND NOT ABOUT CI: the two bare `jq` calls in `.github/workflows/codeql.yml` are correct and stay. Why that is narrower than "it works in CI": `docs/RULE_HISTORY.md` under "## Rule: local tooling on this machine diverges from CI and from the Pi".

Other divergences on this machine, each with its measurement in `docs/RULE_HISTORY.md` under "## Rule: local tooling on this machine diverges from CI and from the Pi": `psql.exe` ends every row with CRLF; a `pgpass.conf` that is silently ignored produces the same prompt as none at all, so write it with `Set-Content -Encoding ASCII` and verify it by running a query; `sys.stdin.isatty()` returns True for `NUL`, so drive a non-interactive path with a PIPE and not `< /dev/null`; and `core.autocrlf=true` is set in the SYSTEM gitconfig.

Stderr going somewhere nobody is looking does not count as reporting, and neither does `2>/dev/null`.
