# Web Review: Dead Code, Dependencies, Naming Drift
Date: 2026-07-06 | Model: Fable 5 | Scope: frontend/src, frontend configs (package.json, next.config.ts, tsconfig.json, README.md), backend/app, backend/tests, backend/scripts, backend root scripts, requirements.txt, plus repo-root artifacts that belong to these trees (seed_content.json, user_uploads/, stray .db files)

## Files reviewed

Candidate generation used four tool passes, then every reported line was opened and confirmed by hand:

- Full import-graph scan of frontend/src plus frontend/test (custom Node script resolving relative and `@/` imports, Next.js route files and tests as entry points).
- `ts-prune` over the frontend tsconfig for unused exports (ds-bundle and .next noise filtered out).
- AST-based unused-import scan over all backend Python files (excluding .venv).
- Per-package import greps for every entry in frontend/package.json and backend/requirements.txt, and a case-insensitive `deepscroll` sweep over both trees.

Files opened to confirm findings: frontend/package.json, frontend/tsconfig.json, frontend/README.md, src/components/EmptyState.tsx, src/components/VerifiedBadge.tsx, src/types/post.ts, src/lib/bookCover.ts, src/lib/battle/seededQuestions.ts, src/app/layout.tsx, src/app/page.tsx, src/app/search/page.tsx, src/app/login/page.tsx, src/app/register/page.tsx, src/app/onboarding/InterestPicker.tsx, src/app/globals.css, src/app/components/PostCard.tsx, src/app/post/[id]/page.tsx, src/app/lib/{api,auth,eventQueue,likedPosts,savedPosts,swr,chatSocket,battleSocket}.ts(x); backend/requirements.txt, backend/app/main.py, backend/app/auth.py, backend/app/routers/follows.py, backend/app/routers/stats.py, backend/app/reading_time.py, backend/app/post_counts.py, backend/seed.py (grep), backend/download_seed_images.py, backend/tests/_db_inspect.py, backend/tests/_fix_bool_columns.py, backend/tests/_inspect_bool_columns.py, backend/tests/_throwaway_db.py, backend/tests/smoke_test.py, backend/seed_content.legacy.README.md, root seed_content.json, root .gitignore, ARCHITECTURE.md.

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|----|-------|----------|------------|----------|--------|
| DEAD-001 | EmptyState.tsx is never imported | Low | High | bloat | S |
| DEAD-002 | Three feed-card type exports are unused (plus CardVisual) | Low | High | bloat | S |
| DEAD-003 | playwright devDependency has no usage in the repo | Medium | Medium | bloat | S |
| DEAD-004 | @types/katex sits in runtime dependencies | Low | High | bloat | S |
| DEAD-005 | Unused import Post in follows.py | Low | High | bloat | S |
| DEAD-006 | tests/_db_inspect.py targets the retired SQLite DB | Low | High | bloat | S |
| DEAD-007 | Completed one-off bool-column helpers still live in tests/ | Low | Medium | bloat | S |
| DEAD-008 | Root seed_content.json is tracked legacy seed data | Medium | High | bloat | S |
| DEAD-009 | Like reconciliation and toggle logic duplicated in PostCard and post detail | Medium | High | duplication | M |
| DEAD-010 | mulberry32 PRNG duplicated in bookCover.ts and seededQuestions.ts | Low | High | duplication | S |
| DEAD-011 | "deepscroll_token" literal repeated 9 times across 5 files, ws-url derivation duplicated | Low | High | duplication | S |
| DEAD-012 | Two parallel lib/ and components/ roots under src | Low | Medium | bloat | M |
| DEAD-013 | httpx needed by the test suite but declared nowhere | Low | High | bug | S |
| DEAD-014 | ARCHITECTURE.md dependency and helper entries are stale | Low | High | bug | S |
| DEAD-015 | frontend/README.md is stock create-next-app boilerplate | Low | High | bloat | S |
| DEAD-016 | User-visible "Deepscroll" strings (title, auth pages, author fallbacks) | Medium | High | naming | S |
| DEAD-017 | All client storage keys are deepscroll_* and need a migration story | Medium | High | naming | M |
| DEAD-018 | Non-visible deepscroll references (comments, UA string, tmp prefix, gitignore, doc pointer) | Low | High | naming | S |
| DEAD-019 | Leftover user_uploads/ directory tree | Low | Medium | bloat | S |

Naming findings use Category: naming because the requested three-way split (bloat, duplication, bug) has no slot for rename drift; everything else uses the requested values.

## Findings

### DEAD-001: EmptyState.tsx is never imported
- Location: frontend/src/components/EmptyState.tsx:84 (default export), whole file 1-99
- Severity: Low | Confidence: High | Category: bloat
- Description: The component (a pre-Stage "coming soon" empty state with seven per-format icons) is not imported by any file under frontend/src or frontend/test. Both the import-graph scan and ts-prune agree, and a manual grep for `EmptyState` finds no consumer in the app. The feed's empty states are now rendered as Stage slabs inside page.tsx instead.
- Impact: Dead component shipped in the repo (not in the bundle, since nothing imports it), plus a stale design-sync preview that suggests it is still part of the design system.
- Fix approach: Delete the file. Note the companion preview frontend/.design-sync/previews/EmptyState.tsx (which imports `EmptyState` from the 'plexive' bundle) and the generated ds-bundle/components/general/EmptyState/ entry; retire those in the same change or the design-sync tooling will keep regenerating a preview for a dead component.
- Effort: S
- Depends on: nothing

### DEAD-002: Three feed-card type exports are unused (plus CardVisual)
- Location: frontend/src/types/post.ts:26 (PeopleFeedCard), post.ts:447 (BooksFeedCard), post.ts:458 (FactsFeedCard), post.ts:94 (CardVisual)
- Severity: Low | Confidence: High | Category: bloat
- Description: ts-prune flags all three, and a grep across frontend/src finds only the definition lines, no imports or usages. Components read feed_card fields through the `fcStr`/`fcNum` narrowing accessors (post.ts:468, 474) against `Record<string, unknown>` instead of these typed shapes. CardVisual (post.ts:94) is referenced only by FactsFeedCard:461, so it becomes orphaned the moment FactsFeedCard goes.
- Impact: Dead type surface that no longer matches how feed cards are actually consumed; it can drift from the real payload shape silently because nothing type-checks against it.
- Fix approach: Either delete the four interfaces, or (if typed feed cards are wanted) actually adopt them at the PostCard/detail call sites instead of fcStr/fcNum. Deleting is the low-effort direction consistent with current code.
- Effort: S
- Depends on: nothing

### DEAD-003: playwright devDependency has no usage in the repo
- Location: frontend/package.json:29
- Severity: Medium | Confidence: Medium | Category: bloat
- Description: `playwright` is declared as a devDependency but nothing references it: no import anywhere under frontend (only package.json and package-lock.json mention it), no playwright.config.* exists in the tree, no npm script invokes it (scripts are dev/build/start/lint/test, package.json:5-11), and the two test files in frontend/test run under plain `node --test`. A grep of frontend/.design-sync also finds no reference, though the presence of .design-sync/_screenshots suggests it may have been installed once for screenshot tooling that drives the browser from outside the repo.
- Impact: Heavy install cost for every fresh `npm install` (playwright plus playwright-core in the lockfile, and typically a multi-hundred-MB browser download on first use) with no in-repo consumer.
- Fix approach: Confirm whether any external tooling (design-sync screenshotting) invokes playwright from this node_modules; if not, `npm uninstall playwright`. Confidence is Medium only because that external-tooling question cannot be settled from the repo alone.
- Effort: S
- Depends on: nothing

### DEAD-004: @types/katex sits in runtime dependencies
- Location: frontend/package.json:14
- Severity: Low | Confidence: High | Category: bloat
- Description: `@types/katex` is a type-declaration package, needed only at compile time, but it is listed under `dependencies` while every other @types/* package (node, react, react-dom) correctly sits in `devDependencies` (package.json:24-26).
- Impact: Cosmetic for a private app (Next bundles by import, not by dependency block), but it misstates the runtime surface and would be pulled into any production-only install (`npm install --omit=dev`).
- Fix approach: Move the entry to devDependencies.
- Effort: S
- Depends on: nothing

### DEAD-005: Unused import Post in follows.py
- Location: backend/app/routers/follows.py:10
- Severity: Low | Confidence: High | Category: bloat
- Description: `from ..models import Follow, Post, User` imports Post, but `Post` appears nowhere else in the file (grep confirms line 10 is the only occurrence). The profile counts that once needed it are computed via raw SQL `text()` subselects.
- Impact: None at runtime; minor noise and a false signal that this router touches posts.
- Fix approach: Drop `Post` from the import list. The AST scan found no other unused imports in backend app code (`models` in main.py:12 and the `_throwaway_db` imports in tests are deliberate side-effect imports, both commented as such).
- Effort: S
- Depends on: nothing

### DEAD-006: tests/_db_inspect.py targets the retired SQLite DB
- Location: backend/tests/_db_inspect.py:1, :12
- Severity: Low | Confidence: High | Category: bloat
- Description: The helper's own docstring says it brings "an existing backend/deepscroll.db up to the current schema" via sqlite3, and line 12 hardcodes that path. The live database is Supabase PostgreSQL (backend/app/database.py via DATABASE_URL), and ARCHITECTURE.md already labels this file "legacy ... no longer used". Its one migration (users.avatar_url) is long since part of the model.
- Impact: Dead maintenance script that only works against a database engine the app no longer uses; running it today would silently "migrate" a stale local file.
- Fix approach: Delete it, together with the stale local artifacts it served (backend/deepscroll.db, backend/deepscroll.db.legacy_20260608_114505, root deepscroll.db, all gitignored), once the legacy snapshot is confirmed no longer needed for the deferred content migration mentioned in seed_content.legacy.README.md.
- Effort: S
- Depends on: decision on the legacy DB snapshot (see DEAD-008)

### DEAD-007: Completed one-off bool-column helpers still live in tests/
- Location: backend/tests/_fix_bool_columns.py:1-63, backend/tests/_inspect_bool_columns.py:1-27
- Severity: Low | Confidence: Medium | Category: bloat
- Description: `_fix_bool_columns.py` is a one-off ALTER TABLE migration (integer to boolean, fixing a June 2026 register 500) and `_inspect_bool_columns.py` is its read-only companion. Both are idempotent and were presumably run against the live DB when the bug was fixed. They are not tests, import nothing test-related, and live in tests/ while every other one-time migration lives in backend/scripts/ (add_graph_columns.py, add_slug_column.py, add_indexes.py, add_identity_and_edges.py, add_knowledge_columns.py).
- Impact: Two done-their-job scripts in the wrong directory; a future reader may mistake them for part of the test suite.
- Fix approach: Either delete them or move them to backend/scripts/ alongside the other one-time migrations. Confidence is Medium on deletion (they remain useful if another SQLite-origin dump is ever imported), High on the misplacement itself.
- Effort: S
- Depends on: nothing

### DEAD-008: Root seed_content.json is tracked legacy seed data
- Location: seed_content.json:3 (repo root; `"purpose": "Seed content for Deepscroll..."`)
- Severity: Medium | Confidence: High | Category: bloat
- Description: A `seed_content.json` sits tracked at the repo root (confirmed via `git ls-files`). Its embedded README describes the pre-migration content model (per-format `details`, deprecated `body` fallback), which the current schema removed (CLAUDE.md: "The old per-format fields ... are removed"). Nothing references it: a grep for `seed_content` across backend, frontend/src, and tools matches only backend/seed_content.legacy.README.md, which says the legacy file was the gitignored backend/seed_content.json and that the pre-migration data is preserved in the backend .db.legacy snapshot. seed.py seeds exclusively from docs/content-structure example and generated JSON files.
- Impact: A tracked, unreferenced legacy data file at the repo root; it contradicts the README that says this data is gitignored or preserved only as a DB snapshot, and it carries old-schema examples that could mislead content tooling.
- Fix approach: Delete it from the repo (the legacy DB snapshot already preserves the data per seed_content.legacy.README.md), or move it explicitly under a legacy/ path and reference it from that README if it is the intended preservation copy.
- Effort: S
- Depends on: confirming which artifact (root JSON vs backend .db.legacy snapshot) is the canonical legacy preservation copy

### DEAD-009: Like reconciliation and toggle logic duplicated in PostCard and post detail
- Location: frontend/src/app/components/PostCard.tsx:173-248 and frontend/src/app/post/[id]/page.tsx:149-228
- Severity: Medium | Confidence: High | Category: duplication
- Description: Both files fetch `/api/posts/{id}/likes` and apply the identical server-count reconciliation formula (`sent && !hasPendingLike` gives onServer, then `adjust = (liked && !onServer ? 1 : 0) - (!liked && sent ? 1 : 0)`, PostCard.tsx:179-184 vs page.tsx:154-159), and both reimplement the like/unlike toggle with the same cache writes and pending-event cancellation (PostCard.tsx:224-248 vs page.tsx:208-228). The mobile app already extracted exactly this into a shared hook (mobile/src/lib/usePostActions.ts per ARCHITECTURE.md); the web has two hand-maintained copies. They have already drifted slightly: the detail page seeds likesCount with `getCachedLikeCount(...) ?? 0` (page.tsx:110) while the card seeds with `?? post.like_count` (PostCard.tsx:157).
- Impact: Any fix to the reconciliation formula (a known subtle area, three localStorage keys interact) must be applied twice; a missed site produces inconsistent like counts between feed and detail.
- Fix approach: Extract a `usePostLike` (or full `usePostActions`) hook under src/app/lib mirroring the mobile split: state init, the reconciliation effect, and the toggle handlers; both call sites keep their own animation and toast concerns.
- Effort: M
- Depends on: nothing

### DEAD-010: mulberry32 PRNG duplicated in bookCover.ts and seededQuestions.ts
- Location: frontend/src/lib/bookCover.ts:160-169 and frontend/src/lib/battle/seededQuestions.ts:18-27
- Severity: Low | Confidence: High | Category: duplication
- Description: Both files carry byte-for-byte identical `mulberry32` implementations (same constants, same bit math). bookCover.ts:142-143 even acknowledges it: "the same idiom as the Battle seed (@/lib/battle/seededQuestions.ts)". bookCover additionally has `xmur3` (bookCover.ts:144-156), which the battle module does not need.
- Impact: Small, but a fix or tweak to one copy will not reach the other, and the battle copy is parity-critical with mobile.
- Fix approach: Extract `mulberry32` (and optionally `xmur3`) into a small src/lib/prng.ts used by both. Constraint to respect: the battle sequence math must stay identical to mobile/src/lib/battle/seededQuestions.ts, so the extraction must not alter the function, and mobile keeps its own copy (cross-repo parity is by convention, not shared code).
- Effort: S
- Depends on: nothing

### DEAD-011: "deepscroll_token" literal repeated 9 times across 5 files, ws-url derivation duplicated
- Location: frontend/src/app/lib/auth.tsx:48, 61, 75, 88, 94; api.ts:7; eventQueue.ts:21; chatSocket.ts:51; battleSocket.ts:43. Also chatSocket.ts:38 and battleSocket.ts:30 (identical `(API_URL ?? "").replace(/^http/, "ws")` derivation)
- Severity: Low | Confidence: High | Category: duplication
- Description: The JWT localStorage key is a bare string literal at nine sites in five files; there is no shared TOKEN_KEY constant. Separately, the http-to-ws URL derivation line is duplicated between the chat and battle socket hooks.
- Impact: Beyond ordinary duplication risk, this directly inflates the deferred rename: the storage-key migration (DEAD-017) currently requires touching five files instead of one.
- Fix approach: Add a single exported constant (for example in api.ts or a new storage.ts) and read it everywhere; fold the ws derivation into a tiny shared helper or into each socket file's existing config section. Doing this before the rename makes the token part of the rename a one-line change plus migration.
- Effort: S
- Depends on: nothing; DEAD-017 becomes cheaper after it

### DEAD-012: Two parallel lib/ and components/ roots under src
- Location: frontend/src/app/lib/ (12 files, for example api.ts, auth.tsx, swr.ts) vs frontend/src/lib/ (formats.ts, prose.ts, bookCover.ts, readAloud/, train/, battle/); frontend/src/app/components/ (13 files, for example PostCard.tsx, BottomNav.tsx) vs frontend/src/components/ (Avatar.tsx, Spinner.tsx, sections/, and others)
- Severity: Low | Confidence: Medium | Category: bloat
- Description: Utility and component code is split across two roots with no discernible rule: app-shell things like auth and the SWR cache live under src/app/lib, while equally app-specific things like formats.ts and bookCover.ts live under src/lib. Imports correspondingly mix `@/app/lib/...` and `@/lib/...` (and some relative paths, for example useComments.ts:3 importing `../components/CommentsSection`). No file exists in both trees, so this is drift, not duplication.
- Impact: Every new file forces a where-does-this-go decision, and cross-tree imports make the dependency direction unclear. Mobile mirrors the src/lib names, which adds to the confusion when porting.
- Fix approach: Pick one convention (src/lib and src/components, matching the mobile mirror and the newer files) and move the src/app/lib and src/app/components files over in a mechanical, import-rewriting pass. Confidence Medium only on whether some split was intentional (nothing in ARCHITECTURE.md or comments says so).
- Effort: M
- Depends on: best done separately from the rename pass to keep diffs reviewable

### DEAD-013: httpx needed by the test suite but declared nowhere
- Location: backend/tests/smoke_test.py:8 ("requires httpx for the TestClient"); backend/requirements.txt:1-13 (no httpx entry)
- Severity: Low | Confidence: High | Category: bug
- Description: FastAPI's TestClient imports httpx at runtime. The test files acknowledge the requirement only in a comment; requirements.txt does not list it and there is no dev/test requirements file, so a fresh environment built from requirements.txt cannot run the test suite until someone manually installs httpx.
- Impact: Broken-by-default test setup on a clean machine or CI; the failure mode is an import error inside FastAPI, not an obvious "missing dependency" message.
- Fix approach: Add a requirements-dev.txt (httpx, plus anything else test-only) referenced from the README/ARCHITECTURE test instructions, or add httpx to requirements.txt with a comment that it is test-only.
- Effort: S
- Depends on: nothing

### DEAD-014: ARCHITECTURE.md dependency and helper entries are stale
- Location: ARCHITECTURE.md:7 (requirements.txt entry) and ARCHITECTURE.md:55 (posts.py entry)
- Severity: Low | Confidence: High | Category: bug
- Description: Two documented facts no longer match the code. First, line 7 lists requirements.txt as "fastapi, uvicorn, sqlalchemy, psycopg2-binary, passlib[bcrypt], python-jose[cryptography], python-dotenv, email-validator, supabase", but the actual file (backend/requirements.txt:1-13) has bcrypt (not passlib; app/auth.py:5 imports bcrypt directly) and additionally python-multipart, Pillow, lxml, defusedxml. Second, line 55 says posts.py has a "_attach_counts() helper"; posts.py:11 now imports the shared attach_counts/attach_counts_one from app/post_counts.py and no local helper exists (grep confirms).
- Impact: The dependency line could lead someone to reinstall passlib or miss that Pillow/lxml/defusedxml are required; the helper line points at code that does not exist.
- Fix approach: Correct both lines in ARCHITECTURE.md (one-line edits, per the repo's own ARCHITECTURE.md rule). Flagged here rather than fixed because this pass is report-only.
- Effort: S
- Depends on: nothing

### DEAD-015: frontend/README.md is stock create-next-app boilerplate
- Location: frontend/README.md:1-20
- Severity: Low | Confidence: High | Category: bloat
- Description: The file is the unmodified create-next-app template ("This is a Next.js project bootstrapped with create-next-app", generic dev-server instructions, Vercel deploy links). It contains nothing about Plexive/Deepscroll, the required .env.local (NEXT_PUBLIC_API_URL per frontend/.env.example), or the backend it depends on.
- Impact: Zero information value; mildly misleading (suggests `npm run dev` alone yields a working app, but the feed is empty without the backend).
- Fix approach: Replace with three or four lines: what the app is, the env var it needs, how to start it against the backend, how to run the tests. Also a rename touchpoint (it should say Plexive when written).
- Effort: S
- Depends on: text should use the final name, so ideally lands with or after the rename pass

### DEAD-016: User-visible "Deepscroll" strings (title, auth pages, author fallbacks)
- Location: frontend/src/app/layout.tsx:60 (metadata title "Deepscroll"); login/page.tsx:56 (brand label above the sign-in slab); register/page.tsx:57 (brand label) and :59 ("Join Deepscroll"); onboarding/InterestPicker.tsx:171 (heading); search/page.tsx:299 (author fallback string for official posts); backend/app/routers/stats.py:184 (top-posts author fallback "Deepscroll")
- Severity: Medium | Confidence: High | Category: naming
- Description: These are the places a user actually sees the old name: the browser-tab title, both auth screens, the onboarding header, and the "official content" author fallback rendered in search results and in the global stats payload. The seed author is @Marlo, so the two fallbacks fire exactly for official/seed content displays.
- Impact: Post-launch, every one of these shows the wrong brand. The two author fallbacks are also a subtle contract: web search UI (search/page.tsx:299) and backend stats (stats.py:184) hardcode the same display name independently, so the rename must change both or search and stats will disagree.
- Fix approach: For the deferred rename pass: replace all seven strings with "Plexive". Consider centralizing the display brand in one exported constant per tier (frontend const, backend const) in that pass so the next rename, or a fork per the AGPL/commercial-fork note in bookCover.ts, is one line per tier. Cataloged only, per the review constraints.
- Effort: S
- Depends on: the coordinated rename pass

### DEAD-017: All client storage keys are deepscroll_* and need a migration story
- Location: frontend/src/app/lib/likedPosts.ts:2 ("deepscroll_liked"), :3 ("deepscroll_like_counts"), :4 ("deepscroll_like_sent"), :9 and :16 ("deepscroll_like_sent_v1" migration marker); savedPosts.ts:2 ("deepscroll_saved"); onboarding/InterestPicker.tsx:121 and :143 plus app/page.tsx:143 ("deepscroll_interests"); the nine "deepscroll_token" sites listed in DEAD-011
- Severity: Medium | Confidence: High | Category: naming
- Description: Every piece of client-side persistence (JWT, chosen interests, likes, like counts, like-sent tracking, saves) is keyed under the old name. The mobile app mirrors the same key names via AsyncStorage/SecureStore (out of scope here, but the rename pass must treat them as one set).
- Impact: This is the riskiest part of the rename: a naive key rename logs every user out, forgets their interests (re-triggering onboarding), and drops their like/save state. likedPosts.ts:8-17 already demonstrates the in-repo pattern for a key migration (the sent-key one-time seed guarded by a _v1 marker).
- Fix approach: For the rename pass, decide explicitly: either keep the deepscroll_* keys forever as an internal legacy namespace (zero user impact, permanent drift), or rename with a one-time read-old-write-new migration per key modeled on migrateSentKey(). Doing DEAD-011 first reduces the token part to one site. Cataloged only.
- Effort: M
- Depends on: the coordinated rename pass; DEAD-011

### DEAD-018: Non-visible deepscroll references (comments, UA string, tmp prefix, gitignore, doc pointer)
- Location: frontend/src/app/globals.css:10 (comment "Deepscroll design tokens"); frontend/src/components/VerifiedBadge.tsx:3 (comment "official Deepscroll seed content"); frontend/.design-sync/NOTES.md:3 (already says "Plexive (the app formerly called Deepscroll)"); backend/app/reading_time.py:9 (doc pointer to docs/content-structure/DEEPSCROLL_CONTENT_STRUCTURE.md, which is the file's real current name); backend/download_seed_images.py:60 (User-Agent "DeepscrollSeedBot/1.0"); backend/tests/_throwaway_db.py:22 (tempdir prefix "deepscroll_test_"); backend/tests/_db_inspect.py:1 and :12 (deepscroll.db path); backend/seed_content.legacy.README.md:3 and :7; root .gitignore:8 (pattern backend/deepscroll.db.legacy_*); untracked local artifacts deepscroll.db (repo root and backend/) and backend/deepscroll.db.legacy_20260608_114505
- Severity: Low | Confidence: High | Category: naming
- Description: The complete remainder of the deepscroll sweep over the in-scope trees: code comments, a bot User-Agent, a temp-directory prefix, the gitignore pattern that matches the legacy DB snapshot filename, and the backend code comment that points at the DEEPSCROLL_CONTENT_STRUCTURE.md spec file. None of these are user-visible; all should ride along in the coordinated rename so the sweep comes back empty afterward.
- Impact: No functional impact. The one ordering constraint: reading_time.py:9 must change together with the actual rename of docs/content-structure/DEEPSCROLL_CONTENT_STRUCTURE.md (and CLAUDE.md's references to it), or the pointer breaks.
- Fix approach: Mechanical string replacements in the rename pass, plus renaming or retiring the legacy .db artifacts (see DEAD-006) and updating the .gitignore pattern in the same commit. The repo folder name and the ARCHITECTURE.md/CLAUDE.md headings are outside this review's scope but belong on the same rename checklist.
- Effort: S
- Depends on: the coordinated rename pass; DEAD-006 for the DB artifacts

### DEAD-019: Leftover user_uploads/ directory tree
- Location: user_uploads/images/ and user_uploads/svgs/ at the repo root (untracked, gitignored; ARCHITECTURE.md:60 confirms "no longer used")
- Severity: Low | Confidence: Medium | Category: bloat
- Description: The pre-Supabase upload destination still exists on disk with its two subdirectories. No backend code references a user_uploads path anymore (uploads go to the Supabase "uploads" bucket via app/upload_config.py, and main.py mounts no StaticFiles).
- Impact: Local-disk clutter only; it is not in git. Confidence Medium because the directories may still hold files a local environment serves or that someone wants to keep; I did not inventory their contents.
- Fix approach: After confirming nothing local depends on the contents, delete the tree and, once gone, the corresponding gitignore entry.
- Effort: S
- Depends on: manual confirmation the local files are disposable

## Coverage notes

- Reviewed: all of frontend/src and frontend/test (157 ts/tsx/css/mjs files) via the import-graph scan, ts-prune over the tsconfig, and targeted file reads; frontend/package.json, package-lock.json (spot checks), next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs, README.md; all backend first-party Python (app/ 31 files, tests/ 13 files, scripts/ 6 files, seed.py, download_seed_images.py) via the AST unused-import scan plus greps and file reads; backend/requirements.txt package by package; the case-insensitive deepscroll sweep over both trees plus root .gitignore and the tracked root seed_content.json.
- Dependency conclusions: every npm dependency except playwright has a confirmed import (vits-web via dynamic import in piper.ts:21, katex in three section components, recharts only in stats/page.tsx, swr in six files); no duplicate-purpose npm libraries found (tailwindcss plus @tailwindcss/postcss is the required v4 pairing). Every Python requirement has a confirmed import or role: bcrypt (auth.py:5), python-jose (auth.py:9), python-dotenv (seven files), Pillow/lxml/defusedxml (sanitize.py:4-6, complementary roles, not duplicates), supabase (upload_config.py:4), email-validator (EmailStr, routers/auth.py:30), python-multipart (UploadFile/File endpoints), psycopg2-binary (the DATABASE_URL driver), fastapi/sqlalchemy/uvicorn (framework, ORM, server).
- Commented-out code: a sweep for line-commented statements (const/let/import/return/if/def/class/print/console patterns) and commented-out JSX blocks across both trees found none; the codebase is unusually clean on this axis.
- Not reviewed (out of scope): mobile/, docs/ content and schemas, tools/, post JSON content, node_modules, the generated frontend/ds-bundle and .next artifacts, .design-sync internals beyond the deepscroll/playwright greps, and the other review passes' domains.
- Low-confidence items kept in the report rather than dropped: DEAD-003 (playwright's possible external design-sync use), DEAD-007 (whether the bool-column helpers are worth archiving), DEAD-012 (whether the dual-root layout was intentional), DEAD-019 (contents of user_uploads/ not inventoried).
- Also observed but not filed as findings: backend/scripts/add_knowledge_columns.py exists but has no ARCHITECTURE.md entry (same doc-drift family as DEAD-014); frontend/dev.log and tsconfig.tsbuildinfo are gitignored local artifacts; the .design-sync previews import from a 'plexive' package name, so the design tooling already uses the new name.
