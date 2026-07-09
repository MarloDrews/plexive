# Web Review, Master Report
Date: 2026-07-06 | Consolidated from: 01 through 08

This report merges the eight domain passes into one prioritized plan. Every master entry (M-ID) references the original finding IDs so each row traces back to its source report. Where two passes describe the same root issue they are merged into one entry; where two passes disagree they are both kept and flagged in "Conflicts to resolve".

Source reports:
- 01 frontend-rendering (FE-RENDER-001..053)
- 02 frontend-data (FE-DATA-001..025)
- 03 backend-endpoints (BE-001..050)
- 04 dead-code-deps-naming (DEAD-001..019)
- 05 architecture-constraints (ARCH-001..015)
- 06 bug-sweep (BUG-001..125)
- 07 security (SEC-001..031)
- 08 accessibility (A11Y-001..030)

## Overview

- Source findings consolidated: 348 across the eight passes.
- Master findings after dedup: 164.
- By severity: High 27, Medium 61, Low 76.
- By category (dominant category per master): perf 50, bug 45, security 22, bloat 18, duplication 12, a11y 11, architecture 6.
- Fix batches: 10, ordered cleanup, then backend contract and performance, then frontend data and rendering, then resilience, then security, then backend concurrency, then accessibility.
- Deferred (not batched here): the coordinated rename task, the server-rendering (SSR) direction, the mobile rebuild, and the long-term shared-store (Redis) scaling direction.

Note on effort ordering: within a severity band the table is sorted smallest effort first (S, then M, then L).

## Master findings table

| Master ID | Title | Severity | Effort | Source IDs | Category |
|-----------|-------|----------|--------|------------|----------|
| M041 | Followers, following and follow-requests lists are N+1 | High | S | BE-006 | perf |
| M074 | Stop preloading the six cover-only font families on every route | High | S | FE-RENDER-007 | perf |
| M082 | Isolate comment bar, memoize section tree, MathText and quiz slides | High | S | FE-RENDER-021, FE-RENDER-022, FE-RENDER-026 | perf |
| M098 | Add React error boundaries (root error, global-error, not-found) | High | S | BUG-001 | bug |
| M101 | Render FastAPI 422 array error details without crashing | High | S | BUG-006 | bug |
| M102 | One legacy tags/connections row 500s every list endpoint | High | S | BUG-008 | bug |
| M138 | Encode the single-replica, single-worker deployment invariant | High | S | ARCH-001, ARCH-006, SEC-019 | architecture |
| M029 | score_posts loads every 30-day event row per feed request | High | M | BE-002 | perf |
| M040 | GET /search fetches all published posts and matches in Python | High | M | BE-003 | perf |
| M042 | GET /stats/me recomputes global aggregates per request, uncached | High | M | BE-005, BE-041 | perf |
| M055 | Every mounted card fires its own /likes request on mount | High | M | FE-RENDER-014, FE-DATA-002, BUG-105 | perf |
| M056 | Saved and liked lists fan out one full detail fetch per id | High | M | FE-DATA-003 | perf |
| M071 | Lazy-load KaTeX JS and CSS off the post-detail and global chunks | High | M | FE-RENDER-003, FE-RENDER-004, FE-RENDER-023 | bloat |
| M099 | Section render crash guards (MathText null, optional content, AtAGlance) | High | M | BUG-002, BUG-003, BUG-004, BUG-024, BUG-025, BUG-102 | bug |
| M100 | Check response.ok before consuming write responses | High | M | BUG-005, BUG-054, BUG-090 | bug |
| M116 | Separate an admin capability from the verification badge | High | M | SEC-001, SEC-002, BE-043, BUG-074 | security |
| M117 | Private-account posts are publicly reachable | High | M | BUG-009 | security |
| M140 | Move chat and battle WS sync DB round trips off the event loop | High | M | BE-004, BE-012 | perf |
| M154 | Keyboard operability (cards, slider, follow control, off-screen pages) | High | M | A11Y-001, A11Y-002, A11Y-009, A11Y-013, A11Y-029 | a11y |
| M157 | Accessible names for content images and SVGs | High | M | A11Y-005, A11Y-006, A11Y-020, A11Y-022, A11Y-023 | a11y |
| M028 | GET /feed loads and scores the entire published corpus per request | High | L | BE-001, SEC-006, FE-DATA-001, BE-023, BE-024 | perf |
| M070 | Split the stats monolith, memoize it, fix its display defects | High | L | FE-RENDER-001, FE-RENDER-002, FE-RENDER-029, FE-RENDER-030, FE-RENDER-052, BUG-115, BUG-116, BUG-117, BUG-118, BUG-119, BUG-120, BUG-121, BUG-122, BUG-124, BUG-125 | perf |
| M076 | Virtualize the feed and saved-posts card lists | High | L | FE-RENDER-013, FE-RENDER-019 | perf |
| M086 | Split the create wizard into memoized section components | High | L | FE-RENDER-031, FE-RENDER-032, BUG-110 | perf |
| M155 | Dialog semantics and focus management for sheets and overlays | High | L | A11Y-004 | a11y |
| M156 | Programmatic label association for all form inputs | High | L | A11Y-003 | a11y |
| M158 | Rebase failing contrast tokens (ink-muted, ink-faint, bad red) | High | L | A11Y-007, A11Y-030 | a11y |
| M005 | Remove the unused playwright devDependency | Medium | S | DEAD-003 | bloat |
| M039 | Schema validation gaps (quiz answer_index, dup sections, email case, year) | Medium | S | BUG-026, BUG-083, BUG-073, BUG-079 | bug |
| M045 | POST /events unbounded growth feeds the feed and stats scans | Medium | S | BE-017 | perf |
| M046 | DB connection pool left at defaults for remote Supabase | Medium | S | BE-018 | perf |
| M054 | upload_svg parses defusedxml/lxml on the event loop | Medium | S | BE-011 | perf |
| M058 | Chat page refetches the whole conversation list for one header | Medium | S | FE-DATA-007 | perf |
| M061 | Debounced searches have a stale-response race | Medium | S | FE-DATA-009, FE-RENDER-037, BUG-056 | bug |
| M065 | Follow-toggle and settings writes skip the ok-check | Medium | S | FE-DATA-023, BUG-060, BUG-061, BUG-106 | bug |
| M067 | Replace raw-anchor navigations (Read Next, profile sheet) with next/link | Medium | S | FE-RENDER-027, FE-DATA-021 | bug |
| M073 | Dynamic-import Marathon and Battle out of the home-feed chunk | Medium | S | FE-RENDER-006 | bloat |
| M077 | Memoize PostCard | Medium | S | FE-RENDER-015 | perf |
| M088 | Search keystroke swaps results for skeletons and remounts lists | Medium | S | FE-RENDER-036 | perf |
| M103 | Unguarded localStorage/sessionStorage access can crash the app | Medium | S | BUG-058 | bug |
| M104 | Logout leaves per-account localStorage for the next account | Medium | S | BUG-059 | bug |
| M106 | Comment submit failure is silent and destroys the draft | Medium | S | BUG-057 | bug |
| M107 | Chat send/receive resilience (rejected send, load-race, order) | Medium | S | BUG-051, BUG-053, BUG-084, BUG-109 | bug |
| M109 | Read-aloud audio unlock and highlight-over-rerender crash | Medium | S | BUG-063, BUG-064 | bug |
| M111 | useSwipeTabs commits NaN active index at zero width | Medium | S | BUG-062, BUG-097 | bug |
| M112 | Quiz UI dead taps/overcount and numeric strict-equality answers | Medium | S | BUG-103, BUG-044 | bug |
| M118 | Validate JWT secret strength at startup | Medium | S | SEC-003 | security |
| M119 | Lock down POST /events (auth, rate limit, dedup, clamp) | Medium | S | SEC-005, BE-016, BUG-029, BUG-030, BUG-031, BUG-032 | security |
| M123 | Allowlist href and image URL schemes on client and server | Medium | S | SEC-009, SEC-024 | security |
| M124 | KaTeX failure fallback must not inject raw HTML | Medium | S | SEC-010, BUG-065 | security |
| M122 | Enforce the upload-prefix on image_url for all formats | Medium | S | SEC-008 | security |
| M132 | Image decode hardening (pixel cap, orientation, transparency, errors) | Medium | S | SEC-023, BUG-015, BUG-016, BUG-017 | security |
| M136 | Proxy-header/IP trust and wss gate hardening | Medium | S | SEC-004, ARCH-002, ARCH-015, SEC-029, BUG-012 | security |
| M139 | Rate limiter correctness (lock, monotonic clock, sweep, memory) | Medium | S | ARCH-003, ARCH-007, ARCH-008, ARCH-009, ARCH-010, BE-046, BE-050, BUG-070 | bug |
| M144 | knowledge_rating read-modify-write race loses deltas | Medium | S | BUG-028 | bug |
| M148 | Check-then-insert unique races return 500 instead of 4xx | Medium | S | BE-015 | bug |
| M151 | Storage/DB error handling (upload 500s, malformed URL, nullable, hash) | Medium | S | BUG-013, BUG-014, BUG-018, BUG-075, BUG-076, BUG-077 | bug |
| M163 | Labels for remove/delete controls and action-rail counts | Medium | S | A11Y-021, A11Y-027 | a11y |
| M016 | Extract a usePostLike hook (dup like reconcile and toggle) | Medium | M | DEAD-009, FE-DATA-011 | duplication |
| M020 | Extract create-wizard editors (quiz, sources, interests) | Medium | M | FE-RENDER-033 | duplication |
| M030 | Add pagination and limit params to list endpoints | Medium | M | BE-007, FE-DATA-022 | bug |
| M031 | reading_minutes recomputed by a full JSON walk per post per request | Medium | M | BE-008 | perf |
| M032 | List endpoints ship full sections then serialize them as [] | Medium | M | BE-009, BE-020, FE-DATA-012, BE-044 | perf |
| M034 | Resolve the elo.formats always-empty contract | Medium | M | FE-DATA-005 | bug |
| M043 | /stats/global time-series scan all-time data with unindexable grouping | Medium | M | BE-010 | perf |
| M057 | Chat history capped at 50; add before_id pagination UI | Medium | M | FE-DATA-006, BUG-052 | bug |
| M059 | Stats Friends tab fan-out (~27 requests) and 12-friend cap | Medium | M | FE-DATA-013, BUG-123 | perf |
| M060 | Gate auth fetches on token presence, render chrome during restore | Medium | M | FE-DATA-014, FE-RENDER-011 | perf |
| M062 | Missing error states (search, feed, onboarding, generic pages) | Medium | M | FE-DATA-008, FE-DATA-010, FE-DATA-017, BUG-007, BUG-055 | bug |
| M081 | Seed post detail from cached feed data instead of refetch skeleton | Medium | M | FE-RENDER-012 | perf |
| M087 | Isolate chat composer and window the message list | Medium | M | FE-RENDER-035 | perf |
| M095 | Drop backdrop-filter blur from the .card slab | Medium | M | FE-RENDER-048 | perf |
| M096 | Adopt next/image, size body images (CLS), add broken-image fallbacks | Medium | M | FE-RENDER-049, BUG-099 | perf |
| M105 | Central 401 handling; stop deleting the token on transient errors | Medium | M | BUG-049, BUG-048, BUG-108 | bug |
| M108 | Event pipeline integrity (dwell lost, timer dead, flush drop, no unlike) | Medium | M | BUG-045, BUG-046, BUG-047, BUG-068 | bug |
| M110 | Detail close dead-end, swipe-close on scrollers, consumeAutoRead | Medium | M | BUG-066, BUG-067, BUG-094 | bug |
| M120 | Move train answer correctness server-side | Medium | M | SEC-007 | security |
| M125 | Add a Content-Security-Policy; reconsider token storage | Medium | M | SEC-011 | security |
| M141 | WS broadcast timeout, frame robustness, delivery correlation | Medium | M | ARCH-005, BUG-034, BUG-035, BUG-085, BUG-086, BUG-087 | bug |
| M142 | Battle state machine overhaul | Medium | M | ARCH-004, ARCH-012, BUG-010, BUG-011, BUG-038, BUG-039, BUG-040, BUG-041, BUG-042, BUG-043, BUG-078 | bug |
| M143 | Socket hooks: backoff, teardown on inactive, auth-keyed reconnect | Medium | M | FE-RENDER-040, BUG-050, BUG-093 | bug |
| M145 | Concurrent DM creation forks a conversation; group collapses to DM | Medium | M | BUG-036, BUG-088 | bug |
| M149 | Post write commits twice (post then edges); crash leaves it edgeless | Medium | M | BE-013 | bug |
| M150 | Account lifecycle state (soft-delete zombies, re-registration lock) | Medium | M | BUG-019, BUG-020, BUG-021, BUG-022 | bug |
| M159 | ARIA state (switch, tabs, chips, accordions, aria-pressed) | Medium | M | A11Y-008, A11Y-012, A11Y-014, A11Y-015 | a11y |
| M161 | Document semantics (headings, landmarks, list markup) | Medium | M | A11Y-010, A11Y-011, A11Y-024, A11Y-028 | a11y |
| M160 | Live-region announcements (errors, toast, quiz/battle feedback) | Medium | L | A11Y-016, A11Y-017, A11Y-018 | a11y |
| M162 | Non-visual alternatives for stats visuals | Medium | L | A11Y-019 | a11y |
| M001 | Delete the never-imported EmptyState component | Low | S | DEAD-001 | bloat |
| M002 | Remove unused feed-card type exports | Low | S | DEAD-002 | bloat |
| M003 | Drop the unused Post import in follows.py | Low | S | DEAD-005 | bloat |
| M004 | Move @types/katex to devDependencies | Low | S | DEAD-004, FE-RENDER-009 | bloat |
| M006 | Retire the legacy sqlite and bool-column scripts in tests/ | Low | S | DEAD-006, DEAD-007 | bloat |
| M007 | Remove the tracked legacy root seed_content.json | Low | S | DEAD-008 | bloat |
| M008 | Delete the leftover user_uploads/ directory tree | Low | S | DEAD-019 | bloat |
| M009 | Declare the test-only httpx dependency | Low | S | DEAD-013 | bug |
| M010 | Correct stale ARCHITECTURE.md dependency/helper entries | Low | S | DEAD-014 | bug |
| M011 | Replace the boilerplate frontend README | Low | S | DEAD-015 | bloat |
| M012 | Drop redundant DB indexes | Low | S | BE-039 | bloat |
| M013 | Remove the dead second sort-key in search ranking | Low | S | BE-045 | bloat |
| M014 | Extract the duplicated mulberry32/xmur3 PRNG | Low | S | DEAD-010 | duplication |
| M015 | Centralize the token key and ws-url derivation | Low | S | DEAD-011 | duplication |
| M018 | Fold the detail page onto the shared useComments hook | Low | S | FE-DATA-015 | duplication |
| M019 | Extract a shared FollowListSheet; standardize SWR reads | Low | S | FE-RENDER-039, FE-DATA-018 | duplication |
| M021 | Move CATEGORIES into a shared lib module | Low | S | FE-RENDER-034 | architecture |
| M023 | Extract the backend eager-load option pair (7 sites) | Low | S | BE-031 | duplication |
| M024 | Extract the username-to-User 404 lookup (4 files) | Low | S | BE-032 | duplication |
| M025 | Collapse near-duplicate query blocks | Low | S | BE-033 | duplication |
| M026 | Unify the pending-post visibility rule (incl. quiz/state, posts/{id}) | Low | S | BE-019, SEC-017, BUG-033 | duplication |
| M027 | Fold get_profile follow_status into the main query | Low | S | BE-028 | duplication |
| M033 | Drop the unused connections array from post responses | Low | S | BE-042, FE-DATA-016 | bloat |
| M035 | Trim create_post re-fetch and zero-count queries | Low | S | BE-025 | perf |
| M036 | Trim create_comment post-commit queries | Low | S | BE-026 | perf |
| M037 | elo_summary re-queries a User row the caller already holds | Low | S | BE-027 | perf |
| M038 | create_conversation queries per username in loops | Low | S | BE-029 | perf |
| M044 | /stats/global cache stampede and leaderboard filter inconsistency | Low | S | BE-022, BE-040, ARCH-013 | perf |
| M048 | Add missing DB indexes (comments, messages, conversations) | Low | S | BE-038 | perf |
| M049 | Remove synchronize_session="fetch" extra SELECT | Low | S | BE-035 | perf |
| M050 | Avoid unconditional edge delete+reinsert churn on every post write | Low | S | BE-034 | perf |
| M051 | Bound the _resolve_live_targets OR clause | Low | S | BE-036 | perf |
| M052 | list_comments count mode compiles to a subquery COUNT | Low | S | BE-047 | perf |
| M053 | Body-cap middleware adds per-request overhead to every route | Low | S | BE-048 | perf |
| M063 | Comments UI shows "No comments yet" during load and after error | Low | S | FE-DATA-019 | bug |
| M064 | Search format filter refires the identical user search | Low | S | FE-DATA-020 | perf |
| M066 | Feed caches never revalidate in-session | Low | S | FE-DATA-025 | architecture |
| M068 | Guard apiFetch localStorage read against server import | Low | S | FE-RENDER-044 | architecture |
| M069 | Detail-page fetch cancellation and per-id reset | Low | S | FE-DATA-024, BUG-111 | bug |
| M075 | Add dynamic imports and a bundle analyzer | Low | S | FE-RENDER-008, FE-RENDER-053 | architecture |
| M078 | Cache localStorage parses in the like/save modules | Low | S | FE-RENDER-016 | perf |
| M079 | Hoist a single Toast and a shared IntersectionObserver | Low | S | FE-RENDER-017 | bloat |
| M080 | Clean up the double-tap nav timer and PostCard timers | Low | S | FE-RENDER-018, BUG-098 | bug |
| M083 | Memoize the SvgBlock re-palette | Low | S | FE-RENDER-024 | perf |
| M084 | Memoize GeneratedBookCover hash/PRNG/text-wrap | Low | S | FE-RENDER-025 | perf |
| M085 | Move the reduced-motion style block into globals.css | Low | S | FE-RENDER-028 | bug |
| M089 | Write profile pager height imperatively via a ref | Low | S | FE-RENDER-038 | perf |
| M090 | Memoize the AuthProvider context value | Low | S | FE-RENDER-041 | perf |
| M091 | Read-aloud blob URL and WAV cache cleanup | Low | S | FE-RENDER-042, BUG-096 | perf |
| M092 | eventQueue bfcache and unreliable-unload signals | Low | S | FE-RENDER-043, BUG-112 | perf |
| M093 | Marathon and Battle state hygiene | Low | S | FE-RENDER-045, FE-RENDER-047, BUG-113 | bug |
| M113 | Miscellaneous render/display guards | Low | S | BUG-069, BUG-092, BUG-100, BUG-101, BUG-104, BUG-095 | bug |
| M114 | Missing NEXT_PUBLIC_API_URL fails confusingly | Low | S | BUG-089 | bug |
| M115 | clearApiCache clears mounted keys without revalidating | Low | S | BUG-091 | bug |
| M121 | Rate-limit and auth-gate the quiz answer key | Low | S | SEC-018, BUG-027 | security |
| M129 | Remove the auth timing and email-exists oracles | Low | S | SEC-015, SEC-016 | security |
| M130 | Rate-limit the remaining authenticated write endpoints | Low | S | SEC-020, BUG-081 | security |
| M131 | Cap the request body on the receive stream (chunked bypass) | Low | S | SEC-022, BUG-023 | security |
| M133 | SVG sanitize consistency (feed_card, use, BookCover default) | Low | S | SEC-025, SEC-026, SEC-027 | security |
| M134 | Escape LIKE wildcards and fix user-search ranking | Low | S | SEC-028, BE-030 | security |
| M135 | Clear the npm and pip dependency advisories | Low | S | SEC-030, SEC-031 | security |
| M147 | Cap chat WebSocket connections per user | Low | S | ARCH-011 | perf |
| M152 | interests="," disables ordering; route username decode | Low | S | BUG-080, BUG-107 | bug |
| M153 | Auth error contract (403 vs 401) and middleware/CORS edges | Low | S | BUG-072, BUG-071 | bug |
| M164 | Reduced-motion for JS scroll; hidden scrollbars decision | Low | S | A11Y-025, A11Y-026 | a11y |
| M017 | Consolidate the frontend helper duplication cluster | Low | M | FE-RENDER-051 | duplication |
| M022 | Unify the src/lib and src/components roots | Low | M | DEAD-012 | bloat |
| M047 | get_current_user costs a users SELECT per authed request | Low | M | BE-049 | perf |
| M072 | Serve FIELD_GLYPHS off the critical feed chunk | Low | M | FE-RENDER-005 | bloat |
| M094 | Localize the NumberSlider value; commit on release | Low | M | FE-RENDER-046, BUG-114 | perf |
| M097 | Tailwind token cleanup and no-op scrollbar utilities | Low | M | FE-RENDER-050 | bloat |
| M126 | Token revocation on password change | Low | M | SEC-012 | security |
| M127 | Length and shape caps on non-books content | Low | M | SEC-013 | security |
| M128 | Identity-key collision hardening for read-next edges | Low | M | SEC-014, BE-014, BE-037 | security |
| M137 | WebSocket pre-auth throttle and periodic revalidation | Low | M | SEC-021, BUG-037 | security |
| M146 | create_all DDL boot race; migration tool | Low | M | ARCH-014, BE-021 | architecture |

## Fix batches

Batches are ordered so low-risk cleanup lands first, then backend contract and query changes, then the frontend data and rendering layers that sit on top of them, then resilience, then security, then backend concurrency and realtime, then accessibility. Critical security (M116, M117) is high severity and its fixes are largely independent, so those two can be pulled forward at any time without waiting for earlier batches.

### Batch 1, Dead code and repo hygiene (suggested branch: chore/dead-code-cleanup)
- Rationale: pure deletions, dependency-block moves and one-line doc corrections. No runtime behavior changes, so this clears noise before any structural work and shrinks later diffs. Runs first because nothing depends on it and it touches files the later batches will edit.
- Findings: M001, M002, M003, M004, M005, M006, M007, M008, M009, M010, M011, M012, M013.
- Dependencies: M006 (legacy sqlite/bool scripts) and M007 (root seed_content.json) both wait on confirming which artifact is the canonical legacy-DB preservation copy, so do M007 before or with M006. Everything else is independent.

### Batch 2, Duplication and shared-helper extraction (suggested branch: refactor/shared-helpers)
- Rationale: extracting the shared helpers and hooks before the performance and rendering batches means those batches edit one implementation instead of two divergent copies. Runs early because several later masters (the like storm, the create wizard, the follow writes) assume a single call site exists.
- Findings: M014, M015, M016, M017, M018, M019, M020, M021, M022, M023, M024, M025, M026, M027.
- Dependencies: M015 (token key constant) precedes the token part of the deferred rename and makes M105 (401 handling) cleaner, do M015 first within the batch. M016 (usePostLike) precedes M055 (like storm, Batch 5) and M081 (Batch 6). M018 (fold detail onto useComments) precedes M063 (Batch 5) so the comments loading state is fixed once. M019 and M020 (extract sheet and wizard editors) precede M086 (Batch 6) and M065 (Batch 5). M022 (unify lib/components roots) is a mechanical import-rewrite and should land last in this batch so it does not churn files the other extractions are still moving.

### Batch 3, Backend contract and payload correctness (suggested branch: perf/api-contract)
- Rationale: this is the "feed query, reading_minutes and related contract drift" cluster. It fixes what each response contains and how the feed is shaped, which the frontend data and rendering batches then build on. Runs before the heavier query-performance batch because the contract decisions (pagination shape, stripped payloads, the empty elo.formats) constrain those queries.
- Findings: M028, M029, M030, M031, M032, M033, M034, M035, M036, M037, M038, M039.
- Dependencies: M030 (pagination and limit params) is the precondition for M028 (feed corpus) becoming a real fix rather than a stopgap; M028 also needs a stable or seeded feed ordering before offset/keyset paging is safe (see Conflicts, the jitter-versus-pagination tension). M029 (score_posts aggregation) shares the scoring redesign with M028, do them together. M033 (drop connections) needs the mobile confirmation noted in Deferred before the backend field is removed. M034 (elo.formats) is a product decision (remove versus repopulate) that gates the Batch 6 stats work and the Batch 5 friends fan-out.

### Batch 4, Backend query and scaling performance (suggested branch: perf/backend-queries)
- Rationale: the remaining server-side scaling work (full-corpus search, N+1 lists, uncached stats, pool sizing, indexes, per-request churn). Grouped after the contract batch because several of these queries change shape once payloads and pagination are settled. All are backend-only and share the same files (routers, models, post_counts, scoring).
- Findings: M040, M041, M042, M043, M044, M045, M046, M047, M048, M049, M050, M051, M052, M053, M054.
- Dependencies: M048 (add indexes) should land before or with M041, M043 and M052 so the N+1 and time-series rewrites target the intended indexes. M042 (stats/me caching) and M044 (stats/global cache) touch the same cache mechanics, do them adjacent. M045 (rate-limit /events) overlaps the security lock-down in M119 (Batch 8); pick one owner, the perf angle here and the abuse angle there must not both edit events.py independently.

### Batch 5, Frontend data-fetching correctness and fan-out (suggested branch: fix/frontend-data)
- Rationale: request-shape and error-handling fixes at the fetch layer, sitting directly on the backend contract from Batches 3 and 4. Kept separate from rendering because these are about when and how data is requested, not how it is drawn.
- Findings: M055, M056, M057, M058, M059, M060, M061, M062, M063, M064, M065, M066, M067, M068, M069.
- Dependencies: M055 (like storm) depends on M016 (usePostLike, Batch 2) and is amplified by M076 (virtualization, Batch 6); it is fixable independently of M076. M056 and M059 want backend batch endpoints that do not exist yet (noted in the source reports as new work), so the frontend-only fix is concurrency capping until those land. M063 depends on M018 (Batch 2). M065 depends on the shared follow helper from M019 (Batch 2). M066 (feed revalidation) is coupled to M028/M030 (stable ordering) from Batch 3. M069 only bites after M067 makes post-to-post client navigation reachable, do M067 first.

### Batch 6, Frontend rendering and bundle (suggested branch: perf/frontend-rendering)
- Rationale: the "frontend rendering" batch: code-splitting, virtualization, memoization, styling and image loading. Runs after the data layer is stable so re-render and windowing work is not chasing a moving fetch surface. The three monoliths (stats, create wizard, and the section tree) are the heaviest items.
- Findings: M070, M071, M072, M073, M074, M075, M076, M077, M078, M079, M080, M081, M082, M083, M084, M085, M086, M087, M088, M089, M090, M091, M092, M093, M094, M095, M096, M097.
- Dependencies: M070 (stats split) is the precondition for the code-split half of the recharts fix folded into it, and it absorbs the stats display bugs so they are fixed in the same rewrite. M077 (memoize PostCard) is most valuable after M076 (virtualization) but is correct independently; keep the two inline call-site props stable when doing M077. M082 (isolate comment bar) makes M083 and M084 (per-section memoization) fully effective. M086 depends on M020 (Batch 2 wizard-editor extraction). M081 depends on M016 (Batch 2) for the like-state seed. M096 (next/image) also carries the broken-image fallbacks that Batch 7 would otherwise duplicate, keep it here.

### Batch 7, Crash resilience and error handling (suggested branch: fix/resilience)
- Rationale: convert crash and silent-failure paths into contained, visible states. M098 (error boundaries) is the single highest-leverage item because it downgrades every crash finding from "app gone" to "section degraded", so it leads the batch. These are cross-cutting frontend and backend error-path fixes that should land as one hardening pass.
- Findings: M098, M099, M100, M101, M102, M103, M104, M105, M106, M107, M108, M109, M110, M111, M112, M113, M114, M115.
- Dependencies: M098 (error boundaries) precedes M099 (section crash guards): the boundary contains what the guards miss, so land M098 first. M105 (401 handling) benefits from M015 (Batch 2 token constant). M100 (response.ok checks) and M065 (Batch 5 follow writes) share the same ok-check pattern; M065 owns the follow sites, M100 owns login/register and chat. M108 (event integrity) and M092 (Batch 6 unload signals) both touch eventQueue, sequence M092 first or do them together.

### Batch 8, Critical security and abuse hardening (suggested branch: security/pre-launch)
- Rationale: the "critical security" batch. M116 (verification is a self-propagating publish-and-admin privilege) and M117 (private posts are public) are the two that most change the trust model and are high severity; they can run ahead of every earlier batch if launch timing demands it. The rest are input-validation, XSS-surface, rate-limit and transport hardening that are largely independent of the performance work.
- Findings: M116, M117, M118, M119, M120, M121, M122, M123, M124, M125, M126, M127, M128, M129, M130, M131, M132, M133, M134, M135, M136, M137.
- Dependencies: M116 precedes M119, M121, M126, M128 in the sense that once verification stops being auto-publish, several abuse paths (M128 edge hijack, M121 answer-key scraping) shrink; they are still worth fixing on their own. M123 (href/image scheme allowlist) and M124 (KaTeX raw-HTML fallback) both reduce the XSS surface that M125 (CSP) then backstops, do M125 last. M132 folds the image-decode bugs (BUG-015/016/017) with the decompression-bomb cap, keep them together. M136 (proxy-header trust) is the same forwarded-headers setting behind M138 (Batch 9) and the rate-limit realism, coordinate the deploy-config change once.

### Batch 9, Backend concurrency, realtime and deployment (suggested branch: fix/backend-concurrency)
- Rationale: the process-local state, websocket delivery, battle and chat state machines, and deployment invariants. Grouped last on the backend because these are the subtlest (races, event-loop blocking, deploy coupling) and should not be entangled with the earlier query reshaping. M138 (encode the single-replica invariant) anchors the batch because every other item here is only correct at one worker.
- Findings: M138, M139, M140, M141, M142, M143, M144, M145, M146, M147, M148, M149, M150, M151, M152, M153.
- Dependencies: M138 (deployment invariant) is the umbrella for M139, M147 and the per-process caches; document it first. M139 (rate-limiter lock) makes M144-style races and the sweep bug (ARCH-010, folded in) moot, so do M139 before relying on limiter counts elsewhere. M140 (WS off event loop) precedes M141 (WS broadcast timeout) since both edit the same send path. M142 (battle state machine) and M143 (frontend socket hooks) are two ends of the same feature; land M142 first so the client changes target the fixed protocol. M146 (create_all/migrations) shares the boot-race concern with M138.

### Batch 10, Accessibility (suggested branch: a11y/pre-launch)
- Rationale: a focused accessibility pass. Kept last because several items ride on the component boundaries the rendering batch establishes (the shared sheet from M019/M155, the memoized cards from M077), and the contrast token rebase is a single design-system change best done when the CSS is otherwise stable.
- Findings: M154, M155, M156, M157, M158, M159, M160, M161, M162, M163, M164.
- Dependencies: M155 (dialog semantics) shares the shared-sheet component with M019 (Batch 2), do them consistently. M159 (tab ARIA) and M154 (off-screen pager pages, A11Y-013) are the same two tab components, sequence M159 then the inert handling in M154. M160 (live regions) depends on M159 for the verdict/announcement wiring (A11Y-018 needs A11Y-016). M162 (stats non-visual alternatives) depends on M161 (headings) and on the stats rewrite in M070 (Batch 6); it is stats-page polish and can be deferred within the batch if the launch bar is the core feed/post/create flows. M158 (contrast) folds the error-red nudge (A11Y-030) into one token pass.

## Conflicts to resolve

These are genuine disagreements or tensions between passes, or product decisions the passes explicitly punted. They are kept unresolved for you to decide.

1. Severity disagreement on the per-card /likes fetch (M055). Passes 01 and 02 rate it High (FE-RENDER-014, FE-DATA-002); the bug sweep rates the same behavior Low (BUG-105). The rendering and data passes weight the request storm scaling with feed length; the bug pass weights only the correctness angle. Decide the priority (the merged entry currently carries High).

2. Severity disagreement on per-process limiter state. Security and architecture rate the single-process rate limiter and socket registries High or as a hard deploy invariant (SEC-019, ARCH-001, folded into M138); the backend pass rates the same limiter internals Low (BE-046, folded into M139). They are looking at different consequences (deploy-time multiplication versus in-process race). Decide whether M138 is a launch blocker or documentation.

3. Feed jitter versus pagination (M028, M030, M066). The backend pass wants a stable or seeded ordering so pagination does not duplicate or skip items (BE-001). The data pass documents that the per-request jitter is deliberate because a silent reshuffle is considered worse than staleness, which is also why feed revalidation is turned off (FE-DATA-025). These pull in opposite directions: any pagination fix must first decide the ordering model (seeded per-user jitter is the candidate both name). Resolve the ordering before M028/M030 land.

4. elo.formats: remove or repopulate (M034). The data pass says the backend always sends an empty formats dict and the frontend builds real UI on it (FE-DATA-005); the contract is "kept for response-shape compatibility since the move to a unified knowledge score". Product decision: delete the per-format sections and types, or reintroduce real per-format data server-side. The stats and friends work in Batches 5 and 6 depends on the answer.

5. connections removal needs a cross-tree owner (M033). The web passes confirm the raw connections array has no web consumer (BE-042, FE-DATA-016), but the backend change is gated on a mobile check that this review did not run. Decide who confirms mobile before the field is dropped from PostOut.

6. Person-portrait alt convention is undecided in-tree (part of M157). The accessibility pass notes StorySection uses alt=name while CastSection, AuthorsContextSection and others use alt="" for the identical pattern (A11Y-005). Pick one convention (name-as-alt or decorative) so the fix is consistent rather than codifying the current split.

7. Hidden scrollbars are an intentional design rule versus an accessibility defect (part of M164). The accessibility pass flags the app-wide scrollbar hiding (A11Y-026, LAYOUT_STANDARD s.5) as a usability loss for motor-impaired and mouse-primary users, but records it as an existing deliberate rule. Product decision: keep the aesthetic, or expose scrollbars under an accessibility setting.

8. JWT-in-localStorage is "previously accepted" versus newly re-flagged (M125). Security re-reports it (SEC-011) while noting the June audit accepted it. Decide whether to add only the CSP backstop or also move the session to an httpOnly cookie (with the CSRF tradeoff the pass names).

## Deferred / out of scope

These were surfaced by the passes but belong to separate tracks, not the fix batches above.

- Coordinated rename task (Deepscroll to Plexive). DEAD-016 (user-visible strings: title, auth pages, onboarding, author fallbacks in search and stats), DEAD-017 (all deepscroll_* client storage keys plus the read-old-write-new migration decision), DEAD-018 (non-visible references: comments, User-Agent, temp prefix, gitignore, the DEEPSCROLL_CONTENT_STRUCTURE.md pointer). M011 (README) and M015 (token constant) are rename touchpoints that land in the batches but should use the final name. The storage-key migration is the risky part: a naive rename logs everyone out and drops interests, likes and saves. This matches the existing project decision that "Plexive" is the final name.

- Server-rendering (SSR) direction. FE-RENDER-010 and FE-DATA-004 (the entire app is client-rendered; SSR output is an empty shell), plus FE-RENDER-020 (latent hydration mismatch that only bites once SSR exists). Both passes explicitly say not to attempt a wholesale SSR conversion inside the fix batches; the direction is to move the clearly public reads (post detail, interests, global stats) server-side first, gated on moving interests/session out of localStorage into cookies. Treat as its own design track.

- Mobile rebuild and mobile confirmations. The connections removal (M033) needs a mobile consumer check; the like/follow/PRNG parity notes (DEAD-009, DEAD-010, FE-DATA-023) assume mobile keeps its own copies by convention. Mobile is out of scope for every pass.

- Long-term shared-store scaling. The Redis-backed rate limiter and websocket pub/sub named in the architecture and security passes (ARCH-006, SEC-019) are the eventual fix for multi-worker/multi-replica; the batched work only encodes and documents the single-process invariant (M138), it does not build the shared store.

- Alembic migrations as a deploy step. Named as the long-term answer to create_all-on-boot (M146, ARCH-014, BE-021); the batched fix only tolerates the duplicate-object race, it does not introduce a migration tool.
