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

`main` is protected by a ruleset: the `android-build` status check is required and force pushes are blocked. A commit therefore cannot be pushed straight to `main`, because a fresh commit has no check result yet.

Changes reach `main` this way: branch off `main`, push the branch, open a pull request, let `android-build` go green on it, then merge. This is not a review requirement; the same person may open and merge the pull request.

The build runs once per pull request, on the `pull_request` trigger. Pushing a branch on its own produces no run, so the check appears only once the pull request exists.

## CI Notes

The workflow uses `distribution: corretto` because `mobile-kmp/gradle/gradle-daemon-jvm.properties` pins `toolchainVendor=AMAZON`. Any other vendor makes Gradle ignore the installed JDK and download Corretto from foojay on every run. Changing that line means changing `.github/workflows/android-build.yml` too.

The `push` trigger is scoped to `branches: [main]` on purpose. Unscoped, it also fires on the branch behind a pull request, so one commit gets two runs reporting the same `android-build` check name and the required check resolves to whichever finishes last. Do not widen it to make branches build; branches build through their pull request. Keeping `main` is what seeds the Gradle dependency cache, since `setup-gradle` only writes the cache from the default branch, and a cold run takes about 3m25s against about 40s warm.

`gradle/actions/setup-gradle@v4` emits a Node.js 20 deprecation warning on every run. v4 was chosen over v6 for predictability, and that argument weakens as v4 ages. Revisit when v6's cache provider leaves free preview.

## Rules
- All code comments in English
- No emojis in code or comments
- I am a beginner, briefly explain what you are doing and why
- Always ask before making changes outside the current task
- After every change, update ARCHITECTURE.md. One line per new or changed item. No explanations beyond what is already there — just add or update the relevant entry. Never let it grow into prose.
