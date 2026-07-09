# Web Review — Frontend Rendering and Bundle
Date: 2026-07-06 | Model: Fable 5 | Scope: frontend/src/app (all routes + components + lib), frontend/src/components (+sections), frontend/src/lib, frontend/src/app/globals.css, frontend/package.json, frontend/next.config.ts, frontend/postcss.config.mjs

## Files reviewed

Opened directly during the verification pass (every cited line re-read from source):

- ARCHITECTURE.md
- frontend/package.json, frontend/next.config.ts
- frontend/src/app/layout.tsx, frontend/src/app/globals.css, frontend/src/app/page.tsx
- frontend/src/app/onboarding/page.tsx
- frontend/src/app/post/[id]/page.tsx
- frontend/src/app/stats/page.tsx (targeted ranges incl. 1-30, 380-445, 714-732, 1168-1183, 1358-1373, 1524-1581, 1900-1914, 2296-2310, 2818-2937)
- frontend/src/app/create/page.tsx (targeted ranges incl. 1-30, 92-167, 545-570, 837-882, 1080-1145)
- frontend/src/app/search/page.tsx (105-160, 268-286), frontend/src/app/saved-posts/page.tsx (full)
- frontend/src/app/login/page.tsx (28-42), frontend/src/app/profile/page.tsx (645-665), frontend/src/app/profile/[username]/page.tsx (70-92, 358-372)
- frontend/src/app/chat/[id]/page.tsx (18-68)
- frontend/src/app/components/PostCard.tsx (full), BottomNav.tsx (full), Toast.tsx (full), Marathon.tsx (104-285), Battle.tsx (82-187), NumberSlider.tsx (55-80)
- frontend/src/app/lib/useSwipeTabs.ts, swr.ts, likedPosts.ts, eventQueue.ts, auth.tsx, api.ts, useComments.ts, chatSocket.ts (45-95), battleSocket.ts (55-95)
- frontend/src/components/SvgBlock.tsx, Avatar.tsx, BookCover.tsx, MathText.tsx, SectionRenderer.tsx (1-130), GeneratedBookCover.tsx (380-430)
- frontend/src/components/sections/ContentImage.tsx, PortraitSection.tsx, RelatedPostsSection.tsx, QuizSection.tsx (218-248), CoreIdeasSection.tsx (20-42), AtAGlanceSection.tsx (18-40)
- frontend/src/lib/formats.ts, frontend/src/lib/readAloud/useReadAloud.ts (55-165), frontend/src/lib/readAloud/piper.ts
- frontend/src/lib/glyphs.ts (measured: 87,578 bytes, ~341 lines, 149 entries)

Additionally opened by the parallel review subagents (findings from these were only kept where the cited mechanism was corroborated by directly verified code):

- frontend/src/app/components/FeedHeader.tsx, SegmentedTabs.tsx, Providers.tsx, icons.tsx, stage.tsx, CommentsBottomSheet.tsx, CommentsSection.tsx, CommentRow.tsx
- frontend/src/app/chat/page.tsx, my-posts/page.tsx, register/page.tsx, onboarding/InterestPicker.tsx
- frontend/src/app/lib/savedPosts.ts, relativeTime.ts
- frontend/src/components/DotScale.tsx, VerifiedBadge.tsx, PostRow.tsx, Spinner.tsx, Prose.tsx, SectionLabel.tsx
- frontend/src/components/sections/HeartSection.tsx, FormalDefinitionSection.tsx, FormalismSection.tsx, RealWorldExamplesSection.tsx, KeyFindingsSection.tsx, ChaptersSection.tsx, CastSection.tsx, PerspectivesSection.tsx, HeadlineSection.tsx
- frontend/src/lib/prose.ts, italics.ts, bookCover.ts, frontend/src/types/post.ts, train.ts
- frontend/src/lib/readAloud/extractText.ts, voice.ts, nodeStub.ts, highlights.ts, autostart.ts
- frontend/src/lib/train/mockQuestions.ts, elo.ts, trainApi.ts, frontend/src/lib/battle/seededQuestions.ts
- frontend/tsconfig.json, postcss.config.mjs, .env.example, package-lock.json (targeted duplicate-dependency greps)
- backend/app/routers/feed.py (lines 28-117, only to size the feed payload behind FE-RENDER-013)
- .next build artifacts (on-disk chunk size measurement for the recharts chunk)

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|---|---|---|---|---|---|
| FE-RENDER-001 | recharts statically imported into a ~508 KB stats route chunk | High | High | bloat | M |
| FE-RENDER-002 | BottomNav prefetches the stats (recharts) chunk from every screen | High | High | perf | S |
| FE-RENDER-003 | KaTeX JS (~271 KB min) eagerly bundled into the post-detail chunk | High | High | bloat | M |
| FE-RENDER-004 | katex.min.css imported globally in the root layout | Medium | High | bloat | S |
| FE-RENDER-005 | 87.6 KB FIELD_GLYPHS record statically imported into the feed chunk | Medium | High | bloat | M |
| FE-RENDER-006 | Marathon + Battle statically imported into the home-feed chunk | Medium | High | bloat | S |
| FE-RENDER-007 | Nine font families (incl. 6 cover-only fonts) preloaded on every route | High | Medium | perf | S |
| FE-RENDER-008 | No dynamic imports anywhere; no bundle analyzer | Low | High | architecture | S |
| FE-RENDER-009 | @types/katex in runtime dependencies | Low | High | bloat | S |
| FE-RENDER-010 | Entire app is client-rendered; SSR output is an empty shell | High | High | architecture | L |
| FE-RENDER-011 | Auth-gated pages render null during session restore | Medium | High | perf | M |
| FE-RENDER-012 | Post detail always refetches and shows skeleton, ignoring cached feed data | Medium | High | perf | M |
| FE-RENDER-013 | Feed mounts every returned post as full DOM — no virtualization, unbounded payload | High | High | perf | L |
| FE-RENDER-014 | Every mounted card fires its own /likes request on mount | High | High | perf | M |
| FE-RENDER-015 | PostCard is not memoized; tab swipes and cache patches re-render all cards | Medium | High | perf | S |
| FE-RENDER-016 | localStorage JSON.parse on every call in card initializers and observer callbacks | Low | High | perf | S |
| FE-RENDER-017 | Per-card always-mounted Toast and per-card IntersectionObserver | Low | High | bloat | S |
| FE-RENDER-018 | Double-tap navigation timer never cleaned up on unmount | Low | High | bug | S |
| FE-RENDER-019 | saved-posts mounts one full-screen PostCard per saved post, all at once | Medium | High | perf | M |
| FE-RENDER-020 | Latent hydration mismatch: localStorage reads in render-phase state initializers | Low | Medium | bug | S |
| FE-RENDER-021 | Comment-bar keystroke re-renders the entire section tree (incl. all KaTeX) | High | High | perf | S |
| FE-RENDER-022 | MathText parses and KaTeX-renders on every render with no memoization | Medium | High | perf | S |
| FE-RENDER-023 | SectionRenderer statically imports all 83 section components; per-render copy+sort | Low | High | bloat | S |
| FE-RENDER-024 | SvgBlock re-palettes the whole SVG string (7 split/join passes) every render | Low | High | perf | S |
| FE-RENDER-025 | GeneratedBookCover recomputes hash/PRNG/text-wrap every render | Low | High | perf | S |
| FE-RENDER-026 | Quiz pager keeps all question slides mounted | Low | High | perf | S |
| FE-RENDER-027 | Raw `<a href>` navigation in Read Next cards and profile followers sheet | Medium | High | bug | S |
| FE-RENDER-028 | Unscoped `* { animation-duration: 0ms }` inline style injected per detail-page mount | Low | Medium | bug | S |
| FE-RENDER-029 | Stats page: 2,937-line monolith rebuilds ~80 chart variants on every render | Medium | High | perf | L |
| FE-RENDER-030 | Stats: dead statusDonut construction and same-color overlay chart | Low | High | bug | S |
| FE-RENDER-031 | Create wizard: 1,199-line single component re-renders whole tree per keystroke | High | High | perf | L |
| FE-RENDER-032 | Create: interestSections Map + flatMap rebuilt on every render | Low | High | perf | S |
| FE-RENDER-033 | Create: quiz/sources/interest blocks duplicated verbatim between the two forms | Medium | High | duplication | M |
| FE-RENDER-034 | Create imports CATEGORIES from the onboarding route component | Low | Medium | architecture | S |
| FE-RENDER-035 | Chat conversation: typing re-renders the full unvirtualized message list | Medium | High | perf | M |
| FE-RENDER-036 | Search: every keystroke swaps results for skeletons and remounts both lists | Medium | High | perf | S |
| FE-RENDER-037 | Debounced user searches lack abort/staleness guard (search page + Battle lobby) | Low | Medium | bug | S |
| FE-RENDER-038 | Profile pager height clamp re-renders the page on every content resize | Low | Medium | perf | S |
| FE-RENDER-039 | Followers/following sheet duplicated across both profile pages | Low | High | duplication | S |
| FE-RENDER-040 | Battle socket persists forever after one tab visit; both sockets retry every 3s with no backoff | Medium | High | bug | M |
| FE-RENDER-041 | AuthProvider context value is a new object (and 4 new closures) every render | Low | High | perf | S |
| FE-RENDER-042 | Read-aloud: blob URL leaked on stop; per-run WAV cache never evicts | Low | High | perf | S |
| FE-RENDER-043 | eventQueue beforeunload listener can disable back/forward cache | Low | Medium | perf | S |
| FE-RENDER-044 | apiFetch reads bare localStorage — throws if ever imported server-side | Low | High | architecture | S |
| FE-RENDER-045 | Marathon state hygiene: TickingNumber first-frame flash, user-effect Elo overwrite, mixed updaters | Low | Medium | bug | S |
| FE-RENDER-046 | NumberSlider is fully controlled — every drag step re-renders Marathon/Battle | Low | High | perf | M |
| FE-RENDER-047 | Battle: setMessage called inside a setStage updater (impure updater) | Low | High | bug | S |
| FE-RENDER-048 | backdrop-filter blur baked into .card and used across all feed cards and chrome | Medium | Medium | perf | M |
| FE-RENDER-049 | No next/image anywhere; body images unsized (CLS); full-res avatars into tiny slots | Medium | High | perf | M |
| FE-RENDER-050 | Tailwind arbitrary-value sprawl and hand-mirrored magic numbers | Low | High | bloat | M |
| FE-RENDER-051 | Duplication cluster: PostCard format branches, FieldGlyph, toBase64Utf8, unescapeDollar, DotScale, comment CRUD | Low | High | duplication | M |
| FE-RENDER-052 | Stats page renders literal emoji, violating the project no-emoji rule | Low | High | architecture | S |
| FE-RENDER-053 | Chat NewChatOverlay bundled in the chat-list chunk despite on-demand mount | Low | High | bloat | S |

## Findings

### FE-RENDER-001 — recharts statically imported into a ~508 KB stats route chunk
- Location: frontend/src/app/stats/page.tsx:4-14
- Severity: High
- Confidence: High
- Category: bloat
- Description: Every recharts chart family (Bar, Line, Area, Pie, Radar, Scatter, Treemap plus axes/grid/tooltip/legend) is imported at the top of the `"use client"` stats page. The chunk containing recharts in the existing `.next` build measures 508 KB on disk and is referenced only by the stats route (subagent measurement; matches the "~517 KB" note in ARCHITECTURE.md). recharts 3.x also pulls @reduxjs/toolkit transitively (~7 MB installed), all contained in this chunk.
- Impact: ~0.5 MB of JS download + parse for anyone opening /stats — and, via FE-RENDER-002, for everyone on every page.
- Fix approach: Split GlobalTab/MyStatsTab/FriendsTab into separate files loaded with `next/dynamic` so recharts loads only when a stats tab actually mounts; alternatively lazy-import the chart kit itself.
- Effort: M
- Depends on: none

### FE-RENDER-002 — BottomNav prefetches the stats (recharts) chunk from every screen
- Location: frontend/src/app/components/BottomNav.tsx:58-64
- Severity: High
- Confidence: High
- Category: perf
- Description: BottomNav is mounted on essentially every route. Its mount effect runs `router.prefetch("/stats")` (plus `/`, `/chat`, `/create`, and the profile route), which in production pulls the 508 KB recharts chunk described in FE-RENDER-001 onto every page load, including the feed. The comment shows this is deliberate ("so the first tap ... skips the route-chunk download"), but the cost is paid by all users on the hottest route, most of whom never open stats.
- Impact: ~0.5 MB extra network + parse competing with feed content for bandwidth on first load, on every entry page.
- Fix approach: Drop `/stats` from the eager prefetch (or defer it to idle/pointer-down on the nav item); fixing FE-RENDER-001 shrinks what prefetch fetches and largely defuses this.
- Effort: S
- Depends on: FE-RENDER-001

### FE-RENDER-003 — KaTeX JS (~271 KB min) eagerly bundled into the post-detail chunk
- Location: frontend/src/components/MathText.tsx:1; frontend/src/components/SectionRenderer.tsx:2-83; frontend/src/app/post/[id]/page.tsx:10
- Severity: High
- Confidence: High
- Category: bloat
- Description: `import katex from "katex"` is a top-level import in MathText (and directly in FormalismSection/FormalDefinitionSection per subagent grep). Roughly 60 section components import MathText; SectionRenderer statically imports all of them; the detail page statically imports SectionRenderer. katex.min.js measures 271 KB minified on disk (~70 KB gz). Verified it does NOT reach the feed chunk: PostCard imports only `unescapeDollar` from lib/prose (PostCard.tsx:16), never MathText. So KaTeX is parsed on every first post-detail open, including for formats that render zero math.
- Impact: ~70 KB gz + parse/compile added to the app's core content route; delays time-to-interactive on mobile for every first post open.
- Fix approach: Load KaTeX lazily (`await import("katex")`) inside the math-rendering path only when a `$...$` segment or display formula actually exists, with a plain-text fallback while loading.
- Effort: M
- Depends on: none

### FE-RENDER-004 — katex.min.css imported globally in the root layout
- Location: frontend/src/app/layout.tsx:14
- Severity: Medium
- Confidence: High
- Category: bloat
- Description: `import "katex/dist/katex.min.css"` sits in the root layout, so ~24 KB of KaTeX CSS (with ~60 @font-face declarations) is bundled into the global stylesheet for every route — feed, login, onboarding, chat — although math renders only inside post-detail sections. The KaTeX font binaries themselves load on demand, so the cost is the CSS payload and parse, not 1.2 MB of fonts.
- Impact: Larger render-blocking CSS on all pages that never render math.
- Fix approach: Move the CSS import next to the math renderer (MathText or the sections that use it) so it ships with the same chunk as the KaTeX JS.
- Effort: S
- Depends on: FE-RENDER-003

### FE-RENDER-005 — 87.6 KB FIELD_GLYPHS record statically imported into the feed chunk
- Location: frontend/src/lib/glyphs.ts:22 (measured 87,578 bytes, 149 inline SVG strings; ~14 KB gz per subagent measurement); imported at frontend/src/app/components/PostCard.tsx:15 and frontend/src/app/post/[id]/page.tsx:9
- Severity: Medium
- Confidence: High
- Category: bloat
- Description: All 149 taxonomy glyph SVGs ship as one module constant. PostCard imports the whole record, so it lands in the chunk of every route that renders cards (feed, search, saved-posts) and again in the detail route. A session's feed only ever uses the handful of slugs present in loaded posts' `tags[0]`.
- Impact: Tens of KB of parse on the critical feed route for mostly unused strings; the record will grow with the taxonomy.
- Fix approach: Serve glyphs as static assets fetched by slug (or a lazily imported chunk / per-post glyph delivered with the payload) instead of a monolithic client constant.
- Effort: M
- Depends on: none

### FE-RENDER-006 — Marathon + Battle statically imported into the home-feed chunk
- Location: frontend/src/app/page.tsx:10-11; render gate at page.tsx:201-210
- Severity: Medium
- Confidence: High
- Category: bloat
- Description: `import Marathon` and `import Battle` are static, so both components and their import graphs (NumberSlider, stage.tsx, battleSocket, trainApi/elo, seededQuestions, the ~9 KB mockQuestions pool — roughly 50 KB of source) ship in the `/` route chunk. Rendering is already correctly gated on tab activation (empty div until first opened), but the code is not: every feed visitor downloads and parses Train/Battle even if they never swipe there.
- Impact: Inflated entry-route JS; slower hydration of the app's most-visited page.
- Fix approach: Load both via `next/dynamic(() => import(...))` — the existing `isActivated` gate makes this a drop-in.
- Effort: S
- Depends on: none

### FE-RENDER-007 — Nine font families (incl. 6 cover-only fonts) preloaded on every route
- Location: frontend/src/app/layout.tsx:2-57, 72
- Severity: High
- Confidence: Medium
- Category: perf
- Description: The root layout instantiates Newsreader (normal + italic), Source Sans 3, Geist Mono, and six cover families — Cinzel, Playfair Display, EB Garamond, Zilla Slab (3 explicit weights), Inter, Poppins (4 explicit weights) — and attaches all nine variables to `<html>`. next/font emits `rel="preload"` for every file, an estimated ~15 woff2 files on every route. The six cover fonts are used only inside baked book-cover SVGs, yet preload on login, chat, stats, etc. `display` defaults to swap, so text is not render-blocked — the cost is preload bandwidth competing with the LCP request. (Byte impact inferred from next/font behavior, not measured from a network trace — hence Medium confidence.)
- Impact: First-load bandwidth contention delaying LCP, especially on mobile; wasted bytes on every non-books route.
- Fix approach: Pass `preload: false` to the six `--font-cover-*` families (the CSS variables keep working; files load on first use).
- Effort: S
- Depends on: none

### FE-RENDER-008 — No dynamic imports anywhere; no bundle analyzer
- Location: frontend/next.config.ts:3-16; frontend/package.json:22-32; grep for `next/dynamic|React.lazy` across frontend/src returned zero matches (subagent)
- Severity: Low
- Confidence: High
- Category: architecture
- Description: The only code-splitting beyond Next's per-route default is the single `await import()` in piper.ts. There is no `@next/bundle-analyzer` (or equivalent) in devDependencies, so chunk regressions of the FE-RENDER-001/003/005/006 kind have no visibility. next.config.ts is otherwise minimal and sound (devIndicators off, fs alias for vits-web is browser-scoped and correct).
- Impact: Bundle composition regressions go unnoticed; no tooling to validate the fixes for the findings above.
- Fix approach: Add a bundle analyzer behind an env flag and adopt `next/dynamic` where flagged in this report.
- Effort: S
- Depends on: none

### FE-RENDER-009 — @types/katex in runtime dependencies
- Location: frontend/package.json:14
- Severity: Low
- Confidence: High
- Category: bloat
- Description: `@types/katex` sits in `dependencies` instead of `devDependencies`. Types never bundle, so there is zero runtime cost — dependency hygiene only.
- Impact: None at runtime; slightly misleading dependency graph.
- Fix approach: Move to devDependencies.
- Effort: S
- Depends on: none

### FE-RENDER-010 — Entire app is client-rendered; SSR output is an empty shell
- Location: 13 of 14 route files carry `"use client"` (e.g. frontend/src/app/page.tsx:1, frontend/src/app/post/[id]/page.tsx:1); the only server page is onboarding/page.tsx:1-5, which just renders the client InterestPicker
- Severity: High
- Confidence: High
- Category: architecture
- Description: Every route fetches its data client-side after hydration (`apiFetch` in useEffect at post/[id]/page.tsx:128-163; SWR keyed behind a localStorage read at page.tsx:142-148 and 57-67). First paint everywhere is loading slabs; real content needs HTML → JS → hydrate → (auth restore at auth.tsx:47-63) → API round trip. Most section components are hook-free presentational functions that could stream as server-rendered HTML with Quiz/comment-bar/read-aloud as client islands. Two real constraints shape this: interests and the JWT live in localStorage, so a naive server conversion is not possible without moving them to cookies.
- Impact: Poor LCP on slow devices and networks; zero SEO for a content platform whose posts are the product; skeleton flash on every navigation.
- Fix approach: Introduce server-side data fetching for the post detail route first (highest content value), passing data into client leaves; consider a cookie for interests/session to unlock the feed later. This is a directional architecture item, not a single fix.
- Effort: L
- Depends on: none

### FE-RENDER-011 — Auth-gated pages render null during session restore
- Location: frontend/src/app/login/page.tsx:36 (`if (loading || user) return null`); same pattern at register/page.tsx:37, profile/page.tsx:129, my-posts/page.tsx:31, create/page.tsx:563 (create renders its login gate at 551-562 but returns null while loading)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: These pages blank themselves until AuthProvider's localStorage check + `/api/auth/me` fetch resolves. The login/register forms and static page chrome have no auth dependency, yet paint only after hydration plus the token check.
- Impact: Delayed first contentful paint and a visible blank frame on every auth-gated route; on login/register the delay gates content that needs no auth at all.
- Fix approach: Render static chrome immediately and gate only the redirect (and user-specific fragments) on `loading`.
- Effort: M
- Depends on: FE-RENDER-010 (same root pattern; fixable independently)

### FE-RENDER-012 — Post detail always refetches and shows skeleton, ignoring cached feed data
- Location: frontend/src/app/post/[id]/page.tsx:128-141 (unconditional fetch), 750-756 (pulse slabs)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: Opening a post from the feed always fires `apiFetch(/api/posts/${id})` and renders pulsing slabs until it resolves, even though the tapped post's card data (title, feed_card, counts) sits in the SWR feed cache the page already knows about (it imports `updatePostInFeedCaches` at line 28 to write counts back). The full refetch is necessary for sections (list endpoints strip them), but nothing is seeded for instant paint. The fetch layer itself belongs to Pass 3; reported here for the rendering consequence (skeleton flash on every card tap).
- Impact: Every card tap pays a full skeleton→content transition even for data already on the client; the app feels slower than its cache allows.
- Fix approach: Seed header/card state from the cached feed list (or SWR fallbackData) and fetch only sections/details in the background.
- Effort: M
- Depends on: none

### FE-RENDER-013 — Feed mounts every returned post as full DOM — no virtualization, unbounded payload
- Location: frontend/src/app/page.tsx:119-121 (`posts.map((post) => <PostCard .../>)`); payload size context: backend/app/routers/feed.py:41-45 (For You returns every published post, no limit)
- Severity: High
- Confidence: High
- Category: perf
- Description: TabPage maps the entire For You response into mounted PostCards with no windowing. Each card is a full-screen `h-[100dvh]` snap section carrying a frosted slab, SlabGlow gradient, teaser rows, avatar, 4-button action rail, interest chips, an inline FieldGlyph SVG, its own IntersectionObserver, and its own Toast (see FE-RENDER-017) — an estimated 100-150 DOM nodes per card. The backend returns all published posts (interests order, never exclude), so DOM cost grows linearly with total content; the Following tab adds its own full set once activated (pager pages stay mounted). The endpoint's unboundedness is Pass 3's domain; the frontend's mount-everything rendering is this pass's finding.
- Impact: Initial mount cost, memory, style/layout recalc, and compositing scale with total published posts — tens of thousands of DOM nodes per tab as content grows; every wide re-render (FE-RENDER-015) touches all of it.
- Fix approach: Window the card list (render current ± a few cards, keep spacer heights so scroll-snap still works); pair with feed pagination when Pass 3 addresses the endpoint.
- Effort: L
- Depends on: none

### FE-RENDER-014 — Every mounted card fires its own /likes request on mount
- Location: frontend/src/app/components/PostCard.tsx:173-188
- Severity: High
- Confidence: High
- Category: perf
- Description: A per-card `useEffect` runs `apiFetch(/api/posts/${post.id}/likes)` on mount — not on visibility. Combined with FE-RENDER-013, activating a feed tab fires one HTTP request per post immediately (the same post fetches again in the other tab; this bypasses SWR so nothing dedupes). Each response triggers `setLikesCount` (a re-render) and `setCachedLikeCount` (a full JSON parse + stringify of the localStorage counts blob, likedPosts.ts:56-63). The feed payload already ships `like_count`, which the card uses only as initial state (line 157).
- Impact: A request storm on feed open scaling with feed length; backend load; N state updates and N synchronous localStorage writes right after mount.
- Fix approach: Trust the feed payload's `like_count` and fetch the reconciled count lazily on first intersection (the observer already exists), or batch counts server-side.
- Effort: M
- Depends on: FE-RENDER-013 (amplifies it; fixable independently)

### FE-RENDER-015 — PostCard is not memoized; tab swipes and cache patches re-render all cards
- Location: frontend/src/app/components/PostCard.tsx:146 (plain function export); triggers: frontend/src/app/lib/useSwipeTabs.ts:89-92 (`setActiveIndex` + `setActivatedIndices` on swipe settle), frontend/src/app/lib/swr.ts:37-44 (`updatePostInFeedCaches` builds a new array for every cached /api/feed* key)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: When a horizontal swipe settles, useSwipeTabs sets state on Home, re-rendering FeedHeader, every TabPage, and every mounted PostCard — re-running each card's render body (`formatStyle`, `fcStr` checks, `unescapeDollar` regexes, and FieldGlyph→SvgBlock string passes per FE-RENDER-024). Closing the comments sheet calls `updatePostInFeedCaches`, which maps a new array for each cached feed list; the new `data` reference re-renders the whole TabPage and, without `React.memo`, every card rather than the one patched. The `post` prop references are otherwise stable, so memoization would actually bite — but two inline call-site props would defeat it if added naively: `onSearch={() => router.push("/search")}` (page.tsx:184) and `onExit={() => selectTab(DEFAULT_TAB_INDEX)}` (page.tsx:207-209).
- Impact: Each tab swipe or comment-count write-through burns a reconciliation pass over hundreds of mounted cards (FE-RENDER-013); scales with feed size.
- Fix approach: Wrap PostCard in `React.memo` and keep its props referentially stable.
- Effort: S
- Depends on: FE-RENDER-013 (magnitude), none functionally

### FE-RENDER-016 — localStorage JSON.parse on every call in card initializers and observer callbacks
- Location: frontend/src/app/lib/likedPosts.ts:21-28, 41-43, 45-63; call sites frontend/src/app/components/PostCard.tsx:155-163 (note `isPostSaved` called twice, lines 160 and 163) and 204-206 (per intersection flip)
- Severity: Low
- Confidence: High
- Category: perf
- Description: `isPostLiked`/`getCachedLikeCount`/`isPostSaved` each JSON.parse the full liked/saved/counts blob from localStorage on every call. Every card mount performs 4+ such parses in useState initializers; every visibility flip re-parses two blobs; every `/likes` response (FE-RENDER-014) does a parse + stringify. With hundreds of cards mounting at once, that is 400+ synchronous parses of the same strings during initial render, growing with the user's like history.
- Impact: Main-thread jank at feed mount and while snap-scrolling.
- Fix approach: Cache the parsed arrays/sets in module memory and invalidate on write (the modules are already the single write path).
- Effort: S
- Depends on: none

### FE-RENDER-017 — Per-card always-mounted Toast and per-card IntersectionObserver
- Location: frontend/src/app/components/PostCard.tsx:741 (Toast), 199-221 (observer); frontend/src/app/components/Toast.tsx:3-6 (`fixed ... backdrop-blur-xl`, opacity-0 when idle)
- Severity: Low
- Confidence: High
- Category: bloat
- Description: Each card unconditionally mounts a fixed-position, backdrop-blurred "Link copied!" Toast div (invisible at opacity-0) — N extra fixed elements with backdrop-filter in the layer tree — and constructs its own IntersectionObserver with identical options instead of sharing one for the feed. Cleanup itself is correct (`observer.disconnect()`, line 221). Related low-confidence note: each card also renders up to a row of `backdrop-blur-md` interest chips (line 655); see FE-RENDER-048 for the blur-breadth discussion.
- Impact: Per-card fixed/blurred layers and observer instances multiplied by FE-RENDER-013's unbounded N.
- Fix approach: Hoist a single Toast to the page level; share one IntersectionObserver across cards via a small registry.
- Effort: S
- Depends on: none

### FE-RENDER-018 — Double-tap navigation timer never cleaned up on unmount
- Location: frontend/src/app/components/PostCard.tsx:295-299 (timer set), 151 (ref); no unmount cleanup anywhere in the component (verified full file)
- Severity: Low
- Confidence: High
- Category: bug
- Description: The 300 ms single-tap disambiguation timer is never cleared in an effect cleanup. If the card unmounts within 300 ms of a tap (tab switch, feed cache invalidation), `navigate()` still fires: `cardRef.current` is null so the scroll save is skipped, but `sessionStorage.setItem("feedActiveTab", ...)` and `router.push` still execute — a stray navigation from a dead component. Also a deliberate-but-notable UX cost: every single-tap navigation waits 300 ms.
- Impact: Rare unexpected navigation; consistent 300 ms tap-to-open latency.
- Fix approach: Clear `navTimerRef` in a useEffect cleanup.
- Effort: S
- Depends on: none

### FE-RENDER-019 — saved-posts mounts one full-screen PostCard per saved post, all at once
- Location: frontend/src/app/saved-posts/page.tsx:88-94 (render), 15-34 (one GET /api/posts/{id} per saved id)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: Every saved post renders a full-viewport PostCard immediately inside the snap scroller — 50 saved posts means 50 full cards in the DOM, each also firing its FE-RENDER-014 likes fetch. The per-id fetch fan-out itself is Pass 3's domain; the mount-everything rendering is this pass's.
- Impact: Same DOM/request scaling problem as the feed, on a page whose list grows with user behavior.
- Fix approach: Share whatever windowing the feed adopts (FE-RENDER-013).
- Effort: M
- Depends on: FE-RENDER-013 (same fix mechanism)

### FE-RENDER-020 — Latent hydration mismatch: localStorage reads in render-phase state initializers
- Location: frontend/src/app/components/PostCard.tsx:155-163; frontend/src/app/post/[id]/page.tsx:108-111; guards at frontend/src/app/lib/likedPosts.ts:22-24
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: `useState(() => isPostLiked(post.id))` etc. read localStorage during render. Server render returns the guarded defaults (false/null), so if these components were ever part of server-rendered HTML, a previously liked/saved post would hydrate with mismatched classes and counts. Today it does not bite — cards render only after client-side data arrives (SSR shows slabs), which the hydration audit across all five slices confirmed (no Date.now/Math.random in render paths either). It becomes real the moment FE-RENDER-010's fix server-renders posts.
- Impact: None today; hydration errors the day feed/detail data moves server-side.
- Fix approach: Initialize with server-safe defaults and sync liked/saved state in a mount effect.
- Effort: S
- Depends on: FE-RENDER-010 (only bites after that fix)

### FE-RENDER-021 — Comment-bar keystroke re-renders the entire section tree (incl. all KaTeX)
- Location: frontend/src/app/post/[id]/page.tsx:106 (`stickyDraft` at page level), 771 (`onChange={(e) => setStickyDraft(...)}`), 679-693 (SectionRenderer receives a fresh `.filter()` array each render); frontend/src/components/SectionRenderer.tsx:107-108 (unmemoized, `[...sections].sort(...)` per render)
- Severity: High
- Confidence: High
- Category: perf
- Description: The comment draft lives on the page component, so every keystroke re-renders the whole detail page. SectionRenderer is not memoized, and its `sections` prop is a fresh array (`post.sections.filter(...)`) each render, so `React.memo` alone would not help — every keystroke re-runs the copy+sort, the 80-case switch, every MathText parse + `katex.renderToString` (FE-RENDER-022), and every SvgBlock repalette (FE-RENDER-024). The same tree-wide re-render fires on read-aloud status transitions (idle→loading→playing→paused), comment load/delete, and like taps.
- Impact: Visible input latency while commenting on long or math-heavy posts on mobile; repeated wasted KaTeX work.
- Fix approach: Extract the comment bar into its own component owning the draft state; `useMemo` the filtered sections array and memoize SectionRenderer.
- Effort: S
- Depends on: none

### FE-RENDER-022 — MathText parses and KaTeX-renders on every render with no memoization
- Location: frontend/src/components/MathText.tsx:51-73 (`parseSegments(text)` at 52, `katex.renderToString(...)` at 67)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: Segment parsing, `splitItalics`, and `katex.renderToString` (the expensive call) run in the render body with no `useMemo` or cache. `text` is stable per post, so results are fully cacheable. Amplified by FE-RENDER-021's tree-wide re-renders — every keystroke re-renders every formula on the page.
- Impact: Repeated LaTeX layout work on the main thread during typing and read-aloud status changes.
- Fix approach: `useMemo` keyed on `text` (or a module-level LRU keyed by the LaTeX string) for segments and rendered HTML.
- Effort: S
- Depends on: FE-RENDER-021 (amplifier; worth fixing regardless)

### FE-RENDER-023 — SectionRenderer statically imports all 83 section components; per-render copy+sort
- Location: frontend/src/components/SectionRenderer.tsx:2-83 (imports), 108 (`[...sections].sort(...)`)
- Severity: Low
- Confidence: High
- Category: bloat
- Description: A post renders roughly ten sections of one format, but all seven formats' components load in one chunk. The individual components are small; the dominant transitive payload is KaTeX (FE-RENDER-003), so fixing that removes most of the weight. The per-render array copy+sort is trivial alone but rides FE-RENDER-021's re-render frequency.
- Impact: Modest detail-chunk size beyond the KaTeX share; small repeated sort work.
- Fix approach: Low priority after FE-RENDER-003; optionally split the switch per format with `next/dynamic`, and sort once via `useMemo`.
- Effort: S
- Depends on: FE-RENDER-003

### FE-RENDER-024 — SvgBlock re-palettes the whole SVG string (7 split/join passes) every render
- Location: frontend/src/components/SvgBlock.tsx:27-36; map at frontend/src/lib/formats.ts:141-149 (7 entries); hot path via FieldGlyph at PostCard.tsx:61-71 and post/[id]/page.tsx:39-49
- Severity: Low
- Confidence: High
- Category: perf
- Description: `repaletteSvg` runs seven full split/join scans over the SVG string on every render. For FIELD_GLYPHS this is always a no-op (glyphs use `var(--accent)`, not legacy hexes), yet it executes for every typographic card on every wide re-render — including each IntersectionObserver visibility flip while scrolling the feed (PostCard.tsx:203/215). The user-content path additionally re-runs `btoa(unescape(encodeURIComponent(...)))` per render (line 40). React's innerHTML string equality prevents DOM rewrites, so the cost is CPU-only.
- Impact: Small per call, multiplied by mounted-card count on every feed re-render and by section count on every detail re-render.
- Fix approach: `useMemo` the re-paletted (and base64) result on `svg`, and skip repalette when the string contains none of the legacy hexes.
- Effort: S
- Depends on: none

### FE-RENDER-025 — GeneratedBookCover recomputes hash/PRNG/text-wrap every render
- Location: frontend/src/components/GeneratedBookCover.tsx:385 (`buildPalette`), 425-427 (`coverParams`, `wrapText` inside StageArt); frontend/src/lib/bookCover.ts:186-195 (xmur3 + mulberry32)
- Severity: Low
- Confidence: High
- Category: perf
- Description: For books cards without a baked cover, every render re-runs the seed hash, ~24 PRNG draws, word-wrapping, and pattern-array construction — pure deterministic functions of `(title, author, background, ink)`. Being seeded, there is no hydration risk; it is just unmemoized work in a path re-run on every wide feed re-render (FE-RENDER-015).
- Impact: Minor CPU waste per books card per re-render.
- Fix approach: `useMemo` on `(title, author, background, ink)`.
- Effort: S
- Depends on: none

### FE-RENDER-026 — Quiz pager keeps all question slides mounted
- Location: frontend/src/components/sections/QuizSection.tsx:227-243
- Severity: Low
- Confidence: High
- Category: perf
- Description: The quiz pager renders every question slide (each with MathText per question and option) inside a translateX strip; off-screen slides stay mounted and re-render with every page-level state change (FE-RENDER-021). Quiz counts are 5-10, so the absolute cost is small.
- Impact: Minor extra render work on the detail page.
- Fix approach: Covered by memoizing the section tree (FE-RENDER-021); optionally mount only current±1 slides.
- Effort: S
- Depends on: FE-RENDER-021

### FE-RENDER-027 — Raw `<a href>` navigation in Read Next cards and profile followers sheet
- Location: frontend/src/components/sections/RelatedPostsSection.tsx:31; frontend/src/app/profile/page.tsx:654-656 (the same sheet in profile/[username]/page.tsx:364 correctly uses `<Link>`)
- Severity: Medium
- Confidence: High
- Category: bug
- Description: "Read Next" cards and the own-profile followers list navigate with plain anchors, causing a full document reload — re-downloading all chunks (including KaTeX for the destination post page), re-running auth restore, and dropping the SWR cache and feed scroll state. Everything else in the app uses next/link or router.push.
- Impact: Read Next, a core engagement loop, is the slowest navigation in the app; the profile sheet loses all client state on tap.
- Fix approach: Replace both with `next/link`.
- Effort: S
- Depends on: none

### FE-RENDER-028 — Unscoped `* { animation-duration: 0ms }` inline style injected per detail-page mount
- Location: frontend/src/app/post/[id]/page.tsx:311-323
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: The page injects a `<style>` tag containing its slide keyframes plus `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0ms !important; } }`. The universal selector is unscoped: while the detail page is mounted it zeroes every animation app-wide for reduced-motion users (probably near-intended, but it also kills the page's own `stage-pulse` loading indication and anything a parent renders), and the block is re-parsed on every mount.
- Impact: Overbroad reduced-motion behavior owned by a leaf page; duplicate style parsing.
- Fix approach: Move the keyframes and a scoped reduced-motion guard into globals.css.
- Effort: S
- Depends on: none

### FE-RENDER-029 — Stats page: 2,937-line monolith rebuilds ~80 chart variants on every render
- Location: frontend/src/app/stats/page.tsx:439+ (GlobalTab), 720-731 (eager `perFormatHeatmap` IIFE), 1526-1577 (chart builders re-declared inside MyStatsTab — the comment admits "reuse the same chart builders from GlobalTab"), 2303-2309 (FriendsTab `sorted()` copies per render), 2819-2936 (StatsPage)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: GlobalTab/MyStatsTab/FriendsTab construct every chart element for all their categories and variants as render-body consts — including eagerly executed IIFEs and data transforms (merges, cumulative sums, seven+ sorted copies of participants). Only the selected chart per category mounts (`charts[selected]?.component`, line 389 — good), but construction repeats on every parent render; StatsPage re-renders on each swipe settle (useSwipeTabs setActiveIndex) and on `setSavedCount` (2840-2843), and no tab is memoized. Lazy tab activation itself is done correctly (2872/2889/2915). Also a maintainability problem: one 2,937-line file.
- Impact: Main-thread jank on every stats tab swipe; the monolith blocks the code-split fix for FE-RENDER-001.
- Fix approach: Split the three tabs into files (prerequisite for FE-RENDER-001), wrap them in `React.memo`, hoist the duplicated chart builders to module level, and `useMemo` derived arrays.
- Effort: L
- Depends on: none (FE-RENDER-001 depends on this split)

### FE-RENDER-030 — Stats: dead statusDonut construction and same-color overlay chart
- Location: frontend/src/app/stats/page.tsx:1174 (`statusDonut` never rendered; `statusDonutReal` at 1175 is what renders), 1366-1369 (likes and posts overlay both drawn in `#7c6fff`)
- Severity: Low
- Confidence: High
- Category: bug
- Description: `statusDonut` is dead code built each render, with an `as unknown as` cast that hides a type mismatch (it feeds non-format keys into a format-keyed helper). The "Likes over Time → Overlay" chart plots its two series in the identical color, making them indistinguishable (the comments overlay nearby uses two colors correctly).
- Impact: Wasted render work; one unreadable chart.
- Fix approach: Delete the dead line; give the posts series a distinct color.
- Effort: S
- Depends on: none

### FE-RENDER-031 — Create wizard: 1,199-line single component re-renders whole tree per keystroke
- Location: frontend/src/app/create/page.tsx:92-162 (~20 useState hooks at the top of one component), inline per-keystroke array clones e.g. 843-851 and 1086-1106
- Severity: High
- Confidence: High
- Category: perf
- Description: All three wizard steps and all ~15 accordion sections live in one component. Typing one character in any input (quiz option, source label, core-idea body) calls a top-level setter and re-renders the entire step-3 tree — 6-12 core-idea blocks, 5-10 quiz blocks with 6 inputs each, sources, ~140 interest chips, and every accordion, all with inline arrow handlers recreated per render and full-array clones per keystroke (`const n = [...quizItems]`).
- Impact: Perceptible input latency on mid/low-end phones once the form fills up — on the app's primary content-entry surface.
- Fix approach: Extract each accordion/section into its own memoized component owning its state slice (or a reducer with per-section subscription) so a keystroke re-renders only its section.
- Effort: L
- Depends on: FE-RENDER-033 (extracting the duplicated blocks is the natural first step)

### FE-RENDER-032 — Create: interestSections Map + flatMap rebuilt on every render
- Location: frontend/src/app/create/page.tsx:545-549
- Severity: Low
- Confidence: High
- Category: perf
- Description: A Map over all interests plus a CATEGORIES flatMap/filter runs in the render body on every render — i.e. every keystroke, per FE-RENDER-031 — though its inputs (`allInterests`) change at most once per session.
- Impact: Small repeated allocation; rides the keystroke re-render.
- Fix approach: `useMemo` keyed on `interestsData`.
- Effort: S
- Depends on: FE-RENDER-031

### FE-RENDER-033 — Create: quiz/sources/interest blocks duplicated verbatim between the two forms
- Location: frontend/src/app/create/page.tsx:837-878 (generic form) vs 1080-1141 (Books form) — identical Quiz and Sources accordions differing only in the radio `name` prefix (`gquiz_answer_` vs `quiz_answer_`); interests picker markup similarly duplicated per subagent (810-826 vs 961-980)
- Severity: Medium
- Confidence: High
- Category: duplication
- Description: ~60 lines of quiz/sources editor markup exist twice and have already begun to drift cosmetically (placeholder text differs at 865 vs 1124). Any fix to FE-RENDER-031 must touch both copies.
- Impact: Source bloat and drift hazard on the content-entry surface.
- Fix approach: Extract QuizEditor / SourcesEditor / InterestPickerBlock components (also the prerequisite for FE-RENDER-031's memoization).
- Effort: M
- Depends on: none

### FE-RENDER-034 — Create imports CATEGORIES from the onboarding route component
- Location: frontend/src/app/create/page.tsx:11 (`import { CATEGORIES } from "@/app/onboarding/InterestPicker"`)
- Severity: Low
- Confidence: Medium
- Category: architecture
- Description: The create route imports a data constant from another route's client-component module. Tree-shaking may drop the unused component export, but coupling one route's chunk to another route's component file is fragile and can pull component code across chunks.
- Impact: Possible cross-route chunk bloat; fragile coupling.
- Fix approach: Move CATEGORIES into a shared lib module imported by both.
- Effort: S
- Depends on: none

### FE-RENDER-035 — Chat conversation: typing re-renders the full unvirtualized message list
- Location: frontend/src/app/chat/[id]/page.tsx:24 (`draft` on the page component), 58-60 (scrollIntoView on every length change), message list mapped in the same component (122-160 per subagent, component verified to hold both states)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: The composer draft lives on the page component alongside `messages`, so each keystroke re-renders every message bubble; the full history renders with no windowing or "load older" pagination.
- Impact: Typing responsiveness degrades linearly with conversation length.
- Fix approach: Move the composer into its own component and memoize the message list; add pagination/windowing for long histories.
- Effort: M
- Depends on: none

### FE-RENDER-036 — Search: every keystroke swaps results for skeletons and remounts both lists
- Location: frontend/src/app/search/page.tsx:137 (`setLoading(true)` synchronously per keystroke; the 300 ms debounce at 138 covers only the fetch), 275-276 (`{loading ? (loadingSlabs) : ...}` replaces the results tree)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: While typing, the entire results tree (post cards and UserRows with local follow state) unmounts and remounts on every character, flashing skeletons even though fresh results are ≥300 ms away. `query` state on the page also re-renders the whole page per keystroke.
- Impact: Flicker, repeated mount/unmount cost proportional to result count, and lost UserRow local state mid-typing.
- Fix approach: Set loading only when the debounced request actually fires and keep previous results visible while it is in flight (SWR keepPreviousData or equivalent); isolate the input from the results tree.
- Effort: S
- Depends on: none

### FE-RENDER-037 — Debounced user searches lack abort/staleness guard (search page + Battle lobby)
- Location: frontend/src/app/search/page.tsx:138-155; frontend/src/app/components/Battle.tsx:171-182
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: Both debounced searches clear the timer on re-run but never abort or staleness-check the in-flight request; a slow response for an earlier query can resolve after a later one and overwrite results with stale data.
- Impact: Occasionally wrong search results under latency jitter.
- Fix approach: Pass an AbortController signal, or compare the query against current state before committing results.
- Effort: S
- Depends on: none

### FE-RENDER-038 — Profile pager height clamp re-renders the page on every content resize
- Location: frontend/src/app/profile/[username]/page.tsx:76-86
- Severity: Low
- Confidence: Medium
- Category: perf
- Description: A ResizeObserver on the active pager page calls `setPagerHeight` on every height change (async post loads, image loads), re-rendering the whole profile page to apply an inline height that could be written to the wrapper node imperatively.
- Impact: A few extra full-page renders after load; more if images trickle in.
- Fix approach: Write `wrapper.style.height` directly inside the observer callback via a ref.
- Effort: S
- Depends on: none

### FE-RENDER-039 — Followers/following sheet duplicated across both profile pages
- Location: frontend/src/app/profile/page.tsx:632-671 vs frontend/src/app/profile/[username]/page.tsx:338-381
- Severity: Low
- Confidence: High
- Category: duplication
- Description: ~40 lines of sheet markup (backdrop, header, user rows) are near-identical copies that have already diverged: the own-profile copy navigates with a raw `<a>` (FE-RENDER-027) while the public-profile copy uses `<Link>` (verified at [username]/page.tsx:364).
- Impact: Drift hazard — one copy already carries a bug the other fixed.
- Fix approach: Extract a shared UserListSheet component (the mobile app already has one, per ARCHITECTURE.md).
- Effort: S
- Depends on: none

### FE-RENDER-040 — Battle socket persists forever after one tab visit; both sockets retry every 3s with no backoff
- Location: frontend/src/app/lib/battleSocket.ts:67-71 (fixed 3 s reconnect), 80 (effect keyed on loggedIn); grow-only activation at frontend/src/app/lib/useSwipeTabs.ts:91 and frontend/src/app/page.tsx:196-210; frontend/src/app/lib/chatSocket.ts:50-87 (same fixed retry, `[]` deps)
- Severity: Medium
- Confidence: High
- Category: bug
- Description: `activatedIndices` only grows, so after one visit to the Battle tab the `<Battle>` component stays mounted while the user swipes back to the feed — keeping an authenticated WebSocket open for the rest of the session and, if the server is unreachable, constructing a new WebSocket every 3 seconds forever with no backoff. chatSocket has the identical fixed-3s loop (scoped to the chat page's lifetime) plus a separate defect: its effect has `[]` deps and reads the token once, so logging in while the chat page is mounted leaves the socket permanently closed.
- Impact: Idle socket + timer churn on the feed; sustained retry traffic against a downed backend; a stuck-closed chat socket after in-page login.
- Fix approach: Disconnect the battle socket when the tab is not active (pass an `active` prop); add exponential backoff to both hooks; key the chat socket effect on auth state like battleSocket does.
- Effort: M
- Depends on: none

### FE-RENDER-041 — AuthProvider context value is a new object (and 4 new closures) every render
- Location: frontend/src/app/lib/auth.tsx:103
- Severity: Low
- Confidence: High
- Category: perf
- Description: The provider value `{ user, loading, login, register, logout, updateUser }` is rebuilt inline with per-render function identities. Today AuthProvider renders only on mount and once on token restore (47-63), so the practical cost is bounded — this is a latent amplifier that turns into an app-wide cascade if the provider ever gains more state, and it already invalidates any consumer effect that lists these functions as deps.
- Impact: Currently ~one extra identity churn per auth transition; future-proofing issue.
- Fix approach: `useMemo` the value on `[user, loading]` with `useCallback`-wrapped actions (or split state and actions into two contexts).
- Effort: S
- Depends on: none

### FE-RENDER-042 — Read-aloud: blob URL leaked on stop; per-run WAV cache never evicts
- Location: frontend/src/lib/readAloud/useReadAloud.ts:61-65 (stop removes `src` without `URL.revokeObjectURL`; revocation only in onended/onerror/autoplay-fail at 143-158), 112-121 (per-run sentence→Blob promise cache, no eviction)
- Severity: Low
- Confidence: High
- Category: perf
- Description: Each mid-sentence stop strands one object URL + WAV blob until page unload. During a run, the cache retains every synthesized sentence's WAV (uncompressed PCM, roughly 40-50 KB per second of speech), so a long post accumulates tens of MB until the run ends and the closure is released. (Piper itself is correctly isolated behind `await import` — verified at piper.ts:21 — and never touches the main bundle.)
- Impact: Memory growth across repeated start/stop and long read-alouds on memory-constrained phones.
- Fix approach: Track the current object URL in a ref and revoke it in `stop()`; delete cache entries once a sentence finishes playing.
- Effort: S
- Depends on: none

### FE-RENDER-043 — eventQueue beforeunload listener can disable back/forward cache
- Location: frontend/src/app/lib/eventQueue.ts:57-62
- Severity: Low
- Confidence: Medium
- Category: perf
- Description: A `beforeunload` handler makes the page ineligible for bfcache in Safari and some Chromium configurations, so back-navigation to the feed pays a full reload instead of an instant restore. The `visibilitychange` + `keepalive` flush already covers the common cases; `pagehide` is the recommended termination hook. (Also a nit: `visibilitychange` is specced on `document`; it reaches `window` only by bubbling.)
- Impact: Possible lost instant back-navigation restores; browser-dependent.
- Fix approach: Replace `beforeunload` with `pagehide` and listen on `document` for visibilitychange.
- Effort: S
- Depends on: none

### FE-RENDER-044 — apiFetch reads bare localStorage — throws if ever imported server-side
- Location: frontend/src/app/lib/api.ts:7
- Severity: Low
- Confidence: High
- Category: architecture
- Description: `localStorage.getItem(...)` without a `typeof window` guard is a ReferenceError in Node. All current callers are client-side, but swr.ts, eventQueue.ts, and trainApi funnel through this module and none carry `"use client"` — a future server-component import fails at runtime, not build time. Directly relevant if FE-RENDER-010 is pursued.
- Impact: None today; a sharp edge for the server-rendering migration.
- Fix approach: Guard the token read like likedPosts.ts does.
- Effort: S
- Depends on: none

### FE-RENDER-045 — Marathon state hygiene: TickingNumber first-frame flash, user-effect Elo overwrite, mixed updaters
- Location: frontend/src/app/components/Marathon.tsx:108 (`useState(to)` — first paint shows the final rating before the animation snaps back to `from`), 206-224 (effect keyed on the `user` object identity refetches and unconditionally overwrites `sessionElo`, even mid-marathon after e.g. `updateUser`), 264-278 (`applyResult` mixes stale-closure reads — `answeredIds`, `lifetimeAnswered`, `streak` — with functional updaters)
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: Three small state-handling defects in one component. The flash is cosmetic (one frame). The Elo overwrite needs a mid-session `user` identity change to trigger. The mixed updaters are safe today only because `busy`/`selected` gating serializes answers.
- Impact: One-frame rating flash; a possible mid-session rating jump; latent lost-update risk.
- Fix approach: Initialize TickingNumber from `from`; key the Elo effect on `user?.username` and seed only in the intro stage; use functional updaters consistently.
- Effort: S
- Depends on: none

### FE-RENDER-046 — NumberSlider is fully controlled — every drag step re-renders Marathon/Battle
- Location: frontend/src/app/components/NumberSlider.tsx:66-69 (`onChange` per step crossing); state owners at Marathon.tsx:197 and Battle.tsx:88
- Severity: Low
- Confidence: High
- Category: perf
- Description: The slider's live value lives on the parent screen component, so every pointer-move that crosses a step boundary re-renders the entire question view (top strip, GlowCard, prompt, options). Snapping already throttles to step changes and the tree is small, so the cost is bounded — dozens of full-component renders during a fast drag on a fine-step question.
- Impact: Possible drag jank on low-end phones; fine on desktop.
- Fix approach: Keep the live value local to the slider (or a memoized subtree) and commit to the parent on release/submit.
- Effort: M
- Depends on: none

### FE-RENDER-047 — Battle: setMessage called inside a setStage updater (impure updater)
- Location: frontend/src/app/components/Battle.tsx:140-146
- Severity: Low
- Confidence: High
- Category: bug
- Description: The `opponent_left` handler calls `setMessage(...)` inside the `setStage` functional updater. Updaters must be pure; React may invoke them more than once (StrictMode dev, and legally in production). Harmless today because the side effect is idempotent, but it is the exact pattern that breaks silently when the side effect stops being idempotent.
- Impact: None observable currently.
- Fix approach: Read the stage via state/ref in the handler and call the two setters as siblings.
- Effort: S
- Depends on: none

### FE-RENDER-048 — backdrop-filter blur baked into .card and used across all feed cards and chrome
- Location: frontend/src/app/globals.css:119-124 (`.card { ... backdrop-filter: blur(24px); }`), 190 (`.btn-icon ... blur(12px)`); ~82 `.card` usages across 25 files plus 14 `backdrop-blur-*` utility usages (subagent grep); full-viewport fixed dot-grid layer beneath at globals.css:84-94
- Severity: Medium
- Confidence: Medium
- Category: perf
- Description: Every feed card slab, icon button, nav dock, tab capsule, toast, and comment bar carries a backdrop filter, forcing per-frame backdrop sampling during scroll of a full-viewport snap feed with many mounted cards — one of the most expensive compositing features on mobile GPUs. The fixed dot-grid pseudo-element adds a permanent full-screen layer that every blur must sample. Notably, over the near-uniform #0a0a0a background the 24px blur is nearly invisible, so much of the cost buys nothing. Not profiled on hardware — hence Medium confidence on magnitude.
- Impact: Scroll jank and battery drain on low/mid mobile GPUs, on the app's primary interaction.
- Fix approach: Drop backdrop-filter from `.card` (the translucent fill alone reads identically on the flat dark page) and keep blur only for chrome that genuinely overlays scrolling content.
- Effort: M
- Depends on: none

### FE-RENDER-049 — No next/image anywhere; body images unsized (CLS); full-res avatars into tiny slots
- Location: zero `next/image` matches in frontend/src (subagent grep) and no `images` config in frontend/next.config.ts:3-16; unsized body figures at frontend/src/components/sections/ContentImage.tsx:19-29, PortraitSection.tsx:17-23, CoreIdeasSection.tsx:29-35; fixed-box header/card images at PostCard.tsx:419-425 (portrait, no `decoding`), 551-558 (stories band), post/[id]/page.tsx:499-504 and 585-591 (no `loading` attr, above the fold); Avatar.tsx:37-46 (correct width/height/lazy/async)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: All images are raw `<img>` with no responsive srcset, no format negotiation, and no server-side resizing, so full-resolution remote files (Supabase uploads, portraits, figures) are downloaded for 80-128 px slots and 20-48 px avatars. Mitigations already present and verified: card/body images consistently set `loading="lazy"` (so the hundreds of offscreen snap cards do not eagerly fetch) and mostly `decoding="async"`; card/header images sit in fixed CSS boxes (no CLS there). The real CLS risk is the article body: ContentImage/PortraitSection/CoreIdeas images have no width/height/aspect-ratio, so each load reflows the post — particularly bad while read-aloud auto-scrolls.
- Impact: Oversized image payloads on a mobile-first feed; mid-article layout shifts.
- Fix approach: Adopt next/image with remotePatterns for the image hosts (or minimally: store intrinsic dimensions in content JSON and set aspect-ratio on body figures; add srcset for covers/portraits).
- Effort: M
- Depends on: none

### FE-RENDER-050 — Tailwind arbitrary-value sprawl and hand-mirrored magic numbers
- Location: examples verified: PostCard.tsx:40 (`text-[1.0625rem]`), 556 (`w-[calc(100%+3rem)]`), 651/671 (`bottom-[calc(env(safe-area-inset-bottom)+72px)]`); post/[id]/page.tsx:512 (`text-[2rem]` with a comment admitting it must be hand-synced to HeadlineSection); the scrollbar-hiding pair `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` copy-pasted ~12× (page.tsx:84/193, stats/page.tsx:2848/2869, search/page.tsx:272, saved-posts/page.tsx:88, post/[id]/page.tsx:397, ...) — despite globals.css:106-111 already hiding scrollbars globally
- Severity: Low
- Confidence: High
- Category: bloat
- Description: Dozens of unique arbitrary values each emit their own CSS rule (modest growth — the Tailwind v4 setup itself is clean, verified in globals.css) and, more importantly, duplicate design decisions that must be kept in sync by hand. The scrollbar-hide utility pair is doubly redundant: a global `*` rule already does it.
- Impact: Drift-prone styling; minor CSS size.
- Fix approach: Promote recurring values to `@theme` tokens / `@utility` definitions; delete the redundant per-container scrollbar classes.
- Effort: M
- Depends on: none

### FE-RENDER-051 — Duplication cluster: PostCard format branches, FieldGlyph, toBase64Utf8, unescapeDollar, DotScale, comment CRUD
- Location: PostCard.tsx:378-640 (seven format branches repeating the identical slab/headline/dek/teaser/footer skeleton, ~250 lines where ~80 would do); FieldGlyph defined twice (PostCard.tsx:61-71 vs post/[id]/page.tsx:39-49); toBase64Utf8 twice (SvgBlock.tsx:20-22 vs BookCover.tsx:30-32, with a comment acknowledging it); unescapeDollar twice (MathText.tsx:20-22 vs lib/prose.ts); DotScale twice (components/DotScale.tsx vs a local copy in AtAGlanceSection.tsx:24-35); the detail page reimplements useComments' post/delete logic (post/[id]/page.tsx:230-259 vs app/lib/useComments.ts:30-58, already divergent — the hook trims the draft inside postComment, the page trims before calling)
- Severity: Low
- Confidence: High
- Category: duplication
- Description: Six near-identical implementations drifting independently. Runtime cost is negligible (Tailwind dedupes the CSS); the risk is inconsistency — the comment-CRUD pair has already diverged in behavior details.
- Impact: Consistency hazard and source bloat on the two most-edited components.
- Fix approach: Extract shared CardSlab/CardHeadline layout pieces, hoist FieldGlyph/toBase64Utf8/unescapeDollar/DotScale to their shared modules, and move the detail page onto useComments.
- Effort: M
- Depends on: none

### FE-RENDER-052 — Stats page renders literal emoji, violating the project no-emoji rule
- Location: frontend/src/app/stats/page.tsx:1906, 1911 (`<div className="text-2xl mt-1">🔥</div>`)
- Severity: Low
- Confidence: High
- Category: architecture
- Description: CLAUDE.md forbids emojis in code; the streak cards render literal 🔥 (the mobile port already replaced it with a flame glyph, per ARCHITECTURE.md). Not a performance issue — reported as a rule violation surfaced during review.
- Impact: Project-rule inconsistency; platform-dependent emoji rendering.
- Fix approach: Replace with the flame SVG glyph used elsewhere.
- Effort: S
- Depends on: none

### FE-RENDER-053 — Chat NewChatOverlay bundled in the chat-list chunk despite on-demand mount
- Location: frontend/src/app/chat/page.tsx:39-179 (component), 276-281 (conditional mount) — per subagent read
- Severity: Low
- Confidence: High
- Category: bloat
- Description: The new-chat overlay renders only on demand but is statically part of the chat chunk. It is small (~140 lines), so this is a completeness note against the code-splitting checklist, not a priority.
- Impact: Marginal chat-route chunk size.
- Fix approach: Only worth `next/dynamic` if the overlay grows.
- Effort: S
- Depends on: none

## Coverage notes

**Reviewed.** All 14 routes under frontend/src/app; the feed and PostCard pipeline; the post-detail page and section-rendering pipeline (SectionRenderer plus 15 of the ~82 section components opened individually, chosen to cover every format and every media-bearing pattern); the styling system (globals.css in full, Tailwind v4 setup, fonts); build configuration (next.config.ts, package.json, postcss.config.mjs, tsconfig, targeted package-lock greps); Train/Battle and the read-aloud stack; all shared client libs (auth, swr, api, eventQueue, likedPosts/savedPosts, sockets, useSwipeTabs, useComments).

**Not reviewed.**
- ~67 section components were not opened individually (most are label+paragraph one-liners over the shared Prose/MathText kit; their MathText imports were confirmed by grep, which is what the bundle findings rest on). Per-component issues there would be missed.
- No production build or profiler run was executed. All chunk-composition claims derive from static import graphs, except: the recharts chunk (508 KB measured on disk from the existing .next build) and glyphs.ts (87,578 bytes measured). Gzip/route-total payloads were not measured (app-build-manifest.json was absent).
- package-lock.json was audited only for react/react-dom/katex/recharts duplication (none found); the remaining ~490 packages were not checked.
- mobile/ is out of scope; parity claims in code comments were not verified against it.
- Data-fetching correctness (feed endpoint unboundedness, per-id fan-outs, FriendsTab request pattern) is Pass 3's domain — included here only where it has a direct rendering consequence (FE-RENDER-012/013/014/019).

**Low-confidence items.** FE-RENDER-048 (backdrop-filter GPU cost — not profiled on hardware), FE-RENDER-007 (font byte impact inferred from next/font behavior, not a network trace), FE-RENDER-043 (bfcache behavior is browser-dependent), FE-RENDER-020 (latent until SSR exists), FE-RENDER-028/034/037/038/045 (mechanisms verified; real-world frequency uncertain).

**Verified non-issues (checked against the checklist, nothing wrong).**
- vits-web / onnxruntime (146 MB installed) is correctly isolated behind the single `await import` in piper.ts:21 and never reaches any route chunk; useReadAloud is imported only by the detail page. Preserve this boundary.
- The swipe-tab indicator writes DOM styles directly on scroll frames (useSwipeTabs.ts:75-77) with passive listeners and full cleanup; React state changes only on scroll settle. Vertical feed scrolling touches no React state beyond localized per-card visibility flips.
- Read-aloud highlighting uses the CSS Custom Highlight API with per-word Range updates at speech rate — no React re-renders per word.
- Marathon's ElapsedBar is a single rAF + CSS width transition, not a per-tick re-render; TickingNumber re-renders only its own leaf span.
- Lazy tab activation is implemented correctly on both the feed (page.tsx:196-212) and stats (2872/2889/2915): never-visited tabs render empty divs.
- No hydration mismatches found anywhere: all localStorage/Date reads in render paths are SSR-guarded or gated behind client-fetched data; the generated book cover PRNG is deterministically seeded.
- Tailwind v4 setup is clean (CSS-first, `@theme inline` for font vars, no config remnants, no @apply abuse); the runtime injection of `::highlight()` rules is a documented Lightning CSS limitation, not a defect.
- No duplicate react/react-dom/katex/recharts versions in the lockfile.
- SWR revalidation is deliberately disabled for feed keys (server jitters order); the resulting reliance on manual cache patching is what makes FE-RENDER-015 matter.

**Stale documentation noticed in passing** (not findings, not fixed per review constraints): ARCHITECTURE.md still describes the feed as an "11-tab bar (Following + For You + Train + Battle + 7 formats)"; the code has 4 tabs with format tabs removed (page.tsx:16-27). Its "~517 KB recharts chunk" figure matches the measured 508 KB.
