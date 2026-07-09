# Web Review — Backend Endpoints and Queries
Date: 2026-07-06 | Model: Fable 5 | Scope: backend/app (all routers, models, schemas, and request-path helpers)

## Files reviewed

- ARCHITECTURE.md (orientation)
- backend/app/main.py
- backend/app/database.py
- backend/app/models.py
- backend/app/schemas.py
- backend/app/auth.py
- backend/app/rate_limit.py
- backend/app/elo.py
- backend/app/post_counts.py
- backend/app/reading_time.py
- backend/app/scoring.py
- backend/app/graph_identity.py
- backend/app/graph_edges.py
- backend/app/sanitize.py
- backend/app/upload_config.py
- backend/app/routers/feed.py
- backend/app/routers/posts.py
- backend/app/routers/search.py
- backend/app/routers/events.py
- backend/app/routers/comments.py
- backend/app/routers/quiz.py
- backend/app/routers/follows.py
- backend/app/routers/auth.py
- backend/app/routers/admin.py
- backend/app/routers/train.py
- backend/app/routers/interests.py
- backend/app/routers/stats.py
- backend/app/routers/chat.py
- backend/app/routers/battle.py
- backend/app/routers/uploads.py

All findings below were re-verified against the cited lines after drafting. Initial reading was fanned out to four parallel subagent readers; every claim kept in this report was then re-opened and confirmed by the reviewing session itself.

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|----|-------|----------|------------|----------|--------|
| BE-001 | GET /feed loads every published post, no limit or pagination | High | High | perf | L |
| BE-002 | score_posts loads every event row of the last 30 days on every feed request | High | High | perf | M |
| BE-003 | GET /search fetches all published posts and substring-matches in Python | High | High | perf | M |
| BE-004 | Chat websocket runs 4 sequential sync DB round trips per message on the event loop | High | High | perf | M |
| BE-005 | GET /stats/me recomputes global aggregates (all users x events x comments x posts) per request, uncached | High | High | perf | M |
| BE-006 | Followers / following / follow-requests lists are N+1 (one user SELECT per row) | High | High | perf | S |
| BE-007 | No client pagination on any list endpoint; fixed caps make items 51+ unreachable | Medium | High | bug | M |
| BE-008 | reading_minutes recomputed by a full recursive JSON walk per post per request | Medium | High | perf | M |
| BE-009 | List endpoints fetch the full sections JSON from the DB only to serialize it as [] | Medium | High | perf | M |
| BE-010 | /stats/global time-series queries scan all-time data with no date bound; function-on-column grouping defeats indexes | Medium | High | perf | M |
| BE-011 | upload_svg is async def doing defusedxml + lxml parsing on the event loop | Medium | High | perf | S |
| BE-012 | Battle websocket runs sync DB queries on the event loop (auth + challenge) | Medium | High | perf | S |
| BE-013 | Post write commits twice (post, then edges); crash between them leaves a published post with no edges | Medium | High | bug | M |
| BE-014 | _relatent_incoming stores latent non-person edges the module invariant says can never exist | Medium | High | bug | S |
| BE-015 | Check-then-insert races on unique constraints return 500 instead of 4xx | Medium | High | bug | S |
| BE-016 | Anonymous like events bypass all dedup and inflate like counts without bound | Medium | High | bug | S |
| BE-017 | POST /api/events has no rate limit; unbounded events growth feeds the scans in BE-002/BE-010 | Medium | High | perf | S |
| BE-018 | Connection pool left at defaults (5+10) for remote Supabase; bursts pay fresh TLS connects | Medium | Medium | perf | S |
| BE-019 | Pending-post visibility rule duplicated 3x and missing in GET /quiz/state | Medium | High | duplication | S |
| BE-020 | GET /posts/mine returns full sections for every post the user ever wrote, unbounded | Medium | Medium | bloat | S |
| BE-021 | Model-vs-live-DB schema drift risk: create_all never alters existing tables, no migration tool | Medium | Low | architecture | M |
| BE-022 | /stats/global cache has no in-flight guard: expiry stampede reruns 18 queries concurrently | Low | High | perf | S |
| BE-023 | GET /feed uses a redundant two-step fetch (id query, then unbounded IN re-fetch) | Low | High | perf | S |
| BE-024 | Following feed loads full Follow ORM rows when only following_id is needed; unbounded IN | Low | High | perf | S |
| BE-025 | create_post ends with a re-fetch plus two guaranteed-zero count queries | Low | High | perf | S |
| BE-026 | create_comment issues up to 3 post-commit queries to serialize data already in hand | Low | High | perf | S |
| BE-027 | elo_summary re-queries a User row the caller already holds (quiz, train, stats, elo endpoints) | Low | High | perf | S |
| BE-028 | get_profile runs follow_status as a separate query; _is_following has diverging semantics | Low | High | duplication | S |
| BE-029 | create_conversation queries per username and per target in loops (bounded at 19) | Low | High | perf | S |
| BE-030 | search_users applies LIMIT 20 before the prefix-first ranking; leading-wildcard ilike is unindexable | Low | High | bug | S |
| BE-031 | Eager-load option pair copy-pasted at 7 call sites | Low | High | duplication | S |
| BE-032 | username-to-User 404 lookup duplicated across 4 files | Low | High | duplication | S |
| BE-033 | Near-duplicate blocks: following/user feed queries, followers/following privacy gate, accept/reject handlers | Low | High | duplication | S |
| BE-034 | Edge rebuild is unconditional delete+reinsert churn on every post write | Low | High | perf | S |
| BE-035 | synchronize_session="fetch" adds an unneeded extra SELECT to 4 bulk edge statements | Low | High | perf | S |
| BE-036 | _resolve_live_targets builds an unbounded OR clause (2 bind params per connection) | Low | High | perf | S |
| BE-037 | post_edges has no uniqueness constraint; duplicate authoring entries create duplicate edge rows | Low | Medium | bug | S |
| BE-038 | Index gaps: comments (post_id, created_at), messages (conversation_id, id), conversations.created_by | Low | High | perf | S |
| BE-039 | Redundant indexes: Follow.id, QuizAnswer.user_id, ConversationParticipant.conversation_id | Low | High | bloat | S |
| BE-040 | Stats top-creators leaderboards inconsistently filter status='published' | Low | High | bug | S |
| BE-041 | /stats/me loads every published-post timestamp of the user into Python | Low | High | perf | S |
| BE-042 | Raw connections array serialized in every post response; frontend consumes only read_next | Low | Medium | bloat | S |
| BE-043 | UserOut includes email unconditionally; admin verify returns another user's UserOut | Low | Medium | bloat | S |
| BE-044 | Quiz-answer stripping re-runs per request; on list endpoints its interaction with drop_sections is order-dependent | Low | Medium | perf | S |
| BE-045 | Dead second sort-key element in search ranking; ordering relies on comment-carried stable-sort assumption | Low | High | bloat | S |
| BE-046 | Rate limiter is per-process, lock-free (small over-admission race), and uses naive utcnow().timestamp() | Low | High | bug | S |
| BE-047 | list_comments count mode compiles to a subquery-wrapped COUNT | Low | High | perf | S |
| BE-048 | BaseHTTPMiddleware body-cap wrapper adds per-request overhead to every route including /health | Low | Medium | perf | S |
| BE-049 | get_current_user costs one remote users SELECT on every authenticated request | Low | High | perf | M |
| BE-050 | datetime.utcnow() used throughout (deprecated since Python 3.12) | Low | High | bug | S |

## Findings

### BE-001 — GET /feed loads every published post, no limit or pagination
- Location: backend/app/routers/feed.py:37-43
- Severity: High
- Confidence: High
- Category: perf
- Description: `id_base = db.query(Post.id).filter(Post.status == "published")` (line 37) has no limit, and `_fetch_posts` (lines 16-24) then loads the full rows — including the `feed_card` and `sections` JSON columns — for every id. The comment at lines 41-42 states this is deliberate: "For You always shows every published post ... Fetch all of them once." The whole set is scored in Python (`score_posts`) and returned in one response.
- Impact: Every feed request transfers the entire published corpus (with full section bodies) from the remote Supabase DB, hydrates it into ORM objects, walks all of it for reading time (BE-008), scores it (BE-002), serializes all of it, and ships the whole list to the client. Cost is linear in total published posts per request. With a content pipeline generating posts continuously, this is the single biggest scalability cliff on the read path.
- Fix approach: Introduce server-side pagination (see BE-007) and cap the response. The random jitter in scoring (scoring.py:93) makes ordering non-deterministic across requests, so plain offset paging would duplicate/skip items — a seeded jitter (per user/session) or a stable sort key is a prerequisite. Alternatively cap the feed at a fixed window (e.g. top N by score) as a stopgap.
- Effort: L
- Depends on: BE-002 (shares the scoring redesign), BE-007

### BE-002 — score_posts loads every event row of the last 30 days on every feed request
- Location: backend/app/scoring.py:37-42 (called from feed.py:45 and feed.py:71)
- Severity: High
- Confidence: High
- Category: perf
- Description: `score_posts` issues one query returning every `(post_id, event_type, duration_ms, format)` tuple for all events in the last 30 days — site-wide, not per-user (the TODO at lines 29-30 admits per-user filtering is future work). The per-format aggregation (lines 44-70) and per-post view counts are then computed as Python folds over the raw rows. This runs on every GET /feed call, including the no-interests branch (feed.py:45).
- Impact: Cost grows linearly with total platform activity, independent of the requesting user or feed size. Combined with BE-017 (events table can be grown without limit by unauthenticated clients), this is a second unbounded per-request scan on the hottest endpoint.
- Fix approach: Replace the raw-row fetch with a SQL `GROUP BY` returning a handful of aggregate rows (per format: avg view duration + like count; per post: view count), or precompute/cached engagement aggregates on an interval. Direction only, no redesign of the scoring formula needed.
- Effort: M
- Depends on: none

### BE-003 — GET /search fetches all published posts and substring-matches in Python
- Location: backend/app/routers/search.py:70-88
- Severity: High
- Confidence: High
- Category: perf
- Description: The endpoint loads every published post — full rows with eager-loaded interests and author, ordered by created_at, no LIMIT (line 78) — then filters in Python via `_post_matches` (lines 24-53), which walks title, feed_card fields, and section content per post. The 50-item cap (line 87) is applied after the full scan, so it bounds the response, not the work. The docstring (lines 26-30) acknowledges this as an accepted small-scale tradeoff. Mitigations present: 100-char query cap (line 64) and a 60/min rate limit (line 66).
- Impact: Every search request costs a full-table fetch of all published posts (JSON columns included) plus a full-corpus Python scan. Grows linearly with content volume; at pipeline-generated scale this and BE-001 are the two whole-corpus-per-request endpoints.
- Fix approach: PostgreSQL full-text search (tsvector column or expression index) or pg_trgm for the current substring semantics, with the filter and LIMIT applied in SQL. The code comment already names this direction.
- Effort: M
- Depends on: none

### BE-004 — Chat websocket runs 4 sequential sync DB round trips per message on the event loop
- Location: backend/app/routers/chat.py:351-374 (message send), chat.py:407-411 (connection auth)
- Severity: High
- Confidence: High
- Category: perf
- Description: `_handle_send` is `async def` but uses the sync `SessionLocal()` directly on the event loop thread: participant check (line 354), `db.add` + `db.commit()` (lines 358-359), a re-SELECT of the message with `selectinload(Message.sender)` (lines 360-365), and a participants SELECT (lines 366-371). The websocket auth path does the same for the user lookup (lines 407-411). Unlike the sync `def` REST handlers (which FastAPI runs in a threadpool), these calls block the event loop itself.
- Impact: Every chat message stalls the entire async loop — all open websockets (chat and battle) and any other async work — for 4 sequential remote-DB round trips (likely 100ms+ total against Supabase). Under any real chat concurrency this serializes all websocket traffic.
- Fix approach: Run the DB block in a worker thread (`anyio.to_thread.run_sync` / `run_in_executor`), or move chat persistence to an async session. The short-lived-session-per-event structure (comment at line 350) is already the right shape for wrapping.
- Effort: M
- Depends on: none

### BE-005 — GET /stats/me recomputes global aggregates per request, uncached
- Location: backend/app/routers/stats.py:597-629 (also 384-399, 642-648)
- Severity: High
- Confidence: High
- Category: perf
- Description: The `extras_row` raw-SQL statement computes, per request: two global ranking subqueries grouping all published posts and all like events by author (lines 600-609), and a `max_engagement_score` subquery LEFT-JOINing three full aggregations (all like events, all comments, all published posts, each grouped by author) against all users (lines 611-622). The result depends only marginally on the requesting user, yet unlike /stats/global there is no cache. The endpoint issues ~15 statements total per request.
- Impact: The most expensive uncached statement in the backend, and its cost is independent of the requesting user — it grows with total users x events x comments. The frontend prefetches the /stats route from the nav dock, so this fires often.
- Fix approach: Cache the global components (max engagement score, total users, ranking distributions) with the same short-TTL in-process pattern /stats/global already uses, keeping only the genuinely per-user subqueries per request. Add a date bound where applicable.
- Effort: M
- Depends on: none

### BE-006 — Followers / following / follow-requests lists are N+1
- Location: backend/app/routers/follows.py:149-153, 169-173, 185-197 (relationships at backend/app/models.py:155-156)
- Severity: High
- Confidence: High
- Category: perf
- Description: All three endpoints query `Follow` rows without eager-loading the user relationship, then access it per row: `FollowUserOut.model_validate(f.follower)` (line 153), `model_validate(f.following)` (line 173), and `f.follower.username / .is_verified / .avatar_url` (lines 191-193). `Follow.follower` / `Follow.following` (models.py:155-156) are default `lazy="select"`, so each distinct user costs one extra SELECT. comments.py:81 shows the codebase already knows the fix (`selectinload(Comment.user)`).
- Impact: A user with N followers costs ~N+1 remote round trips (each tens of ms against Supabase) — 500 followers is a multi-second request occupying a threadpool slot. Compounded by the lists being unbounded (BE-007).
- Fix approach: Add `.options(selectinload(Follow.follower))` (resp. `.following`) to the three queries, or select the User columns directly via a join.
- Effort: S
- Depends on: none

### BE-007 — No client pagination on any list endpoint; fixed caps make items 51+ unreachable
- Location: backend/app/routers/feed.py:37-43 (no limit), feed.py:93 and feed.py:113 (fixed limit 50), backend/app/routers/posts.py:49-55 (no limit), backend/app/routers/search.py:87 (post-scan cap 50), search.py:106 (fixed limit 20), backend/app/routers/follows.py:149-152, 169-172, 185-188 (no limit), backend/app/routers/comments.py:78-84 (no limit)
- Severity: Medium
- Confidence: High
- Category: bug
- Description: No REST list endpoint accepts a page/cursor/offset parameter. Three shapes coexist: (a) unbounded — /feed, /posts/mine, followers, following, follow-requests, comments; (b) fixed silent caps — /feed/following and /feed/user (50), /search (50 post-hoc), /search/users (20): items beyond the cap are unreachable by any request; (c) the one correct implementation — chat message history uses keyset pagination (`before_id`, chat.py:254-262) with a clamped limit (chat.py:253). Note the /feed ordering jitter (scoring.py:93) makes naive offset paging incorrect (duplicates/skips across requests).
- Impact: Unbounded lists are a latency and memory cliff (especially combined with BE-006); capped lists silently truncate — the 51st post of a followed author or the 21st matching user can never be shown.
- Fix approach: Adopt the chat keyset pattern (`before_id` + clamped limit) for comments, followers/following, and the two 50-capped feeds; for /feed itself pair pagination with a stable ordering (see BE-001).
- Effort: M
- Depends on: BE-001 (for /feed specifically)

### BE-008 — reading_minutes recomputed by a full recursive JSON walk per post per request
- Location: backend/app/reading_time.py:24-55, called at backend/app/post_counts.py:56
- Severity: Medium
- Confidence: High
- Category: perf
- Description: `compute_reading_minutes` recursively walks every dict/list/string in a post's sections (`_collect`, lines 24-38) and word-counts the result (line 54). `attach_counts` calls it for every post in every list response (post_counts.py:56). The value is computed correctly — from the raw ORM sections BEFORE `PostListOut.drop_sections` and `strip_quiz_answers` run (verified: attach happens in the router, Pydantic validators run at serialization; reading_time.py:45-46 documents the invariant) — so the number on feed cards is real, not broken by the strip. The cost is the issue, not the correctness.
- Impact: Since GET /feed returns all published posts (BE-001), every feed request re-tokenizes the entire published text corpus in Python. CPU cost linear in total content volume, repeated per request, never cached. It is also the reason list queries cannot defer the sections column (BE-009).
- Fix approach: Compute reading_minutes once on write and store it on the posts row (same pattern as `identity_key`, posts.py:91), with the seed upsert refreshing it. Keep `compute_reading_minutes` as the single source, just move the call site to write time.
- Effort: M
- Depends on: none

### BE-009 — List endpoints fetch the full sections JSON from the DB only to serialize it as []
- Location: backend/app/routers/feed.py:19-24, 43 (full-row fetch); backend/app/schemas.py:423-426 (drop_sections)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: All three feed endpoints and /search load complete Post rows including the `sections` column, then `PostListOut.drop_sections` (schemas.py:423-426) discards the data at serialization. The bytes cross the DB wire and pay ORM/JSON hydration for nothing the client receives. The over-fetch cannot be removed today with `defer(Post.sections)` because `attach_counts` reads `p.sections` per post for reading time (post_counts.py:56) — deferring would turn that into one lazy SELECT per post (a manufactured N+1).
- Impact: DB egress and hydration cost per feed/search request proportional to total corpus size, on top of BE-001. Sections are by far the largest column on the row.
- Fix approach: After BE-008 (stored reading_minutes), add `defer(Post.sections)` (or select explicit columns) on the four list queries. Response shape is unchanged — `sections: []` stays.
- Effort: M
- Depends on: BE-008

### BE-010 — /stats/global time-series queries scan all-time data with no date bound
- Location: backend/app/routers/stats.py:199-238 (four over-time series), 300-309 (likes by post month), 264-276 (heatmap)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: `posts_over_time`, `users_over_time`, `comments_over_time`, `likes_over_time` and `_likes_by_post_month` all `GROUP BY to_char(created_at, 'YYYY-MM')` over the entire table, then `_fill_months` (lines 60-63) discards everything outside the last 12 months in Python. `likes_over_time` scans every like event ever. Grouping on `to_char(...)`/`strftime(...)` is a function of the column, so the plain `created_at` indexes cannot be used for it. On a cache miss the endpoint issues 18 statements total (the comment at line 76 says ~16).
- Impact: Bounded today by the 60s cache (line 87), but each cache miss costs full-table scans that grow without bound as events/comments accumulate (again compounded by BE-017).
- Fix approach: Add `WHERE created_at >= (12 months ago)` to each series query; that alone bounds the scans and lets the created_at indexes prune. The heatmap is inherently all-time by design — consider bounding it too or accepting it consciously.
- Effort: M
- Depends on: none

### BE-011 — upload_svg is async def doing defusedxml + lxml parsing on the event loop
- Location: backend/app/routers/uploads.py:43-55; backend/app/sanitize.py:134-215
- Severity: Medium
- Confidence: High
- Category: perf
- Description: `upload_svg` is `async def` (uploads.py:43). The file read is properly async (sanitize.py:125), but `sanitize_svg_text` then runs synchronously in the async context: a defusedxml parse (line 137), a full lxml parse (lines 143-144), three complete tree traversals (lines 153, 171, 181), and re-serialization (lines 214-215), over up to 512 KB of XML (upload_config.py:7). Contrast with `upload_image`, which is deliberately sync `def` so Pillow work runs in the threadpool (uploads.py:19, sanitize.py:55-58).
- Impact: Each SVG upload blocks the event loop for the full CPU-bound sanitization — stalling all websockets and async work. The 10/hour rate limit caps volume, not per-call stall length.
- Fix approach: Make the endpoint sync `def` (read via `file.file` like validate_image) so it runs in the threadpool, matching upload_image's documented pattern; or push `sanitize_svg_text` through a thread executor.
- Effort: S
- Depends on: none

### BE-012 — Battle websocket runs sync DB queries on the event loop
- Location: backend/app/routers/battle.py:219-224 (auth lookup), battle.py:147-153 (challenge target lookup)
- Severity: Medium
- Confidence: High
- Category: perf
- Description: Same class as BE-004: `async def battle_websocket` and `async def _handle_challenge` call the sync `SessionLocal()` query path directly on the loop thread — one blocking round trip per connection auth and per challenge frame.
- Impact: Lower frequency than chat sends, but identical mechanism: each call stalls the whole event loop for a remote round trip.
- Fix approach: Same as BE-004 (thread executor or async session); fix both routers together.
- Effort: S
- Depends on: BE-004 (same fix pattern)

### BE-013 — Post write commits twice; crash between them leaves a published post with no edges
- Location: backend/app/routers/posts.py:100 and 106; backend/app/graph_edges.py:199-213
- Severity: Medium
- Confidence: High
- Category: bug
- Description: `create_post` commits the post row (posts.py:100), then calls `on_post_written` (posts.py:106), which rebuilds/activates edges and issues its own `db.commit()` (graph_edges.py:213). If the process dies or an exception is raised between the two commits, a published post exists with no outgoing edge rows and no activation of latent edges pointing at it; nothing repairs this until the post is next written (a re-seed fixes seed content; user posts stay inconsistent). Secondary: because `on_post_written` commits the caller's session, it also commits any unrelated pending state a future caller might have — a transactional footgun.
- Impact: A rare but silent correctness gap in the derived layer: read_next is computed from the authoring layer at read time (graph_edges.py:228-266), so the detail page still works, but the edge table (and anything that later consumes it) is missing rows, and latent edges that should point at the new post stay latent.
- Fix approach: Derive edges in the same transaction as the post write — call rebuild/activate before the single commit and remove the commit from `on_post_written` (let callers own the transaction). The seed's call sites would need the same adjustment.
- Effort: M
- Depends on: none

### BE-014 — _relatent_incoming stores latent non-person edges the module invariant says can never exist
- Location: backend/app/graph_edges.py:139-147 (vs the rule at graph_edges.py:43-54 and the docstring at 155-159), triggered from on_post_written (line 212) and on_post_deleted (line 223)
- Severity: Medium
- Confidence: High
- Category: bug
- Description: The module's stated invariant is that only person edges may be stored latent; a non-person edge whose target does not resolve is "discarded silently ... never stored latent" (rebuild docstring, lines 155-159; `_latent_allowed`, lines 43-54). But `_relatent_incoming` sets `target_post_id = NULL` on every incoming edge regardless of `target_format`. When a books/concepts/etc. target is unpublished or deleted, its incoming non-person edges become exactly the latent non-person rows the invariant forbids, and they persist until each source post is next rewritten. Downstream effects are contained (resolved_read_next reads the authoring layer and re-applies `_latent_allowed`; `unmatched_latent_edges` excludes pairs matching an existing post — though after a hard delete no post matches, so those rows would surface in the drift report as noise).
- Impact: Table state contradicts the documented invariant; the unmatched-edges report can show false "drift" entries after deletions; any future consumer that trusts the invariant will mis-read these rows. Possibly intentional (keeping the row lets activate_edges_for re-point it on re-publish, which deletion would not) — but then the docstring is wrong, not the code.
- Fix approach: Decide the invariant: either delete incoming non-person edges in `_relatent_incoming` (keep only person edges latent), or amend the module docstring/`_latent_allowed` commentary to document the unpublish/delete exception.
- Effort: S
- Depends on: none

### BE-015 — Check-then-insert races on unique constraints return 500 instead of 4xx
- Location: backend/app/routers/follows.py:64-74; backend/app/routers/auth.py:67-79, 170-181; backend/app/routers/quiz.py:78-107
- Severity: Medium
- Confidence: High
- Category: bug
- Description: Four write paths do a SELECT-then-INSERT with no `IntegrityError` handling: follow_user (unique `uq_follow`, models.py:145), register (unique email/username, models.py:120-121), patch_me username change, and answer_quiz_question (unique `uq_quiz_answer`, models.py:167). Two concurrent requests both pass the pre-check; the second commit violates the constraint and surfaces as an unhandled 500. (For quiz, the Elo mutation rolls back with the same transaction, so there is no double-scoring — the client just sees a 500.)
- Impact: Double-click or retry storms produce spurious 500s where the intended 400 ("Already following" / "Username already taken" / replay) exists one code path away.
- Fix approach: Keep the pre-checks for friendly errors, wrap the commit in `try/except IntegrityError` with rollback and return the same 4xx. One shared helper would cover all four sites.
- Effort: S
- Depends on: none

### BE-016 — Anonymous like events bypass all dedup and inflate like counts without bound
- Location: backend/app/routers/events.py:43 (dedup gated on `if optional_user`), events.py:63 (batch dedup gated the same), events.py:94-110 (counts include user_id NULL rows)
- Severity: Medium
- Confidence: High
- Category: bug
- Description: The stored-likes dedup query (lines 48-56) and the in-batch dedup (lines 63-67) both run only for authenticated callers. Anonymous like events are stored unconditionally with `user_id=None` (line 72), and `get_likes` (and `attach_counts`' like aggregation, post_counts.py:41-46) count all like rows for the post. Repeated anonymous batches therefore inflate a post's like count arbitrarily. Related: even for authenticated users the dedup is advisory only — there is no unique constraint on `(user_id, post_id, event_type)`, so two concurrent batches can double-store a like silently.
- Impact: like_count — an aggregate served on every feed card and the likes endpoint — is not trustworthy under anonymous or concurrent traffic. Also grows the events table (see BE-017). The abuse dimension belongs to the security pass; the count-correctness dimension is this pass's.
- Fix approach: Decide whether anonymous likes are a real feature; if yes, dedup them by some identity (or don't count them in like_count); if no, require auth for like events. For authenticated likes, a partial unique index on `(user_id, post_id)` where `event_type='like'` would make dedup structural.
- Effort: S
- Depends on: none

### BE-017 — POST /api/events has no rate limit; unbounded events growth feeds the hot-path scans
- Location: backend/app/routers/events.py:15-23
- Severity: Medium
- Confidence: High
- Category: perf
- Description: The only guard is the 50-events-per-batch cap (line 22). The endpoint is writable without authentication and, unlike every other write endpoint in the codebase, never calls `check_rate_limit`. A client can loop batches indefinitely.
- Impact: In this pass's terms: the events table is the input to score_posts' per-request 30-day scan (BE-002), the stats scans (BE-010, BE-005), and attach_counts' like aggregation — all of which degrade linearly as events accumulate. Unbounded, unauthenticated table growth directly worsens every feed request. (The abuse framing itself belongs to the security pass.)
- Fix approach: Add the same `check_rate_limit` used elsewhere (per user id or per IP for anonymous), and consider a retention/rollup policy for old view events.
- Effort: S
- Depends on: none

### BE-018 — Connection pool left at defaults for remote Supabase
- Location: backend/app/database.py:13-30
- Severity: Medium
- Confidence: Medium
- Category: perf
- Description: `_engine_kwargs` sets only `pool_recycle: 1200` and `connect_timeout: 10`; `pool_size`/`max_overflow` stay at SQLAlchemy defaults (5 persistent + 10 overflow). Overflow connections are closed on release, so any burst beyond 5 concurrent DB users pays a fresh TCP+TLS+auth handshake to Supabase per request — the code's own comment (lines 17-18) documents that even one extra round trip (~35ms) was measurable, and a full connect is far worse. FastAPI's default threadpool (~40 threads) can easily exceed 15 total connections under load, at which point requests block waiting for the pool.
- Impact: Latency spikes and pool-wait stalls under moderate concurrency; each slow endpoint (BE-001/003/005) holds a connection longer, compounding it.
- Fix approach: Set an explicit `pool_size`/`max_overflow` matched to the deployment (and Supabase's connection limits / pgbouncer setup); revisit after the slow endpoints shrink their hold times.
- Effort: S
- Depends on: none

### BE-019 — Pending-post visibility rule duplicated 3x and missing in GET /quiz/state
- Location: backend/app/routers/comments.py:21-22, backend/app/routers/events.py:89-90, backend/app/routers/quiz.py:50-51 (present); backend/app/routers/quiz.py:119-121 (missing)
- Severity: Medium
- Confidence: High
- Category: duplication
- Description: The two-line rule "pending posts 404 unless the caller is the author" is hand-copied in three places, and the fourth place that needs it — `get_quiz_state` — only checks `if not post: 404`. The drift is the proof of the duplication cost: an authenticated user gets 200 `{"answers": []}` for someone else's pending post id versus 404 for a nonexistent id (the exact existence oracle events.py:26-27 documents closing).
- Impact: Maintenance drift has already produced one inconsistent endpoint; every future post-scoped endpoint risks repeating it. (The oracle consequence itself is the security pass's to weigh.)
- Fix approach: Extract one `get_visible_post(post_id, db, user)` dependency/helper (comments.py's `_get_visible_post` is the template) and use it in comments, events, and both quiz endpoints.
- Effort: S
- Depends on: none

### BE-020 — GET /posts/mine returns full sections for every post the user ever wrote, unbounded
- Location: backend/app/routers/posts.py:44-56
- Severity: Medium
- Confidence: Medium
- Category: bloat
- Description: The endpoint uses `response_model=List[PostOut]` (line 44) — not `PostListOut` — so full section bodies are serialized (quiz answers stripped), and the query has no limit (lines 49-55). Per ARCHITECTURE.md, the my-posts page renders only row-level data (cover, title, badges, timestamps), never sections.
- Impact: A prolific author's dashboard response carries every section body of every post they ever wrote — the largest possible response the API can produce, growing forever. Confidence Medium only on frontend intent (the frontend pass should confirm nothing reads sections here).
- Fix approach: Switch to `List[PostListOut]` and add pagination (BE-007 pattern). One-line schema change if the frontend confirms.
- Effort: S
- Depends on: BE-007

### BE-021 — Model-vs-live-DB schema drift risk: create_all never alters existing tables
- Location: backend/app/main.py:19; backend/app/models.py:99-103 (comment), 32-52 (columns added via manual scripts)
- Severity: Medium
- Confidence: Low
- Category: architecture
- Description: Startup runs `Base.metadata.create_all` (main.py:19), which creates missing tables but never adds columns or indexes to existing ones — the models.py comments and the backend/scripts/add_*.py one-shot scripts exist precisely because of this. Consequently, any index or column declared in models.py after a table already existed on the live Supabase DB (e.g. `ix_posts_author_id` if posts predates it) may be absent in production, and nothing in the codebase can confirm or deny it.
- Impact: The index inventory below describes the model, not necessarily the live database; a "present" index that is actually missing in production silently changes every query plan that depends on it. Confidence Low because live-DB state is unverifiable from code.
- Fix approach: Verify the live schema once against models.py (a read-only introspection script in the existing scripts/ pattern), and adopt a migration tool (Alembic) before launch so drift stops accumulating.
- Effort: M
- Depends on: none

### BE-022 — /stats/global cache has no in-flight guard: expiry stampede
- Location: backend/app/routers/stats.py:79-88, 370
- Severity: Low
- Confidence: High
- Category: perf
- Description: The cache read and swap are single tuple assignments — atomic under the GIL, so the comment at lines 74-78 is right that no lock is needed for consistency. But there is no in-flight marker: at every 60s expiry, all concurrent requests observe the stale timestamp and each reruns the full 18-query pipeline in parallel threadpool threads; last writer wins. Also per-process: N workers hold N independent caches.
- Impact: Periodic bursts of redundant full-scan query storms against the remote DB, worst exactly when traffic is high.
- Fix approach: A simple "refresh in progress" flag (serve stale while one thread refreshes), or a small lock around the rebuild only.
- Effort: S
- Depends on: none

### BE-023 — GET /feed uses a redundant two-step fetch
- Location: backend/app/routers/feed.py:35-43
- Severity: Low
- Confidence: High
- Category: perf
- Description: The endpoint first queries only `Post.id` (line 37), then `_fetch_posts` re-fetches full rows for the identical set via `Post.id.in_(ids)` (lines 19-24) with no additional narrowing. Two round trips where one query with the same filters would do, plus an `IN` clause whose bind-parameter count equals the entire published-post count (drivers/DBs cap parameter counts; PostgreSQL's limit is 65535).
- Impact: One extra remote round trip per feed request and a statement that grows with corpus size; the parameter cap is a latent hard failure at very large post counts.
- Fix approach: Apply the status/format filters directly in the eager-loading query. (Likely subsumed by the BE-001 pagination work.)
- Effort: S
- Depends on: BE-001

### BE-024 — Following feed loads full Follow ORM rows for ids; unbounded IN
- Location: backend/app/routers/feed.py:79-85, 91
- Severity: Low
- Confidence: High
- Category: perf
- Description: `db.query(Follow).filter(...)` materializes whole Follow objects only to read `row.following_id` (line 80). `db.query(Follow.following_id)` would fetch one column. The subsequent `Post.author_id.in_(following_ids)` (line 91) is unbounded in list size.
- Impact: Cosmetic today; a user following tens of thousands of accounts loads that many ORM rows and binds that many parameters.
- Fix approach: Column-only query; optionally a join instead of the IN list.
- Effort: S
- Depends on: none

### BE-025 — create_post ends with a re-fetch plus two guaranteed-zero count queries
- Location: backend/app/routers/posts.py:108-114
- Severity: Low
- Confidence: High
- Category: perf
- Description: After commit and `on_post_written`, the handler re-fetches the post with eager loads (lines 108-113 — defensible for serialization) and then `attach_counts_one` (line 114) runs the likes and comments GROUP BY queries for a post that was created milliseconds ago and has zero of both by construction. It also recomputes reading_minutes, which is the one attached value actually needed.
- Impact: Two wasted remote round trips per post creation. Rate-limited to 20/day/user, so negligible — recorded for completeness.
- Fix approach: Set like_count/comment_count to 0 directly on the create path and attach reading_minutes/primary_category_name without the count queries.
- Effort: S
- Depends on: none

### BE-026 — create_comment issues up to 3 post-commit queries to serialize data already in hand
- Location: backend/app/routers/comments.py:98-109
- Severity: Low
- Confidence: High
- Category: perf
- Description: After `db.commit()`, accessing `comment.id` (line 106) triggers a refresh SELECT (the instance is expired by commit), then the handler runs a fresh SELECT with `selectinload(Comment.user)` (2 statements). The user is `current_user`, already loaded in the session.
- Impact: Up to 3 extra remote round trips per comment post (30/5min per user, so bounded).
- Fix approach: `db.refresh(comment)` once and build `CommentOut` from `comment` + `current_user` fields directly.
- Effort: S
- Depends on: none

### BE-027 — elo_summary re-queries a User row the caller already holds
- Location: backend/app/elo.py:85-95 (line 92); call sites backend/app/routers/quiz.py:32 (via _elo_payload, used at 88/109), quiz.py:149, backend/app/routers/train.py:44, backend/app/routers/stats.py:566
- Severity: Low
- Confidence: High
- Category: perf
- Description: `elo_summary(db, user_id)` always issues `db.query(User).filter(User.id == user_id).first()`. In quiz answers and train answers the handler holds `current_user` (same session); in `get_user_elo` the handler fetched the same user two lines earlier (quiz.py:146); in stats/me the user is the authenticated caller.
- Impact: One redundant remote round trip on every scored quiz answer, every train answer, every elo view, every stats/me request.
- Fix approach: Accept the `User` object (or read `user.knowledge_rating` directly) instead of the id; keep the id variant only where no object is in hand.
- Effort: S
- Depends on: none

### BE-028 — get_profile runs follow_status separately; _is_following semantics diverge
- Location: backend/app/routers/follows.py:210-235 (counts vs status), 44-49 (_is_following)
- Severity: Low
- Confidence: High
- Category: duplication
- Description: The counts are correctly merged into one multi-subselect round trip (lines 210-221), but the viewer's follow_status is a separate ORM query (lines 231-235) that could be a fourth subselect. Additionally, two similar-looking follow lookups have different semantics: `_is_following` requires `status == "accepted"` (line 48) while the profile status check reads any status — correct for their respective uses, but ripe for misuse without naming/sharing.
- Impact: One extra round trip per profile view; a latent misuse trap.
- Fix approach: Fold follow_status into the raw-SQL round trip; name the two helpers to encode their semantics (e.g. `has_accepted_follow` vs `follow_status`).
- Effort: S
- Depends on: none

### BE-029 — create_conversation queries per username and per target in loops
- Location: backend/app/routers/chat.py:169-176 (user lookup per username), 180-185 (_can_message per target)
- Severity: Low
- Confidence: High
- Category: perf
- Description: One `db.query(User)` per requested username and one follow-existence query per target. Bounded at 19 members (GROUP_MAX_MEMBERS) and rate-limited 20/hour, so worst case ~38 statements plus the DM-dedup queries (lines 192-218).
- Impact: A group-create can cost dozens of sequential remote round trips — seconds of latency — but is rare and bounded.
- Fix approach: One `User.username.in_(...)` query and one batched follow query over all target ids.
- Effort: S
- Depends on: none

### BE-030 — search_users applies LIMIT 20 before ranking; leading-wildcard ilike is unindexable
- Location: backend/app/routers/search.py:103-110
- Severity: Low
- Confidence: High
- Category: bug
- Description: The SQL query has no ORDER BY and `.limit(20)` (line 106), so when more than 20 usernames contain the substring, the DB returns an arbitrary 20; the Python prefix-first sort (line 110) then reorders only those. A prefix match the DB happened to rank 21st never appears. Also `ilike(f"%{q}%")` with a leading wildcard cannot use a btree index (needs pg_trgm) — a full users scan per search, mitigated by the 60/min rate limit and small user counts.
- Impact: Wrong-feeling results once the user table grows (exact-prefix matches missing while weaker matches show); full-table scan per keystroke-debounced search.
- Fix approach: Order in SQL (prefix-match expression first, then username) before the limit; add a pg_trgm index when user counts warrant.
- Effort: S
- Depends on: none

### BE-031 — Eager-load option pair copy-pasted at 7 call sites
- Location: backend/app/routers/feed.py:21, 90, 110; backend/app/routers/posts.py:51, 110, 125; backend/app/routers/search.py:72
- Severity: Low
- Confidence: High
- Category: duplication
- Description: `.options(selectinload(Post.interests), selectinload(Post.author))` appears verbatim seven times. Both eager loads are load-bearing: `PostOut.interests`/`extract_interest_names` (schemas.py:387-392) and the `author_*` properties (models.py:61-71) would otherwise lazy-load per post — a missed call site silently reintroduces an N+1 on a remote DB.
- Impact: Any future post-list query that forgets the pair regresses to N+1 with no error, only latency.
- Fix approach: A single `post_query(db)` helper or a `POST_EAGER` options constant used by all seven sites.
- Effort: S
- Depends on: none

### BE-032 — username-to-User 404 lookup duplicated across 4 files
- Location: backend/app/routers/follows.py:37-41; backend/app/routers/quiz.py:146-148; backend/app/routers/feed.py:105-107; backend/app/routers/chat.py:170-172
- Severity: Low
- Confidence: High
- Category: duplication
- Description: The `db.query(User).filter(User.username == ..., User.is_active == True).first()` + 404 pattern is re-implemented in four routers (follows has it as `_get_target`; the others inline it).
- Impact: Divergence risk (e.g. one site forgetting the is_active filter) and noise.
- Fix approach: Promote `_get_target` to a shared dependency/helper module.
- Effort: S
- Depends on: none

### BE-033 — Near-duplicate blocks: feed queries, privacy gates, accept/reject handlers
- Location: backend/app/routers/feed.py:88-95 vs 108-115; backend/app/routers/follows.py:144-147 vs 164-167; follows.py:96-113 vs 116-133
- Severity: Low
- Confidence: High
- Category: duplication
- Description: `get_following_feed` and `get_user_feed` differ only in the author filter (same options/status/order/limit tail). The followers/following privacy gate is byte-identical in both endpoints. `accept_follow_request` and `reject_follow_request` differ only in the final action on the found row.
- Impact: Three small drift surfaces; e.g. a pagination change to one feed variant can miss the other.
- Fix approach: Small shared helpers (`recent_published_posts(author_filter)`, `can_view_private_lists(...)`, `find_pending_request(...)`).
- Effort: S
- Depends on: none

### BE-034 — Edge rebuild is unconditional delete+reinsert churn on every post write
- Location: backend/app/graph_edges.py:161-182
- Severity: Low
- Confidence: High
- Category: perf
- Description: `rebuild_post_edges` always deletes all of the post's edge rows (lines 161-163) and re-adds every derived edge (lines 170-182), even when the authoring data is unchanged (e.g. a title/section tweak). No diffing. Bounded by the post's own edge count, so the absolute cost per write is small; on PostgreSQL it produces dead tuples/index churn proportional to write volume (the seed rewrites every post per run).
- Impact: Pure write amplification; matters mainly for bulk re-seeds and future higher write volume.
- Fix approach: Cheap set-diff of (format, key, featured, target) tuples against existing rows; skip the delete/insert when equal. Not worth more sophistication than that.
- Effort: S
- Depends on: none

### BE-035 — synchronize_session="fetch" adds an unneeded extra SELECT to 4 bulk edge statements
- Location: backend/app/graph_edges.py:144-146, 161-163, 193-196, 220-222
- Severity: Low
- Confidence: High
- Category: perf
- Description: All four bulk UPDATE/DELETEs pass `synchronize_session="fetch"`, which pre-SELECTs affected rows to sync the identity map (on backends without RETURNING). None of these code paths reads the affected PostEdge objects from the session afterward — the functions return or commit immediately.
- Impact: One extra remote round trip per bulk statement on every post write/publish/delete.
- Fix approach: `synchronize_session=False` on all four.
- Effort: S
- Depends on: none

### BE-036 — _resolve_live_targets builds an unbounded OR clause
- Location: backend/app/graph_edges.py:121-136 (line 130)
- Severity: Low
- Confidence: High
- Category: perf
- Description: One `AND(format=?, identity_key=?)` term (2 bind params) per distinct connection/person pair, with no upstream cap on how many connections a post may declare (PostCreate validates interests, not connections).
- Impact: A pathological post with hundreds of connections produces a very large statement; SQLite's ~999-param default is the practical ceiling in tests. Not reachable by normal authoring.
- Fix approach: Cap connections at validation time (the honest fix), or chunk the pairs; a `(format, identity_key) IN (VALUES ...)` form also stays index-friendly on PostgreSQL.
- Effort: S
- Depends on: none

### BE-037 — post_edges has no uniqueness constraint; duplicate edge rows possible
- Location: backend/app/models.py:81-94; backend/app/graph_edges.py:96-118, 170-182
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: post_edges has three non-unique indexes and no unique constraint on `(source_post_id, target_format, target_identity_key)`. `_edge_specs` yields one spec per authoring entry, so the same person appearing in two section lists (or the same connection twice) inserts two identical edge rows. Contained today: `resolved_read_next` reads the authoring layer, not the table, and rebuild wipes/re-derives — but any future consumer of the table (edge counts, backlinks) would double-count.
- Impact: Latent data-quality issue in the derived layer; invisible until something reads edges directly.
- Fix approach: Either dedup specs in `_edge_specs`/rebuild (a set over (fmt, key) keeping featured=True priority), or add a unique constraint once the desired semantics for duplicates are decided.
- Effort: S
- Depends on: none

### BE-038 — Index gaps: comments, messages, conversations
- Location: backend/app/models.py:220-229 (comments), 208-217 (messages), 180-190 (conversations)
- Severity: Low
- Confidence: High
- Category: perf
- Description: (a) comments: `post_id` is indexed but `created_at` is not, and there is no `(post_id, created_at)` composite — `list_comments` filters by post and orders by created_at desc (comments.py:78-84), so the DB sorts after the index scan. `user_id` (line 225) is also unindexed (delete-own-comment checks by PK, so this only matters for future per-user queries). (b) messages: separate `conversation_id` and global `created_at` indexes; the history query filters conversation_id and orders/keysets on id (chat.py:254-262) — `(conversation_id, id)` would serve it exactly. (c) conversations.created_by FK (line 187) unindexed — currently unqueried, minor. All are low-impact at per-post/per-conversation cardinalities; listed for the index checklist.
- Impact: Extra sorts on per-post comment listing and per-conversation history as those grow.
- Fix approach: `Index("ix_comments_post_id_created_at", "post_id", "created_at")` and `Index("ix_messages_conversation_id_id", "conversation_id", "id")`; apply to the live DB via the existing scripts pattern (see BE-021).
- Effort: S
- Depends on: BE-021 (live-DB application path)

### BE-039 — Redundant indexes
- Location: backend/app/models.py:149 (Follow.id `primary_key=True, index=True`), 171 (QuizAnswer.user_id indexed though it leads uq_quiz_answer at 167), 200 (ConversationParticipant.conversation_id indexed though it leads uq_conversation_participant at 196)
- Severity: Low
- Confidence: High
- Category: bloat
- Description: Three indexes duplicate coverage already provided by a PK or the leading column of a unique constraint.
- Impact: Pure write overhead and storage; no read benefit.
- Fix approach: Drop the three redundant `index=True` flags (and the live-DB indexes if they exist there).
- Effort: S
- Depends on: BE-021

### BE-040 — Stats top-creators leaderboards inconsistently filter status='published'
- Location: backend/app/routers/stats.py:109-118 (filters published) vs 120-158 (no status filter)
- Severity: Low
- Confidence: High
- Category: bug
- Description: `top_creators_by_posts` counts only published posts (line 113); `top_creators_by_likes`, `by_comments`, and `by_avg_read_time` join users→posts→events/comments with no status filter, so engagement on pending (or later-unpublished) posts still counts toward those leaderboards.
- Impact: The four leaderboards answer subtly different questions; a creator with heavily-engaged pending posts ranks differently across adjacent panels. Possibly intentional; flagged for a decision.
- Fix approach: Add (or deliberately document omitting) `Post.status == "published"` on the three join queries.
- Effort: S
- Depends on: none

### BE-041 — /stats/me loads every published-post timestamp of the user into Python
- Location: backend/app/routers/stats.py:642-676
- Severity: Low
- Confidence: High
- Category: perf
- Description: `pub_dates` selects all of the user's published-post created_at values (lines 642-647) to derive streaks and milestone dates in Python. Bounded by one user's post count — fine now, first thing to cap for power users (only distinct dates and 5 specific ordinal timestamps are actually needed).
- Impact: Grows with the requesting user's output; negligible until someone has thousands of posts.
- Fix approach: SQL distinct-date query for the streak plus indexed OFFSET lookups for the milestone ordinals, when it matters.
- Effort: S
- Depends on: none

### BE-042 — Raw connections array serialized in every post response; frontend consumes only read_next
- Location: backend/app/schemas.py:364-368
- Severity: Low
- Confidence: Medium
- Category: bloat
- Description: `PostOut.connections` ships the raw authoring-layer connections on every list and detail response, alongside the resolved `read_next` whose own comment says "the frontend resolves nothing" (lines 365-367). ARCHITECTURE.md confirms the detail page consumes only the server-resolved read_next. On list endpoints read_next is always `[]` and connections is dead weight either way.
- Impact: Payload bloat on every post in every response; also exposes the raw authoring layer to clients that shouldn't need it. Confidence Medium pending the frontend pass confirming no reader exists.
- Fix approach: Drop `connections` from PostOut (or empty it on list responses the way sections are) once the frontend pass confirms it is unread.
- Effort: S
- Depends on: none

### BE-043 — UserOut includes email unconditionally; admin verify returns another user's UserOut
- Location: backend/app/schemas.py:12-22 (line 16); backend/app/routers/admin.py:12, 29
- Severity: Low
- Confidence: Medium
- Category: bloat
- Description: `UserOut` has no public/private split and always carries `email`. On the /auth/* endpoints the subject is the caller, so that is fine. `PATCH /api/admin/users/{user_id}/verify` returns the target user via `response_model=UserOut`, sending the target's email to the verifier. This pass records it as field over-exposure in a serialization schema; whether it constitutes a leak is the security pass's call.
- Impact: One endpoint serializes a field about another user that the UI has no evident need for.
- Fix approach: A `PublicUserOut` without email for any response about a non-self user.
- Effort: S
- Depends on: none

### BE-044 — Quiz-answer stripping re-runs per request; list-path interaction with drop_sections is order-dependent
- Location: backend/app/schemas.py:394-413, 416-426
- Severity: Low
- Confidence: Medium
- Category: perf
- Description: `strip_quiz_answers` rebuilds the quiz section's item dicts (copy-based, correctly avoiding ORM JSON mutation per the comment at line 399) on every PostOut serialization of unchanging content. On PostListOut, both `mode="before"` validators target `sections`; the class comment (lines 420-421) guarantees correctness in either order ("[] is a fixed point for both") but not cost — if Pydantic runs strip before drop, every list item pays the quiz-copy pass on data that is then discarded. Which order Pydantic v2 applies across the inheritance boundary was not verified; the cost either way is small (5-10 question dicts per post).
- Impact: Minor repeated CPU; dwarfed by BE-008 on the same rows. Recorded because the checklist asks specifically about serialization-time work.
- Fix approach: If sections become write-time-normalized (answers stored separately), both validators shrink; not worth independent action otherwise.
- Effort: S
- Depends on: BE-008

### BE-045 — Dead second sort-key element in search ranking
- Location: backend/app/routers/search.py:83-85
- Severity: Low
- Confidence: High
- Category: bloat
- Description: `matched.sort(key=lambda p: (0 if q_lower in p.title.lower() else 1, 0))` — the second tuple element is the constant `0`. The recency tiebreak works only because Python's stable sort preserves the earlier `ORDER BY created_at DESC`; the intent lives in the comment (line 82), not the code.
- Impact: None functionally; a reader can easily break the recency ordering by "fixing" the sort.
- Fix approach: Drop the constant and key on `(title_match, -created_at_timestamp)` or keep stability but delete the dead element and strengthen the comment.
- Effort: S
- Depends on: none

### BE-046 — Rate limiter: per-process, lock-free race, naive utcnow().timestamp()
- Location: backend/app/rate_limit.py:7, 28-41 (line 32, 38-41)
- Severity: Low
- Confidence: High
- Category: bug
- Description: `_counters` is module-global per process — multiple uvicorn workers each grant the full quota, and restarts reset it. The filter/check/append sequence (lines 38-41) is a non-atomic read-modify-write across threadpool threads (and it is also called from async WS handlers on the loop thread — chat.py:345, battle.py:140), so concurrent bursts can exceed a limit by roughly the concurrency degree. `datetime.utcnow().timestamp()` (line 32) interprets a naive UTC datetime in local time; self-consistent, so relative windows work, but absolute values are wrong and a DST transition can stretch/shrink a window by an hour.
- Impact: Soft limits only — acceptable for abuse damping, but the multi-worker multiplication is worth knowing before choosing a deployment topology.
- Fix approach: Document the single-process assumption (it already is, indirectly, in chat/battle comments); switch to `time.time()`; move to a shared store only if multi-worker deployment happens.
- Effort: S
- Depends on: none

### BE-047 — list_comments count mode compiles to a subquery-wrapped COUNT
- Location: backend/app/routers/comments.py:76
- Severity: Low
- Confidence: High
- Category: perf
- Description: `db.query(Comment).filter(...).count()` emits `SELECT count(*) FROM (SELECT comments.* ...)`. A `select(func.count(Comment.id))` form is marginally cheaper and avoids materializing the column list in the subquery.
- Impact: Marginal; recorded for completeness.
- Fix approach: Direct aggregate query.
- Effort: S
- Depends on: none

### BE-048 — BaseHTTPMiddleware body-cap wrapper adds per-request overhead to every route
- Location: backend/app/main.py:46-51
- Severity: Low
- Confidence: Medium
- Category: perf
- Description: The body-size check itself is trivial (header comparison only; it never reads the body), but `@app.middleware("http")` uses Starlette's BaseHTTPMiddleware, which wraps every request — including /health and every GET — in an extra task/stream layer.
- Impact: Small constant overhead per request; measurable mainly at high RPS.
- Fix approach: Reimplement as a pure ASGI middleware (a ~10-line class) if profiling ever shows it; otherwise accept.
- Effort: S
- Depends on: none

### BE-049 — get_current_user costs one remote users SELECT on every authenticated request
- Location: backend/app/auth.py:59-67 (and get_optional_user, 70-80)
- Severity: Low
- Confidence: High
- Category: perf
- Description: After the (cheap, microseconds) HS256 decode, every authenticated request pays one `users` PK lookup against the remote DB. bcrypt is correctly confined to register/login/password-change paths (lines 29-34), not the per-request path.
- Impact: A fixed ~1-round-trip latency floor (tens of ms to Supabase) on every authed endpoint, additive to each endpoint's own queries. It is also what keeps `is_active` revocation immediate — a deliberate trade.
- Fix approach: Only if latency budgets demand it: short-TTL in-process user cache keyed by id (accepting bounded revocation delay). Otherwise accept and document.
- Effort: M
- Depends on: none

### BE-050 — datetime.utcnow() used throughout (deprecated since Python 3.12)
- Location: backend/app/scoring.py:32; backend/app/rate_limit.py:32; backend/app/routers/stats.py:48, 668; backend/app/models.py:38, 94, 112, 123, 153, 177, 188, 202, 215, 227 (column defaults)
- Severity: Low
- Confidence: High
- Category: bug
- Description: `datetime.utcnow()` is deprecated; all stored timestamps are naive UTC. Self-consistent today (everything uses the same convention), but any future introduction of an aware datetime (or a driver change) creates naive-vs-aware comparison errors, and rate_limit.py's `.timestamp()` on the naive value already misinterprets it as local time (see BE-046).
- Impact: No current breakage; a migration tripwire. Borderline with the general-bugs pass; kept here because the column defaults define what the DB stores.
- Fix approach: `datetime.now(timezone.utc)` (columns can keep storing naive UTC via a helper if a schema change is unwanted).
- Effort: S
- Depends on: none

## FE/BE contract

All REST routes are mounted under `/api` (main.py:53-67). `GET /health` (main.py:70-72) is the only unprefixed route. Auth column: **required** = `get_current_user` (Bearer JWT, 401 on failure); **optional** = `get_optional_user` (missing/invalid token → anonymous); **none** = no auth dependency. Every REST handler is sync `def`; the two websockets are `async def`.

### Post payloads (the core contract)

**PostOut** (schemas.py:355-413) — the exact fields the client receives:

| Field | Type | Source |
|---|---|---|
| id, format, title, feed_card, author_id, status, created_at, is_user_content | stored | ORM columns |
| sections | list[dict] | ORM column, passed through `strip_quiz_answers` — quiz items NEVER contain `answer_index` or `explanation` (schemas.py:394-413) |
| tags | list[str] | ORM column (taxonomy slugs; frontend keys glyphs on tags[0]) |
| connections | list[dict] | ORM column, raw authoring layer (see BE-042: likely unread by frontend) |
| read_next | list[ReadNextItem] | `{target_post_id: int\|null, format, title, latent: bool}` — populated ONLY by GET /api/posts/{id} (posts.py:137); `[]` on every other endpoint including POST /posts and /posts/mine |
| author_username, author_is_verified, author_avatar_url | computed | ORM properties reading the eager-loaded author (models.py:61-71) |
| interests | list[str] | Display NAMES, not slugs (`extract_interest_names`, schemas.py:387-392) |
| like_count, comment_count | int | Attached by attach_counts — two grouped queries per request (post_counts.py:41-52); defaults 0 |
| reading_minutes | int | Attached by attach_counts, computed from RAW sections BEFORE any strip/drop (post_counts.py:56) — present and real on BOTH list and detail responses; floor 1 |
| primary_category_name | str\|null | Attached by attach_counts: Interest.name of tags[0] resolved from the post's own interests (post_counts.py:10-25) |

**PostListOut** (schemas.py:416-426) = PostOut with `sections` always serialized as `[]` (`drop_sections`). The key stays in the JSON for schema stability. Detail bodies require a refetch of GET /api/posts/{id}. Everything else (counts, reading_minutes, primary_category_name, interests, tags, feed_card, author fields) is identical on list and detail.

### Endpoints

| Method | Path | Auth | Request | Response | Limits / notes |
|---|---|---|---|---|---|
| GET | /api/interests | none | — | `[InterestOut {id, name, slug}]` | whole taxonomy, unpaginated (small, fixed) |
| GET | /api/feed | none | query: `format?`, `interests?` (CSV slugs — ordering only, never inclusion) | `[PostListOut]` | **no limit — every published post**; ordering jittered per request (scoring.py:93) |
| GET | /api/feed/following | required | — | `[PostListOut]` | fixed limit 50, newest-first, no page param |
| GET | /api/feed/user/{username} | optional (value unused) | path username | `[PostListOut]` | fixed limit 50, newest-first; 404 unknown/inactive user; published only |
| GET | /api/posts/mine | required | — | `[PostOut]` — **full sections** | no limit; any status; newest-first |
| POST | /api/posts | required | `PostCreate {format, title, feed_card, sections, interests(1-10 slugs)}` | 201 `PostOut` (read_next `[]`) | 20/day/user; status = published if verified else pending; 400 unknown slug / invalid SVG |
| GET | /api/posts/{post_id} | optional | path id | `PostOut` with **read_next populated** (cap 3; latent entries have target_post_id null) | 404 if missing, or pending and caller is not the author |
| GET | /api/search | optional | query `q` (≤100 chars else silently `[]`), `format?` | `[PostListOut]` max 50 | 60/min per user-or-IP; title-match-first then recency |
| GET | /api/search/users | optional | query `q` (≤100 chars else silently `[]`) | raw list: `{username, is_verified, is_private, bio, avatar_url, is_self, follow_status: "pending"\|"accepted"\|"none"\|null}` | 60/min; SQL limit 20 applied before prefix ranking (BE-030) |
| POST | /api/events | optional | JSON array of `EventIn {post_id, event_type, duration_ms?}` | `{stored: int}` | max 50/batch (422 above); **no rate limit**; unknown/invisible post ids silently dropped |
| GET | /api/posts/{post_id}/likes | optional | — | `{count: int, liked: bool}` | liked always false anonymous; 404 pending-not-author |
| GET | /api/posts/{post_id}/comments | optional | query `count?: bool` | `{count: int}` or `[CommentOut {id, post_id, username, is_verified, avatar_url, body, created_at}]` | **no pagination**; newest-first; 404 pending-not-author |
| POST | /api/posts/{post_id}/comments | required | `{body}` (1-2000 chars) | 201 `CommentOut` | 30 / 5 min per user |
| DELETE | /api/comments/{comment_id} | required | — | 204 | own comment only (403) |
| POST | /api/auth/register | none | `{email, username (3-30 [A-Za-z0-9._-]), password (8+ chars, ≤72 bytes)}` | 201 `{access_token, token_type: "bearer", user: UserOut}` | 10/hr per IP |
| POST | /api/auth/login | none | `{email, password}` | `TokenResponse` | 30/5min per IP + 10/5min per email |
| GET | /api/auth/me | required | — | `UserOut {id, email, username, created_at, is_verified: int, is_private, bio, avatar_url}` | — |
| PATCH | /api/auth/me | required | `{username?, new_password? (+current_password), is_private?, bio? ≤160}` (422 if all absent) | `UserOut` | — |
| POST | /api/auth/me/avatar | required | multipart `file` (jpeg/png/gif/webp, magic-checked, Pillow re-encoded) | `UserOut` (avatar_url updated) | 10/hr; 5 MB cap |
| DELETE | /api/auth/me | required | `{current_password}` | 204 (soft delete, is_active=false) | — |
| POST | /api/users/{username}/follow | required | — | `{status: "pending"\|"accepted"}` (pending iff target private) | 60/hr; 400 self/duplicate |
| DELETE | /api/users/{username}/follow | required | — | 204 | 404 if not following |
| POST | /api/users/{username}/follow/accept | required (caller is target) | — | `{status: "accepted"}` | 404 if no pending request |
| DELETE | /api/users/{username}/follow/reject | required (caller is target) | — | 204 | 404 if no pending request |
| GET | /api/users/{username}/followers | optional | — | `[FollowUserOut {username, is_verified, is_private, avatar_url}]` | **no pagination**; private accounts return `[]` unless self or accepted follower |
| GET | /api/users/{username}/following | optional | — | `[FollowUserOut]` | same privacy rule; no pagination |
| GET | /api/users/{username}/follow-requests | required, self only (403) | — | `[{username, is_verified, avatar_url, created_at}]` | no pagination |
| GET | /api/users/{username}/profile | optional | — | `ProfileOut {username, is_verified, is_private, bio, avatar_url, follower_count, following_count, post_count, follow_status: str\|null}` | follow_status null for self/anonymous |
| POST | /api/quiz/answer | optional | `{post_id, question_index, chosen_index (0-3)}` | `{correct, correct_index, explanation, already_answered, scored, elo: {format, rating, delta, global_rating}\|null}` | 60/min (authenticated only); answers validated server-side against stored sections |
| GET | /api/quiz/state/{post_id} | required | — | `{answers: [{question_index, chosen_index, correct, correct_index, explanation}]}` | ≤10 rows by uq constraint |
| GET | /api/users/{username}/elo | none | — | `{global_rating: int\|null, formats: {}}` (formats always empty — shape compatibility) | — |
| POST | /api/train/answer | required | `{difficulty (1-3), correct: bool, answer_ms ≥0}` | `{rating, delta, global_rating}` | 120/min; correctness client-trusted (documented mock phase) |
| PATCH | /api/admin/users/{user_id}/verify | required, caller is_verified ≥ 1 | — | `UserOut` of the target (includes email — BE-043) | — |
| GET | /api/stats/global | none | — | dict: overview {total_posts, total_users, total_comments, total_likes, avg_posts_per_user}; top_creators_by_posts/likes/comments/avg_read_time (10 each); top_creators_per_format; top_posts_by_likes (10); posts/users/comments/likes_over_time (12 months each); posts/comments/likes_by_format; activity_by_weekday/hour; activity_heatmap (168); post_quality_over_time; pending_vs_published; comment_activity_by_user (10) | 60s in-process cache, identical for all callers |
| GET | /api/stats/me | required | — | dict: overview {posts_created, posts_published, posts_pending, likes_received, comments_received, posts_saved: always -1 (client-side), posts_liked}; my_posts/likes_received/comments_received_over_time; my_posts_by_format; my_activity_by_weekday/hour/heatmap; my_top_posts_by_likes/comments (5 each); my_avg_read_time_per_format/over_time; my_comments_written(+_by_format); my_ranking {by_posts, by_likes, total_users}; my_engagement_score (0-100); my_streak {current_days, best_days}; my_milestones (9 entries); my_likes_given_by_format; my_elo; my_quiz {answered, correct, accuracy} | uncached (BE-005) |
| GET | /api/chat/conversations | required | — | `[{id, is_group, name (derived for DMs), participants: [{username, avatar_url, is_verified}], last_message: message-dict\|null, created_at}]` | sorted most-recent-activity first; batched (no N+1) |
| POST | /api/chat/conversations | required | `{usernames: [1-19], name? ≤80}` | 201 conversation dict; existing DM returned instead of duplicate | 20/hr; 403 unless accepted follow either direction with each target |
| GET | /api/chat/conversations/{id}/messages | required (participant, else 404) | query `before_id?`, `limit` (clamped 1-100, default 50) | `[{id, conversation_id, sender_id, sender_username, body, created_at}]` oldest-first within page | keyset pagination — the reference implementation |
| WS | /api/chat/ws | first frame `{type:"auth", token}` within 10s (close 4401); wss-or-local gate (close 4403) | client: ping / `send {conversation_id, body ≤2000}` | server: auth_ok, pong, `message {message}`, `error {detail}` | 30 msgs/min per user; 16 KB frame cap |
| WS | /api/battle/ws | same auth/gate as chat | client: ping / `challenge {username}` / `progress {index, correct, score}` / `finish {score}` | server: auth_ok, pong, error, opponent_unavailable, `battle_start {seed, count: 7, opponent}`, opponent_progress, opponent_finish, opponent_left | 30 challenges/min; 4 KB frame cap; nothing persisted |
| POST | /api/upload/image | required | multipart file (5 MB cap, magic-checked, Pillow re-encoded) | 201 `{url}` (public Supabase URL) | 10/hr; 503 if storage unconfigured |
| POST | /api/upload/svg | required | multipart file, content-type image/svg+xml, 512 KB cap | 201 `{svg_content}` (sanitized text, NOT stored) | 10/hr |
| GET | /health | none | — | `{status: "ok"}` | unprefixed |

### Contract notes for the frontend passes

- **Sections are stripped** (serialized `[]`) on: GET /api/feed, /api/feed/following, /api/feed/user/{username}, /api/search. They are **present** on GET /api/posts/{id}, GET /api/posts/mine, and the POST /api/posts response — always with quiz `answer_index`/`explanation` removed. Quiz correctness/explanations are only obtainable via POST /api/quiz/answer (and GET /api/quiz/state for already-answered questions).
- **reading_minutes is present and correct on every post-returning endpoint**, list and detail alike — computed server-side from the raw sections before the strip (post_counts.py:56). The schema default 1 (schemas.py:380) never leaks on these routes because attach_counts runs on all of them.
- **read_next is only ever non-empty on GET /api/posts/{id}** (cap 3; latent person entries have `target_post_id: null, latent: true`). List responses and the create response always carry `read_next: []`. Raw `connections` accompany every response but the frontend is expected to consume only read_next.
- `interests` are display names; `tags` are slugs; `primary_category_name` is the display name of tags[0] and is null when tags[0] is absent or unmapped.
- There is **no DELETE or PUT/PATCH endpoint for posts** — posts are create-and-read only over the web API (graph_edges.on_post_deleted exists but is only called from seed/scripts/tests).
- /api/feed ordering is intentionally non-deterministic across requests (random jitter); identical requests return the same set in different orders.
- FastAPI validation errors return 422 with the standard detail array; auth.tsx already normalizes string/array details.

## Coverage notes

- **Reviewed:** every file under backend/app (30 files) — all 15 routers, models, schemas, database/engine setup, main/middleware, auth, rate limiting, elo, post_counts/reading_time/scoring, graph_identity/graph_edges, sanitize/upload_config. Every finding's cited lines were re-opened and verified after drafting; two subagent claims were dropped in verification (a "missing index on posts.is_user_content" — no query filters on that column; a "missing index on users.knowledge_rating" — no endpoint sorts on it).
- **Not reviewed / out of scope:** backend/seed.py and backend/scripts/* (not on the web request path; note BE-013's two-commit pattern also appears at seed call sites per grep, unverified in detail), backend/tests/*, the mobile app, all frontend code (contract cross-references come from ARCHITECTURE.md), post JSON content/schema files.
- **Deliberately omitted as other passes' domains** (pointers only, no analysis here): security-flavored observations at quiz.py:64-76 (anonymous answer flow and rate-limit placement), events.py (unauthenticated write endpoint), admin.py:18-22 (verification gate semantics), auth.py:25-26 (client IP behind a proxy), main.py:46-51 (Content-Length-only cap), sanitize.py:198-200 (style checks unreachable because `style` is not whitelisted — also a dead-code pass item), and UserOut email exposure beyond the serialization note in BE-043; general-bug observations at sanitize.py:100 (alpha flattening / EXIF orientation, DecompressionBombError surfacing as 500).
- **Low-confidence or unverifiable:** live Supabase schema state vs models.py (BE-021 — indexes/columns added after table creation cannot be confirmed from code); Pydantic v2 before-validator execution order across the PostOut/PostListOut inheritance boundary (BE-044); supabase-py client internals (whether `get_public_url` is pure string construction and whether `create_client` can raise at import in upload_config.py:15); whether the frontend reads `connections` (BE-042) or sections on /posts/mine (BE-020) — flagged for the frontend passes to confirm.
