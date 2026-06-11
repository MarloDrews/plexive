# Deepscroll Architecture

## FOLDER STRUCTURE

```
backend/
  requirements.txt              fastapi, uvicorn, sqlalchemy, psycopg2-binary, passlib[bcrypt], python-jose[cryptography], python-dotenv, email-validator, supabase
  .env.example                  JWT_SECRET, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY templates (copy to .env, never commit .env)
  seed.py                       idempotent: get-or-create 145 interests from taxonomy; reads SEED_ADMIN_PASSWORD from backend/.env; get-or-create @Marlo (marlo07drews@gmail.com, is_verified=2); auto-discovers all *_example.json files in docs/content-structure/examples/ — upserts one post per file (format derived from filename, title from feed_card.title|concept_name|the_question|headline|name); upsert key is (author_id, format) so title changes do not create duplicates; FORMAT_INTEREST_SLUGS dict maps format → interest slugs (books/facts/people/concepts/questions/stories defined)
  tests/_throwaway_db.py        sets DATABASE_URL to a temp SQLite file + blanks SUPABASE env BEFORE app import; every test file imports it first so suites can never touch the real DB or storage
  tests/smoke_test.py           end-to-end API smoke test (quiz/Elo, avatar via fake Supabase storage client, user search) against a throwaway SQLite DB (via _throwaway_db); run with .venv\Scripts\python.exe tests\smoke_test.py (needs httpx)
  tests/chat_test.py            end-to-end chat test (conversation rules, history authz, websocket auth/send/broadcast/rejection) against a throwaway SQLite DB (via _throwaway_db); run with .venv\Scripts\python.exe tests\chat_test.py
  tests/security_test.py        regression test for the June 2026 security review fixes; throwaway SQLite DB via _throwaway_db; run with .venv\Scripts\python.exe tests\security_test.py
  scripts/cleanup_smoke_test_data.sql  one-time manual cleanup of smoke-test rows accidentally written to the live DB on 2026-06-11 (run by hand, never from the app)
  scripts/add_indexes.py        one-time manual CREATE INDEX IF NOT EXISTS for the live DB (events post_id+event_type/user_id/created_at, comments post_id, follows following_id+status); names match models.py; idempotent; run by hand, never from the app
  tests/perf_probe.py           endpoint timing probe against a running backend (--out saves timings + bodies for before/after comparison); authed endpoints via seed-admin login, token cached to respect rate limits
  tests/_db_inspect.py          legacy SQLite helper (no longer used; DB is Supabase PostgreSQL)
  app/
    database.py                 engine (PostgreSQL via DATABASE_URL env var; pool_recycle=1200 + connect_timeout=10 on PG only — pool_pre_ping measured and rejected, +1 round trip per request), SessionLocal, Base, get_db dependency
    main.py                     FastAPI app, CORS origins from FRONTEND_ORIGIN env (default localhost:3000, "*" stripped), 10 MB request body cap middleware, router registration, create_all on startup; no StaticFiles mount (files served from Supabase Storage)
    models.py                   ORM models: Interest, Post (feed_card JSON not null, sections JSON not null, is_user_content Boolean not null default False, author_id FK→users nullable; indexes on format/status/created_at; author_username and author_is_verified as properties), Event (user_id nullable FK; indexes: (post_id,event_type) composite, user_id, created_at — apply to the live DB once via scripts/add_indexes.py), User (posts relationship, is_verified Integer default 0, is_private boolean default false, bio string nullable, avatar_url string nullable), Follow (follower_id FK→users, following_id FK→users, status "pending"|"accepted", created_at; UniqueConstraint uq_follow), UserElo (user_id+format unique, rating float, answered_count), QuizAnswer (user_id+post_id+question_index unique, chosen_index, is_correct, rating_delta), Comment, post_interests join table
    elo.py                      Elo knowledge score: start 1000, floor 100, K=32 first 30 answers per format then 16, question rating 800/1000/1200 from post_difficulty; elo_summary() returns global (average of per-format ratings, None until first answer) + per-format ratings in one query
    auth.py                     hash_password, verify_password, create_access_token, decode_access_token, get_current_user, get_optional_user (returns User|None, used for optional auth)
    schemas.py                  Pydantic v2 models: 15 section types with Literal discriminator → AnySection union; BooksFeedCard; PostCreate (Books required sections: essence/quiz_badge/voices/at_a_glance/heart/core_ideas/takeaway/quiz/sources; image_url recursive check for Supabase storage URL prefix); PostOut (feed_card dict, sections list[dict], is_user_content bool, like_count int, comment_count int; strips answer_index+explanation from quiz sections so answers never reach the client); PostListOut (PostOut subclass for list endpoints: serializes sections as [] — no list view renders sections, detail page refetches GET /api/posts/{id}); UserOut (incl. avatar_url), InterestOut, EventIn, UploadResponse, SvgUploadResponse
    sanitize.py                 validate_image() — sync (runs in threadpool via sync def endpoints; reads file.file), chunked read, magic-byte check, animated-GIF reject, Pillow re-encode; sanitize_svg() / sanitize_svg_text() — defusedxml XXE check, lxml element+attribute whitelist, dangerous-pattern rejection
    upload_config.py            Supabase client (SUPABASE_URL + SUPABASE_SERVICE_KEY from env), SUPABASE_BUCKET="uploads", size limits (5 MB images, 512 KB SVGs)
    rate_limit.py               in-memory per-user rate limiter (dict of timestamps); check_rate_limit(user_id, key, max, window_secs); identity may also be a string ("ip:...", "email:...") for unauthenticated endpoints; idle buckets swept every 10 min (snapshot iteration, pop-with-default) so memory stays bounded
    post_counts.py              attach_counts(posts, db) / attach_counts_one(post, db) — batched like_count+comment_count attachment shared by posts/feed/search routers
    scoring.py                    score_posts() — interest match (tier-scaled), format engagement, repeat penalty; engagement read as one joined tuple query (events x post format, last 30 days)
    routers/
      interests.py              GET /api/interests
      feed.py                   GET /api/feed — three-tier: direct matches → related co-tags → all remaining; GET /api/feed/following (auth, posts from followed users, limit 50); GET /api/feed/user/{username} (no auth, published posts by user, limit 50); all three respond with PostListOut (sections serialized as [])

      events.py                 POST /api/events (captures user_id when auth token present; deduplicates "like" events per user+post for auth users via one IN query per batch, also within a batch; max 50 events/batch; unknown post ids dropped); GET /api/posts/{id}/likes → {count, liked} in one COUNT+MAX(CASE) query when authed; pending posts 404 for non-authors
      auth.py                   POST /api/auth/register (10/hr per IP; username must match ^[A-Za-z0-9._-]{3,30}$ — forward-only), POST /api/auth/login (10/5min per email + 30/5min per IP), GET /api/auth/me, PATCH /api/auth/me (update username/password/is_private/bio; same username rule), POST /api/auth/me/avatar (multipart, validate_image pipeline, 10/hr), DELETE /api/auth/me (soft delete: sets is_active=False)
      follows.py                POST /api/users/{username}/follow (60/hr); DELETE /api/users/{username}/follow; POST /api/users/{username}/follow/accept; DELETE /api/users/{username}/follow/reject; GET /api/users/{username}/followers; GET /api/users/{username}/following (private lists visible to owner + accepted followers); GET /api/users/{username}/follow-requests (auth, own only); GET /api/users/{username}/profile (no auth, returns counts + follow_status; follower/following/post counts in one multi-subselect SELECT); all user payloads include avatar_url
      search.py                 GET /api/search — Python-side search across post.title, feed_card.essence, feed_card.author, heart section content, core_ideas title+body (matching reads ORM sections pre-serialization; response is PostListOut with sections []); ranked by title-match then recency; limit 50; GET /api/search/users — username substring search, prefix matches first, limit 20, follow_status per row when authed; both: q max 100 chars, 60/min per user or IP
      quiz.py                   POST /api/quiz/answer (optional auth; validates against stored answer_index; first authed answer per question updates Elo, own posts never scored, 60/min); GET /api/quiz/state/{post_id} (auth, answered questions with corrections); GET /api/users/{username}/elo (public, global + per-format ratings)
      comments.py               GET /api/posts/{id}/comments?count=true → {count} or full list; POST /api/posts/{id}/comments (auth, 30/5min); DELETE /api/comments/{id} (auth, own comment only); pending posts 404 for non-authors
      uploads.py                POST /api/upload/image (10/hr, validate_image, uploads to Supabase bucket "uploads", returns public URL); POST /api/upload/svg (10/hr, sanitize_svg, returns svg_content string inline — not stored)
      admin.py                  PATCH /api/admin/users/{user_id}/verify — sets is_verified=1; caller must have is_verified>0; 403 otherwise
      posts.py                  GET /api/posts/mine (auth, any status); POST /api/posts (auth, 20/day, status="published" if verified else "pending", sets is_user_content=True, sanitizes visual_svg fields, interest slugs validated in one IN query); GET /api/posts/{id} (pending visible to author only); _attach_counts() helper adds like_count+comment_count as Python attributes before Pydantic serialization
      chat.py                   GET /api/chat/conversations (auth, sorted by last activity, last-message preview); POST /api/chat/conversations (auth, 20/hr; body {usernames[], name?}; DM for 1 username with per-pair dedupe, group for 2-19; each target needs an accepted follow in either direction); GET /api/chat/conversations/{id}/messages?before_id&limit (auth, participant only, 404 otherwise); WS /api/chat/ws (first-frame JWT auth, see SECURITY)
      stats.py                  GET /api/stats/global (no auth, all platform analytics; response cached in-process for 60s — identical for every caller); GET /api/stats/me (auth, personal stats — my_streak/my_milestones/my_engagement_score/my_elo/my_quiz/posts_liked/my_likes_given_by_format computed server-side; posts_saved stays -1, counted client-side from localStorage); FORMATS includes all 7 formats incl. academy; date/time helpers are dialect-aware (to_char/extract on PostgreSQL, strftime on the SQLite test DB); raw SQL subqueries use explicit aliases and COUNT(*)/COUNT(col) in HAVING instead of aliases; post_quality_over_time uses one GROUP BY query (no per-month loop); round trips minimized for the remote DB: overview counts in one multi-subselect SELECT (both endpoints), ranking/max-engagement/first-like/first-comment scalars in one multi-subselect SELECT, streak dates derived in Python from the milestones query, per-format top creators in one grouped query, weekday/hour series derived in Python from the heatmap query, status counts grouped

user_uploads/                 gitignored; no longer used — images uploaded to Supabase Storage bucket "uploads"

frontend/
  next.config.ts                devIndicators disabled (the floating dev badge covered the comment send button at phone width)
  .env.example                  NEXT_PUBLIC_API_URL template
  .env.local                    actual env vars (gitignored)
  src/app/
    layout.tsx                  root layout, Lamplight fonts (Newsreader serif + Source Sans 3 UI + Geist Mono data), title "Deepscroll"
    globals.css                 Tailwind import, Circuit design tokens (@theme: neutral black surface-0/1/2/3/overlay, neutral gray edge/edge-strong, neutral ink levels, lamp/like/good/bad/save accents, fmt-* format inks, radius-card/field/sheet); neutral dot-grid body texture (body::before, no colored background glow); focus-visible lamp ring; component vocabulary (.card/.btn/.field/.chip/.label-caps/.prose-post; card has no color tint, only element-level color; .btn-action-liked sets color to --color-like red; .btn-action-saved sets color to --color-save yellow); heart-pop + heart-boom keyframes with reduced-motion guard
    page.tsx                    home feed: 9-tab bar (For You + Following + 7 formats derived from lib/formats.ts), horizontal snap between tabs, vertical snap within each, real-time indicator; tabs read via useSWR cache-first (revalidateIfStale false — server jitters feed order, a background refetch would reshuffle visibly), so revisiting the feed renders instantly from cache; tab alignment: first tab snaps left, last tab snaps right, middle tabs center; search button top-right above the tab strip (TikTok style, tabs fade under it); Following tab uses /api/feed/following with login/empty states; BottomNav (feed active)
    onboarding/
      page.tsx                  server component — renders InterestPicker (no props)
      InterestPicker.tsx        client — fetches /api/interests, groups 145 pills into 10 categories, sticky header/footer, saves slugs to localStorage
    login/
      page.tsx                  login form: email + password, inline error messages, redirects to / on success or if already logged in
    register/
      page.tsx                  register form: email + username + password, inline error messages, redirects to / on success or if already logged in
    profile/
      page.tsx                  account page: Avatar with camera-button upload (POST /api/auth/me/avatar), @username, email, "View public profile" link, knowledge score card (global + per-format chips from /api/users/{me}/elo), My posts / Saved posts card rows, bio card (160 chars), private account toggle (PATCH /api/auth/me), follow requests panel with avatars (private accounts only, accept/decline each), inline forms for change username / change password / sign out / delete account; BottomNav (profile active)
      [username]/
        page.tsx                public profile: header with back + settings/more-options, 72px Avatar (uploaded picture or initial), verified badge, bio, stats row (posts/followers/following/knowledge Elo); followers+following counts open a bottom-sheet user list; follow/unfollow button (optimistic update written into the SWR cache, revalidate false), Posts|Saved|Liked tabs (own-profile Saved/Liked per-id fetches run on first tab open, not on mount); profile/elo/posts via useSWR (/api/users/{username}/profile, /elo, /api/feed/user/{username}) — revisits render cached instantly with silent background refresh; BottomNav (profile active)
    search/
      page.tsx                  search input + Posts|Accounts scope toggle; posts scope: format chips + compact result cards; accounts scope: /api/search/users rows with Avatar, verified badge, bio and follow/unfollow button; debounced 300ms; BottomNav (search active)
    create/
      page.tsx                  3-step creation wizard for all 7 formats: step 1 — 7 format cards (all enabled); step 2 — duplicate check; step 3 — Books: full wizard with Feed Card block + 15 section accordions (9 required / 6 optional); all other formats: format-specific feed card fields + body textarea (stored as heart section) + shared quiz + sources; submits {format, title, feed_card, sections, interests} to POST /api/posts; on success invalidates the cached feed lists; /api/interests via useSWR (static list, cached across visits); success screen links to /my-posts; BottomNav (create active)
    chat/
      page.tsx                  conversation list (avatar, name, last-message preview, relative time) via useSWR (revisits render cached instantly, background refetch keeps new messages appearing) + New chat overlay (user search via /api/search/users, multi-select chips, optional group name); login prompt when logged out; BottomNav (chat active)
      [id]/
        page.tsx                conversation view: history via GET messages, live updates over the websocket, own messages right/white, others left/zinc, sender labels in groups, textarea send (Enter sends, max 2000 chars), connection status in header
    my-posts/
      page.tsx                  lists the current user's own posts with cover thumbnail (from feed_card.cover_url), title, author, format badge, status badge, timestamps; fetches GET /api/posts/mine; empty state links to /create; BottomNav (create active)
    saved-posts/
      page.tsx                  bookmarked posts: reads IDs from localStorage via getSavedPostIds, fetches each via GET /api/posts/{id} (auth optional; pending author-only posts load correctly), renders as full-screen snap-scroll PostCards; skips missing/deleted posts silently; empty state with bookmark icon; BottomNav (profile active)
    post/
      [id]/
        page.tsx                full-screen detail page; header: format badge, attribution, cover image (Books), title, author, interest tags; SectionRenderer renders all 15 section types in order; sticky comment bar (safe-area aware) with always-visible round btn-primary send + like/save (lamp gold when active) + share; slide-up animation, swipe-right-to-close; attribution: Submitted by @user (blue verified badge) for user content; Deepscroll + violet badge for seed/official; comment add/delete writes the new count through to the cached feed lists
    components/
      PostCard.tsx               full-screen snap card; format-aware layout with image, stat/meta highlight, hook, inline SVG; action rail with 44px tap targets, like lights up red (#ff3a5c / btn-action-liked), save lights up lamp purple; counts hidden (invisible) when zero; re-exports Post type; format styles come from lib/formats.ts; animated noise background (SVG feTurbulence baseFrequency=0.45 numOctaves=3, opacity=0.11, 7s drift, z-0); format badge glow (stronger textShadow + boxShadow using accent color); author avatar initials shown absolute bottom-right of the card box (inside transition div); comment-count changes from the bottom sheet write through to the cached feed lists (updatePostInFeedCaches)
      BottomNav.tsx              fixed bottom nav: Chat / Stats / Feed (flame) / Create (plus-circle) / Profile; 5 buttons; active item glows via double drop-shadow filter (lamp color); bar has upward radial glow (boxShadow); all inactive items including Create always shown as text-ink-muted; safe-area-inset-bottom aware; prefetches the sibling routes on mount so the first tap skips the route-chunk download (incl. the ~517 KB recharts chunk for /stats)
      Providers.tsx              "use client" boundary; wraps children with AuthProvider + SWRConfig (jsonFetcher as default fetcher; focus/reconnect revalidation off to keep request patterns unchanged) so layout.tsx stays a Server Component
    lib/
      eventQueue.ts             module-level batch queue; flushes every 5s or at 5 events to POST /api/events with Authorization header when token present; exports hasPendingLike/cancelPendingLike so unlike-before-flush can cancel an in-flight event; deduplicates "like" events per post_id within the current queue
      auth.tsx                  AuthContext + AuthProvider: stores JWT in localStorage under "deepscroll_token", restores session via /api/auth/me on load, exposes user/login/register/logout/updateUser/loading; normalizes FastAPI string/array error details; clears the SWR cache on login/register/logout so no cached data crosses accounts
      api.ts                    apiFetch wrapper: prepends NEXT_PUBLIC_API_URL, attaches Authorization: Bearer header when token present; skips Content-Type for FormData bodies
      swr.ts                    SWR cache plumbing: jsonFetcher (apiFetch-backed, throws ApiError with status), clearApiCache() global wipe used by auth.tsx; updatePostInFeedCaches(postId, patch) patches a post in all cached /api/feed* lists (comment-count write-through), invalidateFeedCaches() drops them (called after post creation)
      relativeTime.ts           shared relativeTime(iso) formatter (just now / Nm / Nh / Nd / short date)
      chatSocket.ts             useChatSocket hook: one ws per page, http→ws url derivation, first-frame JWT auth, auto-reconnect (3s), send(conversationId, body); exports ChatMessage/Conversation types + MESSAGE_MAX_CHARS
      likedPosts.ts             isPostLiked, likePost, unlikePost, getLikedPostIds; localStorage key "deepscroll_liked"; getCachedLikeCount/setCachedLikeCount; key "deepscroll_like_counts"; isLikeSent/markLikeSent/unmarkLikeSent; key "deepscroll_like_sent" tracks posts whose like event reached the backend — used in the server-count reconciliation formula; one-time migration seeds sent-key from liked-key; server-safe; TODO: replace with backend endpoint
      savedPosts.ts             isPostSaved, savePost, unsavePost, getSavedPostIds; localStorage key "deepscroll_saved"; server-safe; TODO: replace with backend endpoint
  src/lib/
    formats.ts                  single source of format identity: FORMAT_IDS, FORMAT_STYLES (label, badge, Circuit ink hex, rgb, text/dot/border/indicator classes from fmt-* tokens), formatStyle() with neutral fallback, LEGACY_SVG_ACCENT_MAP (old accent hex → new ink, used by SvgBlock)
  src/components/
    SvgBlock.tsx                shared visual_svg renderer; user content → UTF-8-safe base64 <img>, seed → dangerouslySetInnerHTML; render-time re-palette of legacy accent hexes to Circuit inks; className/color props for per-section layout
    SectionLabel.tsx            unified section header (h3, text-xs uppercase tracking-widest, zinc-500 default, color override)
    VerifiedBadge.tsx           level-based user check (1=slate-blue, 2=gold, 3+=purple) + variant="official" for Deepscroll seed content; size prop
    Spinner.tsx                 unified loading spinner (sm/md)
    PostRow.tsx                 compact post list card (format dot + badge + title) used by profile tabs
    SectionRenderer.tsx         maps section.type → component; handles all sections for books/facts/people/concepts/questions/stories formats
    sections/
      (books/facts/people/concepts sections — existing)
      OneLinerSection.tsx       concepts: prominent one-sentence summary
      IntuitionSection.tsx      concepts: plain-language intuition paragraph
      VisualExplanationSection.tsx concepts: SVG + caption
      HowItWorksSection.tsx     concepts: numbered steps with title+body
      FormalDefinitionSection.tsx concepts: body + monospace formula + notation legend
      RealWorldExamplesSection.tsx concepts: list of domain-labelled examples
      HowToApplySection.tsx     concepts: body + checkbox list + optional SVG
      WhereItBreaksSection.tsx  concepts: where the concept fails
      MentalTakeawaySection.tsx concepts: closing insight + optional SVG
      OriginSection.tsx         concepts: history body + key thinkers cards
      NearbyConceptsSection.tsx concepts: list of related concepts with distinctions
      TheQuestionSection.tsx    questions: large heading with the question text
      SetupSection.tsx          questions: intro paragraph
      WhyItsHardSection.tsx     questions: why the question is difficult
      WhatHangsOnItSection.tsx  questions: stakes/importance
      PerspectivesSection.tsx   questions: array of 4 positions with argument + example
      WhereTheyClashSection.tsx questions: fault lines between positions
      WhatScienceSaysSection.tsx questions: body + key_findings list + optional SVG
      YourTurnSection.tsx       questions: numbered reflection prompts + closing thought
      HistoryOfTheQuestionSection.tsx questions: history of the debate
      WhereTheDebateStandsSection.tsx questions: current state of the debate
      ColdOpenSection.tsx       stories: opening hook paragraph (no label)
      SettingSection.tsx        stories: context body + optional image
      ChaptersSection.tsx       stories: array of titled chapters with optional images
      TheTurnSection.tsx        stories: turning point with body + optional image
      TheAftermathSection.tsx   stories: aftermath with body + optional SVG
      WhatItMeansSection.tsx    stories: significance
      WhatWeLearnSection.tsx    stories: lesson
      UnansweredSection.tsx     stories: unresolved aspects
      CastSection.tsx           stories: array of character cards (name/role/one_line/lifespan)
      HistoricalContextSection.tsx stories: broader historical setting

docs/REVIEW.md                  full-pass audit (June 2026): categorized findings + design direction and token set
docs/DESIGN.md                  "Lamplight" design identity (June 2026 redesign): rationale, full token set, format ink palette, type system, component vocabulary
docs/SERVER.md                  Raspberry Pi deployment reference: systemd units, env vars, Tailscale IPs, update routine, debugging playbook, known pitfalls
.claude/skills/commit.md        conventional commit format rules for this project
```

## DATABASE

### interests
| column | type   | description                     |
|--------|--------|---------------------------------|
| name   | String | display label e.g. "Politics"   |
| slug   | String | filter key e.g. "politics"      |

### posts
| column          | type    | description                                                             |
|-----------------|---------|-------------------------------------------------------------------------|
| id              | Integer | primary key                                                             |
| format          | String  | one of: books, facts, people, concepts, questions, stories, academy     |
| title           | String  | book/post title                                                         |
| feed_card       | JSON    | format-specific card data (BooksFeedCard: cover_url, title, author, essence, teasers, post_reading_time_min, post_difficulty, year, genre) |
| sections        | JSON    | ordered array of {type, order, content} objects; 15 types for Books    |
| is_user_content | Boolean | False for seed/official posts; True for user submissions (controls SVG rendering) |
| author_id       | Int FK? | FK→users.id; set for all posts including seeds                         |
| status          | String  | "published" (default, seed) or "pending" (unverified user submission)  |
| created_at      | DateTime| indexed                                                                 |

### post_interests
Join table linking posts ↔ interests (many-to-many).

### comments
| column     | type      | description                              |
|------------|-----------|------------------------------------------|
| id         | Integer   | primary key                              |
| post_id    | FK→posts  |                                          |
| user_id    | FK→users  |                                          |
| body       | Text      | plain text; max 2000 chars enforced by API |
| created_at | DateTime  | default now                              |

### events
| column      | type     | description                              |
|-------------|----------|------------------------------------------|
| post_id     | FK→posts |                                          |
| event_type  | String   | "view" or "like"                         |
| duration_ms | Integer? | ms card was on screen; null for likes    |
| user_id     | FK→users, nullable | set when auth token present; used by GET /likes to determine liked state |

### users
| column        | type     | description                               |
|---------------|----------|-------------------------------------------|
| id            | Integer  | primary key                               |
| email         | String   | unique, indexed, not null                 |
| username      | String   | unique, not null                          |
| password_hash | String   | bcrypt hash; plaintext never stored       |
| created_at    | DateTime | default now                               |
| is_active     | Boolean  | default true; false = soft-deleted        |
| is_verified   | Integer  | default 0; 1=basic, 2=premium, 3+=elite; >0 bypasses review queue; rights tiers reserved for future use |
| is_private    | Boolean  | default false; true = follow requests require approval |
| bio           | String?  | up to 160 chars; shown on public profile  |
| avatar_url    | String?  | Supabase Storage public URL set by POST /api/auth/me/avatar |

### follows
| column       | type              | description                                         |
|--------------|-------------------|-----------------------------------------------------|
| id           | Integer           | primary key                                         |
| follower_id  | FK→users          | the user who is following                           |
| following_id | FK→users          | the user being followed                             |
| status       | String            | "pending" (awaiting approval) or "accepted" (active)|
| created_at   | DateTime          | default now                                         |
Unique constraint: (follower_id, following_id)

### conversations
| column     | type     | description                                    |
|------------|----------|------------------------------------------------|
| id         | Integer  | primary key                                    |
| is_group   | Boolean  | false = DM (always exactly 2 participants)     |
| name       | String?  | group display name; NULL for DMs               |
| created_by | FK→users | conversation creator                           |
| created_at | DateTime | default now                                    |

### conversation_participants
| column          | type             | description            |
|-----------------|------------------|------------------------|
| id              | Integer          | primary key            |
| conversation_id | FK→conversations | indexed                |
| user_id         | FK→users         | indexed                |
| joined_at       | DateTime         | default now            |
Unique constraint: (conversation_id, user_id)

### messages
| column          | type             | description                          |
|-----------------|------------------|--------------------------------------|
| id              | Integer          | primary key                          |
| conversation_id | FK→conversations | indexed                              |
| sender_id       | FK→users         |                                      |
| body            | Text             | plain text; 1-2000 chars enforced    |
| created_at      | DateTime         | default now, indexed                 |

### user_elo
| column         | type     | description                                  |
|----------------|----------|----------------------------------------------|
| user_id        | FK→users |                                              |
| format         | String   | one Elo rating per (user, format)            |
| rating         | Float    | starts 1000, floor 100                       |
| answered_count | Integer  | scored answers in this format (drives K)     |
Unique constraint: (user_id, format)

### quiz_answers
| column         | type     | description                                  |
|----------------|----------|----------------------------------------------|
| user_id        | FK→users |                                              |
| post_id        | FK→posts |                                              |
| question_index | Integer  | index into the post's quiz section           |
| chosen_index   | Integer  | option the user picked                       |
| is_correct     | Boolean  | decided server-side against answer_index     |
| rating_delta   | Float    | Elo change applied (0 for own posts)         |
Unique constraint: (user_id, post_id, question_index) — each question scores once

## API ENDPOINTS

```
GET  /api/interests                                    → [{id, name, slug}]
GET  /api/feed  ?interests=slug1,slug2  ?format=books  → [PostListOut]  PostListOut = PostOut with sections always []; PostOut: {id, format, title, feed_card, sections, author_id, author_username, author_is_verified, status, created_at, is_user_content, like_count, comment_count, interests[]}
GET  /api/posts/{id}                                   → PostOut  404 if not found
GET  /api/search  ?q=...  ?format=books                → [{...PostOut}]  limit 50, title matches ranked first; empty list if q is blank
POST /api/events  body: [{post_id, event_type, duration_ms?}]  → {stored: N}
GET  /health                                           → {status: "ok"}
POST /api/auth/register  body: {email, username, password}  → {access_token, token_type, user: {id, email, username, created_at}}  400 on duplicate email/username
POST /api/auth/login     body: {email, password}            → {access_token, token_type, user: {id, email, username, created_at}}  401 on bad credentials (same msg for unknown email or wrong password)
GET  /api/auth/me        Authorization: Bearer <token>      → {id, email, username, created_at}  401 if invalid/missing token
PATCH /api/auth/me      Authorization: Bearer <token>      body: {username?, new_password?, current_password?}  → updated UserOut  400 on bad current_password or duplicate username
DELETE /api/auth/me     Authorization: Bearer <token>      body: {current_password}  → 204  400 on bad current_password  (soft delete: is_active=False)
GET  /api/posts/{id}/comments                              → [{id, post_id, username, is_verified, body, created_at}]  newest first  404 if post not found
GET  /api/posts/{id}/comments?count=true                   → {count: N}  404 if post not found
POST /api/posts/{id}/comments  Authorization: Bearer <token>  body: {body}  → CommentOut  201  404 if post not found  422 if body empty or >2000 chars
DELETE /api/comments/{id}      Authorization: Bearer <token>  → 204  403 if not the comment's author  404 if not found
GET  /api/posts/{id}/likes                                 → {count: N, liked: bool}  auth optional; liked=true only when token present and user has a like event for this post
POST /api/upload/image  Authorization: Bearer <token>      multipart file field "file"  → {url: "https://<project>.supabase.co/storage/v1/object/public/uploads/images/{uuid}.ext"}  10/hr rate limit  validates magic bytes + Pillow re-encode; uploads to Supabase bucket "uploads"
POST /api/upload/svg    Authorization: Bearer <token>      multipart file field "file"  → {svg_content: "<sanitized SVG>"}  10/hr rate limit  defusedxml+lxml whitelist sanitization
POST /api/posts         Authorization: Bearer <token>      body: {format, title, feed_card, sections, interests}  → PostOut 201  status="pending"  20/day rate limit  Books requires 9 sections; image_url must use Supabase storage URL prefix; unknown interest slug → 400
GET  /api/posts/mine    Authorization: Bearer <token>                                   → [PostOut]  all statuses  ordered by created_at DESC
PATCH /api/admin/users/{user_id}/verify  Authorization: Bearer <token>                 → UserOut  sets is_verified=1  403 if caller.is_verified<1  404 if user not found
GET  /api/stats/global                                                                  → GlobalStats JSON (no auth)
GET  /api/stats/me      Authorization: Bearer <token>                                   → MyStats JSON  401 if unauthenticated
POST /api/users/{username}/follow   Authorization: Bearer <token>                       → {status: "accepted"|"pending"}  400 if already following or self-follow
DELETE /api/users/{username}/follow  Authorization: Bearer <token>                      → 204  404 if not following
POST /api/users/{username}/follow/accept  Authorization: Bearer <token>                 → {status: "accepted"}  current_user must be the target  404 if no pending request
DELETE /api/users/{username}/follow/reject  Authorization: Bearer <token>               → 204  current_user must be the target  404 if no pending request
GET  /api/users/{username}/followers                                                    → [{username, is_verified, is_private}]  empty if private+not-following
GET  /api/users/{username}/following                                                    → [{username, is_verified, is_private}]  same privacy rule
GET  /api/users/{username}/follow-requests  Authorization: Bearer <token>               → [{username, is_verified, created_at}]  403 if not own account
GET  /api/users/{username}/profile                                                      → {username, is_verified, is_private, bio, follower_count, following_count, post_count, follow_status}
GET  /api/feed/following  Authorization: Bearer <token>                                 → [PostOut]  limit 50  empty if following nobody
GET  /api/feed/user/{username}                                                          → [PostOut]  published posts by user  limit 50  404 if user not found
POST /api/auth/me/avatar  Authorization: Bearer <token>  multipart file field "file"    → UserOut with new avatar_url  10/hr  same validate_image pipeline as post images
GET  /api/search/users  ?q=...   auth optional                                          → [{username, is_verified, is_private, bio, avatar_url, is_self, follow_status}]  limit 20  prefix matches first  follow_status only when authed
POST /api/quiz/answer   auth optional  body: {post_id, question_index, chosen_index}    → {correct, correct_index, explanation, already_answered, scored, elo: {format, rating, delta, global_rating} | null}  Elo only for authed first-time answers on others' posts  60/min  400 bad index  404 missing post
GET  /api/quiz/state/{post_id}  Authorization: Bearer <token>                           → {answers: [{question_index, chosen_index, correct, correct_index, explanation}]}  restores answered quiz UI
GET  /api/users/{username}/elo                                                          → {global_rating: int|null, formats: {fmt: {rating, answered_count}}}  404 if user not found
GET  /api/chat/conversations  Authorization: Bearer <token>                             → [{id, is_group, name, participants[{username, avatar_url, is_verified}], last_message|null, created_at}]  sorted by last activity
POST /api/chat/conversations  Authorization: Bearer <token>  body: {usernames[], name?} → conversation 201  DM deduped per pair  403 if a target has no accepted follow either direction  20/hr
GET  /api/chat/conversations/{id}/messages  ?before_id&limit  Authorization: Bearer     → [{id, conversation_id, sender_id, sender_username, body, created_at}] ascending  404 for non-participants
WS   /api/chat/ws             first frame {type:"auth", token}  → {type:"auth_ok"}; then {type:"send", conversation_id, body} → broadcast {type:"message", message} to all connected participants; {type:"ping"}→pong; errors as {type:"error", detail}; closes 4401 unauthorized / 4403 insecure scheme
```

## ELO KNOWLEDGE SCORE

Standard Elo: R' = R + K * (S - E), E = 1 / (1 + 10^((Q - R) / 400)). Each quiz question is an
opponent rated by the post's difficulty (1→800, 2→1000, 3→1200; default 1000). Correct answers
gain points, wrong answers always lose points so guessing has a cost. K=32 for the first 30
answers in a format (fast convergence), K=16 after (stable). Ratings start at 1000, floored at
100, one rating per format; the global score is the average of per-format ratings. A question
can only ever be scored once per user (DB unique constraint) and answering your own post never
moves your rating, so replays and self-quizzing cannot farm Elo. answer_index/explanation are
stripped from API post payloads; correctness is decided only server-side.

## CHAT / WEBSOCKET DESIGN

One socket per client at WS /api/chat/ws serves all of that user's conversations; the server
routes by participant lookup, the client never subscribes to anything. Auth is a first frame
{type:"auth", token} validated with the existing JWT decode + is_active check (token stays out
of URLs and logs; browsers cannot set WS headers). Plain ws:// is refused (4403) unless the
client is local or x-forwarded-proto says https — production must run wss behind TLS. Sending
goes through the socket only ({type:"send"}); persistence happens before broadcast, and the
sender's echo doubles as the delivery confirmation. Participant-only authorization is re-checked
in the DB on every send and every REST call; non-participants get 404/error indistinguishable
from nonexistent conversations. Conversation creation requires an accepted follow in either
direction with every target (so private accounts are unreachable until they approve). DMs are
deduplicated per user pair; groups hold 2-19 targets + creator. Messages: plain text 1-2000
chars, 30/min per user; no E2E encryption by design (would split DM/group into two systems and
break moderation). ConnectionManager and rate limits are in-process — fine single-worker,
needs Redis pub/sub for multi-worker. Deliberate scope cuts: no read receipts, no typing
indicators, no message deletion, conversation list does not live-update (refetch on open).

## SECURITY

See SECURITY_REVIEW.md (June 2026) for the full audit: what was fixed vs accepted vs open decisions.

Comment body is untrusted user input stored as plain text. React's default JSX text rendering
writes to the DOM via `.textContent`, which the browser treats as literal characters — `<script>`
becomes `&lt;script&gt;` and cannot execute. `dangerouslySetInnerHTML` bypasses this by injecting
raw HTML directly into the DOM, enabling XSS if the string contains `<script>` tags or event
attributes. Never use `dangerouslySetInnerHTML` to render comment text.

### User-uploaded file security

- **SVG sanitized twice**: upload endpoint (sanitize_svg) + post creation (sanitize_svg_text) as defense-in-depth
- **SVG rendering**: user SVGs (is_user_content=true) rendered as `<img src="data:image/svg+xml;base64,…">` — JavaScript cannot execute in image context. Official/seed SVGs may use dangerouslySetInnerHTML (controlled pipeline); marked with a comment in PostCard.tsx and post/[id]/page.tsx
- **Image re-encoding**: Pillow converts to RGB and re-saves at quality=85, stripping steganographic payloads and ICC profiles
- **Magic-byte check**: file bytes inspected before Pillow to reject non-image content disguised with an image extension
- **Animated GIFs**: rejected outright (hard to sanitize safely)
- **UUID filenames**: upload filenames always UUID-generated — user-provided filenames are never used (prevents path traversal like `../../etc/passwd`)
- **Upload directory**: absolute path outside backend/ (`user_uploads/` at repo root) — files are never on Python's module search path
- **image_url validation**: user-submitted posts must use the Supabase storage URL prefix (`{SUPABASE_URL}/storage/v1/object/public/uploads/`) — no arbitrary external image URLs accepted
- **File size enforced via chunked reads**: Content-Length header is not trusted; reads stop as soon as the running total exceeds the limit
- **Rate limits**: 10 image uploads/hr, 10 SVG uploads/hr, 20 post submissions/day per user (in-memory, no external dependency)

## FRONTEND COMPONENTS

| file                   | responsibility                                                              |
|------------------------|-----------------------------------------------------------------------------|
| page.tsx               | 9-tab feed (For You, Following, Books, Facts, People, Ideas, Q&A, Stories, Academy); each tab is an independent lazy-fetched vertical snap feed; search button top-right above the tab strip; Following tab shows login prompt or find-people empty state; format tabs show EmptyState when empty; BottomNav (feed active) |
| PostCard.tsx           | full-screen card; Books layout: cover thumbnail + title/author + essence + teasers (amber arrows) + metadata bar; Facts layout: field label + headline + teasers (cyan arrows) + read time + DotScale; People layout: circular portrait + role label (rose-400) + name + lifespan + essence + teasers (rose arrows) + read time + DotScale; fallback for other formats shows title only; re-exports Post type from @/types/post; format styles from lib/formats.ts |
| types/post.ts          | TypeScript interfaces: Post (feed_card: Record<string,unknown>), BooksFeedCard, FactsFeedCard, PeopleFeedCard, Section, SectionType (34 types), VoiceItem, AtAGlanceBooksContent, AtAGlancePeopleContent, CoreIdeaItem, TakeawayContent, QuizItem, RelatedPostItem, SourceItem, AuthorContextContent, SeeItContent, KeyNumberItem, AngleItem, KeyFigure, StoryContent, MisconceptionItem; fcStr/fcNum typed feed_card accessors |
| SectionRenderer.tsx    | dispatch component; sorts sections by order; switches on type to render named sub-component; passes isUserContent down to SVG-rendering sections and postId to QuizSection; console.warn on unknown type; handles 34 section types (15 Books + 10 Facts + 9 People); section bodies use .prose-post (17px/1.7 serif) with px-6 py-8 wrappers |
| sections/EssenceSection.tsx | large centered text, min-height 140px |
| sections/QuizBadgeSection.tsx | amber pill badge |
| sections/VoicesSection.tsx | blockquotes with serif font, attribution footer |
| sections/AtAGlanceSection.tsx | 2-column grid; detects people vs books by presence of "born" field; people: born/died/nationality/field/known_for/read-time/difficulty; books: genre/year/country/pages/reading_ease/read-time/difficulty/best_for |
| sections/WhyEnduresSection.tsx | prose with left amber border |
| sections/HeartSection.tsx | standard prose |
| sections/StructureSection.tsx | numbered list with amber numbers |
| sections/CoreIdeasSection.tsx | per-idea: amber title h2, body, SVG block (w-full max-w-[360px] wrapper so flex context doesn't collapse it; dangerouslySetInnerHTML if !isUserContent, base64 img if isUserContent; color #e4e4e7 for currentColor), image, pull-quote, amber callout for in_practice |
| sections/TakeawaySection.tsx | framework framing: amber card; question framing: large centered amber text; optional SVG |
| sections/QuizSection.tsx | client component; tappable options POST /api/quiz/answer; green/red correctness + explanation + Elo delta chip; restores answered state from GET /api/quiz/state; summary card with score when all answered; log-in hint for anonymous users |
| Avatar.tsx (src/components) | shared avatar: Supabase URLs used as-is; legacy /uploads/ paths get API_URL prepended; initial-letter fallback; size prop; verified: number prop adds boxShadow ring (1=slate-blue, 2=gold, 3+=purple); img lazy-loaded (loading=lazy decoding=async, same attrs added to my-posts thumbnails and section images missing them; detail hero stays eager) |
| sections/RelatedPostsSection.tsx | horizontal scroll row; post_id empty → non-clickable with "Coming soon" label |
| sections/WorldContextSection.tsx | secondary text with heading |
| sections/AuthorContextSection.tsx | portrait + text + Wikipedia external link |
| sections/CritiqueSection.tsx | secondary text with heading |
| sections/SourcesSection.tsx | type badge (W/P/B/A/D) + label + external link icon |
| sections/HeadlineSection.tsx | large centered headline; digit runs + optional scale words highlighted in cyan-400 via regex |
| sections/SeeItSection.tsx | "See It" label; SVG (dangerouslySetInnerHTML/base64 per isUserContent) or image; caption + optional attribution |
| sections/KeyNumbersSection.tsx | 2-column grid; value in cyan-400, optional unit in cyan-700, label in zinc-400 |
| sections/TangibleSection.tsx | "Make It Tangible" label; bullet list with cyan dots |
| sections/HowWeKnowSection.tsx | "How We Know" label; prose block |
| sections/SurprisesSection.tsx | "Why It Surprises Us" label; cyan-950/20 background; prose in zinc-200 |
| sections/AnglesSection.tsx | "Multiple Angles" label; list of titled angles with cyan-400 titles, prose, optional SVG; passes isUserContent |
| sections/StorySection.tsx | "The Story Behind It" label; body prose; optional SVG/image; key_figures cards (name, lifespan, role in cyan-600, one_line); passes isUserContent |
| sections/BiggerPictureSection.tsx | "The Bigger Picture" label; heavier prose in zinc-200 font-medium |
| sections/MisconceptionsSection.tsx | "Common Misconceptions" label; per-item: myth (line-through, zinc-500) with red ✕, reality (zinc-300) with green ✓ |
| sections/IdentitySection.tsx | People: large lead paragraph (xl, font-semibold) |
| sections/PortraitSection.tsx | People: full-width image (max-h-420px) with caption + attribution |
| sections/WhyTheyMatterSection.tsx | People: "Why They Matter" heading + body prose |
| sections/LifeArcSection.tsx | People: "Life Arc" heading + SVG timeline (dangerouslySetInnerHTML/base64 per isUserContent; btoa uses encodeURIComponent for non-ASCII SVG text) + milestone list (year in rose-400 mono) |
| sections/DefiningMomentsSection.tsx | People: "Defining Moments" heading + chronological episodes with year (rose-400 mono), location, title (h4), body, optional SVG, optional image+caption |
| sections/GreatestWorkSection.tsx | People: "Greatest Work" heading + rose-400 title + body + optional SVG/image; passes isUserContent |
| sections/WhatDroveThemSection.tsx | People: "What Drove Them" heading + body prose |
| sections/LegacySection.tsx | People: "Legacy" heading + body prose + optional present_day_impact in rose-400/10 callout box |
| sections/TheirWorldSection.tsx | People: "The World They Lived In" heading + secondary prose |
| EmptyState.tsx         | format-aware inline SVG icon + "coming soon" message; used by format tabs when posts.length === 0 |
| BottomNav.tsx          | fixed bottom nav: Chat / Stats / Feed (flame) / Create (plus-circle, white when logged in) / Profile; 5 buttons; active item highlighted; safe-area-inset-bottom aware; Profile tab navigates to /profile/{username} (public view) when logged in, /login otherwise |
| saved-posts/page.tsx   | bookmarked posts feed: reads IDs from localStorage, fetches each via GET /api/posts/{id}, snap-scroll PostCards; skips missing posts; empty state; BottomNav (profile active) |
| search/page.tsx        | search input + format chips (All + 7 formats from lib/formats.ts) + compact result cards; debounced 300ms; links to post detail; shows inline verified badge next to author_username if author_is_verified; BottomNav (search active) |
| InterestPicker.tsx     | onboarding pill grid; 10 category sections + Other; fetches own data; gates entry to feed via localStorage |
| eventQueue.ts          | batches view/like events and POSTs them in groups rather than one-by-one    |
| auth.tsx               | AuthContext/Provider: JWT in localStorage, session restore via /me, login/register/logout/loading; AuthUser includes is_private and bio |
| api.ts                 | apiFetch: adds Authorization header when token present                      |
| Providers.tsx          | client boundary so layout.tsx (Server Component) can mount AuthProvider     |
| profile/page.tsx       | account settings: avatar, identity display (inline verified badge if is_verified), Posts/Followers/Following stats row (counts from /api/users/{me}/profile; tapping Followers or Following opens bottom-sheet user list), change username/password, sign out, delete account; BottomNav (profile active) |
| CommentsSection.tsx    | read-only display component; receives comments/currentUsername/onDelete/deletingId as props; relative timestamps (UTC-aware); plain-text only (no dangerouslySetInnerHTML); exports Comment interface (includes is_verified); shows VerifiedBadge next to username |
| CommentsBottomSheet.tsx | bottom sheet modal for feed card comments; self-contained state (fetch/post/delete); drag handle: swipe up expands to 75 vh, swipe down collapses to 50 vh or closes; X button top-right closes sheet; live translateY feedback during downward drag; sticky input; rendered via createPortal into document.body; shows VerifiedBadge next to username |
| Toast.tsx              | fixed bottom-center pill notification; visible prop controls opacity via CSS transition; pointer-events-none |
| chat/page.tsx          | conversation list + New chat overlay (multi-select user picker, optional group name); BottomNav (chat active) |
| chat/[id]/page.tsx     | conversation view: REST history + live websocket messages, bubble layout, plain-text rendering only |
| chatSocket.ts          | useChatSocket hook: first-frame JWT auth, auto-reconnect, send(); ChatMessage/Conversation types |
| stats/page.tsx         | Global, Personal, and Friends tabs; global + personal stats via useSWR (revisits render cached data instantly, refresh silently in background); personal stats prefetched in parallel with global on mount (key null until session restored); per-section chart-type pill selector; WaffleChart (10×10 grid), CalendarHeatmap (12-month squares), ActivityHeatmap (7×24 grid), GaugeChart (SVG arc + needle) as custom components; recharts for all other chart types; Friends tab fetches /following + /elo + /profile per participant and renders 7 CategorySection blocks: Knowledge Leaderboard, Per-format Elo, Quiz Activity, Knowledge Efficiency (Elo/answer), Knowledge Breadth, Content Created, Social |

## CURRENT STATUS

**Built**
- FastAPI backend with PostgreSQL (Supabase), CORS, full API
- Section-based post schema: feed_card JSON + sections JSON array; old per-format fields removed
- 15 section types for Books format (validated via Pydantic v2 discriminated union)
- Seed script: 145 interests + auto-discovers all *_example.json files (currently Books + Facts + People); FORMAT_INTEREST_SLUGS maps format → interests; _post_title falls back to feed_card.name for People
- Legacy DB preserved as backend/deepscroll.db.legacy_*
- Onboarding: interest picker → slugs saved to localStorage → gates feed
- Feed: 9-tab horizontal swipe (For You + Following + 7 formats) + vertical snap scroll per tab
- Quiz + Elo: interactive quizzes, server-validated answers, per-format + global knowledge score (see ELO KNOWLEDGE SCORE)
- Profiles: avatar upload, knowledge score, follower/following lists, account search, follow UI end-to-end
- EmptyState component for format tabs with no posts yet
- Books feed card: cover, title, author, essence, 3 teasers, difficulty DotScale, year/genre
- Detail page: SectionRenderer renders 34 section types (15 Books + 10 Facts + 9 People) in order (SVG security: dangerouslySetInnerHTML for seed, base64 img for user)
- Create page: 3-step Books wizard with Feed Card block + interest picker (1–5) + 15 section accordions
- My-posts page: cover thumbnail + title + author + status from feed_card
- User accounts: JWT auth, register/login, follow system, public profiles, comments, likes, saves
- Stats page, verification system, saved posts
- Real-time chat: DMs + group chats over WebSocket (see CHAT / WEBSOCKET DESIGN), conversation list + chat view, chat in bottom nav (search moved top-right)
- Security hardening pass (June 2026, see SECURITY_REVIEW.md)
- "Lamplight" visual redesign (June 2026, see docs/DESIGN.md): warm dark token system in globals.css drives every screen; Newsreader serif + Source Sans 3 + Geist Mono type system; muted book-spine format inks; per-post --accent CSS variable replaces hardcoded section colors; seed SVGs re-paletted at render time in SvgBlock (content JSON untouched); shared component vocabulary (.card/.btn/.field/.chip/.label-caps)

**Next**
- Content for academy format
- Recommendation algorithm improvements
- Pagination / infinite scroll
