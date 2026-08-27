# Plexive

Open source social media app that replaces doomscrolling with valuable content.

## Tech Stack
- Backend: Python FastAPI
- Frontend: Next.js
- Database: Supabase PostgreSQL (connection via `DATABASE_URL` in `backend/.env`)
- License: AGPL v3

## Content Model

Posts use a `sections` JSON array and a `feed_card` JSON object. The old per-format fields (`hook`, `key_points`, `details`, `body`, etc.) are removed.

- Full schema spec: `docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md`
- Books skeleton: `docs/content-structure/skeletons/books_skeleton.jsonc`
- Books example: `docs/content-structure/examples/books_example.json`
- Style guide: `docs/content-structure/STYLE_GUIDE_LONGFORM.md`

SVG security: `is_user_content=false` (seed/official) uses `dangerouslySetInnerHTML`; `is_user_content=true` (user submissions) uses a base64 `<img>` data URL. This applies in `SectionRenderer` (CoreIdeasSection, TakeawaySection) and `PostCard`.

## Git Workflow

`main` is protected by a ruleset: the `android-build`, `backend-checks` and `frontend-checks` status checks are required and force pushes are blocked. A commit therefore cannot be pushed straight to `main`, because a fresh commit has no check result yet.

Changes reach `main` this way: branch off `main`, push the branch, open a pull request, let the three checks go green on it, then merge. This is not a review requirement; the same person may open and merge the pull request.

All three run once per pull request, on the `pull_request` trigger. Pushing a branch on its own produces no run, so the checks appear only once the pull request exists.

## CI Notes

The workflow uses `distribution: corretto` because `mobile-kmp/gradle/gradle-daemon-jvm.properties` pins `toolchainVendor=AMAZON`. Any other vendor makes Gradle ignore the installed JDK and download Corretto from foojay on every run. Changing that line means changing `.github/workflows/android-build.yml` too.

The `push` trigger is scoped to `branches: [main]` on purpose. Unscoped, it also fires on the branch behind a pull request, so one commit gets two runs reporting the same `android-build` check name and the required check resolves to whichever finishes last. Do not widen it to make branches build; branches build through their pull request. Keeping `main` is what seeds the Gradle dependency cache, since `setup-gradle` only writes the cache from the default branch, and a cold run takes about 3m25s against about 40s warm.

There are three workflow files, one per codebase, one job each: `android-build.yml`, `backend-checks.yml`, `frontend-checks.yml`. One job per codebase on purpose. The number of check names a person has to interpret on a pull request is the real budget, and three is what it will bear.

No workflow has a `paths:` filter. A workflow skipped by a top-level `paths:` filter reports no status at all, and a required check that never reports blocks the pull request permanently. Actions minutes are unmetered here, so the saving would buy nothing anyway.

Every job sets `shell: bash` explicitly. The Linux default is `bash -e {0}`, without `pipefail`, which is how a piped failure becomes a green check; `shell: bash` is `bash --noprofile --norc -eo pipefail {0}`. This already bit the Android workflow once.

Every check asserts on a count, not only on an exit code, because all of them can pass having checked nothing: a loop that globs no files exits 0, `compileall` over a wrong path exits 0, `npm test` with no matching files exits 0 reporting `pass 0`. The counts are floors well below what was observed, not exact numbers: a route count or a test count moves with normal feature work, and a gate that reds during correct work is a gate that gets switched off. The floors that sit at their observed value (16 suite files, 40 frontend tests) only move down through a deliberate deletion, which is worth a deliberate edit here.

The backend suites run as a per-file subprocess loop, not `pytest tests`. 12 of the 16 suites execute their whole body at import and share one app instance, one in-memory rate limiter and the first module's temp SQLite file, so in one process they collide: pytest collects 92 of about 979 assertions and interrupts on 4 collection errors. The loop also runs every suite after one fails, so a second failure is not hidden behind the first.

The backend boot check counts `app.openapi()["paths"]`, not `len(app.routes)`. The route count is not a property of this codebase, it is a property of the installed FastAPI version: on the same commit it was 57 on the dev laptop (0.136.3, one flattened `APIRoute` per endpoint) and 23 in CI (0.141.1, where `include_router` leaves one `_IncludedRouter` per router). Since `requirements.txt` pins nothing, both are "correct" on the same day. The OpenAPI path count was 45 on both, so that is what the guard asserts. Do not change it back to counting routes.

Neither Python nor Node is pinned anywhere in the project, so `backend-checks.yml` (Python 3.12) and `frontend-checks.yml` (Node 24) are now the de facto pins. Both were chosen as the versions the code is known to run on locally, not as a claim about what the Pi runs.

ESLint is deliberately not in `frontend-checks`. It reports 88 errors and 13 warnings on tracked files, so it cannot gate anything until those are cleared, and a check that reports without ever failing is noise.

`gradle/actions/setup-gradle@v4` emits a Node.js 20 deprecation warning on every run. v4 was chosen over v6 for predictability, and that argument weakens as v4 ages. Revisit when v6's cache provider leaves free preview.

## Rules
- All code comments in English
- No emojis in code or comments
- I am a beginner, briefly explain what you are doing and why
- Always ask before making changes outside the current task
- After every change, update ARCHITECTURE.md. One line per new or changed item. No explanations beyond what is already there — just add or update the relevant entry. Never let it grow into prose.
- A change that makes existing documentation false must correct it in the same commit or the same batch, even when that falls outside the stated scope. This covers ARCHITECTURE.md, CLAUDE.md and the CI notes. Scope boundaries exist to prevent creep, not to preserve known-false text.
