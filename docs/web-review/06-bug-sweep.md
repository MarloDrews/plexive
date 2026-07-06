# Web Review: Bug Sweep
Date: 2026-07-06 | Model: Fable 5 | Scope: backend/app (all routers and request-path helpers) and frontend/src (all web pages, components, sections, and libs); mobile/, tools/, backend seed/scripts/tests, and post content JSON are out of scope

This pass covers functional bugs, error handling, and resilience. Pure performance findings live in the earlier passes; pure security belongs to Pass 7. Where a bug was already recorded by the backend pass (03-backend-endpoints.md), it is cross-referenced as BE-xxx instead of re-derived; this report only re-states an overlap when this pass adds a new functional angle.

Method: nine parallel read agents swept backend and frontend (the ninth was a dedicated full pass of stats/page.tsx); every finding kept below was then re-verified by the coordinating session, which re-opened the cited lines and confirmed the code says what the finding claims. Findings that did not survive verification were dropped (see Coverage notes).

## Files reviewed

Backend (each read in full, findings re-verified against cited lines):
- backend/app: main.py, database.py, models.py, schemas.py, auth.py, rate_limit.py, elo.py, scoring.py, post_counts.py, reading_time.py, sanitize.py, upload_config.py, graph_identity.py, graph_edges.py
- backend/app/routers: feed.py, posts.py, search.py, events.py, comments.py, quiz.py, interests.py, auth.py, follows.py, admin.py, train.py, stats.py, uploads.py, chat.py, battle.py

Frontend (each read in full unless noted):
- src/app pages: page.tsx, post/[id]/page.tsx, saved-posts/page.tsx, my-posts/page.tsx, search/page.tsx, create/page.tsx, profile/page.tsx, profile/[username]/page.tsx, chat/page.tsx, chat/[id]/page.tsx, login/page.tsx, register/page.tsx, onboarding/page.tsx + InterestPicker.tsx; stats/page.tsx (full pass, including its inline chart, heatmap, gauge, and treemap components and all three tabs)
- src/app/components: PostCard, FeedHeader, SegmentedTabs, BottomNav, Providers, Toast, CommentsBottomSheet, CommentsSection, CommentRow, Marathon, Battle, NumberSlider, stage, icons
- src/app/lib: api.ts, auth.tsx, swr.ts, eventQueue.ts, likedPosts.ts, savedPosts.ts, useComments.ts, useSwipeTabs.ts, chatSocket.ts, battleSocket.ts, relativeTime.ts
- src/components: SectionRenderer, SvgBlock, MathText, Prose, BookCover, GeneratedBookCover, DotScale, VerifiedBadge, PostRow, SectionLabel, Avatar, and all section components under src/components/sections/ (the ~30 label+prose sections via structural scan, the complex ones in full)
- src/lib: prose.ts, italics.ts, formats.ts, bookCover.ts, glyphs.ts (lookup logic), readAloud/ (useReadAloud, extractText, voice, piper, highlights, autostart), train/ (mockQuestions, elo, trainApi), battle/seededQuestions.ts
- src/types: post.ts, train.ts

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|----|-------|----------|------------|----------|--------|
| BUG-001 | No React error boundaries: any render throw white-screens the app | High | High | bug (resilience) | S |
| BUG-002 | MathText crashes on missing text (reached from ~70 sections) | High | High | bug (crash) | S |
| BUG-003 | Unguarded optional-content access across section components | High | Medium | bug (crash) | M |
| BUG-004 | AtAGlance shape sniffing falls through to a crashing books branch | High | High | bug (crash) | S |
| BUG-005 | Missing response.ok checks poison state: render crashes and blank pages | High | High | bug (error-handling) | M |
| BUG-006 | FastAPI 422 array details crash or garble error rendering | High | High | bug (contract) | S |
| BUG-007 | Onboarding dead-ends when /api/interests fails | High | High | bug (error-handling) | S |
| BUG-008 | One legacy tags/connections row 500s every list endpoint | High | Medium | bug (contract) | S |
| BUG-009 | Private accounts' posts are fully public | High | Medium | bug (logic) | M |
| BUG-010 | Battle: mutual challenge produces two battles with divergent seeds | High | High | bug (race) | M |
| BUG-011 | Battle: players strand in dead states with invisible errors | High | High | bug (state) | M |
| BUG-012 | Per-IP rate limits share one bucket behind a reverse proxy | Medium | Medium | bug (logic) | S |
| BUG-013 | Avatar upload 500s when Supabase storage is unconfigured | Medium | High | bug (error-handling) | S |
| BUG-014 | Storage API failures escape both upload endpoints as bare 500s | Medium | High | bug (error-handling) | S |
| BUG-015 | validate_image: decode-stage Pillow errors escape as 500 | Medium | High | bug (error-handling) | S |
| BUG-016 | validate_image flattens transparency onto black | Medium | High | bug (logic) | S |
| BUG-017 | validate_image drops EXIF orientation: phone photos display rotated | Medium | High | bug (logic) | S |
| BUG-018 | Malformed SUPABASE_URL crashes the whole app at import | Medium | Medium | bug (resilience) | S |
| BUG-019 | Pending follow requests from soft-deleted users become permanent zombies | Medium | High | bug (state) | S |
| BUG-020 | Going public leaves pending follow requests stuck | Medium | High | bug (state) | S |
| BUG-021 | Account deletion permanently locks the email and username | Medium | High | bug (state) | M |
| BUG-022 | Soft-deleted users remain in lists, counts, and leaderboards as dead links | Medium | High | bug (logic) | M |
| BUG-023 | 10 MB body cap bypassed by chunked Transfer-Encoding | Medium | Medium | bug (resilience) | S |
| BUG-024 | Malformed JSON shapes crash quiz, search, and post serialization | Medium | Medium | bug (crash) | S |
| BUG-025 | Non-string title crashes identity-key derivation on create and read | Medium | High | bug (crash) | S |
| BUG-026 | Quiz item without answer_index is unanswerable yet still costs Elo | Medium | Medium | bug (logic) | S |
| BUG-027 | Anonymous quiz flow leaks answers before the rate limit: Elo gameable | Medium | High | bug (logic) | S |
| BUG-028 | knowledge_rating read-modify-write race loses deltas | Medium | Medium | bug (race) | S |
| BUG-029 | Authenticated like double-submit race stores duplicates | Medium | Medium | bug (race) | S |
| BUG-030 | duration_ms unbounded: batch 500s and poisoned feed scoring | Medium | High | bug (validation) | S |
| BUG-031 | Unlimited anonymous view events bury posts for every user | Medium | High | bug (logic) | S |
| BUG-032 | Feed scoring penalty is global: 6 views by anyone zero a post for all | Medium | High | bug (logic) | M |
| BUG-033 | GET /posts/{id} hides only status "pending", siblings hide all non-published | Medium | High | bug (logic) | S |
| BUG-034 | WS: a DB exception mid-frame kills the connection instead of an error frame | Medium | High | bug (error-handling) | S |
| BUG-035 | Chat: message committed but broadcast can be lost, no correlation id | Medium | Medium | bug (resilience) | M |
| BUG-036 | Concurrent DM creation forks a pair into two conversations | Medium | High | bug (race) | M |
| BUG-037 | WS sessions never recheck is_active or token expiry | Medium | High | bug (logic) | S |
| BUG-038 | Battle: challenger's own busy state unchecked, old opponent orphaned | Medium | High | bug (state) | S |
| BUG-039 | Battle: socket takeover leaves a ghost room the new socket knows nothing about | Medium | High | bug (state) | M |
| BUG-040 | Battle: TOCTOU between online check and pair creates dead pairings | Medium | Medium | bug (race) | S |
| BUG-041 | Battle rooms persist after a finished duel: players read as busy forever | Medium | High | bug (state) | S |
| BUG-042 | Hidden Battle tab silently accepts challenges | Medium | High | bug (state) | M |
| BUG-043 | opponent_left discards a battle that was already decided | Medium | High | bug (logic) | S |
| BUG-044 | Numeric answers use strict float equality against snapped slider values | Medium | Medium | bug (logic) | S |
| BUG-045 | eventQueue timer permanently dead after firing on an empty queue | Medium | High | bug (logic) | S |
| BUG-046 | Failed event flush drops the batch while the like is marked sent forever | Medium | High | bug (data-integrity) | M |
| BUG-047 | No unlike event exists: retracted likes stay on the server | Medium | High | bug (data-integrity) | M |
| BUG-048 | Transient network error during session restore deletes the auth token | Medium | High | bug (error-handling) | S |
| BUG-049 | No 401 handling anywhere; expired tokens silently degrade to anonymous | Medium | High | bug (error-handling) | M |
| BUG-050 | Socket hooks: stale-token infinite reconnect, no backoff, logout keeps socket | Medium | High | bug (resilience) | M |
| BUG-051 | Chat view drops WS messages that arrive while history is loading | Medium | High | bug (race) | S |
| BUG-052 | Chat history is capped at the newest 50 messages (no pagination UI) | Medium | High | bug (contract) | M |
| BUG-053 | Rejected chat send loses the typed message | Medium | High | bug (error-handling) | S |
| BUG-054 | Chat view error handling: NaN id, missing catch, everything reads "not found" | Medium | High | bug (error-handling) | S |
| BUG-055 | Fetch failures render as empty states or infinite skeletons across pages | Medium | High | bug (error-handling) | M |
| BUG-056 | Debounced searches have no stale-response guard and no error handling | Medium | High | bug (race) | S |
| BUG-057 | Comment submit failures are silent and destroy the draft | Medium | High | bug (error-handling) | S |
| BUG-058 | Unguarded localStorage/sessionStorage access can crash the app | Medium | High | bug (resilience) | S |
| BUG-059 | Logout leaves per-account localStorage: next account inherits state | Medium | High | bug (data-integrity) | S |
| BUG-060 | Public-profile follow writes optimistic cache without checking the response | Medium | High | bug (error-handling) | S |
| BUG-061 | Own-profile settings actions fail silently with stale counts | Medium | High | bug (error-handling) | S |
| BUG-062 | useSwipeTabs commits NaN as the active index at zero width | Medium | Medium | bug (logic) | S |
| BUG-063 | Read-aloud one-shot audio unlock latched by the non-gesture autostart | Medium | Medium | bug (logic) | S |
| BUG-064 | Read-aloud highlights over re-rendered DOM throw and end playback | Medium | Medium | bug (crash) | S |
| BUG-065 | KaTeX failure fallbacks inject raw content via dangerouslySetInnerHTML | Medium | High | bug (logic) | S |
| BUG-066 | Detail close() calls router.back(): dead end on direct links | Medium | Medium | bug (logic) | S |
| BUG-067 | Swipe-right-to-close fires while dragging horizontal scrollers | Medium | High | bug (logic) | S |
| BUG-068 | View dwell event lost when a card unmounts while visible | Medium | High | bug (data-integrity) | S |
| BUG-069 | Like counts can render -1 or NaN | Low | Medium | bug (logic) | S |
| BUG-070 | Rate limiter sweep can delete a bucket mid-update | Low | High | bug (race) | S |
| BUG-071 | Middleware/CORS edge cases: unreadable 413, empty allow-list, trailing slash | Low | Medium | bug (error-handling) | S |
| BUG-072 | Missing Authorization header returns 403, invalid token returns 401 | Low | High | bug (contract) | S |
| BUG-073 | Email uniqueness and login are case-sensitive on the local part | Low | High | bug (logic) | S |
| BUG-074 | Admin verify downgrades levels, ignores is_active, and is transitive | Low | Medium | bug (logic) | S |
| BUG-075 | Login 500s on a malformed stored password hash | Low | Low | bug (error-handling) | S |
| BUG-076 | Nullable created_at columns can crash stats and follow-requests | Low | Low | bug (crash) | S |
| BUG-077 | database.py resilience gaps: raw KeyError, boot crash, stale connections | Low | Medium | bug (resilience) | S |
| BUG-078 | Reported Elo delta ignores the rating floor clamp | Low | High | bug (logic) | S |
| BUG-079 | _coerce_year raises on "--480", NaN, and infinity instead of returning None | Low | High | bug (crash) | S |
| BUG-080 | interests="," silently disables interest ordering | Low | High | bug (logic) | S |
| BUG-081 | create_post burns a daily rate-limit slot on failed validation | Low | High | bug (logic) | S |
| BUG-082 | AtAGlanceBooks validator is dead code: required section unvalidated | Low | High | bug (validation) | S |
| BUG-083 | Duplicate section types allowed: second quiz section unanswerable | Low | High | bug (validation) | S |
| BUG-084 | Chat: cross-sender display order can invert versus stored order | Low | Medium | bug (race) | S |
| BUG-085 | One stalled participant socket delays delivery to everyone after it | Low | Medium | bug (resilience) | S |
| BUG-086 | WS frame robustness: binary frames, char-counted cap, bool scores | Low | Medium | bug (error-handling) | S |
| BUG-087 | opponent_left delivery is fire-and-forget and can arrive stale | Low | Medium | bug (resilience) | S |
| BUG-088 | Group create silently degrades to a DM when recipients collapse | Low | High | bug (logic) | S |
| BUG-089 | Missing NEXT_PUBLIC_API_URL fails confusingly everywhere | Low | High | bug (resilience) | S |
| BUG-090 | login/register parse JSON before checking ok: SyntaxError shown to users | Low | High | bug (error-handling) | S |
| BUG-091 | clearApiCache clears mounted keys without revalidating | Low | Low | bug (logic) | S |
| BUG-092 | relativeTime renders "Invalid Date" and throws on null | Low | High | bug (crash) | S |
| BUG-093 | send() reports success before the socket is authenticated | Low | Medium | bug (race) | S |
| BUG-094 | consumeAutoRead destroys a pending request on post-id mismatch | Low | Medium | bug (logic) | S |
| BUG-095 | Text-processing edges: spaced asterisks italicized, double backslash collapsed | Low | High | bug (logic) | S |
| BUG-096 | Read-aloud minor defects: blob leak, abbreviation splits, dropped spaces | Low | High | bug (logic) | S |
| BUG-097 | useSwipeTabs minor: mid-drag settle, unclamped index, resize snap-back | Low | Medium | bug (logic) | S |
| BUG-098 | PostCard timer hygiene: overlapping toasts, nav timer fires after unmount | Low | High | bug (logic) | S |
| BUG-099 | Broken-image fallbacks missing on Avatar and three section images | Low | High | bug (resilience) | S |
| BUG-100 | PostCard renders raw feed_card values as React children | Low | Low | bug (crash) | S |
| BUG-101 | Absent reading_minutes renders the literal "undefined min" | Low | Low | bug (logic) | S |
| BUG-102 | SectionRenderer: NaN sort on missing order, null entries crash | Low | Medium | bug (crash) | S |
| BUG-103 | Quiz UI: dead taps while state loads, summary can overcount | Low | High | bug (logic) | S |
| BUG-104 | BookCover image-failure flag never resets for a new book | Low | Low | bug (state) | S |
| BUG-105 | Every card fires GET /likes on mount: N parallel requests per feed load | Low | High | bug (resilience) | S |
| BUG-106 | Search follow toggle swallows failures with no feedback | Low | High | bug (error-handling) | S |
| BUG-107 | Route username compared without decoding (legacy charsets) | Low | Low | bug (logic) | S |
| BUG-108 | BottomNav routes a restoring session to /login | Low | High | bug (logic) | S |
| BUG-109 | Chat view minor: forced scroll on new messages, silent metadata fallback | Low | High | bug (logic) | S |
| BUG-110 | Create wizard minor: double-submit window, interest cap mismatch, stale state | Low | Medium | bug (logic) | S |
| BUG-111 | Detail page never resets or aborts on post-id change (latent) | Low | Medium | bug (race) | S |
| BUG-112 | eventQueue flush listeners on unreliable unload signals | Low | Low | bug (resilience) | S |
| BUG-113 | Marathon minor: blind retry can double-score, mismatched rating display | Low | Medium | bug (logic) | M |
| BUG-114 | Battle/slider minor: latent hangs, unguarded commits, two-tab livelock | Low | Medium | bug (logic) | M |
| BUG-115 | Friends tab: unchecked HTTP errors crash the whole stats page | High | High | bug (error-handling) | M |
| BUG-116 | Stats error boundary is whole-page: one bad chart removes all tabs | Medium | High | bug (resilience) | S |
| BUG-117 | Non-verified users render a stray "0" after their username | Medium | High | bug (logic) | S |
| BUG-118 | Ranking gauge headline shows the inverted rank | Low | Medium | bug (logic) | S |
| BUG-119 | Elo leaderboard default variants render blank instead of "No data" | Low | High | bug (logic) | S |
| BUG-120 | Treemaps emit NaN-sized rects on all-zero data | Low | Medium | bug (logic) | S |
| BUG-121 | CalendarHeatmap month window computed in client-local time | Low | Medium | bug (logic) | S |
| BUG-122 | Likes-over-time overlay uses one color for both series | Low | High | bug (logic) | S |
| BUG-123 | Friends comparison silently capped at first 12 followed users | Low | High | bug (logic) | S |
| BUG-124 | Stats tab staleness: saved count and verification level | Low | High | bug (state) | S |
| BUG-125 | Stats display hardening and dead code | Low | Low | bug (logic) | S |

## Findings

### BUG-001: No React error boundaries: any render throw white-screens the app
- Location: frontend/src/app (absence; verified by Glob: no error.tsx, global-error.tsx, not-found.tsx, or loading.tsx anywhere under frontend/src/app)
- Severity: High | Confidence: High | Category: bug (resilience)
- Description: Every page is a client component and the App Router has no error boundary files. Any uncaught throw during render or commit unmounts the entire React tree to a blank screen with no recovery UI. BUG-002 through BUG-005 and BUG-058 list concrete throw paths that are one bad row or one failed request away.
- Impact: A single malformed content field or unexpected API body takes down the whole app for that user, not just the affected section.
- Fix approach: Add a root app/error.tsx (plus global-error.tsx and not-found.tsx) with a reset button. This is the single highest-leverage resilience fix because it converts every crash finding below from "app gone" to "section degraded".
- Effort: S | Depends on: none

### BUG-002: MathText crashes on missing text (reached from ~70 sections)
- Location: frontend/src/components/MathText.tsx:27 (parseSegments loops over text.length) and :52 (no guard); representative callers: sections/CoreIdeasSection.tsx:21, PerspectivesSection.tsx:25, OriginSection.tsx:33, plus every label+prose section that renders MathText with content directly
- Severity: High | Confidence: High | Category: bug (crash)
- Description: parseSegments dereferences text.length with no null/undefined guard. Every free-text prose string in all seven formats routes through MathText, so a seed or legacy section whose prose field is absent (a core_ideas item without body, a string section with null content) throws TypeError during render.
- Impact: One missing optional field in one post unmounts the entire detail page (no error boundary, BUG-001). The blast radius of every content-pipeline slip is the whole app.
- Fix approach: Coerce text ?? "" at the top of MathText; one line covers all ~70 consumers.
- Effort: S | Depends on: none

### BUG-003: Unguarded optional-content access across section components
- Location: frontend/src/components/sections/FormalismSection.tsx:32 (content.equations.map) and :45 (content.notation_legend.length); VisualExplanationSection.tsx:19-23 (SvgBlock rendered unconditionally; crash lands in SvgBlock.tsx:30 repaletteSvg on undefined); TangibleSection.tsx:16 (content.items.map); QuizSection.tsx:201-232 (content.length/map on possibly non-array content); same unguarded pattern in YourTurnSection:22, PaperCardSection:16, LifeArcSection:28, FieldContextSection:18, DefiningMomentsSection:27, KeyFindingsSection:21, FiguresSection:19, ChaptersSection:16, RealWorldExamplesSection:27, HowItWorksSection:23, SourcesSection:28, VoicesSection:16, MisconceptionsSection:14, KeyNumbersSection:12, AnglesSection:18, CastSection:18, AuthorsContextSection:18, NearbyConceptsSection:20, StructureSection:12, CoreIdeasSection:18
- Severity: High | Confidence: Medium (crash mechanics certain; occurrence depends on seed/legacy rows, which Pydantic does not validate) | Category: bug (crash)
- Description: SectionRenderer passes section.content as any; array-shaped sections call .map or .length on it directly. Content that is null, object-wrapped, or missing the array throws during render. A handful of sections (StorySection key_figures, OpenQuestionsSection items, WhatScienceSaysSection key_findings, HowToApplySection checklist, FormalDefinitionSection notation_legend) already guard correctly, proving the intended pattern.
- Impact: Same page-killing blast radius as BUG-002 for any structurally odd section row.
- Fix approach: A shared asArray helper (or normalization in SectionRenderer) applied to every array section; align the unguarded sections with their guarded siblings.
- Effort: M | Depends on: none

### BUG-004: AtAGlance shape sniffing falls through to a crashing books branch
- Location: frontend/src/components/sections/AtAGlanceSection.tsx:165-173 (books fallback calls unescapeDollar(content.genre) etc.), also :90-96 (questions), :115-120 (stories), :139-159 (people, e.g. content.nationality, content.known_for); crash mechanism in frontend/src/lib/prose.ts:7 (text.replace on undefined throws)
- Severity: High | Confidence: High | Category: bug (crash)
- Description: The component detects the format by key sniffing ("study_type" in c, "born" in c, "still_debated" in c, "sources_reliability" in c). Any at_a_glance content matching no branch (a people record missing born, an unknown or partial shape) falls into the books fallback, which calls unescapeDollar on keys that do not exist. The same crash occurs inside a matched branch when a "required" key is absent. Note the backend never validates this section's shape (BUG-082), so nothing upstream prevents it.
- Impact: Detail page unmounts for any post whose at_a_glance is missing one expected key.
- Fix approach: Make unescapeDollar accept string | undefined returning "", and skip rows whose value is missing instead of rendering them.
- Effort: S | Depends on: BUG-082 (closing the validation gap prevents new bad rows)

### BUG-005: Missing response.ok checks poison state: render crashes and blank pages
- Location: frontend/src/app/search/page.tsx:148-149 (setResults from res.json() with no ok check; results.map crashes at ~284-306); my-posts/page.tsx:25-28 (posts becomes an error object; all render gates false, page silently blank); post/[id]/page.tsx:142-148 (comments becomes {detail}; CommentsSection.tsx:34 comments.map throws; the bad length is also written into feed caches via lines 123-126); app/lib/useComments.ts:16-21 (same, crashes the comments sheet and fires onCountChange(undefined)); profile/page.tsx:88-94 (pendingRequests becomes an object; .map throws when the panel opens)
- Severity: High | Confidence: High | Category: bug (error-handling)
- Description: These fetches call r.json() and store the result without checking r.ok or validating the shape. FastAPI error bodies are JSON ({"detail": ...}), so they parse successfully and land in state typed as an array. Depending on the render gate, the page then crashes on .map (search, comments, follow requests) or renders permanently blank (my-posts).
- Impact: Any 401 (expired token), 429, or 500 on these endpoints turns into a client crash or a silent dead page rather than an error message.
- Fix approach: Check r.ok and Array.isArray before setState at every site (throw into the existing catch where one exists); a small fetchJson helper would make the pattern uniform.
- Effort: M | Depends on: none (BUG-001 reduces the crash blast radius)

### BUG-006: FastAPI 422 array details crash or garble error rendering
- Location: frontend/src/app/create/page.tsx:479 and :519 (setServerError(data.detail ?? ...)) rendered as a React child at :880 and :1182; create/page.tsx:218 (cover upload: new Error(data.detail)); profile/page.tsx:172, :232, :250 and siblings (new Error(data.detail) renders "[object Object]")
- Severity: High | Confidence: High | Category: bug (contract)
- Description: FastAPI returns 422 validation details as an array of objects (confirmed contract, 03-backend-endpoints.md). The create page stores that array in serverError and renders {serverError} directly: React throws "Objects are not valid as a React child" and the page unmounts after the user filled a long form. The profile and upload paths stringify the array into an unreadable message. auth.tsx:32-39 already contains detailToMessage, which handles exactly this, but it is private to that module.
- Impact: The worst case destroys a fully filled create wizard; the milder cases show garbage error text. Reachable because client validation is weaker than the backend's (for example source URL shape, generic-format field lengths).
- Fix approach: Export detailToMessage from auth.tsx (or a shared lib) and route every data.detail through it.
- Effort: S | Depends on: none

### BUG-007: Onboarding dead-ends when /api/interests fails
- Location: frontend/src/app/onboarding/InterestPicker.tsx:120-131 (fetch with no .catch and no r.ok check), crash at :150 (interests.map inside new Map)
- Severity: High | Confidence: High | Category: bug (error-handling)
- Description: A network failure leaves loading true forever: the new user sees pulsing placeholders with a permanently disabled Continue and no retry. A non-ok JSON response sets interests to {detail: ...} and the next render throws at interests.map. Onboarding gates the entire app (the feed redirects here until interests exist in localStorage), so there is no way around it.
- Impact: First-run users are hard-blocked by any transient API problem, at the single most unforgiving moment.
- Fix approach: Add catch + ok check with an inline retry button, and validate the payload is a non-empty array.
- Effort: S | Depends on: none

### BUG-008: One legacy tags/connections row 500s every list endpoint
- Location: backend/app/schemas.py:363-364 (tags: List[str], connections: List[dict]); legacy string refs documented as expected data in backend/app/graph_edges.py:12-14 and :89-90
- Severity: High | Confidence: Medium (mechanism certain; whether such rows exist in the live DB is unverifiable from code) | Category: bug (contract)
- Description: graph_edges.py explicitly tolerates legacy string connection refs "so old and new shapes coexist while the seed data is migrated later", but PostOut declares connections as List[dict] and tags as List[str]. Pydantic v2 will not coerce a str into dict, so serializing one such published row raises ResponseValidationError.
- Impact: The failure is not per-post: GET /api/feed, /api/search, /api/feed/following, and /api/feed/user return one list, so a single bad row 500s the entire feed and search for everyone until the row is fixed.
- Fix approach: Loosen the two fields (validator that filters non-conforming entries) or drop/empty connections in responses entirely (the frontend provably never reads it, see Coverage notes).
- Effort: S | Depends on: none

### BUG-009: Private accounts' posts are fully public
- Location: backend/app/routers/feed.py:99-116 (get_user_feed filters only status; the resolved _current_user on line 102 is never used); same absence in feed.py:37 (For You) and search.py:70-78
- Severity: High | Confidence: Medium (is_private semantics inferred from the follows/chat gates; the unused dependency suggests the check was intended) | Category: bug (logic)
- Description: is_private gates follower/following lists (follows.py:144-147), makes follows require approval, and makes chat unreachable without an accepted follow. But the account's actual posts are served to anyone, anonymous included, via /api/feed/user/{username}, and also appear in For You and search.
- Impact: The privacy feature protects the metadata while leaving the content itself public. Users who set their account private will reasonably believe their posts are restricted; they are not.
- Fix approach: Decide the product rule, then enforce it in get_user_feed (owner or accepted follower only) and decide explicitly whether private authors' posts belong in For You and search.
- Effort: M | Depends on: none (product decision first)

### BUG-010: Battle: mutual challenge produces two battles with divergent seeds
- Location: backend/app/routers/battle.py:166-178 (busy check deliberately lets a counter-challenge through, then pair + two battle_start sends with a fresh random seed per handler); frontend/src/app/components/Battle.tsx:117-131 (every battle_start fully resets the client)
- Severity: High | Confidence: High | Category: bug (race)
- Description: When A challenges B while B challenges A (both tapping Rematch is the likely trigger), two _handle_challenge coroutines run concurrently. Each generates its own seed and broadcasts battle_start to both players; the four sends interleave on the event loop. Each client resets on every battle_start it receives, so the active battle is whichever frame arrived last, and A can settle on seed2 while B settles on seed1. The clients then derive different question sequences while the score strip claims a live duel. Frames carry no battle/room id, so neither side can detect the mismatch, and a stale opponent_progress from the old pairing is applied to the new one (Battle.tsx:133-134).
- Impact: Silently incoherent duels exactly in the highest-frequency flow (rematch).
- Fix approach: Serialize pairing in one lock scope and reuse the existing pairing's seed for a symmetric counter-challenge; attach a battle id to every frame so clients drop frames from a battle they are no longer in.
- Effort: M | Depends on: none

### BUG-011: Battle: players strand in dead states with invisible errors
- Location: frontend/src/app/components/Battle.tsx:151-153 (error frames change stage only from "waiting"; message renders only in the lobby, ~407-411), :224-230 (commitAnswer ignores progress() return), :245-251 (finish then stage "done"), renderDone (~492-499: no button, no timeout); backend/app/routers/battle.py:273-276 (disconnect tears the room down)
- Severity: High | Confidence: High | Category: bug (state)
- Description: If a player's socket drops mid-battle, the server ends the room and the reconnected socket rejoins nothing. The client keeps playing: progress/finish send failures and the server's "You are not in a battle." error frames are invisible outside the lobby, so the player answers all questions against nobody and lands in "done", a screen with no exit that waits for an opponent_finish that will never arrive. The same terminal state occurs whenever the opponent simply stops answering.
- Impact: A stuck full-screen state with no recovery except leaving the tab; every mid-battle disconnect produces it.
- Fix approach: Render message in every stage, treat "not in a battle" errors and failed sends as battle-over, and give renderDone an exit control plus an optional timeout.
- Effort: M | Depends on: BUG-010 (a battle id makes the client-side detection clean)

### BUG-012: Per-IP rate limits share one bucket behind a reverse proxy
- Location: backend/app/routers/auth.py:25-26 (_client_ip returns request.client.host), used at :66 (register 10/hr) and :88 (login 30/5min); same pattern in search.py:20
- Severity: Medium (High if deployed behind a proxy) | Confidence: Medium (deployment-dependent) | Category: bug (logic)
- Description: Behind any reverse proxy or load balancer without proxy-headers handling, request.client.host is the proxy's IP for every request. All users then share one ip:{proxy} login bucket and one register bucket.
- Impact: Roughly 30 login attempts per 5 minutes site-wide before every user receives 429: a functional outage vector, distinct from the per-process limiter notes in BE-046.
- Fix approach: Enable proxy-headers middleware (trusting only the known proxy) before keying limits on client IP; document the deployment assumption either way.
- Effort: S | Depends on: none

### BUG-013: Avatar upload 500s when Supabase storage is unconfigured
- Location: backend/app/routers/auth.py:214-219 (supabase_client.storage used with no None check); contrast uploads.py:31-32 (the guard exists there); upload_config.py:15 (client is None without env vars)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: upload_image checks supabase_client is None and returns 503; upload_avatar does not, so without SUPABASE_URL/SUPABASE_SERVICE_KEY every avatar upload raises AttributeError on None.
- Impact: Unhandled 500 instead of a clear 503; the failed attempt also consumes one of the user's 10/hour rate-limit slots (the check runs at line 203, before the upload).
- Fix approach: Add the same None guard used in upload_image.
- Effort: S | Depends on: none

### BUG-014: Storage API failures escape both upload endpoints as bare 500s
- Location: backend/app/routers/auth.py:214-219 and backend/app/routers/uploads.py:33-38 (upload and get_public_url calls with no exception handling)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: supabase-py raises StorageApiError (bucket missing, policy denial, duplicate path) or httpx transport errors (network down, timeout) from .upload(). Nothing catches them, so the client receives an opaque 500; in the avatar path the rate-limit slot is consumed and the DB update never runs.
- Impact: Storage-side incidents surface to users as generic failures with no actionable message, and burn upload quota.
- Fix approach: Wrap the storage calls and map storage/transport failures to 502/503 with a clear detail.
- Effort: S | Depends on: none

### BUG-015: validate_image: decode-stage Pillow errors escape as 500
- Location: backend/app/sanitize.py:90-91 (img.n_frames before verify, outside any try) and :99-117 (re-open, convert, thumbnail, save: all outside try); callers map only ValueError to 400 (uploads.py:21-24, auth.py:204-207)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: Only the first Image.open and img.verify() are wrapped. verify() does not fully decode pixel data, so a truncated or corrupt file that passes it raises OSError ("image file is truncated" / "broken data stream") in convert/thumbnail/save; n_frames on a malformed GIF can raise before verify. These escape as 500s. (DecompressionBombError is fine: Pillow raises it inside the first, wrapped Image.open.)
- Impact: Corrupt uploads produce 500s instead of the intended 400 "invalid image", and consume rate-limit slots.
- Fix approach: Extend the existing except-Exception-raise-ValueError pattern over lines 90-117.
- Effort: S | Depends on: none

### BUG-016: validate_image flattens transparency onto black
- Location: backend/app/sanitize.py:100 (img.convert("RGB")) with PNG/WebP re-save at :104-108
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: convert("RGB") on an RGBA image discards the alpha channel without compositing, so transparent regions become black, even though the file is then re-saved as PNG/WebP, formats that support alpha.
- Impact: Every transparent-background avatar or content image comes out with a black background.
- Fix approach: Keep RGBA for PNG/WebP, or composite onto white before converting.
- Effort: S | Depends on: none

### BUG-017: validate_image drops EXIF orientation: phone photos display rotated
- Location: backend/app/sanitize.py:99-115 (re-encode never applies ImageOps.exif_transpose and saves without EXIF)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: The re-encode strips all metadata including the Orientation tag but never applies the rotation it encoded. A portrait phone JPEG (Orientation=6) is stored sideways.
- Impact: Sideways avatars and images everywhere for the most common upload source there is.
- Fix approach: ImageOps.exif_transpose(img) after the re-open, before convert.
- Effort: S | Depends on: none

### BUG-018: Malformed SUPABASE_URL crashes the whole app at import
- Location: backend/app/upload_config.py:15 (create_client at module import when both vars are non-empty); main.py:14 imports the uploads router unconditionally
- Severity: Medium | Confidence: Medium (depends on supabase-py raising on invalid URLs, which it does for obvious malformations) | Category: bug (resilience)
- Description: Absent env vars are handled (None client, 503s). But a present-and-invalid value (typo, stray whitespace, wrong scheme) makes create_client raise at import time, so the entire API fails to boot over a storage-only misconfiguration. Note also that upload_config.py never calls load_dotenv itself; it works only because database.py/auth.py load it first.
- Impact: A storage typo takes down every endpoint, not just uploads.
- Fix approach: Wrap create_client in try/except, log, and fall back to None so only uploads degrade.
- Effort: S | Depends on: none

### BUG-019: Pending follow requests from soft-deleted users become permanent zombies
- Location: backend/app/routers/follows.py:185-197 (get_follow_requests has no is_active filter on the follower) versus :103 and :123 (accept/reject resolve the requester via _get_target, follows.py:37-41, which filters is_active == True and 404s)
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: User A requests to follow private user B, then deletes their account (soft delete keeps the Follow row). B still sees A's request in the list, but both accept and reject 404 because A no longer resolves.
- Impact: An undismissable request sits in B's UI forever.
- Fix approach: Filter pending requests by follower is_active (or clean up follows on soft delete), and let accept/reject operate on the Follow row without the is_active gate.
- Effort: S | Depends on: none

### BUG-020: Going public leaves pending follow requests stuck
- Location: backend/app/routers/auth.py:183-184 (is_private toggle touches nothing else); backend/app/routers/follows.py:64-71 (an existing row of any status yields 400 "Already following.")
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: When a private account goes public, its pending Follow rows stay pending. Requesters never become followers, their profile view shows "Requested" indefinitely, and tapping follow again returns "Already following.", which is also the wrong message for a pending request on a still-private account.
- Impact: Silent, permanent stuck state for every requester the account had when it went public; only unfollow-then-refollow heals it.
- Fix approach: On the private-to-public transition, bulk-update that user's pending rows to accepted; separately, make follow_user return a distinct message for an existing pending row.
- Effort: S | Depends on: none

### BUG-021: Account deletion permanently locks the email and username
- Location: backend/app/routers/auth.py:231-247 (soft delete sets is_active=False) versus :67-70 (register uniqueness checks ignore is_active); no reactivation path exists in the router
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: The dead row still occupies the unique email and username. Login and tokens are correctly blocked, but re-registration with the same email is refused ("Email already registered.") forever.
- Impact: A user who deletes their account can never return with their own email address, and the error message denies the account ever existed.
- Fix approach: Pick a policy: reactivation on login/register, or scrambling email/username at soft-delete time to free them.
- Effort: M | Depends on: none

### BUG-022: Soft-deleted users remain in lists, counts, and leaderboards as dead links
- Location: backend/app/routers/follows.py:149-153 and :169-173 (follower/following lists have no is_active filter), :210-224 (profile counts count them); backend/app/routers/stats.py:109-159 and :332-340 (all leaderboards and total_users include them); posts of deactivated users also stay in feed/search (feed.py:37, search.py:70-74)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: After DELETE /me the user's row and content stay visible everywhere except direct profile lookups, which 404 via _get_target. The delete handler's own comment claims "All auth and lookup paths already filter on is_active", which these paths contradict.
- Impact: Follower lists and leaderboards contain entries that 404 when tapped; counts disagree with what a viewer can see; deactivation semantics are inconsistent surface by surface.
- Fix approach: Decide the visibility rule for deactivated users' rows and posts, then apply is_active joins consistently (lists, profile counts, stats, feed/search).
- Effort: M | Depends on: none

### BUG-023: 10 MB body cap bypassed by chunked Transfer-Encoding
- Location: backend/app/main.py:46-51 (cap checks only a digit Content-Length header)
- Severity: Medium | Confidence: Medium (impact depends on ASGI-server-level limits in the deployment) | Category: bug (resilience)
- Description: A request with Transfer-Encoding: chunked carries no Content-Length, so the middleware passes it through and FastAPI buffers the entire streamed body in memory; a non-digit spoofed Content-Length also skips the check. The comment calls the cap defense-in-depth, but for JSON endpoints it is the only cap.
- Impact: The documented 10 MB protection does not hold for the one request shape an abusive client would actually use. (Abuse framing belongs to Pass 7; recorded here because the cap functionally does not do what it says.)
- Fix approach: Enforce the limit while reading the stream, or set an equivalent limit at the ASGI server and document it.
- Effort: S | Depends on: none

### BUG-024: Malformed JSON shapes crash quiz, search, and post serialization
- Location: backend/app/routers/quiz.py:23-26 (section.get on non-dict sections; content that is a string), :59-60 (item.get on non-dict items), :95-96 with elo.py:42 (unhashable post_difficulty raises in dict.get); backend/app/routers/search.py:34-51 (_post_matches: .lower() on non-string feed_card values, idea.get on non-dict core_ideas entries); backend/app/post_counts.py:18-21 (tags stored as dict raises KeyError on tags[0], reached by attach_counts on every list response)
- Severity: Medium | Confidence: Medium (mechanism certain, occurrence data-dependent) | Category: bug (crash)
- Description: Seed and legacy rows are arbitrary JSON. graph_edges._iter_person_entries and reading_time._collect are written defensively against exactly these shapes; quiz, search, and post_counts are not. One odd row turns POST /api/quiz/answer, GET /api/quiz/state, every search request, or (for tags) every list endpoint into a 500.
- Impact: Same one-bad-row amplification as BUG-008 on additional paths.
- Fix approach: Apply the same isinstance tolerance used in graph_edges/reading_time at these read sites.
- Effort: S | Depends on: none

### BUG-025: Non-string title crashes identity-key derivation on create and read
- Location: backend/app/graph_identity.py:105-107 (non-books path passes title into normalize_identity) and :51 (unicodedata.normalize requires str); reached from posts.py:91 (create) and graph_edges.py:93/:257 (resolved_read_next on GET /posts/{id}); PostCreate.feed_card is a bare dict for non-books formats (schemas.py:289)
- Severity: Medium | Confidence: High (create path; Medium for the read path) | Category: bug (crash)
- Description: POST /api/posts with format="facts" and feed_card={"title": 123} raises TypeError inside post_identity_key (500 after the rate-limit slot is consumed). The same key assembly runs at read time over connections refs, so a seed post carrying a non-string ref title 500s that post's detail endpoint. This contradicts the module's own "returns None, never raises" contract, which _coerce_year honors for people.
- Impact: Unhandled 500s on create and on detail reads for structurally odd data.
- Fix approach: Require isinstance(str) in _key_from_parts/_connection_key, returning None otherwise (matching the documented contract).
- Effort: S | Depends on: none

### BUG-026: Quiz item without answer_index is unanswerable yet still costs Elo
- Location: backend/app/routers/quiz.py:60-62 (correct = chosen == item.get("answer_index"), None if absent) and :94-97 (apply_answer scores it)
- Severity: Medium | Confidence: Medium (mechanism High; requires a seed row missing the field) | Category: bug (logic)
- Description: If a stored quiz item lacks answer_index, every possible chosen_index (0-3) is "wrong", and an authenticated first attempt permanently deducts Elo on a question that cannot be answered correctly.
- Impact: Users lose rating to broken content with no way to tell.
- Fix approach: If answer_index is not in (0,1,2,3), return the result unscored (scored=False, delta 0).
- Effort: S | Depends on: none

### BUG-027: Anonymous quiz flow leaks answers before the rate limit: Elo gameable
- Location: backend/app/routers/quiz.py:64-76 (result includes correct_index + explanation; anonymous return at :73-74 sits before check_rate_limit at :76; nothing is stored for anonymous callers)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: Unauthenticated callers get the correct answer for any (post_id, question_index) with no rate limit and no record. A user can probe every answer logged out, then answer logged in with perfect accuracy.
- Impact: The knowledge score's integrity is trivially defeatable; this is the functional side (the abuse framing belongs to Pass 7).
- Fix approach: Rate-limit anonymous answers by IP and consider not returning correct_index/explanation to anonymous callers.
- Effort: S | Depends on: none

### BUG-028: knowledge_rating read-modify-write race loses deltas
- Location: backend/app/elo.py:63-71 (read rating, add delta, write back); committed from quiz.py:107 and train.py:39-42
- Severity: Medium | Confidence: Medium | Category: bug (race)
- Description: Two concurrent scored answers (realistic in rapid Train play at 120/min, or two tabs) both read the same rating and the last commit wins: one delta and one knowledge_answered_count increment vanish, also skewing the K-factor switchover at 30 answers.
- Impact: Occasional silently lost rating changes; count drift.
- Fix approach: Row lock (with_for_update) or an atomic SQL expression update.
- Effort: S | Depends on: none

### BUG-029: Authenticated like double-submit race stores duplicates
- Location: backend/app/routers/events.py:42-67 (Python snapshot dedup, check-then-act); events table has no unique constraint (models.py:97-113)
- Severity: Medium | Confidence: Medium (mechanism High; frequency Medium) | Category: bug (race)
- Description: Two concurrent flushes carrying the same like (double-tap plus retry, or two tabs) both pass the stored-likes snapshot check and both insert. Extends BE-016 (which covers the anonymous bypass): here the dedup exists but has no constraint backstop.
- Impact: like_count permanently inflated by real duplicates even for authenticated users.
- Fix approach: Partial unique index on (user_id, post_id) where event_type='like', with conflict handling; or dedup at count time.
- Effort: S | Depends on: none

### BUG-030: duration_ms unbounded: batch 500s and poisoned feed scoring
- Location: backend/app/schemas.py:28 (EventIn.duration_ms: int with no bounds); stored at events.py:71; averaged raw at scoring.py:51-53 and :62-64 into the per-format bonus normalized at :66-68
- Severity: Medium | Confidence: High | Category: bug (validation)
- Description: (a) duration_ms above int32 passes Pydantic but overflows the PostgreSQL Integer column: DataError, unhandled 500 for the whole batch. (b) Values that fit (billions, or negatives) enter the average directly; one crafted view event dominates max_raw and rescales every format's engagement bonus for all users for 30 days.
- Impact: A trivial payload distorts everyone's feed ordering or 500s event ingestion.
- Fix approach: Clamp/validate duration_ms in EventIn (0 to a few hours in ms) and clamp outliers before averaging.
- Effort: S | Depends on: none

### BUG-031: Unlimited anonymous view events bury posts for every user
- Location: backend/app/routers/events.py:15-23 (no rate limit, optional auth); backend/app/scoring.py:89 (score -= views * 1.0, global)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: The rate-limit absence is recorded as BE-017 (perf angle). The functional angle is new: every stored view applies the global repeat penalty, so looping anonymous 50-event batches against one post drives its score to zero in every user's For You feed.
- Impact: Any post can be buried platform-wide by an unauthenticated client.
- Fix approach: Rate-limit by user-or-IP like search does; see BUG-032 for the scoring side.
- Effort: S | Depends on: BE-017 (same fix)

### BUG-032: Feed scoring penalty is global: 6 views by anyone zero a post for all
- Location: backend/app/scoring.py:29-30 (TODO: filter events per user "once user authentication exists") and :89 (post_view_counts is site-wide)
- Severity: Medium | Confidence: High (behavior; whether it is still accepted is a product call) | Category: bug (logic)
- Description: Events carry user_id and auth has existed for months, but scoring still aggregates all users. Base score is 1.0 and each view subtracts 1.0, so any post with about 6 total views by anyone scores 0 (before interest bonus) for every visitor, including people who never saw it.
- Impact: Popular posts sink for everyone as usage grows; the "already viewed" mechanic punishes the wrong users. This becomes the dominant feed-quality bug at any real traffic.
- Fix approach: Filter the event aggregation to the requesting user (feed.py already resolves get_optional_user in the sibling endpoint) or rescale the global penalty.
- Effort: M | Depends on: none

### BUG-033: GET /posts/{id} hides only status "pending", siblings hide all non-published
- Location: backend/app/routers/posts.py:132-134 (== "pending") versus comments.py:21, quiz.py:50, events.py:89 (!= "published")
- Severity: Medium | Confidence: High (latent: only two statuses are written today) | Category: bug (logic)
- Description: The detail endpoint whitelists "pending" while every sibling uses the != "published" rule; graph_edges.py's docstring already anticipates taken-down/un-published states.
- Impact: The moment a third status is introduced (rejection, takedown), the detail endpoint serves it publicly while every other endpoint hides it.
- Fix approach: Use != "published" here too; ideally via the shared visibility helper proposed in BE-019.
- Effort: S | Depends on: BE-019

### BUG-034: WS: a DB exception mid-frame kills the connection instead of an error frame
- Location: backend/app/routers/chat.py:351-374 (_handle_send: try/finally with no except) and battle.py:147-153 (_handle_challenge, same); the receive loops catch only WebSocketDisconnect (chat.py:439, battle.py:271)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: A transient DB error (pool exhausted, network blip, commit failure) raised inside a frame handler propagates out of the receive loop and destroys the connection with a stack trace instead of an {"type":"error"} frame.
- Impact: One failed message costs the user their live session (chat and battle both).
- Fix approach: Wrap per-frame handling in a broad try/except that rolls back, sends an error frame, and keeps the loop alive.
- Effort: S | Depends on: none

### BUG-035: Chat: message committed but broadcast can be lost, no correlation id
- Location: backend/app/routers/chat.py:359-376 (commit, then re-query + participants query + serialize, then broadcast)
- Severity: Medium | Confidence: Medium | Category: bug (resilience)
- Description: After commit succeeds, the re-query/serialization can raise (see BUG-034): the message is durably stored but nobody, including the sender, is notified, and the sender's connection dies. There is also no client-supplied temp id echoed back, so a sender cannot correlate the broadcast echo with a pending optimistic send at all.
- Impact: Ghost messages that exist in history but never appeared live; retries create duplicates.
- Fix approach: Build the payload inside one guarded block from the flushed object, and echo a client-provided temp id in the broadcast.
- Effort: M | Depends on: BUG-034

### BUG-036: Concurrent DM creation forks a pair into two conversations
- Location: backend/app/routers/chat.py:189-230 (SELECT-then-INSERT dedupe); models.py:180-206 (no pair-level unique constraint)
- Severity: Medium | Confidence: High | Category: bug (race)
- Description: Both users tapping "message" at once pass the dedupe check and both insert, yielding two DM conversations for the same pair. Each client then holds a different conversation id; future dedupe lookups return whichever .first() finds, so the split never heals and messages fork between the two threads.
- Impact: Permanently forked DM history for the affected pair.
- Fix approach: Canonical pair key column (sorted user ids) with a unique constraint; handle IntegrityError by returning the existing conversation.
- Effort: M | Depends on: none

### BUG-037: WS sessions never recheck is_active or token expiry
- Location: backend/app/routers/chat.py:407-414 (checked once at auth) and :354 (_handle_send checks participant rows only); battle.py:219-227
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: is_active and expiry are validated only on the auth frame. A user deactivated (or moderated) mid-session keeps an open socket and can send chat messages and battle frames indefinitely; tokens live 30 days and sockets are long-lived with auto-reconnect.
- Impact: Moderation and self-deletion do not take effect on live sockets until the client happens to reconnect.
- Fix approach: Recheck is_active in _handle_send/_handle_challenge (a DB session is already open there) or force-close a user's registered sockets on deactivation.
- Effort: S | Depends on: none

### BUG-038: Battle: challenger's own busy state unchecked, old opponent orphaned
- Location: backend/app/routers/battle.py:131-178 (_handle_challenge checks only the target's room) and :100-110 (pair silently pops a detached partner's entry)
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: A user mid-battle can challenge a third user; pair() detaches their current opponent without any notification. The abandoned opponent keeps playing: every progress/finish now draws "You are not in a battle." errors (invisible per BUG-011) and no opponent_left ever arrives.
- Impact: The abandoned player is stranded exactly as in BUG-011, but by an ordinary user action rather than a disconnect.
- Fix approach: Reject challenges while the challenger has a room, or send opponent_left to any partner detached by pair().
- Effort: S | Depends on: none

### BUG-039: Battle: socket takeover leaves a ghost room the new socket knows nothing about
- Location: backend/app/routers/battle.py:64-76 (latest socket wins, old one closed) and :83-85 (replaced socket's disconnect deliberately leaves the room intact); no state resync is ever sent
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: On reconnect or a second tab, the server keeps the user's room but never re-sends battle state to the new socket. The new client sits in the lobby while the server believes the user is mid-battle: challengers get "unavailable", the opponent's frames are relayed to a lobby client that ignores them, and the opponent never gets opponent_left.
- Impact: One backgrounded phone strands the opponent and makes the user unreachable until they disconnect entirely.
- Fix approach: On takeover either tear the room down (notifying the opponent) or send the new socket a resync frame with the room's seed and opponent.
- Effort: M | Depends on: none

### BUG-040: Battle: TOCTOU between online check and pair creates dead pairings
- Location: backend/app/routers/battle.py:163-177 (is_online, opponent_of, and pair each take the lock separately)
- Severity: Medium | Confidence: Medium | Category: bug (race)
- Description: If the target disconnects between the online check and pair(), the room is created for a user with no socket and no future disconnect event. The challenger receives battle_start and plays against nobody; no opponent_left ever arrives (the target's cleanup already ran), and the challenger reads as busy to everyone until they disconnect or re-challenge.
- Impact: Dead in-memory pairing plus a stranded player (feeds BUG-011).
- Fix approach: Perform online-check, busy-check, and pair in one lock acquisition, verifying the socket still exists at pair time.
- Effort: S | Depends on: none

### BUG-041: Battle rooms persist after a finished duel: players read as busy forever
- Location: backend/app/routers/battle.py:86-110 (rooms are removed only on disconnect or re-pair; finish frames at :263-268 only relay)
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: After both players finish, the pairing stays in _rooms. Any third user challenging either player gets opponent_unavailable, which the frontend renders as "is not online. Ask them to open the Battle tab." even though they are sitting in the lobby with the tab open. Only a disconnect or a new challenge from the finished players clears it (rematch works because the busy check allows the same pair).
- Impact: Finished players are unreachable for new challenges, with actively misleading copy (see also BUG-114 for the offline/busy conflation).
- Fix approach: Tear the room down when both finish frames have been relayed, or on any new challenge from either side.
- Effort: S | Depends on: none

### BUG-042: Hidden Battle tab silently accepts challenges
- Location: frontend/src/app/page.tsx:195-212 (tabs stay mounted once activated); frontend/src/app/components/Battle.tsx:117-131 (battle_start jumps straight to question); waiting copy at ~437 claims an accept step exists
- Severity: Medium | Confidence: High | Category: bug (state)
- Description: There is no accept step in the protocol: pairing is instant. A user who opened the Battle tab once and swiped back to the feed still holds an open, challengeable socket; a challenge flips the hidden component into question state without the user seeing anything, and the challenger plays a full battle against an absent opponent, ending stranded in "done" (BUG-011). The waiting screen's "They need the Battle tab open to accept" is false on both counts.
- Impact: Phantom battles and stranded challengers in a completely ordinary usage pattern.
- Fix approach: Add an explicit accept frame, or only auto-join when the Battle tab is actually visible; fix the copy either way.
- Effort: M | Depends on: BUG-010 (same protocol change)

### BUG-043: opponent_left discards a battle that was already decided
- Location: frontend/src/app/components/Battle.tsx:140-146 (opponent_left drops to lobby from any non-lobby/summary stage, even when oppDone is true; also calls setMessage inside a setStage updater, an impure updater)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: If the opponent finishes first (final score already received) and then closes the tab, opponent_left arrives while the local player is still answering and throws the whole battle away, even though everything needed to finish and score it locally is present.
- Impact: Completed-in-substance duels are destroyed by an irrelevant disconnect.
- Fix approach: Ignore opponent_left when oppDone is already true; move the setMessage call out of the updater.
- Effort: S | Depends on: none

### BUG-044: Numeric answers use strict float equality against snapped slider values
- Location: frontend/src/app/components/NumberSlider.tsx:30-34 (snap accumulates min + k*step float error); frontend/src/lib/train/trainApi.ts:81-83 and frontend/src/app/components/Battle.tsx:242 (chosenValue === answerValue)
- Severity: Medium | Confidence: Medium (latent: the current 24-question pool uses only integer steps with on-grid answers) | Category: bug (logic)
- Description: Three ways the correct value can be unreachable: fractional steps accumulate float error (0.1*3 !== 0.3 even when the display shows "0.3"); an answerValue off the min + k*step grid can never be produced; and when step does not divide (max - min), max itself is unreachable. Becomes live the first time a question with step 0.5 or an off-grid answer enters the pool, in both Train and Battle.
- Impact: Questions that cannot be answered correctly, silently.
- Fix approach: Compare step-scaled integers (Math.round((v - min) / step)) or use a step-scaled epsilon; validate answer reachability at pool build time.
- Effort: S | Depends on: none

### BUG-045: eventQueue timer permanently dead after firing on an empty queue
- Location: frontend/src/app/lib/eventQueue.ts:15-17 (flush returns on empty queue BEFORE nulling the fired timer handle) and :32-35 (scheduleFlush sees the stale handle and never schedules again)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: Queue a like (timer scheduled), unlike before the flush (cancelPendingLike empties the queue), let the timer fire: flush() early-returns with timer still holding the fired handle. From then on scheduleFlush is a no-op for the page's lifetime; events only flush at 5 queued events or on tab-hide/unload.
- Impact: Single likes and views can sit in memory indefinitely and are lost on crash or an unload signal that does not fire (BUG-112).
- Fix approach: Null the timer at the top of flush(), before the empty-queue return.
- Effort: S | Depends on: none

### BUG-046: Failed event flush drops the batch while the like is marked sent forever
- Location: frontend/src/app/lib/eventQueue.ts:18 (batch spliced out before the fetch) and :29 (.catch(() => {}) with no requeue); frontend/src/app/components/PostCard.tsx:231-233 (markLikeSent persisted at queue time)
- Severity: Medium | Confidence: High | Category: bug (data-integrity)
- Description: On a failed POST the batch is gone: views are silently lost, and for likes the localStorage sent-marker already says "delivered". The reconciliation formula (onServer = sent && !pending) then treats the like as on the server forever: the heart shows liked, the local count is adjusted, and isLikeSent blocks any re-send. A related race: an unlike during the in-flight window skips unmarkLikeSent because hasPendingLike is already false, landing in the same desync if the POST then fails.
- Impact: Permanently divergent like state per browser; views undercounted.
- Fix approach: Re-queue the batch on failure with a bounded retry, and mark likes sent only after a successful flush (completion callback).
- Effort: M | Depends on: BUG-045 (same module)

### BUG-047: No unlike event exists: retracted likes stay on the server
- Location: frontend/src/app/lib/eventQueue.ts:5 (event_type union is "view" | "like" only); frontend/src/app/components/PostCard.tsx:238-248 and post/[id]/page.tsx:211-218 (unlike has no else branch after the pending window)
- Severity: Medium | Confidence: High | Category: bug (data-integrity)
- Description: cancelPendingLike only works while the like is still in the in-memory queue (a window of at most 5 seconds). After the flush, unliking updates localStorage only; the server keeps the like forever. The local adjust arithmetic hides it for this browser, but every other user sees the inflated count, and clearing localStorage breaks the correction for this user too.
- Impact: Server like counts only ever go up; cross-device and cross-user counts drift permanently.
- Fix approach: Add an unlike event type (or DELETE endpoint) the backend decrements, and send it when the like was already flushed. Backend work plus both like call sites.
- Effort: M | Depends on: none

### BUG-048: Transient network error during session restore deletes the auth token
- Location: frontend/src/app/lib/auth.tsx:56-62 (fetch rejection and 401 share one catch that removes the token)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: Opening the app while offline, during a deploy, or through a flaky tunnel lands in the same .catch as a genuine invalid token, and the perfectly valid credential is destroyed.
- Impact: Whole-userbase logout on any backend restart that coincides with open tabs.
- Fix approach: Remove the token only on 401/403 responses; on network errors keep it and stay logged out for the session (or retry).
- Effort: S | Depends on: none

### BUG-049: No 401 handling anywhere; expired tokens silently degrade to anonymous
- Location: frontend/src/app/lib/api.ts:6-18 and swr.ts:17-21 (no global 401 reaction); backend/app/auth.py:70-81 (get_optional_user maps an invalid/expired token to anonymous instead of 401)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: When the 30-day JWT expires mid-session, the UI stays "logged in" while every authenticated call 401s, and on optional-auth endpoints the backend quietly treats the caller as anonymous: like events are stored with user_id NULL (feeding BE-016 dedup loss), and quiz answers return results but are never recorded or scored. Nothing tells the client to re-authenticate.
- Impact: Silent data loss and a dead-looking app in a state every long-lived session eventually reaches.
- Fix approach: Centralize 401 detection in apiFetch/jsonFetcher (token removal + auth reset event); on the backend, distinguish "no credentials" from "bad credentials" in get_optional_user, at least for write endpoints.
- Effort: M | Depends on: none

### BUG-050: Socket hooks: stale-token infinite reconnect, no backoff, logout keeps socket
- Location: frontend/src/app/lib/chatSocket.ts:50-87 (token read once at mount, deps [], unconditional 3s reconnect, early return when no token) and battleSocket.ts:42-80 (same, keyed on loggedIn)
- Severity: Medium | Confidence: High | Category: bug (resilience)
- Description: (a) The JWT is captured once; if it expires or rotates, every 3s reconnect replays the dead token forever, with no backoff and no close-code inspection. (b) chatSocket mounted while logged out never connects even after login (empty deps). (c) Logging out does not close the old socket, which stays authenticated as the previous user until the page unmounts. (d) For battle, reconnect rejoins no state, so frames sent during the 3s gap are simply gone (feeds BUG-011).
- Impact: Reconnect storms against the backend, chat stuck "offline", and a cross-account session hole on shared devices.
- Fix approach: Read the token inside connect(), key the effects on auth state, stop retrying (or prompt re-login) on a 4401 close, and add capped backoff.
- Effort: M | Depends on: BUG-049 (shared auth-state signal)

### BUG-051: Chat view drops WS messages that arrive while history is loading
- Location: frontend/src/app/chat/[id]/page.tsx:31-35 (if (prev === null) return prev) with the socket opened at :39 before the history fetch at :43-49 resolves
- Severity: Medium | Confidence: High | Category: bug (race)
- Description: Frames received while messages === null are discarded, and if the REST snapshot was built before that message committed, it is missing entirely until a full reload; nothing re-fetches or buffers.
- Impact: Messages received in the first seconds of opening a conversation can vanish, the worst possible failure for a chat.
- Fix approach: Buffer socket messages while history is null and merge them (dedupe by id) when the fetch resolves.
- Effort: S | Depends on: none

### BUG-052: Chat history is capped at the newest 50 messages (no pagination UI)
- Location: frontend/src/app/chat/[id]/page.tsx:43 (single fetch with no params, no load-older mechanism); the backend supports before_id keyset pagination (chat.py:241-262)
- Severity: Medium | Confidence: High | Category: bug (contract)
- Description: The backend's default limit is 50 and the client never passes before_id, so any conversation longer than 50 messages permanently truncates in the UI.
- Impact: Older messages are unreachable by any user action.
- Fix approach: Scroll-top loader fetching before_id={oldest loaded id} and prepending the page (backend pages arrive oldest-first).
- Effort: M | Depends on: none

### BUG-053: Rejected chat send loses the typed message
- Location: frontend/src/app/chat/[id]/page.tsx:62-69 (draft cleared as soon as send() returns true; server error frames arrive later)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: send() only confirms the frame left the client. When the server answers with an error frame (30 msgs/min rate limit, participant check), the error text renders but the draft is already gone, and with no per-message correlation the error may even refer to an earlier send.
- Impact: Users must retype rate-limited messages; content loss on every rejected send.
- Fix approach: Keep the draft (or an outbox entry) until the message echoes back over the socket; restore it on an error frame.
- Effort: S | Depends on: BUG-035 (correlation id makes this exact)

### BUG-054: Chat view error handling: NaN id, missing catch, everything reads "not found"
- Location: frontend/src/app/chat/[id]/page.tsx:42 (non-numeric id: fetch effect returns early, skeleton renders forever), :43-55 (neither fetch has a .catch: network failure = unhandled rejection + eternal skeleton), :44-46 (any non-ok status renders "Conversation not found.", including 401 and 500)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: Three adjacent gaps in one screen: /chat/abc loads forever; offline loads forever; and a participant hitting a transient 500 is told the conversation does not exist.
- Impact: Dead ends and misleading terminal states in the messaging surface.
- Fix approach: Treat a non-finite id as not-found; add catch with a retry state; branch on r.status (404 vs other).
- Effort: S | Depends on: none

### BUG-055: Fetch failures render as empty states or infinite skeletons across pages
- Location: frontend/src/app/page.tsx:70 (For You: error keeps posts null, skeleton forever; Following: error maps to [] and renders "Nothing here yet" + "Find people"); saved-posts/page.tsx:21-33 (all fetches rejected, e.g. offline, renders "No saved posts yet"; dead ids are also refetched forever, never pruned); chat/page.tsx:192 (convError maps to [] = "No chats yet"); profile/[username]/page.tsx:113 (postsError maps to [] = "No posts yet."), :120-136 (saved/liked tab failures render as empty), :106-109 (followers sheet error = empty list); post/[id]/page.tsx:141 (network error renders the terminal "Post not found ... removed or awaiting review" card)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: The app has no error rendering vocabulary: every failure is coerced to either null (skeleton) or [] (empty state). Empty states carry confident, wrong copy ("No saved posts yet", "may have been removed"), and with focus/reconnect revalidation globally off, an offline-to-online transition never self-heals the SWR-backed ones.
- Impact: Users are told they have no content when the network failed; there is no retry affordance anywhere.
- Fix approach: One shared error card (message + retry that calls mutate/refetch) and per-page branching of error vs empty. Pair with BUG-005, which is the same disease on the crash side.
- Effort: M | Depends on: BUG-005

### BUG-056: Debounced searches have no stale-response guard and no error handling
- Location: frontend/src/app/search/page.tsx:138-156 (cleanup clears only the timer; in-flight responses land freely; try/finally with no catch); chat/page.tsx:53-57 (same, plus no ok handling); create/page.tsx:166-184 (same, plus: clearing the query returns early without resetting searchLoading, leaving the step-2 spinner on forever)
- Severity: Medium | Confidence: High | Category: bug (race)
- Description: Typing "cats" can display results for "cat" if the older response resolves last; format-chip toggles race the same way; a rejection mid-debounce is an unhandled promise rejection that strands the loading flag.
- Impact: Wrong-looking search results and stuck spinners under ordinary latency variance.
- Fix approach: AbortController (or a request-sequence counter) per effect run; reset loading in the empty-query branch; add catch.
- Effort: S | Depends on: none

### BUG-057: Comment submit failures are silent and destroy the draft
- Location: frontend/src/app/post/[id]/page.tsx:261-267 (sticky bar clears the draft before the POST resolves) and :241-259 (handlePostComment: non-ok returns silently; no catch, so a network failure is an unhandled rejection); app/lib/useComments.ts:42-58 (postComment returns false on non-ok with no surfaced error; rejections propagate to callers)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: A rate-limited (30/5min) or failed comment simply never appears while the input is already empty; the user believes it posted.
- Impact: Lost user content with zero feedback.
- Fix approach: Clear the draft only after a 2xx; restore it and show an error otherwise; catch network failures inside the hook.
- Effort: S | Depends on: none

### BUG-058: Unguarded localStorage/sessionStorage access can crash the app
- Location: frontend/src/app/lib/likedPosts.ts:8-19 (migrateSentKey: unguarded JSON.parse at module load; a corrupt value crashes every page importing the module, on every load, until storage is cleared); page.tsx:143-148 (setSlugs(JSON.parse(saved)) with no try/catch or array check) and :74-79 (feedScrollPosition parse; mismatched entries are also never removed); likedPosts/savedPosts (valid-JSON-wrong-shape values pass the existing try/catch and later throw on .includes; setItem calls unguarded against quota errors); onboarding/InterestPicker.tsx:142-145 (setItem throw leaves the Continue button dead)
- Severity: Medium | Confidence: High (mechanics; corrupt-storage frequency Low) | Category: bug (resilience)
- Description: Storage is user- and extension-writable and survives deploys; a single bad value in deepscroll_liked bricks the app at module-evaluation time, which is the worst variant because no navigation escapes it.
- Impact: Hard, persistent crash loop for affected users; nothing self-heals.
- Fix approach: try/catch + Array.isArray on every read (falling back to defaults and rewriting the key), try/catch on writes; wrap the migration.
- Effort: S | Depends on: none

### BUG-059: Logout leaves per-account localStorage: next account inherits state
- Location: frontend/src/app/lib/auth.tsx:92-96 (logout removes only the token); consumed at InterestPicker.tsx:121 (interests key skips onboarding) and profile/[username]/page.tsx:122/:132 (saved/liked ids)
- Severity: Medium | Confidence: High | Category: bug (data-integrity)
- Description: deepscroll_interests, deepscroll_saved, deepscroll_liked, deepscroll_like_sent, and deepscroll_like_counts persist across accounts on one device. A second account is bounced past onboarding and sees the previous user's Saved and Liked tabs as their own.
- Impact: Cross-account state bleed on shared devices; also corrupts the like reconciliation arithmetic for the new account.
- Fix approach: Clear (or namespace by user id) these keys on login/logout, mirroring what clearApiCache already does for SWR.
- Effort: S | Depends on: none

### BUG-060: Public-profile follow writes optimistic cache without checking the response
- Location: frontend/src/app/profile/[username]/page.tsx:138-156 (DELETE result never checked before decrementing follower_count; POST parses r.json() without ok, writing follow_status: undefined on a 400; no catch, so network failures are unhandled rejections; revalidate: false means nothing self-corrects)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: Unfollowing after having unfollowed on another device (404), or any 500, still decrements the visible follower count; a duplicate-follow 400 blanks the button state.
- Impact: Visible count drift and a broken follow button for the rest of the session.
- Fix approach: Mutate the cache only on r.ok; on failure revalidate instead; catch and surface errors.
- Effort: S | Depends on: none

### BUG-061: Own-profile settings actions fail silently with stale counts
- Location: frontend/src/app/profile/page.tsx:241-255 (privacy toggle: try/finally with no catch, the throw escapes the click handler with zero feedback), :257-275 (accept/decline: response ignored, row removed even on failure, follower count never updated on success), :97-117 (counts/elo failures swallowed into permanent placeholder dashes)
- Severity: Medium | Confidence: High | Category: bug (error-handling)
- Description: Three settings interactions on one page share the pattern: the UI asserts success regardless of the response.
- Impact: A failed accept looks accepted until reload; a failed privacy toggle looks applied; users cannot tell loading from broken.
- Fix approach: Check r.ok, surface errors inline, and bump/refetch the follower count after a successful accept.
- Effort: S | Depends on: none

### BUG-062: useSwipeTabs commits NaN as the active index at zero width
- Location: frontend/src/app/lib/useSwipeTabs.ts:87-92 (index = Math.round(scrollLeft / clientWidth); every guard is false for NaN, so setActiveIndex(NaN) commits)
- Severity: Medium | Confidence: Medium | Category: bug (logic)
- Description: With clientWidth 0 (hidden container mid-layout), NaN passes the range and equality guards: no tab is highlighted, activatedIndices gains NaN, onSettle(NaN) can poison persisted tab state, and the ResizeObserver then computes scrollLeft = NaN.
- Impact: Feed/search/profile/stats pagers wedge into a no-active-tab state until remount.
- Fix approach: Bail out when clientWidth is 0 or the computed index is not finite.
- Effort: S | Depends on: none

### BUG-063: Read-aloud one-shot audio unlock latched by the non-gesture autostart
- Location: frontend/src/lib/readAloud/useReadAloud.ts:214-217 (unlockedRef set true on the first start() regardless of outcome)
- Severity: Medium | Confidence: Medium | Category: bug (logic)
- Description: The autostart path (consumeAutoRead after navigation) runs start() outside a user gesture. On strict-autoplay browsers the silent-WAV unlock play() rejects, but unlockedRef is already latched, so later gesture-driven starts never retry the unlock; every sentence's audio.play() then rejects and the reader silently does nothing on that page.
- Impact: Read-aloud permanently mute for the page on iOS Safari when opened via the card speaker button.
- Fix approach: Latch unlockedRef only when the silent play resolves, or re-attempt the unlock on every gesture-driven start.
- Effort: S | Depends on: none

### BUG-064: Read-aloud highlights over re-rendered DOM throw and end playback
- Location: frontend/src/lib/readAloud/highlights.ts:68-71 (range.setStart with no try/catch); consumed at useReadAloud.ts:88-98
- Severity: Medium | Confidence: Medium | Category: bug (crash)
- Description: Text segments capture live Text nodes at start(). If React re-renders the post mid-read (comment-count patch, like update), a node can shrink or be replaced; setStart past node.length throws IndexSizeError, which propagates as an unhandled rejection in the Piper path or inside utterance.onend in the fallback path, silently stopping speech.
- Impact: Read-aloud dies mid-article whenever the page updates under it.
- Fix approach: try/catch in rangeFromOffsets returning null, and clamp offsets to node.length.
- Effort: S | Depends on: none

### BUG-065: KaTeX failure fallbacks inject raw content via dangerouslySetInnerHTML
- Location: frontend/src/components/MathText.tsx:65-72 (catch returns seg.content, which then renders through __html); sections/FormalismSection.tsx:12-20 and FormalDefinitionSection.tsx (DisplayMath initializes html = latex before the try)
- Severity: Medium | Confidence: High (code path certain; trigger needs a KaTeX throw, possible even with throwOnError: false, e.g. maxExpand) | Category: bug (logic)
- Description: The failure branch is wrong: the fallback should render as text, but instead the raw math string is parsed as HTML, so content containing < is swallowed or mangled. (For user content this is also an injection surface; that dimension belongs to Pass 7. The functional bug is the mis-render.)
- Impact: Math that fails to render disappears or corrupts the page instead of degrading to visible source text.
- Fix approach: On failure render the string as a plain text child (or inside a code element), never through __html.
- Effort: S | Depends on: none

### BUG-066: Detail close() calls router.back(): dead end on direct links
- Location: frontend/src/app/post/[id]/page.tsx:174-180 (slide-down animation then router.back(); isClosingRef blocks any retry); the not-found card's "Go back" uses the same close()
- Severity: Medium | Confidence: Medium (relies on back() being a no-op with empty history, the common case for shared links) | Category: bug (logic)
- Description: A user landing directly on /post/{id} (shared link, new tab) who swipes right or taps back gets the closing animation (the page stays translated off-screen via animation-fill forwards) and then nothing: history has no previous entry.
- Impact: Blank stuck screen on exactly the entry path sharing produces.
- Fix approach: Fall back to router.push("/") when there is no in-app history to return to.
- Effort: S | Depends on: none

### BUG-067: Swipe-right-to-close fires while dragging horizontal scrollers
- Location: frontend/src/app/post/[id]/page.tsx:189-198 (touchend closes on dx > 80 with no scrollable-ancestor check); overflow-x-auto regions at sections/RelatedPostsSection.tsx:45 and the DisplayMath blocks in FormalismSection/FormalDefinitionSection
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: QuizSection deliberately stops propagation for its own swipes; the Read Next row and wide-equation blocks do not, so scrubbing them leftward (finger moving right) closes the whole detail page.
- Impact: Reading interrupted by an accidental close in normal scroll interactions.
- Fix approach: In touchstart, ignore gestures originating inside a horizontally scrollable ancestor (or stopPropagation in those sections like the quiz does).
- Effort: S | Depends on: none

### BUG-068: View dwell event lost when a card unmounts while visible
- Location: frontend/src/app/components/PostCard.tsx:199-222 (dwell is queued only in the intersection-leave callback; the effect cleanup just disconnects)
- Severity: Medium | Confidence: High | Category: bug (data-integrity)
- Description: Tapping a card navigates away and unmounts the feed, so the card the user actually engaged with never logs its view or duration; the last-viewed card on tab close is likewise dropped. Dwell also keeps accumulating wall-clock time while the tab is hidden, inflating the durations that do get sent.
- Impact: The engagement signal that feeds scoring (BUG-032) is systematically missing its strongest events and skewed on the rest.
- Fix approach: Flush the pending dwell in the effect cleanup and on visibility-hidden, gated on MIN_DWELL_MS; pause the clock while hidden.
- Effort: S | Depends on: none

### BUG-069: Like counts can render -1 or NaN
- Location: frontend/src/app/components/PostCard.tsx:181-184 (adjust formula yields -1 after a dropped flush: liked=false, sent=true, pending=false) and :156-158 (post.like_count absent makes the initial state undefined, then undefined + 1 = NaN); post/[id]/page.tsx:149-160 (d.count undefined on an error body renders NaN); unlike at PostCard:243 has no zero floor
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Several arithmetic paths trust upstream state that BUG-046/BUG-005 can corrupt.
- Impact: Visible "-1" or "NaN" next to the heart.
- Fix approach: Default like_count ?? 0, apply counts only when typeof d.count === "number", clamp displays at 0.
- Effort: S | Depends on: BUG-046, BUG-005

### BUG-070: Rate limiter sweep can delete a bucket mid-update
- Location: backend/app/rate_limit.py:22-25 (check timestamps then pop) racing :38-41 (filter/check/append); _last_sweep check-then-set at :33-34
- Severity: Low | Confidence: High (race exists; practical impact low) | Category: bug (race)
- Description: Between reading timestamps[-1] and pop, another threadpool request can append a fresh timestamp to the same list; the sweep then discards it, admitting extra requests. Multiple threads can also sweep simultaneously. Extends BE-046 (this is a distinct deletion race in the sweep path).
- Impact: Slight over-admission at sweep boundaries.
- Fix approach: One threading.Lock around sweep and bucket update.
- Effort: S | Depends on: BE-046

### BUG-071: Middleware/CORS edge cases: unreadable 413, empty allow-list, trailing slash
- Location: backend/app/main.py:33-39 vs :46-51 (the body-cap middleware is added later, so its 413 short-circuits outside CORSMiddleware: no Access-Control-Allow-Origin, browsers see an opaque error); :27-31 (FRONTEND_ORIGIN="" or "*" yields an empty allow-list with no fallback or warning; a trailing-slash origin never matches)
- Severity: Low | Confidence: Medium | Category: bug (error-handling)
- Description: Two configuration-sensitive edges around the same lines: the 413 is invisible to the frontend, and two plausible env values silently CORS-block every browser request.
- Impact: Confusing failures during deployment/misconfiguration rather than at steady state.
- Fix approach: Register the cap middleware inside CORS (or attach the header manually); fall back to the default (or fail loudly) when the parsed origin list is empty; strip trailing slashes.
- Effort: S | Depends on: none

### BUG-072: Missing Authorization header returns 403, invalid token returns 401
- Location: backend/app/auth.py:25 (HTTPBearer() with default auto_error raises 403 for an absent header)
- Severity: Low | Confidence: High | Category: bug (contract)
- Description: Clients keying re-auth behavior on 401 will mishandle the missing-header case (for example after localStorage was cleared mid-session). Becomes load-bearing once BUG-049's global 401 handling exists.
- Impact: Inconsistent status codes for the same "not authenticated" condition.
- Fix approach: Emit 401 with WWW-Authenticate: Bearer for missing credentials.
- Effort: S | Depends on: BUG-049

### BUG-073: Email uniqueness and login are case-sensitive on the local part
- Location: backend/app/routers/auth.py:67 (register duplicate check) and :90 (login lookup); the rate-limit key at :89 already lowercases, showing the intent
- Severity: Low | Confidence: High (mechanism; user impact Medium) | Category: bug (logic)
- Description: Pydantic EmailStr lowercases only the domain. Bob@x.com and bob@x.com register as two accounts; a user who registered with a capital letter and later types lowercase gets 401 "Invalid credentials." despite the correct password.
- Impact: Baffling login failures and accidental duplicate accounts.
- Fix approach: Normalize email to lowercase at register and login.
- Effort: S | Depends on: none

### BUG-074: Admin verify downgrades levels, ignores is_active, and is transitive
- Location: backend/app/routers/admin.py:18-26 (gate is is_verified < 1; target lookup has no is_active filter; target.is_verified = 1 unconditionally)
- Severity: Low | Confidence: Medium (level semantics inferred) | Category: bug (logic)
- Description: Verifying an is_verified=2 user silently downgrades them to 1; soft-deleted users can be verified; and any level-1 user can verify anyone, making verification transitive (the endpoint has no admin-specific gate).
- Impact: Verification levels are not stable under normal use of the endpoint.
- Fix approach: max(target.is_verified, 1), filter is_active, and gate on a real admin level.
- Effort: S | Depends on: none

### BUG-075: Login 500s on a malformed stored password hash
- Location: backend/app/auth.py:33-34 (bcrypt.checkpw raises ValueError on an invalid salt/hash)
- Severity: Low | Confidence: Low (requires a corrupt row) | Category: bug (error-handling)
- Description: A legacy or manually inserted row with a non-bcrypt hash turns login/patch_me/delete_me into 500s instead of 401/400.
- Impact: Data-dependent hard failure on the auth path.
- Fix approach: Wrap checkpw and return False on ValueError.
- Effort: S | Depends on: none

### BUG-076: Nullable created_at columns can crash stats and follow-requests
- Location: backend/app/models.py:38, :153 (no nullable=False/server_default; ORM defaults skip script-inserted rows); consumers follows.py:194 (isoformat on None), stats.py:265 (int(None)), :652 (None.strftime)
- Severity: Low | Confidence: Low (requires NULL rows, possible via the manual backfill scripts) | Category: bug (crash)
- Description: The default fires only on ORM inserts; raw-SQL rows can carry NULL and each cited consumer would 500.
- Impact: Latent 500s keyed to how rows were created.
- Fix approach: nullable=False with a server_default, and/or guard the consumers.
- Effort: S | Depends on: BE-021 (live-DB application path)

### BUG-077: database.py resilience gaps: raw KeyError, boot crash, stale connections
- Location: backend/app/database.py:10 (os.environ["DATABASE_URL"]: uninformative KeyError, contrast the explicit JWT_SECRET RuntimeError in auth.py:19-20); main.py:19 (create_all in lifespan: a transient DB outage during deploy prevents startup, no retry); database.py:16-25 (no pre-ping by explicit measured choice; a connection killed before the 1200s recycle surfaces as a one-off OperationalError 500)
- Severity: Low | Confidence: Medium | Category: bug (resilience)
- Description: Three related operational edges around engine setup. The pre-ping trade-off is documented and deliberate; recorded here because the failure mode (sporadic 500 after idle periods) matches the pre-launch traffic pattern.
- Impact: Confusing boot failures and rare post-idle 500s.
- Fix approach: Descriptive error for the missing var; boot retry; either accept-and-document the stale-connection case or add a one-retry catch for OperationalError.
- Effort: S | Depends on: none

### BUG-078: Reported Elo delta ignores the rating floor clamp
- Location: backend/app/elo.py:68-71 (rating clamped to FLOOR_RATING but the unclamped delta is returned and stored in quiz_answers.rating_delta)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Near the floor (rating 105, wrong answer, base -16) the rating moves -5 but the user is shown and the DB stores -16; stored deltas no longer sum to the rating.
- Impact: Display/store inconsistency in the scoring history.
- Fix approach: Return the effective delta (new rating minus old).
- Effort: S | Depends on: none

### BUG-079: _coerce_year raises on "--480", NaN, and infinity instead of returning None
- Location: backend/app/graph_identity.py:68-73 (lstrip("-") strips all dashes so int("--480") raises; int(float("nan")) raises; int(float("inf")) overflows)
- Severity: Low | Confidence: High (mechanism; occurrence Low) | Category: bug (crash)
- Description: Contradicts the function's documented "returns None, never raises" contract; a people entry with such a birth_year 500s post write or GET /posts/{id}.
- Impact: Same class as BUG-025, narrower trigger.
- Fix approach: try/except returning None; check math.isfinite for floats.
- Effort: S | Depends on: BUG-025 (same module hardening)

### BUG-080: interests="," silently disables interest ordering
- Location: backend/app/routers/feed.py:33 (split without filtering falsy slugs)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: interests="," yields ["", ""], a truthy list, so the tier path runs with selected={""}: nothing matches tier 1 and every post lands tier 3 with no interest bonus, instead of falling back to the no-interests branch. A trailing comma pollutes selected with "" (harmless but sloppy).
- Impact: Wrong feed ordering for malformed but plausible query strings.
- Fix approach: Filter empty entries in the comprehension.
- Effort: S | Depends on: none

### BUG-081: create_post burns a daily rate-limit slot on failed validation
- Location: backend/app/routers/posts.py:65 (check_rate_limit appends the timestamp before the interest-slug check at :70-79 and the SVG check at :83-86)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Twenty consecutive 400s (a client bug sending an unknown slug) exhaust the 24-hour budget, so subsequent valid posts get 429 for a day.
- Impact: A validation loop can lock a user out of posting.
- Fix approach: Record the slot only after validation passes (or use a separate budget for failures).
- Effort: S | Depends on: none

### BUG-082: AtAGlanceBooks validator is dead code: required section unvalidated
- Location: backend/app/schemas.py:48-62 (defined, referenced nowhere: single grep hit) versus :137-140 (AtAGlanceSection.content: dict)
- Severity: Low | Confidence: High | Category: bug (validation)
- Description: A books post can publish with at_a_glance content {}. The frontend then renders missing keys, which is exactly the crash input for BUG-004.
- Impact: The validation gap upstream of a page-killing render bug.
- Fix approach: Validate the section content with AtAGlanceBooks inside validate_books_sections (as BooksFeedCard already is).
- Effort: S | Depends on: none

### BUG-083: Duplicate section types allowed: second quiz section unanswerable
- Location: backend/app/schemas.py:315-319 (presence via set, uniqueness never checked); backend/app/routers/quiz.py:22-26 (_get_quiz_items returns the first quiz section only)
- Severity: Low | Confidence: High | Category: bug (validation)
- Description: A post can carry two quiz sections; questions in the second render but can never be answered (index bounds are computed against the first list), while still counting toward reading time.
- Impact: Confusing half-dead quizzes on malformed posts.
- Fix approach: Reject duplicate section types in the model validator.
- Effort: S | Depends on: none

### BUG-084: Chat: cross-sender display order can invert versus stored order
- Location: backend/app/routers/chat.py:357-376 (commit and broadcast are separate steps; two handlers can interleave at the send awaits)
- Severity: Low | Confidence: Medium | Category: bug (race)
- Description: Handler A commits id=41, yields inside send_to_users; handler B commits id=42 and completes its broadcast first. Clients appending in arrival order display 42 before 41, disagreeing with the id-ordered history after a refresh.
- Impact: Occasional visible reorder in busy conversations.
- Fix approach: Clients insert by message id (cheap), or serialize broadcasts per conversation.
- Effort: S | Depends on: none

### BUG-085: One stalled participant socket delays delivery to everyone after it
- Location: backend/app/routers/chat.py:290-298 (sequential awaited sends; the per-send try/except handles dead sockets but not alive-and-stalled ones); same shape in battle.py:112-121
- Severity: Low | Confidence: Medium | Category: bug (resilience)
- Description: A socket with a full TCP send buffer makes send_json await indefinitely: later participants never receive the message and the sender's own receive loop stays blocked inside _handle_send.
- Impact: One frozen client degrades delivery for a whole group.
- Fix approach: asyncio.wait_for with a short timeout per send (treat timeout as a dead socket) or fan out with gather.
- Effort: S | Depends on: none

### BUG-086: WS frame robustness: binary frames, char-counted cap, bool scores
- Location: backend/app/routers/chat.py:391 and :420, battle.py:203 and :233 (receive_text on a binary frame raises an exception outside the caught tuples, killing the handshake or connection without an error frame); chat.py:22/:421, battle.py:17/:234 (len(raw) counts code points, so the "byte" cap admits ~4x the bytes; the auth frame is exempt from any size check); battle.py:256/:265 (isinstance(score, (int, float)) admits bool, relayed as score: true; index/score otherwise unbounded); chat.py:326-327, battle.py:127-128 (reply sends unguarded: on older Starlette a send to a just-closed socket raises past the except)
- Severity: Low | Confidence: Medium (some variants are Starlette-version dependent) | Category: bug (error-handling)
- Description: A cluster of small robustness gaps in the two WS loops, none of which corrupts state (the finally cleanup always runs) but all of which turn diagnosable client mistakes into silent connection deaths or nonsense relayed values.
- Impact: Harder-to-debug disconnects; garbage score frames reach opponents.
- Fix approach: Branch on websocket.receive() text/bytes; compare encoded byte length and cap the auth frame; exclude bool and clamp index/score; guard reply sends.
- Effort: S | Depends on: none

### BUG-087: opponent_left delivery is fire-and-forget and can arrive stale
- Location: backend/app/routers/battle.py:112-121 (manager.send swallows all exceptions) and :274-276 (notification sent after the lock is released, so the survivor can already be re-paired when it lands)
- Severity: Low | Confidence: Medium | Category: bug (resilience)
- Description: The one frame that ends a battle has no delivery guarantee (momentarily dead/replaced socket loses it forever), and a late one can arrive during the survivor's next battle, which the client would treat as the current opponent leaving.
- Impact: Stranded or wrongly aborted battles in edge timings; both resolved by the same battle-id mechanism as BUG-010.
- Fix approach: Include a battle id in battle_start and opponent_left so clients discard stale ones; treat "not in a battle" errors as battle-over client-side.
- Effort: S | Depends on: BUG-010

### BUG-088: Group create silently degrades to a DM when recipients collapse
- Location: backend/app/routers/chat.py:169-175 (self and duplicates silently skipped), :187 (is_group computed from the deduped count), :221-223 (name dropped for DMs)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: {"usernames": ["myself", "alice"], "name": "Study group"} becomes a plain DM with the name discarded, and via DM dedupe may return a years-old existing conversation instead of creating anything, with no signal to the client.
- Impact: The response shape does not match what was requested; group intent is lost silently.
- Fix approach: Error when the deduped recipient set changes the group/DM shape (or at least when name is provided for a DM).
- Effort: S | Depends on: none

### BUG-089: Missing NEXT_PUBLIC_API_URL fails confusingly everywhere
- Location: frontend/src/app/lib/api.ts:1 and :17 (requests go to "undefined/api/...", everything 404s with no diagnostic; same pattern in auth.tsx:6 and eventQueue.ts:1); chatSocket.ts:37-38 and :60 (the WS URL degrades to a relative string; the WebSocket constructor throw inside the reconnect setTimeout is uncaught and permanently ends the reconnect chain); api.ts:7 (localStorage touched without a typeof window guard, unlike every sibling lib)
- Severity: Low | Confidence: High | Category: bug (resilience)
- Description: A misconfigured build fails with scattered, unrelated-looking symptoms instead of one loud error.
- Impact: Deployment mistakes cost debugging time; the WS variant leaves sockets permanently dead.
- Fix approach: Fail fast at module load when the env var is missing; wrap the WebSocket constructor in try/catch treating failure as a close; guard localStorage.
- Effort: S | Depends on: none

### BUG-090: login/register parse JSON before checking ok: SyntaxError shown to users
- Location: frontend/src/app/lib/auth.tsx:71-72 and :85-86 (await r.json() precedes the ok check)
- Severity: Low | Confidence: High | Category: bug (error-handling)
- Description: A proxy 502/504 HTML page makes r.json() throw; the login form then renders the raw "Unexpected token '<'" message instead of "Login failed." (422 array details themselves are handled correctly here via detailToMessage).
- Impact: Ugly, confusing error text exactly when the backend is down.
- Fix approach: Parse defensively (try/catch around r.json()) and fall back to the generic message.
- Effort: S | Depends on: none

### BUG-091: clearApiCache clears mounted keys without revalidating
- Location: frontend/src/app/lib/swr.ts:27 (mutate(() => true, undefined, { revalidate: false }))
- Severity: Low | Confidence: Low (depends on SWR revalidation behavior for currently mounted keys) | Category: bug (logic)
- Description: After login/logout, hooks that are mounted at that moment have data set to undefined with revalidation suppressed; visible screens can drop to loading/empty states until some other trigger revalidates.
- Impact: Transient blank screens around auth transitions.
- Fix approach: Revalidate mounted keys after clearing (revalidate: true, or clear then broadcast).
- Effort: S | Depends on: none

### BUG-092: relativeTime renders "Invalid Date" and throws on null
- Location: frontend/src/app/lib/relativeTime.ts:4 (iso.endsWith on null throws; appending "Z" to an offset-bearing timestamp produces an invalid date; invalid input falls through to toLocaleDateString rendering the literal "Invalid Date")
- Severity: Low | Confidence: High | Category: bug (crash)
- Description: ChatMessage.created_at is string | null per the chat serializer (chat.py:61), so the null case is reachable from real data.
- Impact: A crash or junk text in timestamps.
- Fix approach: Handle nullish input with a fallback string; append "Z" only when no timezone designator exists; check Number.isNaN(date.getTime()).
- Effort: S | Depends on: none

### BUG-093: send() reports success before the socket is authenticated
- Location: frontend/src/app/lib/chatSocket.ts:89-94 and battleSocket.ts:82-87 (gate on readyState OPEN, not on auth_ok); chat/[id]/page.tsx:174-179 (the Enter key path is not gated on status, only the button is disabled)
- Severity: Low | Confidence: Medium | Category: bug (race)
- Description: Between onopen and auth_ok, readyState is OPEN, so send() returns true and the draft is cleared. Frame ordering protects the normal case (the auth frame was sent first in onopen), so the message is lost only when auth fails, and during the reconnect window send() returns false with no queue, silently dropping the Enter-key attempt.
- Impact: Occasional silently lost messages around connection churn.
- Fix approach: Gate send on status === "open" and queue outbound frames until authenticated.
- Effort: S | Depends on: BUG-050

### BUG-094: consumeAutoRead destroys a pending request on post-id mismatch
- Location: frontend/src/lib/readAloud/autostart.ts:19-22 (removeItem before comparing the stored id)
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Any other consumer running first (React StrictMode double-invocation in dev, an intermediate page) deletes the request and the matching post then returns false, so the promised auto-read never starts.
- Impact: The card speaker button intermittently opens the post without reading.
- Fix approach: Remove the key only when it matches the requesting post id (add a timestamp for staleness).
- Effort: S | Depends on: none

### BUG-095: Text-processing edges: spaced asterisks italicized, double backslash collapsed
- Location: frontend/src/lib/italics.ts:10 (the pair regex matches "* 4 *" in "3 * 4 * 5", italicizing " 4 " and eating the asterisks; "**bold**" renders as a stray asterisk plus italics); frontend/src/lib/prose.ts:6-8 (an authored backslash before an escaped dollar collapses); frontend/src/components/Prose.tsx:10-14 (the unescape does not recurse into element children: latent only, no current call site nests strings that way)
- Severity: Low | Confidence: High (mechanisms; content triggering them is guarded by the gold tests for pipeline content but not for user content) | Category: bug (logic)
- Description: Three small text-shaping edge cases that silently change meaning rather than crash.
- Impact: Mis-rendered prose for inputs the authoring rules discourage but nothing enforces on user submissions.
- Fix approach: Require non-whitespace adjacent to italic delimiters; document or handle the double-backslash case; document the Prose constraint.
- Effort: S | Depends on: none

### BUG-096: Read-aloud minor defects: blob leak, abbreviation splits, dropped spaces
- Location: frontend/src/lib/readAloud/useReadAloud.ts:61-65 (stop() never revokes the current blob URL, accumulating over a session); extractText.ts:55-58 (the sentence regex splits "e.g. " and "Dr. " into their own sentences, contradicting the comment; "3.14" is fine); extractText.ts:86 (whitespace-only text nodes between inline elements are dropped, so the synthesizer receives concatenated words like "fastthinking")
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Three contained defects in the read-aloud pipeline: a resource leak and two audible text-extraction faults.
- Impact: Odd pauses and run-together words during playback; slow memory growth with heavy use.
- Fix approach: Revoke blob src in stop(); add an abbreviation guard before the terminator; emit an unmapped space when skipping a separator node between kept siblings.
- Effort: S | Depends on: none

### BUG-097: useSwipeTabs minor: mid-drag settle, unclamped index, resize snap-back
- Location: frontend/src/app/lib/useSwipeTabs.ts:118-125 (the 50ms no-scrollend fallback fires while a finger rests mid-swipe, committing an intermediate index); :33 and :135-153 (initialIndex/selectTab never clamped to count, so a persisted index from a larger tab set desyncs state from reality); :101-105 (the ResizeObserver realigns scrollLeft on any size change, including height-only content growth, cancelling an in-progress swipe)
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Three contained mechanics issues in the shared pager hook, affecting all swipeable surfaces (feed, search, profile, stats).
- Impact: Spurious tab settles and cancelled swipes, mostly on iOS (no scrollend) and content-loading pagers.
- Fix approach: Lengthen/verify the fallback settle, clamp indices, and realign only when the width actually changed.
- Effort: S | Depends on: none

### BUG-098: PostCard timer hygiene: overlapping toasts, nav timer fires after unmount
- Location: frontend/src/app/components/PostCard.tsx:309-310 (two shares within 2s stack timeouts; the first hides the second toast early; no unmount cleanup) and :295-299 (the 300ms single-tap navigation timer is never cleared on unmount, so a card removed within the window still navigates and writes feedScrollPosition)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Two small uncleared-timer defects in the same component.
- Impact: Truncated toasts; rare navigation fired from a dead card.
- Fix approach: Keep both timers in refs, clear before reuse and in an effect cleanup.
- Effort: S | Depends on: none

### BUG-099: Broken-image fallbacks missing on Avatar and three section images
- Location: frontend/src/components/Avatar.tsx:34-47 (no onError: a dead avatar URL shows the broken-image glyph everywhere instead of the initial fallback); sections/StorySection.tsx:37-45, AuthorContextSection.tsx:26-32, HeadlineFigureSection.tsx:21 (siblings CastSection, OriginSection, AuthorsContextSection, and ContentImage all hide on error; these three do not)
- Severity: Low | Confidence: High | Category: bug (resilience)
- Description: Inconsistent application of the codebase's own onError pattern.
- Impact: Broken-image glyphs in cards, headers, and person cards when storage objects die.
- Fix approach: Add the same onError fallback/hide handler (or route through ContentImage).
- Effort: S | Depends on: none

### BUG-100: PostCard renders raw feed_card values as React children
- Location: frontend/src/app/components/PostCard.tsx:385, :387, :435, :469 ({fc.title as string} etc., where the surrounding code otherwise uses the fcStr narrowing helper)
- Severity: Low | Confidence: Low (requires a non-string value in those keys, which Pydantic does not prevent for non-books formats) | Category: bug (crash)
- Description: A feed_card carrying an object in title/author/name/headline throws "Objects are not valid as a React child" and unmounts the feed.
- Impact: Same one-bad-row feed risk as BUG-008, client-side.
- Fix approach: Use fcStr like the adjacent code.
- Effort: S | Depends on: none

### BUG-101: Absent reading_minutes renders the literal "undefined min"
- Location: frontend/src/app/components/PostCard.tsx:124 (template string over post.reading_minutes); sections/AtAGlanceSection.tsx rows (same interpolation)
- Severity: Low | Confidence: Low (the field is attached on every current endpoint; only stale caches or third-party callers would miss it) | Category: bug (logic)
- Description: The field is typed required and the backend attaches it everywhere, but nothing guards the render.
- Impact: Cosmetic "undefined min" if the contract ever slips.
- Fix approach: post.reading_minutes ?? fallback in the two templates.
- Effort: S | Depends on: none

### BUG-102: SectionRenderer: NaN sort on missing order, null entries crash
- Location: frontend/src/components/SectionRenderer.tsx:108 (a.order - b.order yields NaN for a section without order, an inconsistent comparator that can scramble section order) and :116-119 (a null entry in sections throws on section.content)
- Severity: Low | Confidence: Medium | Category: bug (crash)
- Description: Unknown types are correctly warn+skip; these two structural edges are not covered.
- Impact: Scrambled layout or a page crash on malformed section arrays.
- Fix approach: (a?.order ?? 0) in the comparator and skip falsy entries.
- Effort: S | Depends on: none

### BUG-103: Quiz UI: dead taps while state loads, summary can overcount
- Location: frontend/src/components/sections/QuizSection.tsx:55 versus :89 (the answer guard includes locked but the button's disabled does not, so options look tappable and swallow taps until GET /quiz/state settles; on a hung request the quiz appears broken); :205 and :250 (the summary counts every restored entry, so a stale cached post with fewer questions can show "4/3 correct"; the server filters out-of-range indexes, so this needs a client-side stale post)
- Severity: Low | Confidence: High (first part), Low (second) | Category: bug (logic)
- Description: Two contained quiz presentation defects.
- Impact: Perceived broken quiz on slow connections; nonsense summary in a rare stale-cache case.
- Fix approach: Include locked in disabled (with a subdued style); filter summary results to index < content.length.
- Effort: S | Depends on: none

### BUG-104: BookCover image-failure flag never resets for a new book
- Location: frontend/src/components/BookCover.tsx:77 (useState(false)), :84/:96 (imgFailed forces the generated fallback with no reset when the resolved URL changes)
- Severity: Low | Confidence: Low (requires a reused component instance across different books, which depends on list keying) | Category: bug (state)
- Description: A prior book's failed cover permanently forces the generated cover for a different book rendered by the same instance.
- Impact: Wrong cover tier in reused-list scenarios.
- Fix approach: Reset the flag when the cover URL changes (effect keyed on the URL).
- Effort: S | Depends on: none

### BUG-105: Every card fires GET /likes on mount: N parallel requests per feed load
- Location: frontend/src/app/components/PostCard.tsx:173-188 (per-card fetch on mount); the feed mounts every returned post (page.tsx:120) and GET /api/feed is unpaginated (BE-001)
- Severity: Low | Confidence: High | Category: bug (resilience)
- Description: The whole published corpus's worth of cards each issue a likes request on feed load, repeated per tab and again on saved-posts. Mass failures and 429s feed the NaN path in BUG-069. The scaling side belongs to the perf passes; recorded here because burst failures produce functional wrongness.
- Impact: Request storms whose error responses corrupt visible counts.
- Fix approach: Fetch like counts lazily on intersection (the observer already exists) or carry a fresh count in the list payload.
- Effort: S | Depends on: BE-001/BE-007 (pagination shrinks the burst)

### BUG-106: Search follow toggle swallows failures with no feedback
- Location: frontend/src/app/search/page.tsx:55-73 (DELETE result never checked before setFollowStatus("none"); no catch, so network failures reject out of the click handler; non-ok POST leaves the button unchanged silently)
- Severity: Low | Confidence: High | Category: bug (error-handling)
- Description: Same family as BUG-060, milder because only local row state is touched.
- Impact: The button can show "none" after a failed unfollow; failures give no signal.
- Fix approach: Check r.ok, catch, and toast on failure.
- Effort: S | Depends on: none

### BUG-107: Route username compared without decoding (legacy charsets)
- Location: frontend/src/app/profile/[username]/page.tsx:56-57 and :88 (params.username used raw; useParams returns the percent-encoded segment)
- Severity: Low | Confidence: Low (new usernames are ASCII-only by the register regex; only pre-rule legacy names could contain encodable characters) | Category: bug (logic)
- Description: For an encodable username, isOwnProfile is false on the user's own profile, rendering a Follow button whose tap produces a self-follow 400 with no feedback (BUG-060 family).
- Impact: Broken own-profile detection for legacy names.
- Fix approach: decodeURIComponent the param before use.
- Effort: S | Depends on: none

### BUG-108: BottomNav routes a restoring session to /login
- Location: frontend/src/app/components/BottomNav.tsx:71 (user ? profile : "/login" without consulting the auth loading flag)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Tapping Profile during the session-restore window navigates to /login, which then bounces the restored user to "/" rather than their profile: the tap is misrouted and lost.
- Impact: Confusing first-tap behavior after cold loads.
- Fix approach: Read loading from useAuth and defer or route neutrally until restored.
- Effort: S | Depends on: none

### BUG-109: Chat view minor: forced scroll on new messages, silent metadata fallback
- Location: frontend/src/app/chat/[id]/page.tsx:58-60 (any messages-length change yanks the viewport to the bottom, including an incoming message while the user reads history) and :50-55/:107 (the conversation header/names come from finding the id in the full list; if that lookup fails the header shows "Chat" and group sender labels never render, silently)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Two contained UX-correctness issues in the conversation view.
- Impact: Reading position lost on incoming messages; degraded headers with no signal.
- Fix approach: Auto-scroll only when near the bottom or for own messages; derive is_group/name from the messages response or add a single-conversation endpoint.
- Effort: S | Depends on: none

### BUG-110: Create wizard minor: double-submit window, interest cap mismatch, stale state
- Location: frontend/src/app/create/page.tsx:455-464 (handleSubmit has no re-entrancy guard; two clicks before the re-render both POST, duplicating the post and burning rate budget), :203 (interest cap 5 versus the backend's 1-10: contract mismatch plus a silently ignored sixth tap), :528-543 (state resets only in resetForm: switching formats at step 1 carries essence/teasers/quiz/sources/body authored for the previous format into the new post)
- Severity: Low | Confidence: Medium (the format-switch carryover may be intended as convenience) | Category: bug (logic)
- Description: Three contained wizard issues sharing one file.
- Impact: Occasional duplicate posts; capped interests; accidental cross-format content.
- Fix approach: Early-return on submitting; align or document the cap; confirm intent for cross-format carryover and reset (or prompt) if unintended.
- Effort: S | Depends on: none

### BUG-111: Detail page never resets or aborts on post-id change (latent)
- Location: frontend/src/app/post/[id]/page.tsx:101-163 (no state reset, no AbortController, no stale-response check in the [id] effect; the liked/likesCount useState initializers run once for the first id)
- Severity: Low | Confidence: Medium (currently masked: the only same-page navigation, Read Next, uses a raw anchor at sections/RelatedPostsSection.tsx:45 that forces a full document load, itself bypassing client routing) | Category: bug (race)
- Description: If the component instance ever survives an id change (App Router preserves page state on same-segment param navigation), the old post keeps rendering while the new loads, and a slow old response can overwrite the newer post and comments.
- Impact: Latent today; becomes live the moment Read Next switches to next/link, which it should for performance.
- Fix approach: Reset state and abort in the [id] effect; convert RelatedPostsSection to next/link at the same time.
- Effort: S | Depends on: none

### BUG-112: eventQueue flush listeners on unreliable unload signals
- Location: frontend/src/app/lib/eventQueue.ts:57-61 (visibilitychange listener attached to window, which some older Safari versions do not deliver; beforeunload is often skipped on iOS)
- Severity: Low | Confidence: Low | Category: bug (resilience)
- Description: The last-chance flush can silently never fire on the platforms most likely to need it.
- Impact: Marginal additional event loss on top of BUG-045/BUG-046.
- Fix approach: Listen on document and prefer pagehide.
- Effort: S | Depends on: BUG-046

### BUG-113: Marathon minor: blind retry can double-score, mismatched rating display
- Location: frontend/src/app/components/Marathon.tsx:298-301 (retry replays handleSelect after a failed POST; if the server had committed before the response was lost, the Elo delta applies twice, and the replayed answer_ms recomputes from the original start, losing the time bonus); :511-523 with trainApi.ts:87/:107-109 (eloBefore is the client's session value while eloAfter/delta are server values: the ticker and the delta pill can disagree, off-by-one routinely via rounding, arbitrarily with concurrent activity); :239-247 (the random slider start can land exactly on the correct answer: instant full-time-bonus correct without moving, and in Battle the two clients roll independent starts, randomizing fairness); :331-335 (Next has no busy guard: latent until question loading becomes async); :206-224 (the rating-seed effect keys on the user object identity and can refetch and overwrite the live session rating mid-marathon); :183-185 (lifetimeAnswered claims persistence in comments but resets every mount, so the guest K-factor restarts at K_FAST per visit)
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Six contained defects in the Train marathon, none page-killing, all in one component pair (Marathon + trainApi).
- Impact: Occasional double-scored answers, visibly inconsistent rating animations, and free-answer slider spawns.
- Fix approach: Idempotency key for answer submission (or distinguish network failure from rejection before offering retry); server-provided pre-answer rating for the ticker; exclude answerValue from the random start (or require movement); busy-guard Next; key the seed effect on username and skip reseeding mid-session; persist or re-document lifetimeAnswered.
- Effort: M | Depends on: none

### BUG-114: Battle/slider minor: latent hangs, unguarded commits, two-tab livelock
- Location: frontend/src/app/components/Battle.tsx:245-253 with src/lib/battle/seededQuestions.ts:41-44 (finish gate uses the server count while buildSequence silently slices to the 24-question pool: a count above the pool renders a blank, unfinishable screen; latent at count 7); Battle.tsx:239-243 (numeric Submit has no per-question committed flag, so rapid double activations can emit duplicate progress frames); NumberSlider.tsx:59 and :75-80 (frac unclamped for out-of-range values; any pointer button starts a drag; setPointerCapture unguarded while its release counterpart is guarded); battleSocket.ts:67-71 with battle.py:64-76 (two same-account tabs steal the single server-side socket from each other every 3 seconds, alternating which tab receives battle frames); battle.py:163-169 with Battle.tsx:147-149 (opponent_unavailable conflates offline and busy; the client always says "is not online. Ask them to open the Battle tab.", wrong advice in the busy case, and the fallback renders "@That user")
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Five contained defects across the battle stack, several latent behind current constants.
- Impact: Mostly future-proofing and copy correctness; the two-tab livelock is observable today.
- Fix approach: Gate finish on min(count, seq.length); per-question commit flag; clamp frac and check e.button; distinct close code for "replaced" so the old tab stops reconnecting; add a reason field to opponent_unavailable and branch the copy.
- Effort: M | Depends on: BUG-010 (frame ids), BUG-041 (room lifecycle)

### BUG-115: Friends tab: unchecked HTTP errors crash the whole stats page
- Location: frontend/src/app/stats/page.tsx:2202-2210 (the three me/following fetches: apiFetch(...).then(r => r.json()) with no ok checks), :2230-2251 (per-friend fan-out, same pattern at :2236-2237; the per-friend try/catch at :2248-2250 catches only rejections, not error statuses), :2299 (me resolved with a non-null assertion), crash sites :2460 (totalAnswers: Object.values(p.formats)) and :2580/:2607/:2719/:2733 (breadth/totalAnswers called with me)
- Severity: High | Confidence: High | Category: bug (error-handling)
- Description: FastAPI error bodies are valid JSON, so a 404/429/500 does not reject: r.json() succeeds and the participant object is built with formats/post_count undefined. Three paths end in a render crash: a failed /following makes followingData.slice throw into the outer catch, leaving participants empty with loading false and noFollowing false, so me is undefined despite the assertion; a failed me-side /elo or /profile leaves me.formats undefined; and a failed friend fetch passes the per-friend catch untouched and poisons that participant. All three then throw inside totalAnswers or breadth. The 429 case is realistic: the fan-out fires up to 27 near-simultaneous requests (3 + 12 x 2) against endpoints that share a rate limiter. Even where it does not crash, undefined post_count yields NaN sorts and NaN cells in tables and averages (:2723).
- Impact: Because the page's error boundary wraps everything (BUG-116), one failed request in the Friends fan-out replaces all three stats tabs with "Stats page error". The tab has no error or retry state at all: the outer catch's comment says "leave empty state", but no such state exists for that combination.
- Fix approach: Check r.ok at all five fetch sites (throw so the existing catches engage, or reuse jsonFetcher), add a real error state with retry for the tab, and guard me instead of asserting it.
- Effort: M | Depends on: BUG-005 (same shared helper)

### BUG-116: Stats error boundary is whole-page: one bad chart removes all tabs
- Location: frontend/src/app/stats/page.tsx:27-49 (StatsErrorBoundary) wrapping the entire page container including SegmentedTabs and BottomNav at :2851
- Severity: Medium | Confidence: High | Category: bug (resilience)
- Description: Unlike the rest of the app (BUG-001: no boundaries anywhere), the stats page has a boundary, but at the wrong granularity: a render exception in any single chart or tab (for example BUG-115) replaces the whole page, and the user cannot even switch back to the working Global tab.
- Impact: Every stats render bug is promoted to a full-page outage.
- Fix approach: Add per-tab (or per-CategorySection) boundaries inside the existing page-level one.
- Effort: S | Depends on: none

### BUG-117: Non-verified users render a stray "0" after their username
- Location: frontend/src/app/stats/page.tsx:493, :560, :2364 ({r.is_verified && <span>...</span>} where is_verified is typed number, see line 88)
- Severity: Medium | Confidence: High | Category: bug (logic)
- Description: When is_verified is 0, the numeric && expression evaluates to 0, which React renders as literal text. Every non-verified user in Top Creators by Posts, Top Creators by Likes, and the friends Elo table displays as "username0".
- Impact: Visible corruption in three leaderboards for the default (unverified) user population.
- Fix approach: is_verified > 0 && ... at the three sites.
- Effort: S | Depends on: none

### BUG-118: Ranking gauge headline shows the inverted rank
- Location: frontend/src/app/stats/page.tsx:1858 and :1864 (GaugeChart value={total_users - by_posts + 1}); GaugeChart prints value as the large center text (:286-287, :310-318)
- Severity: Low | Confidence: Medium (the inversion is correct for the arc fill; the displayed number is the bug) | Category: bug (logic)
- Description: Rank #5 of 100 renders a large "96" inside the gauge while the caption directly below says "#5 of 100". An unranked by_posts of 0 displays total_users + 1.
- Impact: Contradictory numbers inside one card of the Personal tab.
- Fix approach: Give GaugeChart a separate display label so the arc keeps the inverted value while the text shows the rank.
- Effort: S | Depends on: none

### BUG-119: Elo leaderboard default variants render blank instead of "No data"
- Location: frontend/src/app/stats/page.tsx:2311-2330 (eloProgressBars) and :2346-2372 (eloTable) map over eloSorted with no empty guard; the sibling variants at :2332 (eloHorizBar) and :2374 (eloScatter) have the length === 0 guard
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: eloSorted filters out null ratings (:2309), so when no participant has answered a quiz yet the default Progress bars variant renders an empty div and the Table variant renders headers with zero rows.
- Impact: The default view of the friends leaderboard looks broken instead of saying "No data yet".
- Fix approach: Apply the same NoData guard the sibling variants use.
- Effort: S | Depends on: none

### BUG-120: Treemaps emit NaN-sized rects on all-zero data
- Location: frontend/src/app/stats/page.tsx:416-417 (TreemapCell guard width <= 0 || height <= 0 lets NaN through, since NaN <= 0 is false); consumers makeTreemap and topByPostsTreemap (:502-514) over posts/comments/likes_by_format and creator lists
- Severity: Low | Confidence: Medium (depends on recharts producing NaN areas for a zero total) | Category: bug (logic)
- Description: For a brand-new platform the by-format dicts are all zeros; cell areas computed as 0/0 are NaN and <rect width={NaN}> is emitted: SVG attribute errors in the console and an invisible chart instead of a No data state.
- Impact: Broken-looking charts precisely in the empty-platform state.
- Fix approach: Guard with !(width > 0) || !(height > 0) and render NoData when all sizes are zero before mounting the Treemap.
- Effort: S | Depends on: none

### BUG-121: CalendarHeatmap month window computed in client-local time
- Location: frontend/src/app/stats/page.tsx:180-184 (12-month window built from new Date() in local time, keyed YYYY-MM) matched against backend period keys computed from stored UTC timestamps
- Severity: Low | Confidence: Medium | Category: bug (logic)
- Description: Around a month boundary (already July in UTC while still June locally, or the reverse) the newest backend period falls outside the client's window: its data silently disappears and the visible current month shows zero.
- Impact: Transiently wrong calendar heatmaps near month boundaries for non-UTC users.
- Fix approach: Derive the window from the maximum period key present in the data instead of the client clock.
- Effort: S | Depends on: none

### BUG-122: Likes-over-time overlay uses one color for both series
- Location: frontend/src/app/stats/page.tsx:1366-1369 (both the likes and posts series pass "#7c6fff"; the comments overlay at :1349-1352 correctly uses two colors)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: A copy-paste slip: the two lines and both legend entries are identical in color, so the Overlay variant of Likes over Time is unreadable.
- Impact: One chart variant conveys nothing.
- Fix approach: Distinct color for the posts series.
- Effort: S | Depends on: none

### BUG-123: Friends comparison silently capped at first 12 followed users
- Location: frontend/src/app/stats/page.tsx:2230 (followingData.slice(0, 12)) and :2732 (the "Friends Following" overview card shows friends.length, the fetched subset)
- Severity: Low | Confidence: High | Category: bug (logic)
- Description: Users following more than 12 people get an arbitrary list-order subset with no truncation indicator; every leaderboard and average is computed over that subset, and the overview card presents the subset size as a fact about the user's network.
- Impact: Silently wrong comparisons for exactly the well-connected users most likely to open the tab.
- Fix approach: Label the truncation in the UI; longer term, a server-side ranked subset (which also shrinks the 27-request fan-out behind BUG-115).
- Effort: S | Depends on: none

### BUG-124: Stats tab staleness: saved count and verification level
- Location: frontend/src/app/stats/page.tsx:2840-2843 (savedCount read once per Personal-tab activation: the first paint after activation flashes the initial 0, and saves made elsewhere in the app stay stale until the tab is left and re-entered); :2218-2226 with effect deps [username] at :2265 (verifiedLevel is read inside the Friends effect but missing from the deps: the checkmark can go stale)
- Severity: Low | Confidence: High | Category: bug (state)
- Description: Two small staleness defects in the tab plumbing.
- Impact: Briefly or persistently wrong Saved Posts count; cosmetic checkmark staleness.
- Fix approach: Read getSavedPostIds().length at render time (cheap and client-only) or subscribe to storage changes; add the missing dependency.
- Effort: S | Depends on: none

### BUG-125: Stats display hardening and dead code
- Location: frontend/src/app/stats/page.tsx:1123-1125 (the hour polar chart indexes activity_by_hour by array position; correct today only because the backend zero-fills all 24 hours, backend/app/routers/stats.py:296, while the sibling Bar/Area variants key on the hour field: a latent coupling); :1876, :1489, :1495-1496 (score.toFixed, Object.entries(data.my_elo.formats), and the my_quiz reads throw if a future backend omits those fields; my_elo.global_rating null itself is handled with a dash); :449 (avg_posts_per_user rendered raw, showing full float precision if the backend ever stops rounding); :338-346 (FormatChip on an unknown format id computes backgroundColor "undefined22", rendering an unstyled chip); :1174 (statusDonut is built but never rendered, and would always yield NoData) and :1484 (the savedCount "dash" branch is unreachable since savedCount is always >= 0)
- Severity: Low | Confidence: Low (none observable under the current contract) | Category: bug (logic)
- Description: A cluster of latent couplings, version-skew hardening gaps, and dead code found during the full pass; recorded so the invariants they rely on are written down somewhere.
- Impact: None today; tripwires for contract drift and for adding an eighth format.
- Fix approach: Index by the hour field, default absent objects at the point of use, round client-side, fall back to DEFAULT_COLOR, delete the dead code.
- Effort: S | Depends on: none

## Coverage notes

- Reviewed: all 15 backend routers and all 14 backend request-path modules; all frontend pages including a dedicated full pass of stats/page.tsx (all ~2900 lines, three tabs, and the inline chart/heatmap/gauge/treemap components: BUG-115 to BUG-125), the full component and section library, all frontend libs including read-aloud, train, and battle. Method: nine parallel read agents (three backend, six frontend), then the coordinating session re-opened the cited lines of every finding above and confirmed each against the actual code. Findings dropped in verification: "register does not trim username" (the backend field validator strips it, routers/auth.py:37); "loadPiper retry race" (behavior is acceptable, duplicate download at worst); the "send before auth_ok loses messages in normal operation" claim was downgraded into BUG-093 because WebSocket frame ordering protects the normal case; "ActivityHeatmap weekday labels may be shifted by one day" (the backend explicitly remaps SQL weekdays to Mon=0 at backend/app/routers/stats.py:18-21, matching the frontend labels exactly); and the hour-polar positional-indexing claim was downgraded into BUG-125 as a latent coupling because the backend provably zero-fills all 24 hours (stats.py:296).
- Not reviewed: mobile/ (out of scope), backend/seed.py, backend/scripts/, backend/tests/ (not on the web request path), tools/, post content JSON, next.config.ts, docs.
- Contract confirmations requested by the backend pass: (1) BE-020: nothing in frontend/src reads post.sections from GET /api/posts/mine (my-posts renders feed_card/title/status only; the only .sections readers operate on GET /api/posts/{id}), so switching /posts/mine to stripped sections is safe for the web app (mobile/ not checked). (2) BE-042: no frontend code reads post.connections (grep-verified; the only hits are an optional type field and the unrelated connections_to_other_fields section type), so dropping it from responses is safe for the web app, and doing so also removes the BUG-008 amplification path.
- Overlap with 03-backend-endpoints.md, re-confirmed at the cited lines and owned by that report: BE-007 (pagination caps), BE-013 (two-commit post/edge write; this pass adds that a client retry after the 500 duplicates the post), BE-014 (_relatent_incoming latent non-person edges), BE-015 (check-then-insert IntegrityError 500s), BE-016 (anonymous like dedup bypass; extended by BUG-029), BE-017 (events rate limit; extended by BUG-031), BE-019 (pending-visibility drift incl. quiz state), BE-030 (search_users limit-before-rank), BE-037 (duplicate post_edges rows), BE-040 (leaderboard status filters), BE-046 (rate limiter process/race/clock; extended by BUG-070), BE-050 (datetime.utcnow).
- Low-confidence items to weigh before batching: BUG-008 and BUG-024 (whether offending legacy rows exist in the live DB is unverifiable from code; a one-off read-only scan of tags/connections/sections shapes would settle both), BUG-009 (is_private product semantics inferred), BUG-012 (deployment topology), BUG-018 (supabase-py internals), BUG-075/BUG-076 (require corrupt rows), BUG-091 (SWR behavior), BUG-100/BUG-101/BUG-104/BUG-107 (need unusual data or reuse patterns), BUG-111 (Next.js param-navigation remount behavior; currently masked), BUG-120 (depends on recharts internals for zero-total treemaps), BUG-121 (needs a month-boundary plus timezone offset to observe), BUG-125 (latent by design, none observable under the current contract).
- Suggested batching seams for fixes: (1) error boundaries + response.ok/error-state vocabulary (BUG-001, 005, 006, 055, 056, and the Low error-handling items); (2) content-render hardening (BUG-002, 003, 004, 065, 082, 102); (3) like/event pipeline (BUG-045, 046, 047, 068, 069, plus backend BUG-029); (4) battle protocol (BUG-010, 011, 038-043, 087, 114); (5) chat correctness (BUG-034-037, 051-054, 084-086, 088, 109); (6) accounts lifecycle (BUG-019-022, 073); (7) image pipeline (BUG-013-018); (8) scoring integrity (BUG-026-032, 078); (9) stats page (BUG-115-125, with BUG-115/116 first since they are the page-killing pair).
