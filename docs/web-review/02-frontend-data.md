# Web Review — Frontend Data-Fetching
Date: 2026-07-06 | Model: Fable 5 | Scope: frontend/src (app pages, app/lib, app/components, components/sections data consumers, lib/train, types)

## Files reviewed

- ARCHITECTURE.md (orientation)
- docs/web-review/03-backend-endpoints.md (reference input: FE/BE contract)
- frontend/src/app/lib/api.ts
- frontend/src/app/lib/swr.ts
- frontend/src/app/lib/auth.tsx
- frontend/src/app/lib/eventQueue.ts
- frontend/src/app/lib/useComments.ts
- frontend/src/app/lib/likedPosts.ts
- frontend/src/app/lib/savedPosts.ts
- frontend/src/app/lib/chatSocket.ts
- frontend/src/app/components/Providers.tsx
- frontend/src/app/components/PostCard.tsx
- frontend/src/app/components/CommentsBottomSheet.tsx
- frontend/src/app/components/CommentsSection.tsx
- frontend/src/app/components/BottomNav.tsx (fetch-relevant part)
- frontend/src/app/components/Marathon.tsx (fetch-relevant part)
- frontend/src/app/components/Battle.tsx (fetch-relevant part)
- frontend/src/app/page.tsx
- frontend/src/app/post/[id]/page.tsx
- frontend/src/app/profile/page.tsx
- frontend/src/app/profile/[username]/page.tsx
- frontend/src/app/search/page.tsx
- frontend/src/app/chat/page.tsx
- frontend/src/app/chat/[id]/page.tsx
- frontend/src/app/my-posts/page.tsx
- frontend/src/app/saved-posts/page.tsx
- frontend/src/app/stats/page.tsx (fetch call sites, FriendsTab, formats consumers)
- frontend/src/app/create/page.tsx (fetch call sites)
- frontend/src/app/onboarding/InterestPicker.tsx (fetch-relevant part)
- frontend/src/components/sections/QuizSection.tsx
- frontend/src/components/sections/RelatedPostsSection.tsx
- frontend/src/components/Avatar.tsx
- frontend/src/types/post.ts
- frontend/src/lib/train/trainApi.ts

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|----|-------|----------|------------|----------|--------|
| FE-DATA-001 | Feed consumes the whole published corpus per tab, no pagination, all cards mounted | High | High | perf | L |
| FE-DATA-002 | Every mounted feed card fires its own GET /likes; N requests per feed view, repeated on every revisit | High | High | perf | M |
| FE-DATA-003 | Saved and Liked lists fan out one full post-detail fetch per saved id | High | High | perf | M |
| FE-DATA-004 | The entire app is client-fetched; no server-side data fetching or Next.js fetch caching exists | Medium | High | architecture | L |
| FE-DATA-005 | Per-format Elo (elo.formats) is typed, charted and rendered, but the backend always sends {} | Medium | High | bug | M |
| FE-DATA-006 | Chat history is capped at the latest 50 messages; before_id pagination is never used | Medium | High | bug | M |
| FE-DATA-007 | Chat conversation page refetches the entire conversation list to find one header | Medium | High | perf | S |
| FE-DATA-008 | For You and format tabs show loading slabs indefinitely on fetch error | Medium | High | bug | S |
| FE-DATA-009 | Debounced searches have a stale-response race (no abort or sequence guard) | Medium | High | bug | S |
| FE-DATA-010 | Search page has no error state: a failed search renders a blank results area | Medium | High | bug | S |
| FE-DATA-011 | Detail page duplicates the like count fetch and eagerly loads comments; the server liked flag is never consumed | Medium | High | duplication | S |
| FE-DATA-012 | my-posts consumes only row-level fields but receives full sections (confirms BE-020) | Medium | High | bloat | S |
| FE-DATA-013 | Stats Friends tab fans out 2 sequential-per-friend requests (up to ~27 total) | Medium | High | perf | M |
| FE-DATA-014 | Auth-gated fetches wait for the /me round trip instead of token presence | Medium | Medium | perf | S |
| FE-DATA-015 | Detail page re-implements useComments; ARCHITECTURE.md claims the hook is shared | Low | High | duplication | S |
| FE-DATA-016 | Post.connections is typed but never read anywhere in the web frontend (confirms BE-042) | Low | High | bloat | S |
| FE-DATA-017 | Onboarding interests fetch has no error handling: failure leaves placeholders forever | Low | High | bug | S |
| FE-DATA-018 | The same resources are fetched through mixed layers (raw fetch vs SWR), so caches never share | Low | High | duplication | S |
| FE-DATA-019 | Comments UI shows "No comments yet" during loading and after a failed fetch | Low | High | bug | S |
| FE-DATA-020 | Changing the search format filter refires the identical user search | Low | High | perf | S |
| FE-DATA-021 | Plain anchor navigations (Read Next, own-profile sheet) reload the app and drop the SWR cache | Low | High | perf | S |
| FE-DATA-022 | Create-page duplicate check fetches up to 50 full list posts and uses 5 | Low | High | bloat | S |
| FE-DATA-023 | Optimistic follow update on the public profile writes the response without an ok-check | Low | High | bug | S |
| FE-DATA-024 | Detail-page fetch effects have no cancellation; stale responses can be applied | Low | Low | bug | S |
| FE-DATA-025 | Feed caches never revalidate in-session (deliberate), so counts and new posts go stale | Low | Medium | architecture | S |

## Findings

### FE-DATA-001 — Feed consumes the whole published corpus per tab, no pagination, all cards mounted
- Location: frontend/src/app/page.tsx:57-70 (SWR key without any limit parameter), page.tsx:120 (posts.map renders every returned post)
- Severity: High / Confidence: High / Category: perf
- Description: The For You tab requests `/api/feed?interests=...` and renders the complete response. Per the backend contract (03-backend-endpoints.md, BE-001), this endpoint returns every published post with no limit, and the frontend sends no paging parameter because none exists. All returned posts are mounted at once as PostCard components (each with an IntersectionObserver, entrance animation state, and its own likes fetch, see FE-DATA-002). The list is then held in the SWR cache for the whole session (revalidateIfStale false, page.tsx:67).
- Impact: Response size, parse time, memory, and the number of mounted DOM subtrees all grow linearly with total published posts. With the content pipeline generating posts continuously, first-feed-paint degrades without bound. This is the frontend half of the platform's single biggest scalability cliff; the backend half is BE-001/BE-007.
- Fix approach: When the backend gains pagination (BE-007 keyset pattern plus a stable feed ordering), switch the feed to an incremental loader (SWR infinite or manual append on scroll-near-end) and mount a window of cards rather than all of them (windowing itself is Pass 2 territory, the fetch shape is this pass's). No frontend-only fix exists beyond truncating the response client-side as a stopgap.
- Effort: L
- Depends on: BE-001, BE-007

### FE-DATA-002 — Every mounted feed card fires its own GET /likes; N requests per feed view, repeated on every revisit
- Location: frontend/src/app/components/PostCard.tsx:173-188; mounted for every post at frontend/src/app/page.tsx:120, and per saved post at frontend/src/app/saved-posts/page.tsx:89-93
- Severity: High / Confidence: High / Category: perf
- Description: PostCard's mount effect unconditionally fetches `/api/posts/{id}/likes` for reconciliation with the localStorage like state. Because the feed mounts every card at once (FE-DATA-001), a feed of N posts fires N such requests immediately on load. The feed list itself is served cache-first on revisits, but the cards remount, so all N requests fire again on every return to the feed. The fetched payload is `{count, liked}`; the server `liked` flag is never read (the local liked state comes from `isPostLiked`, line 155 and 179), and `like_count` is already present on every post in the feed payload (types/post.ts:497), so the only new information is a fresher count.
- Impact: The hottest screen multiplies its request count by the corpus size: each request costs the backend an events aggregation plus, for logged-in users, the per-request auth lookup (BE-049). Network tab noise, rate-limit pressure, and battery cost on mobile web. The marginal value is small because the feed payload already carries a fresh count on first load.
- Fix approach: Fetch the reconciliation only when a card actually becomes visible (the IntersectionObserver at PostCard.tsx:199 already knows), or drop the per-card fetch entirely on first load (trust `post.like_count` from the list payload) and reconcile only on cached revisits; longer term, a batch likes endpoint or including `liked` in the feed payload for authed users removes the pattern.
- Effort: M
- Depends on: none

### FE-DATA-003 — Saved and Liked lists fan out one full post-detail fetch per saved id
- Location: frontend/src/app/profile/[username]/page.tsx:120-136 (Promise.all over ids, one GET /api/posts/{id} each); frontend/src/app/saved-posts/page.tsx:15-34 (same pattern)
- Severity: High / Confidence: High / Category: perf
- Description: Saved and liked post ids live in localStorage (savedPosts.ts, likedPosts.ts), and both consumers hydrate them by fetching each id individually via the detail endpoint. Each response is a full PostOut: complete sections JSON plus a server-side read_next resolution (posts.py per the contract). The profile tabs render only PostRow (title, format dot, status), so virtually the entire payload is discarded; saved-posts renders PostCards, which need only the list shape (sections arrive stripped-equivalent unused). The fan-out is unbounded and fully parallel: 100 saved posts means 100 concurrent requests hitting the backend threadpool at once. The tabs are at least lazy (fetch on first tab settle, page comment at lines 116-119).
- Impact: A heavy saver pays hundreds of requests and megabytes of section bodies to draw a list of title rows; the burst also competes with everything else on the connection pool (BE-018). Grows with the user's saved count forever.
- Fix approach: A backend batch endpoint (GET /api/posts?ids=... returning PostListOut) is the honest fix and also the natural stepping stone to server-side saves (both libs carry a TODO to move to the backend). Until then, cap concurrency and consider chunking. Frontend-only mitigation is limited.
- Effort: M
- Depends on: backend endpoint (new; related to the savedPosts/likedPosts backend TODO), BE-020's PostListOut precedent

### FE-DATA-004 — The entire app is client-fetched; no server-side data fetching or Next.js fetch caching exists
- Location: every page opens with "use client" (frontend/src/app/page.tsx:1, post/[id]/page.tsx:1, profile/[username]/page.tsx:1, etc.); the only server component is frontend/src/app/onboarding/page.tsx, which renders a client component; no fetch call anywhere passes cache or next.revalidate options
- Severity: Medium / Confidence: High / Category: architecture
- Description: Next.js is used purely as an SPA shell. Every byte of data arrives through client-side fetch/SWR after hydration, gated behind the JS bundle download and, for auth-dependent pages, the /me round trip (FE-DATA-014). There is no Route Handler, no server component data fetch, and therefore zero use of the Next.js fetch cache, revalidation, or streaming. The checklist item "missing or wrong Next.js fetch cache settings" resolves to: there are none, by construction.
- Impact: First contentful paint of real data always costs bundle + hydrate + fetch. Public, cacheable content (post detail pages, the interest taxonomy, global stats) is refetched by every client although it changes rarely. Public post pages are also invisible to crawlers, which matters for a content platform's launch. Weighed against that: most surfaces are personalized or localStorage-driven, so full SSR would be a redesign, which is out of scope here.
- Fix approach: Direction only: move the clearly public, static-ish reads server-side first (post detail GET, /api/interests, /api/stats/global) as server components or cached route handlers with revalidate, keeping interaction state client-side. Do not attempt a wholesale SSR conversion as part of fix batches.
- Effort: L
- Depends on: none

### FE-DATA-005 — Per-format Elo (elo.formats) is typed, charted and rendered, but the backend always sends {}
- Location: frontend/src/app/stats/page.tsx:2395-2600 (Friends tab per-format radar, leaders, quiz activity, breadth, all reading p.formats[fmt]), stats/page.tsx:1489 (Personal tab eloFormats), frontend/src/app/profile/page.tsx:360-371 (per-format chips), profile/page.tsx:21-24 and profile/[username]/page.tsx:31-34 (EloData types promising {rating, answered_count})
- Severity: Medium / Confidence: High / Category: bug
- Description: The contract (03-backend-endpoints.md, /api/users/{username}/elo and elo_summary) states `formats` is always an empty dict, kept only for response-shape compatibility since the move to a single unified knowledge score. The frontend still types it as populated and builds real UI on it: the profile knowledge slab's per-format chips (render-gated on non-empty, so they silently never appear), and several Friends-tab stat sections whose radar values, leader bars, answered counts and breadth counts all compute from `formats[fmt]` and therefore permanently render zeros or empty comparisons. MyStatsTab's eloFormats from /stats/me my_elo has the same source.
- Impact: Dead UI and misleading displays: the Friends tab's per-format sections look like "nobody has answered anything in any format" rather than "this data does not exist". The types also misdocument the contract for future work.
- Fix approach: Decide the product answer: either remove the per-format sections and the formats field from the frontend types (matching the unified-score reality), or reintroduce real per-format data server-side. Until then, hide the sections that depend on it.
- Effort: M
- Depends on: none

### FE-DATA-006 — Chat history is capped at the latest 50 messages; before_id pagination is never used
- Location: frontend/src/app/chat/[id]/page.tsx:43 (GET messages with no query parameters)
- Severity: Medium / Confidence: High / Category: bug
- Description: The messages endpoint is the backend's one correctly paginated list (keyset via before_id, limit clamped 1-100, default 50, per the contract). The web client calls it bare: it receives the newest 50 messages and provides no way to scroll further back. Messages 51+ into the past are unreachable from the web UI.
- Impact: Any conversation longer than 50 messages silently loses its history from the user's point of view. This will be one of the first visible data bugs after launch for active chatters.
- Fix approach: On scroll-to-top of the message list, fetch `?before_id={oldest loaded id}` and prepend; keep the existing dedupe-by-id logic (already present for socket messages at lines 31-35).
- Effort: M
- Depends on: none

### FE-DATA-007 — Chat conversation page refetches the entire conversation list to find one header
- Location: frontend/src/app/chat/[id]/page.tsx:50-55
- Severity: Medium / Confidence: High / Category: perf
- Description: To render the conversation name and participants, the page fetches `GET /api/chat/conversations` (the full list, including a last-message preview and participant list for every conversation the user has) and picks one entry client-side. The comment acknowledges there is no single-conversation endpoint. The call uses raw apiFetch, not SWR, so the copy of this exact list that the /chat page just cached under the SWR key `/api/chat/conversations` (chat/page.tsx:189) is not reused; entering a conversation from the list pays the full list fetch again.
- Impact: One redundant full-list round trip per conversation open, on a payload that grows with conversation count, when the needed data was fetched seconds earlier.
- Fix approach: Use `useSWR<Conversation[]>("/api/chat/conversations")` here so the cached list renders instantly and revalidates in the background; alternatively (or additionally) a backend GET /api/chat/conversations/{id} endpoint.
- Effort: S
- Depends on: none

### FE-DATA-008 — For You and format tabs show loading slabs indefinitely on fetch error
- Location: frontend/src/app/page.tsx:67-70 (error mapped to posts=null for non-following tabs), page.tsx:106-111 (posts===null renders the pulsing loading slabs)
- Severity: Medium / Confidence: High / Category: bug
- Description: TabPage deliberately preserves the pre-SWR behavior: only the Following tab maps errors to an empty list; every other tab leaves posts at null on error, which is indistinguishable from loading. SWR's default error retry keeps trying in the background with backoff, but if the API stays down (or the request 4xxs), the user sees pulsing placeholder slabs forever with no message and no retry affordance. The comment at lines 68-69 confirms this is inherited behavior, not an oversight of this review.
- Impact: The app's primary screen has no failure feedback. A user on a flaky connection cannot tell dead backend from slow load.
- Fix approach: Branch on the SWR error for all tabs: render the existing slab-message pattern (like the Following empty state) with a retry button wired to SWR's mutate.
- Effort: S
- Depends on: none

### FE-DATA-009 — Debounced searches have a stale-response race (no abort or sequence guard)
- Location: frontend/src/app/search/page.tsx:137-156 (primary); same pattern at frontend/src/app/create/page.tsx:166-184 (duplicate check) and frontend/src/app/chat/page.tsx:47-58 (new-chat user search)
- Severity: Medium / Confidence: High / Category: bug
- Description: The 300ms debounce prevents scheduling overlapping requests but does nothing about in-flight ones. Sequence: the timer fires and a fetch for query A starts; the user types more; a new timer fires and a fetch for query B starts; if A's response arrives after B's (slow backend, and /api/search is a full-corpus Python scan per BE-003, so slow responses are realistic), setResults applies A's stale results over B's, and A's finally also clears the loading flag while B is still in flight. There is no AbortController, no sequence token, and no comparison of the response's query against the current one.
- Impact: Visibly wrong search results for the query on screen, intermittently, exactly when the backend is under load. The same race exists in the create-page duplicate check, where a stale result can mislead the duplicate decision.
- Fix approach: Keep a request sequence counter (or AbortController) in a ref; apply a response only if it is still the latest. One small shared helper could serve all three sites.
- Effort: S
- Depends on: none

### FE-DATA-010 — Search page has no error state: a failed search renders a blank results area
- Location: frontend/src/app/search/page.tsx:138-156 (try/finally with no catch), 284-306 and 319-325 (results===null with hasQuery renders null)
- Severity: Medium / Confidence: High / Category: bug
- Description: The search effect has try/finally but no catch: a network failure rejects inside the setTimeout callback (an unhandled promise rejection), loading is cleared by the finally, and results/userResults stay null. With a query present, the render falls through every branch (loading, idle, empty, non-null results) to `null`: an entirely blank results area under the search box, with no message.
- Impact: Search failure looks like the app silently ignoring the user. Combined with FE-DATA-009 the failure modes of this page are all silent.
- Fix approach: Add a catch that sets an error flag; render the existing "No results" slab pattern with an error message and keep the previous results visible where sensible.
- Effort: S
- Depends on: none

### FE-DATA-011 — Detail page duplicates the like count fetch and eagerly loads comments; the server liked flag is never consumed
- Location: frontend/src/app/post/[id]/page.tsx:128-163 (three parallel fetches on mount: post, comments, likes), 137-139 (like count also taken from the post payload), 149-162 (likes response, only d.count read)
- Severity: Medium / Confidence: High / Category: duplication
- Description: The three fetches run in parallel (good, no waterfall), but two of them overlap: GET /api/posts/{id} already returns like_count and comment_count, and GET /api/posts/{id}/likes returns {count, liked}. Both handlers write likesCount (lines 137-139 and 152-160), so the same number is fetched twice on one screen and last-writer-wins between two racing sources. The `liked` flag in the likes response is never read here or anywhere else in the web app (liked state is localStorage-derived, line 108), so the endpoint's only consumed field duplicates the post payload. Separately, the full comment list is fetched eagerly on mount although comments sit below the entire post body and many readers never reach them.
- Impact: One redundant request per post open (multiplied by every open), a benign but real race between two count sources, and comment payloads paid for views that never scroll down.
- Fix approach: Drop the /likes call on the detail page and reconcile from post.like_count with the existing localStorage formula; lazy-load comments when the reader approaches them (an IntersectionObserver on the comments heading) or on first interaction with the comment bar.
- Effort: S
- Depends on: none

### FE-DATA-012 — my-posts consumes only row-level fields but receives full sections (confirms BE-020)
- Location: frontend/src/app/my-posts/page.tsx:23-29 (fetch), 81-127 (render reads format, feed_card, title, status, created_at, is_user_content only)
- Severity: Medium / Confidence: High / Category: bloat
- Description: BE-020 flagged that GET /api/posts/mine serializes full PostOut (complete sections) and asked the frontend pass to confirm nothing reads them. Confirmed: the page renders slab rows from row-level fields and the feed_card (BookCover, author line); `post.sections` is never touched. The response is unbounded (no pagination) and grows with everything the user ever wrote.
- Impact: The largest response the API can produce is spent on a list of title rows. For a prolific author this page becomes the slowest screen in the app.
- Fix approach: Backend: switch the endpoint to PostListOut (BE-020, now confirmed safe). Frontend needs no change; optionally move the fetch to SWR for cached revisits.
- Effort: S
- Depends on: BE-020

### FE-DATA-013 — Stats Friends tab fans out 2 requests per friend (up to ~27 total)
- Location: frontend/src/app/stats/page.tsx:2202-2210 (own following + elo + profile in parallel), 2229-2247 (per friend, capped at 12: elo + profile in parallel)
- Severity: Medium / Confidence: High / Category: perf
- Description: Opening the Friends tab triggers: 3 requests for the viewer, then for each of up to 12 friends a parallel pair of GET /elo and GET /profile, so up to 27 requests per visit. Each /profile costs the backend a multi-subselect plus a follow-status query (BE-028), and each authed request pays the per-request user lookup (BE-049). Mitigations already present: the tab is lazy (fan-out only on first visit, useSwipeTabs activatedIndices, page comment at 2823-2825), the friend count is capped at 12, per-friend failures are caught, and there is a cancellation flag. The cap also silently truncates: a user following more than 12 people gets an arbitrary first-12 comparison with no indication.
- Impact: A burst of ~27 requests against a remote-DB backend on one tab open, repeated per session; plus silent truncation of the comparison set.
- Fix approach: A backend batch endpoint (one request returning elo+profile rows for a list of usernames) is the real fix; frontend-side, cache the result in SWR so revisits within a session do not refire, and surface the 12-friend cap in the UI.
- Effort: M
- Depends on: backend endpoint (new)

### FE-DATA-014 — Auth-gated fetches wait for the /me round trip instead of token presence
- Location: frontend/src/app/lib/auth.tsx:47-63 (session restore fetch, sets loading until /me resolves); gates at frontend/src/app/page.tsx:60 (following feed), frontend/src/app/chat/page.tsx:190 (conversation list), frontend/src/app/stats/page.tsx:2836 (stats/me), frontend/src/app/my-posts/page.tsx:24
- Severity: Medium / Confidence: Medium / Category: perf
- Description: On every full page load, AuthProvider fetches /api/auth/me to restore the session, and every auth-gated SWR key stays null until that resolves (`!authLoading && user`). The gated requests themselves need only the Bearer token, which is already in localStorage; they do not need the /me response. So the Following tab, chat list, personal stats and my-posts all pay a serial waterfall: bundle, then /me, then their own fetch. The /me gate is what makes the UI reliable about logged-out states, and firing gated fetches with an invalid token would produce 401s, so the current shape is defensible; Confidence Medium is about whether the change is worth the edge cases, not about the mechanics.
- Impact: One extra sequential round trip (tens to low hundreds of ms against the remote backend) before any personalized surface starts loading, on every hard navigation.
- Fix approach: Gate data fetches on token presence (localStorage read, synchronous) rather than /me completion, keeping /me for the user object and logout-on-invalid; on a 401 from a gated fetch, clear the token. Apply to the two or three hottest gates first (following feed, chat list).
- Effort: S
- Depends on: none

### FE-DATA-015 — Detail page re-implements useComments; ARCHITECTURE.md claims the hook is shared
- Location: frontend/src/app/post/[id]/page.tsx:104-107, 142-148, 230-259 (own comments state, fetch, delete, post); frontend/src/app/lib/useComments.ts (the hook); ARCHITECTURE.md frontend section (useComments "shared by CommentsBottomSheet and the post detail page")
- Severity: Low / Confidence: High / Category: duplication
- Description: The detail page duplicates the hook's fetch/post/delete logic inline (with small divergences: it scrolls to the comments heading after posting and syncs the feed cache itself), while the sheet uses the hook. The architecture doc says both use the hook, so the doc has drifted from the code. Behavior differences can now creep in silently, e.g. the hook's loadedRef guard exists in both copies today but only by parallel maintenance.
- Impact: Drift surface between the two comment UIs; a fix to one path (like FE-DATA-019's loading state) must be made twice.
- Fix approach: Fold the detail page onto useComments (the hook already accepts onCountChange; the scroll-into-view can stay at the call site), then correct or keep the ARCHITECTURE.md line accordingly.
- Effort: S
- Depends on: none

### FE-DATA-016 — Post.connections is typed but never read anywhere in the web frontend (confirms BE-042)
- Location: frontend/src/types/post.ts:486 (the only occurrence of the field in frontend/src); read_next consumption at frontend/src/app/post/[id]/page.tsx:717-728
- Severity: Low / Confidence: High / Category: bloat
- Description: BE-042 asked this pass to confirm whether any frontend reader of the raw `connections` array exists. A full-source search finds exactly one reference: the type declaration. The detail page consumes only the server-resolved read_next, as designed. The raw authoring-layer array therefore ships on every post in every response for no consumer.
- Impact: Payload bloat on every post response; also exposes the authoring layer to clients needlessly.
- Fix approach: Backend: drop or empty `connections` in PostOut responses (BE-042, now confirmed safe for the web client; the mobile app should be checked by its own pass before the backend change lands). Frontend: remove the field from the Post type at the same time.
- Effort: S
- Depends on: BE-042, mobile confirmation

### FE-DATA-017 — Onboarding interests fetch has no error handling: failure leaves placeholders forever
- Location: frontend/src/app/onboarding/InterestPicker.tsx:120-131 (fetch with .then chain, no .catch; setLoading(false) only on success)
- Severity: Low / Confidence: High / Category: bug
- Description: The very first screen a new user sees fetches /api/interests with a raw fetch and no catch. On network failure or non-JSON response, the promise rejects unhandled, loading never becomes false, and the user stares at pulsing pill placeholders with no message and no retry. This is also the one fetch in the app standing entirely outside both apiFetch and SWR (see FE-DATA-018).
- Impact: A backend blip during onboarding permanently strands a first-run user (until manual reload). Bad first impression exactly at acquisition time.
- Fix approach: Switch to useSWR("/api/interests") (shares the cache the create page already populates) or add a catch with an error slab and retry.
- Effort: S
- Depends on: none

### FE-DATA-018 — The same resources are fetched through mixed layers (raw fetch vs SWR), so caches never share
- Location: /api/interests: frontend/src/app/onboarding/InterestPicker.tsx:125 (raw fetch) vs frontend/src/app/create/page.tsx:153 (useSWR). /api/users/{me}/profile and /elo: frontend/src/app/profile/page.tsx:88-117 (raw apiFetch) vs frontend/src/app/profile/[username]/page.tsx:97-100 (useSWR, same URLs when viewing yourself); also frontend/src/app/components/Marathon.tsx:206-224 (raw apiFetch of /elo). Followers/following sheet fetch plus its markup duplicated between profile/page.tsx:119-127, 632-671 and profile/[username]/page.tsx:103-110, 338-381.
- Severity: Low / Confidence: High / Category: duplication
- Description: Identical GET resources are fetched through two different mechanisms depending on the page. Navigating between the account page and your public profile refetches profile and elo although SWR holds fresh copies keyed by the exact same URLs; the Train tab refetches /elo the profile pages just cached. The followers/following bottom sheet exists twice as copy-paste, including its state handling.
- Impact: Redundant round trips on common navigation paths, and two drift surfaces (the sheet markup, the count-refresh behavior) that must be maintained twice.
- Fix approach: Standardize reads on useSWR with the URL as key (writes can stay apiFetch); extract one FollowListSheet component used by both profile pages.
- Effort: S
- Depends on: none

### FE-DATA-019 — Comments UI shows "No comments yet" during loading and after a failed fetch
- Location: frontend/src/app/lib/useComments.ts:15-23 (initial [] state, catch swallows errors); frontend/src/app/components/CommentsBottomSheet.tsx:100-103 (count line) and 119-121 ("No comments yet" whenever comments.length===0); frontend/src/app/components/CommentsSection.tsx:31-32 (same on the detail page); frontend/src/app/post/[id]/page.tsx:142-148 (same swallow on the detail copy)
- Severity: Low / Confidence: High / Category: bug
- Description: Comments state starts as an empty array and there is no loading or error flag, so between sheet-open and response (and permanently, on a failed fetch) the UI asserts "0 comments / No comments yet". On a post whose card just showed a nonzero comment count, the sheet visibly contradicts the card for a moment, then snaps to the real list.
- Impact: A flash of wrong data on every sheet open with nonempty comments (jank the checklist explicitly asks about), and a silent lie on fetch failure.
- Fix approach: Track comments as `Comment[] | null` (null = loading) plus an error flag, mirroring the patterns already used elsewhere (e.g. chat list); render pulsing rows while null.
- Effort: S
- Depends on: FE-DATA-015 (fix once in the shared hook)

### FE-DATA-020 — Changing the search format filter refires the identical user search
- Location: frontend/src/app/search/page.tsx:144-147 (both requests inside one effect), 156 (dependency array [query, formatFilter])
- Severity: Low / Confidence: High / Category: perf
- Description: The posts search and the user search run in one debounced effect keyed on both query and formatFilter. The format filter is only a parameter of the posts request (line 143); the user search request is byte-identical across filter changes, yet every chip tap refetches it (and /api/search/users is a full-table scan per BE-030).
- Impact: One wasted request per filter chip tap; minor, but free to fix.
- Fix approach: Split into two effects (users keyed on query only), or cache the user results per query.
- Effort: S
- Depends on: none

### FE-DATA-021 — Plain anchor navigations (Read Next, own-profile sheet) reload the app and drop the SWR cache
- Location: frontend/src/components/sections/RelatedPostsSection.tsx:31 (`<a href={/post/...}>`); frontend/src/app/profile/page.tsx:653-666 (sheet rows as `<a href>`; the public-profile copy of the same sheet uses Link at profile/[username]/page.tsx:363-376)
- Severity: Low / Confidence: High / Category: perf
- Description: Two navigation sites use raw anchors instead of next/link. A raw anchor performs a full document navigation: the entire JS bundle re-executes, AuthProvider refetches /api/auth/me, and the whole in-memory SWR cache (feed lists, profile, stats, conversations) is discarded, so the next visit to any cached surface refetches from scratch. Every other equivalent site in the app uses Link or router.push.
- Impact: Tapping Read Next, the flagship graph feature, is the slowest navigation in the app and silently resets all session caching. The data cost is why this belongs to this pass rather than Pass 2.
- Fix approach: Replace both with next/link (the detail page already supports client-side entry; the slide-up animation runs on mount either way).
- Effort: S
- Depends on: none

### FE-DATA-022 — Create-page duplicate check fetches up to 50 full list posts and uses 5
- Location: frontend/src/app/create/page.tsx:172-181 (fetch /api/search, then `data.slice(0, 5)`)
- Severity: Low / Confidence: High / Category: bloat
- Description: The step-2 duplicate check reuses /api/search, which returns up to 50 PostListOut objects (each with full feed_card, counts, author fields), then keeps five. The backend offers no limit parameter, so the over-fetch is forced from this side; recorded because the checklist asks for pulls beyond what the view needs. Note the endpoint also computes reading_minutes for all 50 server-side (BE-008).
- Impact: Roughly 10x the needed payload per keystroke-debounced check; small absolute cost.
- Fix approach: A `limit` query parameter on /api/search (trivial backend addition), then pass limit=5 here.
- Effort: S
- Depends on: backend limit param (small, related to BE-007)

### FE-DATA-023 — Optimistic follow update on the public profile writes the response without an ok-check
- Location: frontend/src/app/profile/[username]/page.tsx:149-151 (POST follow: `data.status` used with no `r.ok` check, no try/catch around the awaits beyond the finally); contrast frontend/src/app/search/page.tsx:64-68 (same action, checks r.ok)
- Severity: Low / Confidence: High / Category: bug
- Description: When the follow POST fails (400 self/duplicate, 401, 429 from the 60/hr limit), the response body is an error object, `data.status` is undefined, and the SWR cache is mutated to `follow_status: undefined` with revalidate false, so the wrong state persists for the session. A thrown network error escapes the handler as an unhandled rejection (the finally only clears the busy flag). The DELETE branch similarly assumes success. The search-page UserRow does this correctly, so the two follow buttons behave differently on failure.
- Impact: After a failed follow (most likely via the rate limit), the button can show a state the server does not have until a hard refresh.
- Fix approach: Check r.ok before mutating, revalidate the profile key on failure, and share one follow-toggle helper with the search row (the mobile app already extracted lib/follow.ts for exactly this).
- Effort: S
- Depends on: none

### FE-DATA-024 — Detail-page fetch effects have no cancellation; stale responses can be applied
- Location: frontend/src/app/post/[id]/page.tsx:128-163 (three fetches keyed on [id], no AbortController or staleness check); initial state from the first id at lines 108-111 (useState initializers)
- Severity: Low / Confidence: Low / Category: bug
- Description: If the component re-renders with a new id without unmounting, the effect refires but the previous responses are not cancelled: a slow response for post A can call setPost after post B's fetch started, and the useState lazy initializers for liked/likesCount never re-run for the new id. Confidence Low because today no navigation path moves post-to-post client-side (Read Next is a full reload per FE-DATA-021, and back-navigation unmounts), so the race is currently unreachable; fixing FE-DATA-021 makes it reachable.
- Impact: None today; a wrong-post flash or wrong like state once post-to-post client navigation exists.
- Fix approach: When fixing FE-DATA-021, add an ignore-stale guard (or AbortController) to these effects and key the like state off post?.id instead of initializers.
- Effort: S
- Depends on: FE-DATA-021

### FE-DATA-025 — Feed caches never revalidate in-session (deliberate), so counts and new posts go stale
- Location: frontend/src/app/page.tsx:67 (revalidateIfStale: false), frontend/src/app/components/Providers.tsx:15 (focus/reconnect revalidation off), frontend/src/app/lib/swr.ts:30-52 (manual write-through and invalidation as the compensation)
- Severity: Low / Confidence: Medium / Category: architecture
- Description: Feed tabs are cache-first for the whole session with no background refetch, an explicit decision because the backend jitters feed order per request and a silent reshuffle is worse than staleness (comments at page.tsx:53-56 and swr.ts:30-33). The compensations are hand-rolled: comment counts write through (updatePostInFeedCaches), own post creation invalidates. Everything else drifts for the session: like counts from other users, new posts by others, edited profiles on cards. Recorded as a finding because the trade-off is real and currently undocumented outside code comments; Confidence Medium on whether any of the drift matters at launch scale.
- Impact: A long session shows an increasingly stale feed; the localStorage like-count reconciliation (FE-DATA-002) exists partly to patch this.
- Fix approach: Keep the decision, but make it revisit-able: once the backend has a stable feed ordering (seeded jitter, prerequisite named in BE-001), revalidateIfStale can be turned back on and the per-card reconciliation fetch dropped. Note the coupling in whichever fix batch touches BE-001.
- Effort: S
- Depends on: BE-001 (stable ordering)

## Coverage notes

- **Reviewed:** every fetch call site in the web frontend (confirmed by a full-source search for apiFetch/useSWR/raw fetch, all 60+ hits accounted for above or read in context), all app pages, the SWR/auth/event plumbing, the localStorage like/save layers, the websocket hooks' fetch-adjacent behavior (chatSocket read in full; battleSocket only via its consumer Battle.tsx), the data-consuming parts of PostCard, the comments components, QuizSection, RelatedPostsSection, Avatar, trainApi, and the Post types against the backend contract.
- **Checklist items with no finding:** reading_minutes shows no contract drift (typed required at types/post.ts:501, consumed at PostCard.tsx:124 and post/[id]/page.tsx:89, and the contract confirms the server attaches it on every post-returning endpoint). Stripped sections cause no runtime errors: post.sections is only read on the detail page (post/[id]/page.tsx:76, 682-687), where sections are populated; no list consumer touches it. The three detail-page fetches run in parallel, and search's two requests run in parallel, so no significant request waterfalls exist beyond the auth gate (FE-DATA-014).
- **Not reviewed / out of scope:** rendering and bundle concerns (recharts, virtualization, image loading strategy: Pass 2), the read-aloud subsystem (no API fetches; Piper model download noted but out of scope), section components other than the ones named (render-only), the mobile app, backend internals beyond the contract document, battleSocket.ts internals, CommentRow.tsx, FeedHeader.tsx, SegmentedTabs.tsx, useSwipeTabs.ts (no fetching).
- **Low-confidence:** FE-DATA-024 (race currently unreachable); FE-DATA-014's cost/benefit (mechanics verified, the right trade-off is a product call); the exact visual result of the empty formats data in every Friends-tab chart (FE-DATA-005: the data path is verified against the contract, but I did not execute the charts).
