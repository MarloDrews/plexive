# Deepscroll Architecture

## FOLDER STRUCTURE

```
backend/
  requirements.txt              fastapi, uvicorn, sqlalchemy, passlib[bcrypt], python-jose[cryptography], python-dotenv, email-validator
  .env.example                  JWT_SECRET template (copy to .env, never commit .env)
  seed.py                       idempotent: get-or-create 145 interests from taxonomy; reads SEED_ADMIN_PASSWORD from backend/.env; get-or-create @Marlo (marlo07drews@gmail.com, is_verified=True); auto-discovers all *_example.json files in docs/content-structure/examples/ — upserts one post per file (format derived from filename, title from feed_card.title|the_question|headline|name); upsert key is (author_id, format) so title changes do not create duplicates; FORMAT_INTEREST_SLUGS dict maps format → interest slugs (books/facts/questions/stories defined); legacy DB preserved as deepscroll.db.legacy_*
  deepscroll.db                 SQLite database (gitignored)
  app/
    database.py                 engine, SessionLocal, Base, get_db dependency
    main.py                     FastAPI app, CORS for localhost:3000, router registration, create_all on startup
    models.py                   ORM models: Interest, Post (feed_card JSON not null, sections JSON not null, is_user_content Boolean not null default False, author_id FK→users nullable; indexes on format/status/created_at; author_username and author_is_verified as properties), Event (user_id nullable FK), User (posts relationship, is_verified boolean default false, is_private boolean default false, bio string nullable), Follow (follower_id FK→users, following_id FK→users, status "pending"|"accepted", created_at; UniqueConstraint uq_follow), Comment, post_interests join table
    auth.py                     hash_password, verify_password, create_access_token, decode_access_token, get_current_user, get_optional_user (returns User|None, used for optional auth)
    schemas.py                  Pydantic v2 models: 15 section types with Literal discriminator → AnySection union; BooksFeedCard; PostCreate (Books required sections: essence/quiz_badge/voices/at_a_glance/heart/core_ideas/takeaway/quiz/sources; image_url recursive check for /uploads/ prefix); PostOut (feed_card dict, sections list[dict], is_user_content bool, like_count int, comment_count int); UserOut, InterestOut, EventIn, UploadResponse, SvgUploadResponse
    sanitize.py                 validate_image() — chunked read, magic-byte check, animated-GIF reject, Pillow re-encode; sanitize_svg() / sanitize_svg_text() — defusedxml XXE check, lxml element+attribute whitelist, dangerous-pattern rejection
    upload_config.py            UPLOAD_DIR (absolute path at repo root/user_uploads/), size limits (5 MB images, 512 KB SVGs)
    rate_limit.py               in-memory per-user rate limiter (dict of timestamps); check_rate_limit(user_id, key, max, window_secs)
    post_counts.py              attach_counts(posts, db) / attach_counts_one(post, db) — batched like_count+comment_count attachment shared by posts/feed/search routers
    scoring.py                    score_posts() — interest match (tier-scaled), format engagement, repeat penalty
    routers/
      interests.py              GET /api/interests
      feed.py                   GET /api/feed — three-tier: direct matches → related co-tags → all remaining; GET /api/feed/following (auth, posts from followed users, limit 50); GET /api/feed/user/{username} (no auth, published posts by user, limit 50)

      events.py                 POST /api/events (captures user_id when auth token present; deduplicates "like" events per user+post for auth users, also within a batch); GET /api/posts/{id}/likes → {count, liked}
      auth.py                   POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, PATCH /api/auth/me (update username/password/is_private/bio), DELETE /api/auth/me (soft delete: sets is_active=False)
      follows.py                POST /api/users/{username}/follow; DELETE /api/users/{username}/follow; POST /api/users/{username}/follow/accept; DELETE /api/users/{username}/follow/reject; GET /api/users/{username}/followers; GET /api/users/{username}/following; GET /api/users/{username}/follow-requests (auth, own only); GET /api/users/{username}/profile (no auth, returns counts + follow_status)
      search.py                 GET /api/search — Python-side search across post.title, feed_card.essence, feed_card.author, heart section content, core_ideas title+body; ranked by title-match then recency; limit 50
      comments.py               GET /api/posts/{id}/comments?count=true → {count} or full list; POST /api/posts/{id}/comments (auth); DELETE /api/comments/{id} (auth, own comment only)
      uploads.py                POST /api/upload/image (10/hr, validate_image, UUID filename); POST /api/upload/svg (10/hr, sanitize_svg, returns svg_content string not URL)
      admin.py                  PATCH /api/admin/users/{user_id}/verify — sets is_verified=True; caller must be authenticated and is_verified; 403 otherwise
      posts.py                  GET /api/posts/mine (auth, any status); POST /api/posts (auth, 20/day, status="published" if verified else "pending", sets is_user_content=True, sanitizes visual_svg fields); GET /api/posts/{id} (pending visible to author only); _attach_counts() helper adds like_count+comment_count as Python attributes before Pydantic serialization
      stats.py                  GET /api/stats/global (no auth, all platform analytics); GET /api/stats/me (auth, personal stats — my_streak/my_milestones/my_engagement_score computed server-side); FORMATS includes all 7 formats incl. academy

user_uploads/                 gitignored; absolute path outside backend/ so files are never importable as Python modules; subdirs: images/, svgs/

frontend/
  .env.example                  NEXT_PUBLIC_API_URL template
  .env.local                    actual env vars (gitignored)
  src/app/
    layout.tsx                  root layout, Geist font, title "Deepscroll"
    globals.css                 Tailwind import, Geist font wiring, design tokens (@theme: surface-0/1/2/overlay, edge/edge-strong, ink levels, radius-card/field), dark-only body base, heart-pop + heart-boom keyframes
    page.tsx                    home feed: 8-tab bar (For You + 7 formats derived from lib/formats.ts), horizontal snap between tabs, vertical snap within each, real-time indicator; BottomNav (feed active)
    onboarding/
      page.tsx                  server component — renders InterestPicker (no props)
      InterestPicker.tsx        client — fetches /api/interests, groups 145 pills into 10 categories, sticky header/footer, saves slugs to localStorage
    login/
      page.tsx                  login form: email + password, inline error messages, redirects to / on success or if already logged in
    register/
      page.tsx                  register form: email + username + password, inline error messages, redirects to / on success or if already logged in
    profile/
      page.tsx                  account page: avatar (initials), @username, email, "My posts →" link, bio textarea (160 chars, save button), private account toggle (PATCH /api/auth/me), follow requests panel (private accounts only, accept/decline each), inline forms for change username / change password / sign out / delete account; BottomNav (profile active)
      [username]/
        page.tsx                public profile: header with back + settings/more-options, 72px avatar, verified badge, bio, stats row (posts/followers/following), follow/unfollow button, Posts|Saved|Liked tabs; fetches /api/users/{username}/profile and /api/feed/user/{username}; BottomNav (profile active)
    search/
      page.tsx                  search input + format chips + compact result cards; debounced 300ms; navigates to post detail; BottomNav (search active); attribution (@user or Deepscroll) below title in result cards
    create/
      page.tsx                  3-step Books creation wizard: step 1 — 7 format cards (only Books enabled, rest "coming soon"); step 2 — duplicate check; step 3 — Books form with Feed Card block, interest picker (1–5 required), 15 section accordions (9 required / 6 optional); submits {format, title, feed_card, sections, interests} to POST /api/posts; success screen links to /my-posts; BottomNav (create active)
    my-posts/
      page.tsx                  lists the current user's own posts with cover thumbnail (from feed_card.cover_url), title, author, format badge, status badge, timestamps; fetches GET /api/posts/mine; empty state links to /create; BottomNav (create active)
    saved-posts/
      page.tsx                  bookmarked posts: reads IDs from localStorage via getSavedPostIds, fetches each via GET /api/posts/{id} (auth optional; pending author-only posts load correctly), renders as full-screen snap-scroll PostCards; skips missing/deleted posts silently; empty state with bookmark icon; BottomNav (profile active)
    post/
      [id]/
        page.tsx                full-screen detail page; header: format badge, attribution, cover image (Books), title, author, interest tags; SectionRenderer renders all 15 section types in order; sticky comment bar with like + save + share buttons; slide-up animation, swipe-right-to-close; attribution: Submitted by @user (blue verified badge) for user content; Deepscroll + violet badge for seed/official
    components/
      PostCard.tsx               full-screen snap card; format-aware layout with image, stat/meta highlight, hook, inline SVG; re-exports Post type; format styles come from lib/formats.ts
      BottomNav.tsx              fixed bottom nav: Search / Stats / Feed (flame) / Create (plus-circle, center, white when logged in) / Profile; 5 buttons; active item highlighted; safe-area-inset-bottom aware
      Providers.tsx              "use client" boundary; wraps children with AuthProvider so layout.tsx stays a Server Component
    lib/
      eventQueue.ts             module-level batch queue; flushes every 5s or at 5 events to POST /api/events with Authorization header when token present; exports hasPendingLike/cancelPendingLike so unlike-before-flush can cancel an in-flight event; deduplicates "like" events per post_id within the current queue
      useWikipediaImage.ts      hook — fetches portrait from Wikipedia REST API for people posts without image_url; returns thumbnail or original size
      auth.tsx                  AuthContext + AuthProvider: stores JWT in localStorage under "deepscroll_token", restores session via /api/auth/me on load, exposes user/login/register/logout/updateUser/loading; normalizes FastAPI string/array error details
      api.ts                    apiFetch wrapper: prepends NEXT_PUBLIC_API_URL, attaches Authorization: Bearer header when token present; skips Content-Type for FormData bodies
      relativeTime.ts           shared relativeTime(iso) formatter (just now / Nm / Nh / Nd / short date)
      likedPosts.ts             isPostLiked, likePost, unlikePost, getLikedPostIds; localStorage key "deepscroll_liked"; getCachedLikeCount/setCachedLikeCount; key "deepscroll_like_counts"; isLikeSent/markLikeSent/unmarkLikeSent; key "deepscroll_like_sent" tracks posts whose like event reached the backend — used in the server-count reconciliation formula; one-time migration seeds sent-key from liked-key; server-safe; TODO: replace with backend endpoint
      savedPosts.ts             isPostSaved, savePost, unsavePost, getSavedPostIds; localStorage key "deepscroll_saved"; server-safe; TODO: replace with backend endpoint
  src/lib/
    formats.ts                  single source of format identity: FORMAT_IDS, FORMAT_STYLES (label, badge, accent hex, rgb, text/dot/border/indicator classes, glow, radial), formatStyle() with neutral fallback
  src/components/
    SvgBlock.tsx                shared visual_svg renderer; user content → UTF-8-safe base64 <img>, seed → dangerouslySetInnerHTML; className/color props for per-section layout
    SectionLabel.tsx            unified section header (h3, text-xs uppercase tracking-widest, zinc-500 default, color override)
    VerifiedBadge.tsx           blue user check / violet official check, size prop
    Spinner.tsx                 unified loading spinner (sm/md)
    PostRow.tsx                 compact post list card (format dot + badge + title) used by profile tabs
    SectionRenderer.tsx         maps section.type → component; handles all sections for books/facts/people/concepts/questions/stories formats
    sections/
      (books/facts/people/concepts sections — existing)
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
| is_verified   | Boolean  | default false; true = bypasses review queue (posts go to "published"), can verify other users via admin endpoint |
| is_private    | Boolean  | default false; true = follow requests require approval |
| bio           | String?  | up to 160 chars; shown on public profile  |

### follows
| column       | type              | description                                         |
|--------------|-------------------|-----------------------------------------------------|
| id           | Integer           | primary key                                         |
| follower_id  | FK→users          | the user who is following                           |
| following_id | FK→users          | the user being followed                             |
| status       | String            | "pending" (awaiting approval) or "accepted" (active)|
| created_at   | DateTime          | default now                                         |
Unique constraint: (follower_id, following_id)

## API ENDPOINTS

```
GET  /api/interests                                    → [{id, name, slug}]
GET  /api/feed  ?interests=slug1,slug2  ?format=books  → [PostOut]  PostOut: {id, format, title, feed_card, sections, author_id, author_username, author_is_verified, status, created_at, is_user_content, like_count, comment_count, interests[]}
GET  /api/posts/{id}                                   → PostOut  404 if not found
GET  /api/search  ?q=...  ?format=books                → [{...PostOut}]  limit 50, title matches ranked first; empty list if q is blank
POST /api/events  body: [{post_id, event_type, duration_ms?}]  → {stored: N}
GET  /health                                           → {status: "ok"}
POST /api/auth/register  body: {email, username, password}  → {access_token, token_type, user: {id, email, username, created_at}}  400 on duplicate email/username
POST /api/auth/login     body: {email, password}            → {access_token, token_type, user: {id, email, username, created_at}}  401 on bad credentials (same msg for unknown email or wrong password)
GET  /api/auth/me        Authorization: Bearer <token>      → {id, email, username, created_at}  401 if invalid/missing token
PATCH /api/auth/me      Authorization: Bearer <token>      body: {username?, new_password?, current_password?}  → updated UserOut  400 on bad current_password or duplicate username
DELETE /api/auth/me     Authorization: Bearer <token>      body: {current_password}  → 204  400 on bad current_password  (soft delete: is_active=False)
GET  /api/posts/{id}/comments                              → [{id, post_id, username, body, created_at}]  newest first  404 if post not found
GET  /api/posts/{id}/comments?count=true                   → {count: N}  404 if post not found
POST /api/posts/{id}/comments  Authorization: Bearer <token>  body: {body}  → CommentOut  201  404 if post not found  422 if body empty or >2000 chars
DELETE /api/comments/{id}      Authorization: Bearer <token>  → 204  403 if not the comment's author  404 if not found
GET  /api/posts/{id}/likes                                 → {count: N, liked: bool}  auth optional; liked=true only when token present and user has a like event for this post
POST /api/upload/image  Authorization: Bearer <token>      multipart file field "file"  → {url: "/uploads/images/{uuid}.ext"}  10/hr rate limit  validates magic bytes + Pillow re-encode
POST /api/upload/svg    Authorization: Bearer <token>      multipart file field "file"  → {svg_content: "<sanitized SVG>"}  10/hr rate limit  defusedxml+lxml whitelist sanitization
POST /api/posts         Authorization: Bearer <token>      body: {format, title, feed_card, sections, interests}  → PostOut 201  status="pending"  20/day rate limit  Books requires 9 sections; image_url must use /uploads/ prefix; unknown interest slug → 400
GET  /api/posts/mine    Authorization: Bearer <token>                                   → [PostOut]  all statuses  ordered by created_at DESC
PATCH /api/admin/users/{user_id}/verify  Authorization: Bearer <token>                 → UserOut  sets is_verified=True  403 if caller is not verified  404 if user not found
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
```

## SECURITY

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
- **image_url validation**: user-submitted posts must use `/uploads/` prefix — no external image URLs accepted
- **File size enforced via chunked reads**: Content-Length header is not trusted; reads stop as soon as the running total exceeds the limit
- **Rate limits**: 10 image uploads/hr, 10 SVG uploads/hr, 20 post submissions/day per user (in-memory, no external dependency)

## FRONTEND COMPONENTS

| file                   | responsibility                                                              |
|------------------------|-----------------------------------------------------------------------------|
| page.tsx               | 8-tab feed (For You, Books, Facts, People, Ideas, Q&A, Stories, Academy — no Following tab); each tab is an independent lazy-fetched vertical snap feed; format tabs show EmptyState when empty; BottomNav (feed active) |
| PostCard.tsx           | full-screen card; Books layout: cover thumbnail + title/author + essence + teasers (amber arrows) + metadata bar; Facts layout: field label + headline + teasers (cyan arrows) + read time + DotScale; People layout: circular portrait + role label (rose-400) + name + lifespan + essence + teasers (rose arrows) + read time + DotScale; fallback for other formats shows title only; re-exports Post type from @/types/post; format styles from lib/formats.ts |
| types/post.ts          | TypeScript interfaces: Post (feed_card: Record<string,unknown>), BooksFeedCard, FactsFeedCard, PeopleFeedCard, Section, SectionType (34 types), VoiceItem, AtAGlanceBooksContent, AtAGlancePeopleContent, CoreIdeaItem, TakeawayContent, QuizItem, RelatedPostItem, SourceItem, AuthorContextContent, SeeItContent, KeyNumberItem, AngleItem, KeyFigure, StoryContent, MisconceptionItem; fcStr/fcNum typed feed_card accessors |
| SectionRenderer.tsx    | dispatch component; sorts sections by order; switches on type to render named sub-component; passes isUserContent down to SVG-rendering sections; console.warn on unknown type; handles 34 section types (15 Books + 10 Facts + 9 People) |
| sections/EssenceSection.tsx | large centered text, min-height 140px |
| sections/QuizBadgeSection.tsx | amber pill badge |
| sections/VoicesSection.tsx | blockquotes with serif font, attribution footer |
| sections/AtAGlanceSection.tsx | 2-column grid; detects people vs books by presence of "born" field; people: born/died/nationality/field/known_for/read-time/difficulty; books: genre/year/country/pages/reading_ease/read-time/difficulty/best_for |
| sections/WhyEnduresSection.tsx | prose with left amber border |
| sections/HeartSection.tsx | standard prose |
| sections/StructureSection.tsx | numbered list with amber numbers |
| sections/CoreIdeasSection.tsx | per-idea: amber title h2, body, SVG block (w-full max-w-[360px] wrapper so flex context doesn't collapse it; dangerouslySetInnerHTML if !isUserContent, base64 img if isUserContent; color #e4e4e7 for currentColor), image, pull-quote, amber callout for in_practice |
| sections/TakeawaySection.tsx | framework framing: amber card; question framing: large centered amber text; optional SVG |
| sections/QuizSectionPlaceholder.tsx | client component; "Reveal answer" expand; answer highlighted in amber; "Quiz scoring coming soon" note |
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
| BottomNav.tsx          | fixed bottom nav: Search / Stats / Feed (flame) / Create (plus-circle, white when logged in) / Profile; 5 buttons; active item highlighted; safe-area-inset-bottom aware |
| saved-posts/page.tsx   | bookmarked posts feed: reads IDs from localStorage, fetches each via GET /api/posts/{id}, snap-scroll PostCards; skips missing posts; empty state; BottomNav (profile active) |
| search/page.tsx        | search input + format chips (All + 7 formats from lib/formats.ts) + compact result cards; debounced 300ms; links to post detail; shows inline verified badge next to author_username if author_is_verified; BottomNav (search active) |
| InterestPicker.tsx     | onboarding pill grid; 10 category sections + Other; fetches own data; gates entry to feed via localStorage |
| eventQueue.ts          | batches view/like events and POSTs them in groups rather than one-by-one    |
| useWikipediaImage.ts   | fetches Wikipedia portrait for people posts lacking image_url; thumbnail or original size |
| auth.tsx               | AuthContext/Provider: JWT in localStorage, session restore via /me, login/register/logout/loading; AuthUser includes is_private and bio |
| api.ts                 | apiFetch: adds Authorization header when token present                      |
| Providers.tsx          | client boundary so layout.tsx (Server Component) can mount AuthProvider     |
| profile/page.tsx       | account settings: avatar, identity display (inline verified badge if is_verified), change username/password, sign out, delete account; BottomNav (profile active) |
| CommentsSection.tsx    | read-only display component; receives comments/currentUsername/onDelete/deletingId as props; relative timestamps (UTC-aware); plain-text only (no dangerouslySetInnerHTML); exports Comment interface |
| CommentsBottomSheet.tsx | bottom sheet modal for feed card comments; self-contained state (fetch/post/delete); drag-to-close on handle bar; sticky input; fixed overlay with max-w-[430px] sheet |
| Toast.tsx              | fixed bottom-center pill notification; visible prop controls opacity via CSS transition; pointer-events-none |
| stats/page.tsx         | Global and My Stats tabs; 19 global sections + 17 personal sections; per-section chart-type pill selector; WaffleChart (10×10 grid), CalendarHeatmap (12-month squares), ActivityHeatmap (7×24 grid), GaugeChart (SVG arc + needle) as custom components; recharts for all other chart types |

## CURRENT STATUS

**Built**
- FastAPI backend with SQLite, CORS, full API
- Section-based post schema: feed_card JSON + sections JSON array; old per-format fields removed
- 15 section types for Books format (validated via Pydantic v2 discriminated union)
- Seed script: 145 interests + auto-discovers all *_example.json files (currently Books + Facts + People); FORMAT_INTEREST_SLUGS maps format → interests; _post_title falls back to feed_card.name for People
- Legacy DB preserved as backend/deepscroll.db.legacy_*
- Onboarding: interest picker → slugs saved to localStorage → gates feed
- Feed: 8-tab horizontal swipe (For You + 7 formats, no Following tab) + vertical snap scroll per tab
- EmptyState component for format tabs with no posts yet
- Books feed card: cover, title, author, essence, 3 teasers, difficulty DotScale, year/genre
- Detail page: SectionRenderer renders 34 section types (15 Books + 10 Facts + 9 People) in order (SVG security: dangerouslySetInnerHTML for seed, base64 img for user)
- Create page: 3-step Books wizard with Feed Card block + interest picker (1–5) + 15 section accordions
- My-posts page: cover thumbnail + title + author + status from feed_card
- User accounts: JWT auth, register/login, follow system, public profiles, comments, likes, saves
- Stats page, verification system, saved posts

**Next**
- Content for formats other than Books, Facts, and People (concepts, questions, stories, academy)
- Quiz scoring implementation
- Recommendation algorithm improvements
- Pagination / infinite scroll
- PostgreSQL migration
