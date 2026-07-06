# Web Review: Security
Date: 2026-07-06 | Model: Claude Fable 5 (claude-fable-5) | Scope: backend (FastAPI: app/ and routers/), frontend (Next.js: src/), config (main.py, upload_config.py, .env.example, docs/SERVER.md), dependencies (npm audit, pinned pip versions)

This is a defensive pre-launch audit. It catalogs weaknesses and the direction of the fix. It contains no exploit code and proposes no rewrite. Every finding is grounded in a file and line that was opened during the review. Where exploitability is uncertain, the finding is kept and marked with a lower confidence rather than dropped.

A prior internal audit exists at `docs/SECURITY_REVIEW.md` (June 2026). Several items below were accepted there as launch decisions; they are re-reported here with current line references so the launch checklist is complete in one place. New regressions and newly reached code (chat, battle, train, graph edges, stats) are flagged as such.

## Files reviewed

Backend:
- `backend/app/main.py`, `auth.py`, `sanitize.py`, `rate_limit.py`, `upload_config.py`, `schemas.py`, `database.py` (partial), `graph_edges.py` (partial)
- `backend/app/routers/auth.py`, `admin.py`, `posts.py`, `uploads.py`, `events.py`, `quiz.py`, `train.py`, `feed.py`, `stats.py`, `search.py` (via agent), `comments.py` (via agent), `follows.py` (via agent), `chat.py` (via agent), `battle.py` (via agent), `interests.py` (via agent)
- `backend/.env.example`, `docs/SERVER.md`, `docs/SECURITY_REVIEW.md`

Frontend:
- `frontend/src/app/lib/auth.tsx`, `api.ts`, `swr.ts`, `chatSocket.ts`, `battleSocket.ts`, `eventQueue.ts`, `likedPosts.ts`, `savedPosts.ts`
- `frontend/src/components/SvgBlock.tsx`, `MathText.tsx`, `BookCover.tsx`, `SectionRenderer.tsx`, `PostCard.tsx`
- `frontend/src/components/sections/SourcesSection.tsx`, `AuthorContextSection.tsx`, `PaperCardSection.tsx`
- `frontend/src/app/create/page.tsx`, `frontend/next.config.ts`, `frontend/package.json`, `frontend/.env.example`

Config and tooling:
- `frontend/package.json` + `npm audit`; backend pinned versions via `pip freeze` (pip-audit was not installed, so backend dependency review is version-based manual analysis, noted at SEC-031)

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|----|-------|----------|------------|----------|--------|
| SEC-001 | Verification is a self-propagating privilege that also unlocks auto-publish | High | High | security | M |
| SEC-002 | Any verified user can read any user's email via the verify endpoint | Medium | High | security | S |
| SEC-003 | JWT secret strength not validated; the shipped placeholder is accepted | Medium | High | security | S |
| SEC-004 | Per-IP rate limits are spoofable under the documented `--forwarded-allow-ips=*` deploy | Medium | High | security | S |
| SEC-005 | `POST /events` has no auth and no rate limit; counters and read-time are client-forgeable | Medium | High | security | S |
| SEC-006 | `GET /feed` loads and scores every published post unbounded, unauthenticated | Medium | High | security | M |
| SEC-007 | `POST /train/answer` trusts client-decided correctness and writes the ranking score | Medium | High | security | M |
| SEC-008 | `image_url` upload-prefix enforcement only runs for the books format | Medium | High | security | S |
| SEC-009 | User-supplied URLs render as `href` with no scheme validation | Medium | Medium | security | S |
| SEC-010 | KaTeX failure path injects the raw user string via `dangerouslySetInnerHTML` | Medium | Low | security | S |
| SEC-011 | JWT stored in localStorage with no Content-Security-Policy | Medium | High | security | M |
| SEC-012 | JWTs are not revoked on password change and live 30 days | Low | High | security | M |
| SEC-013 | Non-books `feed_card` and section text have no shape or length caps | Low | High | security | M |
| SEC-014 | Identity-key collision lets a verified user hijack cross-post read-next edges | Low | Medium | security | M |
| SEC-015 | Login is a timing oracle for registered emails | Low | High | security | S |
| SEC-016 | Registration returns a definitive email-exists signal | Low | High | security | S |
| SEC-017 | `GET /quiz/state/{id}` skips the pending-post visibility rule (existence oracle) | Low | High | security | S |
| SEC-018 | `POST /quiz/answer` returns the answer key to anonymous callers with no rate limit | Low | High | security | S |
| SEC-019 | Rate limiter and socket registries are per-process, in-memory | Low | High | security | M |
| SEC-020 | Several authenticated write endpoints have no rate limit | Low | High | security | S |
| SEC-021 | WebSocket sockets are unthrottled pre-auth and never re-validated once open | Low | Medium | security | M |
| SEC-022 | Request-body cap trusts `Content-Length` only (chunked bypass) | Low | High | security | S |
| SEC-023 | Image validation does not cap decoded pixels (decompression bomb) | Low | High | security | S |
| SEC-024 | Content image URLs and avatars render with no scheme allowlist | Low | High | security | S |
| SEC-025 | `feed_card` SVG is not re-sanitized on post creation | Low | Medium | security | S |
| SEC-026 | `BookCover` defaults `isUserContent` to false (fails open) | Low | High | security | S |
| SEC-027 | SVG `<use>` is allowed while its href is not whitelisted (latent risk) | Low | Medium | security | S |
| SEC-028 | User search does not escape LIKE wildcards | Low | High | security | S |
| SEC-029 | WebSocket TLS gate trusts a spoofable `x-forwarded-proto` | Low | High | security | S |
| SEC-030 | Frontend dependencies: three moderate npm advisories | Low | High | security | S |
| SEC-031 | Backend dependency: python-jose pulls ecdsa with an unfixed timing advisory | Low | Low | security | S |

## Findings

### SEC-001: Verification is a self-propagating privilege that also unlocks auto-publish
- Location: `backend/app/routers/admin.py:12-29`; privilege consumed at `backend/app/routers/posts.py:96`; column at `backend/app/models.py` (`is_verified`)
- Severity: High | Confidence: High | Category: security
- Description: The only gate on `PATCH /api/admin/users/{user_id}/verify` is `if current_user.is_verified < 1: raise 403`, after which `target.is_verified = 1`. There is no separate admin role, no rate limit, and no audit trail. Verification is therefore transitive: any verified user can verify any other user, who can then verify others. The same `is_verified` flag also decides publication in `create_post`: `status = "published" if current_user.is_verified else "pending"` (posts.py:96), so verification is not only a badge but the moderation bypass. The target lookup at admin.py:23 also omits the `is_active` filter, so a soft-deleted account can be verified.
- Impact: A single compromised or malicious verified account can mint unlimited verified accounts and grant unlimited accounts the ability to publish content that skips the pending queue. The trust and moderation model collapses from one account, with no record of who did it.
- Fix approach: Introduce a distinct `is_admin` capability separate from the `is_verified` badge, restrict this endpoint to admins, seed the first admin out of band, add a rate limit and an audit log, and add the `is_active` filter to the target lookup.
- Effort: M | Depends on: none (SEC-002 shares this endpoint)

### SEC-002: Any verified user can read any user's email via the verify endpoint
- Location: `backend/app/routers/admin.py:12-29` returns `UserOut`; schema at `backend/app/schemas.py:12-23`
- Severity: Medium | Confidence: High | Category: security
- Description: `verify_user` is declared `response_model=UserOut` and returns the target user object. `UserOut` includes `email` (schemas.py:17) and the internal `id`. For self-only endpoints (`/auth/me`, register, login) reflecting the caller's own email is fine, but here the response is another user's record. Combined with SEC-001 (any verified user can call verify on any `user_id`), this becomes a cross-account email-harvesting path: enumerate ids, call verify, read the returned email.
- Impact: PII (email) disclosure for arbitrary users to any verified account. The June audit stated stats endpoints leak no emails; this response path does.
- Fix approach: Return a public projection (username, is_verified, avatar_url, bio) from the verify endpoint, and keep the email-bearing `UserOut` only on self-scoped responses.
- Effort: S | Depends on: SEC-001

### SEC-003: JWT secret strength not validated; the shipped placeholder is accepted
- Location: `backend/app/auth.py:18-20`; placeholder at `backend/.env.example:2` (`JWT_SECRET=your-secret-key-here`)
- Severity: Medium | Confidence: High | Category: security
- Description: The server correctly refuses to start when `JWT_SECRET` is unset (a good control). It accepts any non-empty value, including the example placeholder `your-secret-key-here` and any short or low-entropy string. With HS256 (auth.py:22), the secret is the sole barrier to forging tokens.
- Impact: If the app is ever deployed with the placeholder or a weak secret, an attacker who knows or brute-forces it can mint a valid token for any `sub` (any user id), fully bypassing authentication and impersonating any account, including a verified one (which then chains into SEC-001).
- Fix approach: At startup, reject a secret shorter than roughly 32 bytes and reject the known placeholder value; the example already documents `secrets.token_hex(32)` as the generator.
- Effort: S | Depends on: none

### SEC-004: Per-IP rate limits are spoofable under the documented deploy
- Location: `docs/SERVER.md:35` (`uvicorn ... --proxy-headers --forwarded-allow-ips=*`, bound to `0.0.0.0:8000`); IP derivation at `backend/app/routers/auth.py:25-26`, used at auth.py:66, auth.py:88, and `backend/app/routers/search.py`
- Severity: Medium | Confidence: High | Category: security
- Description: `_client_ip` reads `request.client.host`, which is the safe choice only when uvicorn sees the real peer. The documented production command sets `--forwarded-allow-ips=*`, which tells uvicorn to trust `X-Forwarded-For` from any peer and rewrite `request.client.host` from it. Because the process binds `0.0.0.0:8000`, any client that can reach it can send a fresh forged `X-Forwarded-For` per request and receive a fresh rate-limit bucket every time. The per-IP register limit (10/hour, auth.py:66), the per-IP login limit (30/5 min, auth.py:88), and the anonymous search limit key on this value. The per-email login limit (auth.py:89) is not IP-based and remains a real backstop against single-account brute force.
- Impact: Mass registration and distributed credential stuffing are effectively unthrottled per IP. The same trust also feeds the WebSocket `x-forwarded-proto` gate (see SEC-029). Note the deploy is described as Tailscale-only today, which narrows current reachability, but the setting is a launch-time trap if the port becomes internet reachable.
- Fix approach: Set `--forwarded-allow-ips` to the reverse-proxy IP only (not `*`), ensure the proxy overwrites inbound `X-Forwarded-*`, and keep port 8000 unreachable except through the trusted proxy. Keep the per-email limit as the identity-anchored backstop.
- Effort: S | Depends on: none

### SEC-005: `POST /events` has no auth and no rate limit; counters and read-time are client-forgeable
- Location: `backend/app/routers/events.py:15-76`; schema at `backend/app/schemas.py:25-28`
- Severity: Medium | Confidence: High | Category: security
- Description: `create_events` uses `get_optional_user` (anonymous allowed) and calls no `check_rate_limit` (the router does not import it). The only cap is 50 events per batch (events.py:22); batches are unlimited. Like dedup only runs when a user is present (events.py:43-56), so anonymous likes (`user_id=None`) are never deduped. `EventIn.event_type` is a free-form `str` and `duration_ms` is an unbounded client integer stored verbatim (events.py:68-73); both feed the stats aggregations (for example `top_creators_by_avg_read_time` and the like/view series).
- Impact: An anonymous client can inflate public like and view counts, write junk `event_type` values, set arbitrary `duration_ms` to top read-time leaderboards, and flood the events table (storage and DoS). All engagement-derived analytics become forgeable.
- Fix approach: Add per-identity rate limiting (reuse the `ip:` identity used by search for anonymous callers), require auth for like events or dedup anonymous likes by IP, constrain `event_type` to a `Literal` allowlist, and clamp `duration_ms` to a sane range.
- Effort: S | Depends on: none

### SEC-006: `GET /feed` loads and scores every published post unbounded, unauthenticated
- Location: `backend/app/routers/feed.py:37-71`; `score_posts` at `backend/app/scoring.py`
- Severity: Medium | Confidence: High | Category: security
- Description: The main feed selects all published post ids (feed.py:37-43), then loads the full rows (feed_card and sections JSON eager-loaded) for every one, then `score_posts` additionally reads events from the last 30 days, all per request, with no auth, no pagination, no limit, and no rate limit. Tier scoring is O(posts x interests) in Python. The sibling endpoints `/feed/following` and `/feed/user/{username}` are capped at 50 (feed.py:93, feed.py:113); the main `/feed` is not.
- Impact: As the corpus grows, this becomes an unbounded memory and CPU cost on the hottest anonymous endpoint. A few concurrent requests can exhaust the single worker.
- Fix approach: Add server-side pagination and a hard cap on posts scored per request, push status and format filtering plus ordering into the database, add a short cache like `/stats/global` already has, and rate-limit the endpoint.
- Effort: M | Depends on: none

### SEC-007: `POST /train/answer` trusts client-decided correctness and writes the ranking score
- Location: `backend/app/routers/train.py:20-49` (caveat documented at train.py:31-36)
- Severity: Medium | Confidence: High | Category: security
- Description: `TrainAnswerIn.correct` is taken from the client and passed straight into `apply_answer_timed`, which writes `users.knowledge_rating`, the same rating shown on profiles and leaderboards. `difficulty` (1 to 3) and `answer_ms` are validated; `correct` is not. The code documents this as a mock-phase trust hole to be closed before a real question bank exists. The endpoint is rate-limited (120/min).
- Impact: Any authenticated user can raise their own Knowledge score and ranking arbitrarily by sending `correct=true`. This is an integrity and leaderboard-manipulation issue, not cross-user access. Battle scores (battle.py) are similarly client-asserted but only relayed to the opponent, not persisted, so their impact is lower.
- Fix approach: Move correctness server-side (as `/quiz/answer` already does) and stop accepting `correct` from the client before launch.
- Effort: M | Depends on: none

### SEC-008: `image_url` upload-prefix enforcement only runs for the books format
- Location: `backend/app/schemas.py:308-343` (`validate_books_sections` returns early for non-books at schemas.py:310; `_check_image_urls` at schemas.py:327)
- Severity: Medium | Confidence: High | Category: security
- Description: `_check_image_urls` forces every user `image_url` to start with the Supabase storage prefix, but it is only invoked inside the books branch of the model validator, which returns early for every other format. For facts, people, concepts, questions, stories, and academy posts, `image_url` values in section content are stored unchecked. The June audit recorded the uploads-prefix enforcement as verified-safe; that guarantee no longer holds for non-books formats.
- Impact: A user can embed arbitrary external `image_url` values in non-books posts. The client renders these as `<img src>` (see SEC-024), so a viewer's IP and referrer leak to an attacker-controlled host, and the intended "images only from our storage" invariant is defeated.
- Fix approach: Run `_check_image_urls` for all formats (move it out of the books-only early return), and validate on the server rather than relying on the client-side check.
- Effort: S | Depends on: none

### SEC-009: User-supplied URLs render as `href` with no scheme validation
- Location: `frontend/src/components/sections/SourcesSection.tsx:31` (`href={source.url}`), `frontend/src/components/sections/AuthorContextSection.tsx:44` (`href={content.wikipedia_url}`); values created at `frontend/src/app/create/page.tsx:306-310` and create/page.tsx:294-302; server side `SourceItem.url` is an unvalidated `str` at `backend/app/schemas.py:101-105`
- Severity: Medium | Confidence: Medium | Category: security
- Description: Source links and the author Wikipedia link render the raw user string directly into an anchor `href` with no scheme allowlist on either the client or the server. The create form takes these verbatim (create/page.tsx:867 for source url). By contrast, the citation links in `PaperCardSection.tsx:34,44` are safe because they interpolate into fixed `https://doi.org/` and `https://arxiv.org/abs/` prefixes. Confidence on exploitability is Medium, not High: both anchors carry `target="_blank" rel="noopener noreferrer"`, and current browsers block `javascript:` navigation into a new noopener context, so today the protection rests on browser behavior rather than on code. If that markup ever changes, or a future browser differs, a `javascript:` scheme in `source.url` would execute in the app origin.
- Impact: If the vector fires, script running in the app origin can read `localStorage["deepscroll_token"]` (see SEC-011), which is session theft and account takeover. Even without script execution, arbitrary schemes and hosts in links are a phishing and content-injection surface.
- Fix approach: Allowlist `http:` and `https:` at render time for every user-controlled `href`, and validate the same on the server for `SourceItem.url` and `wikipedia_url`.
- Effort: S | Depends on: none

### SEC-010: KaTeX failure path injects the raw user string via `dangerouslySetInnerHTML`
- Location: `frontend/src/components/MathText.tsx:65-72`; same pattern in `frontend/src/components/sections/FormalDefinitionSection.tsx` and `FormalismSection.tsx`
- Severity: Medium | Confidence: Low | Category: security
- Description: MathText renders inline `$...$` segments by calling `katex.renderToString(seg.content, { throwOnError: false, output: "html" })` and injecting the result with `dangerouslySetInnerHTML`. On an exception it falls back to `return seg.content`, the raw user-controlled math string, which is then injected as HTML. `throwOnError: false` turns ordinary parse errors into escaped error spans, so only an unexpected non-parse exception reaches the catch, which is why confidence on triggerability is Low. MathText receives user-creatable text (quiz questions and options, core-idea bodies, takeaway, image captions), so the input is attacker-controlled.
- Impact: If an input can make `renderToString` throw (rather than return an error span), the raw string is written to the DOM as HTML, which is stored XSS in the app origin.
- Fix approach: On failure, render the raw string as a plain JSX text node, never through `__html`.
- Effort: S | Depends on: none

### SEC-011: JWT stored in localStorage with no Content-Security-Policy
- Location: `frontend/src/app/lib/auth.tsx:48,75,88`, `api.ts:7`, `chatSocket.ts:51`, `battleSocket.ts:43`, `eventQueue.ts:21` (key `deepscroll_token`); `frontend/next.config.ts` sets no `headers()`/CSP
- Severity: Medium | Confidence: High | Category: security
- Description: The session JWT is kept in localStorage and read by the API and socket layers. This is a common and previously accepted pattern, and the token is correctly kept out of URLs and logs (it travels as an `Authorization` header and as the WebSocket first frame). The residual risk is that any successful XSS (see SEC-009, SEC-010) can read localStorage and exfiltrate the token, and there is no CSP to blunt an injection. `next.config.ts` defines no security headers.
- Impact: A single XSS becomes full session theft with a 30-day token (see SEC-012). There is no second layer (httpOnly cookie or CSP) to contain it.
- Fix approach: Add a Content-Security-Policy (at minimum `script-src 'self'`) at the app or hosting layer as defense in depth, and consider moving the session to an httpOnly cookie (weigh the CSRF tradeoff) or at least shortening the token lifetime.
- Effort: M | Depends on: SEC-012

### SEC-012: JWTs are not revoked on password change and live 30 days
- Location: `backend/app/auth.py:37-40` (30-day token, payload is only `sub` and `exp`); password change at `backend/app/routers/auth.py:157-168`
- Severity: Low | Confidence: High | Category: security
- Description: Tokens carry no version or `jti`, live 30 days, and there is no denylist. Changing the password (auth.py:168) does not invalidate existing tokens. Account soft-delete is mitigated because every auth path filters `is_active == True`, but password change is not. Previously accepted in the June audit.
- Impact: A stolen or leaked token stays valid for up to 30 days even after the victim changes their password, so the usual first response to a compromise does not cut off the attacker.
- Fix approach: Add a `token_version` or `password_changed_at` column, embed it in the token, and check it on decode; bump it on password change. Alternatively, use short-lived access tokens plus refresh tokens.
- Effort: M | Depends on: none

### SEC-013: Non-books `feed_card` and section text have no shape or length caps
- Location: `backend/app/schemas.py:286-324` (`feed_card: dict`, `sections: list[AnySection]`); `AtAGlanceSection.content` is a raw dict at schemas.py:137-140
- Severity: Low | Confidence: High | Category: security
- Description: `feed_card` is validated only for books (`BooksFeedCard(**self.feed_card)` at schemas.py:313); for the other six formats it is an arbitrary dict with no key, depth, or size constraints, stored as-is (posts.py:90). Section arrays have per-type item caps (voices, core_ideas, quiz, sources) but there is no cap on the number of sections, and string fields (bodies, quotes, labels, urls) have no `max_length`. The only backstop is the 10 MB body middleware, which itself trusts Content-Length (see SEC-022). Title (1 to 200), comment body (2000), bio (160), and chat message (2000) are correctly bounded, so this is an inconsistency, not a blanket gap.
- Impact: A single post can carry multi-MB deeply nested JSON that is stored and then walked repeatedly by reading-time computation, SVG re-sanitization, search, and scoring: storage bloat plus per-request CPU amplification.
- Fix approach: Cap the number of sections, add `max_length` to section string fields, and add per-format `feed_card` models (or at least a serialized-size and depth check) for non-books formats.
- Effort: M | Depends on: none

### SEC-014: Identity-key collision lets a verified user hijack cross-post read-next edges
- Location: `backend/app/graph_edges.py:185-196` (`activate_edges_for`), invoked from `backend/app/routers/posts.py:106`; key derivation at `backend/app/graph_identity.py`
- Severity: Low | Confidence: Medium | Category: security
- Description: A post's `identity_key` is derived from client-supplied `feed_card` fields (title, author, name, birth_year). When a post becomes live, `activate_edges_for` runs a single UPDATE that repoints every edge whose `(target_format, target_identity_key)` matches to this post's id (graph_edges.py:193-196). Identity-key collisions are only flagged, never enforced (per the models note). Because a verified user's post publishes immediately (SEC-001), a verified user can craft `feed_card` so their post's identity key matches a popular target that many posts link to, and on publish their post captures those latent read-next edges.
- Impact: Content-graph poisoning: a verified user can insert their own post as the resolved read-next or graph target across other posts that reference a well-known work or person. Gated on verified status and on latent edges existing for the chosen target.
- Fix approach: For user-generated posts, exclude them from edge activation onto an identity key already owned by a seed or official post, or treat a collision as a hard block for user content rather than a flag.
- Effort: M | Depends on: SEC-001

### SEC-015: Login is a timing oracle for registered emails
- Location: `backend/app/routers/auth.py:90-98`
- Severity: Low | Confidence: High | Category: security
- Description: The error text is correctly identical for unknown-email and wrong-password (a good control). But `if not user or not verify_password(...)` short-circuits: the deliberately slow bcrypt comparison only runs when the email exists. An unknown email returns markedly faster than a known email with a wrong password, so response latency distinguishes the two.
- Impact: An attacker can build a list of registered emails by timing, feeding targeted phishing or credential stuffing. The per-email and per-IP limits slow but do not remove a statistical timing attack.
- Fix approach: Always run a bcrypt comparison against a fixed dummy hash when the user is not found, so both branches spend equal time.
- Effort: S | Depends on: none

### SEC-016: Registration returns a definitive email-exists signal
- Location: `backend/app/routers/auth.py:67-70`
- Severity: Low | Confidence: High | Category: security
- Description: Register returns distinct messages: "Email already registered." versus "Username already taken." Login was hardened to a generic error; this parallel enumeration oracle on register was not. Register is rate-limited 10/hour per IP (subject to SEC-004).
- Impact: Anyone can confirm whether a specific email has an account (a privacy leak and phishing input). Username enumeration is lower impact since usernames are effectively public.
- Fix approach: Return a neutral response for email collisions, or gate account existence behind an email-verification flow so a synchronous "registered" signal is not returned. At minimum document as accepted.
- Effort: S | Depends on: none

### SEC-017: `GET /quiz/state/{id}` skips the pending-post visibility rule
- Location: `backend/app/routers/quiz.py:113-127`
- Severity: Low | Confidence: High | Category: security
- Description: Every other post-id endpoint (get_post, comments, likes, quiz/answer) returns 404 for a pending post unless the caller is the author. `quiz/state` looks up the post and 404s only when the id does not exist (quiz.py:119-121); it applies no status or author check. It returns only the caller's own answer rows, so no answer content leaks for posts they could not answer, but it returns 200 with `{"answers": []}` for an existing pending post versus 404 for a nonexistent id.
- Impact: An authenticated existence oracle for pending or unpublished post ids, which the sibling endpoints deliberately hide. No content disclosure.
- Fix approach: Reuse the same published-or-author guard used elsewhere before returning state.
- Effort: S | Depends on: none

### SEC-018: `POST /quiz/answer` returns the answer key to anonymous callers with no rate limit
- Location: `backend/app/routers/quiz.py:64-76`
- Severity: Low | Confidence: High | Category: security
- Description: The endpoint builds `result` with `correct_index` and `explanation` (quiz.py:64-71), then for anonymous callers returns it at quiz.py:73-74 before reaching `check_rate_limit` at quiz.py:76 (which is only hit by authenticated callers). Scoring integrity is protected by the unique constraint (first answer scores, replays never re-score), so this is not a scoring exploit, but the answer key is returned to unauthenticated clients with no throttle.
- Impact: Answer keys for published quizzes are freely enumerable and scrapable by unauthenticated clients, which undercuts stripping `answer_index` from post payloads. Also an unthrottled anonymous POST surface (each does a post lookup).
- Fix approach: Apply an IP-based rate limit for anonymous callers (as search does), and consider requiring auth to receive the answer and explanation.
- Effort: S | Depends on: none

### SEC-019: Rate limiter and socket registries are per-process, in-memory
- Location: `backend/app/rate_limit.py:7` (`_counters` module global); chat and battle connection managers in `backend/app/routers/chat.py` and `battle.py`
- Severity: Low | Confidence: High | Category: security
- Description: All rate-limit counters and WebSocket connection state live in one process's memory. Correct for the current single-worker deploy (SERVER.md:34), and explicitly documented as not multi-worker safe. A restart clears all counters. The check-then-append at rate_limit.py:38-41 is also not atomic, so two concurrent requests can both pass the threshold check (slight overshoot only, not a practical bypass). Previously accepted.
- Impact: Running more than one worker (or a restart) resets or partitions counters, so effective limits multiply by the worker count and chat and battle delivery break across workers.
- Fix approach: Move counters and socket pub/sub to a shared store (for example Redis) before scaling past one worker; keep single-worker as a documented pre-scale gate.
- Effort: M | Depends on: none

### SEC-020: Several authenticated write endpoints have no rate limit
- Location: `backend/app/routers/auth.py:145` (`PATCH /me`), auth.py:231 (`DELETE /me`); `backend/app/routers/follows.py` (unfollow, accept, reject have no `check_rate_limit` while follow does); `backend/app/routers/stats.py:374` (`/stats/me`, uncached, roughly 15 aggregate queries per call)
- Severity: Low | Confidence: High | Category: security
- Description: These endpoints all require a valid session, so abuse is self-scoped rather than cross-account, which limits severity. `PATCH /me` runs a bcrypt verification on password change with no limit; the follow-state mutations allow churn and accept/reject notification spam; `/stats/me` forces expensive full-table scans against the remote database on every call.
- Impact: A valid token can hammer profile mutations, follow churn, or `/stats/me` as a low-effort resource-exhaustion vector on the single worker. No cross-user compromise.
- Fix approach: Add modest per-user `check_rate_limit` calls to these endpoints (consistent with the existing follow and comment limits), and consider a short per-user cache for `/stats/me`.
- Effort: S | Depends on: none

### SEC-021: WebSocket sockets are unthrottled pre-auth and never re-validated once open
- Location: `backend/app/routers/chat.py` (accept then await auth frame; message loop re-checks participant only), `backend/app/routers/battle.py`
- Severity: Low | Confidence: Medium | Category: security
- Description: The socket is accepted before authentication and held open up to a 10s timeout awaiting the auth frame, with no per-IP cap on connection attempts. After connect, the message loop re-checks conversation participation on every send (a good control) but never re-checks token expiry or `is_active`, so a long-lived socket outlives both a soft-delete and token expiry. No data is reachable before a valid token is decoded.
- Impact: A connection-flood DoS can hold many half-open sockets until timeout (memory and file-descriptor pressure), and an open socket can keep sending or relaying after the account is deactivated or the token expires, until it disconnects.
- Fix approach: Add a per-IP connection and attempt limit at accept time, cap concurrent unauthenticated sockets, and periodically re-validate token expiry and reload `is_active` on the socket, closing on failure.
- Effort: M | Depends on: SEC-019

### SEC-022: Request-body cap trusts `Content-Length` only (chunked bypass)
- Location: `backend/app/main.py:46-51`
- Severity: Low | Confidence: High | Category: security
- Description: The middleware rejects a request only when the `content-length` header exceeds 10 MB. A request using `Transfer-Encoding: chunked` carries no Content-Length and passes straight through, and Starlette then buffers the full body when an endpoint reads it. Upload endpoints are independently safe because they do incremental chunked reads with their own caps (sanitize.py), but JSON endpoints such as `POST /api/posts` have no streamed-byte cap. Previously accepted.
- Impact: A memory-exhaustion DoS against the single worker via a chunked request with no length header.
- Fix approach: Count bytes on the ASGI receive stream and abort past the cap, and enforce a body limit at the reverse proxy.
- Effort: S | Depends on: none

### SEC-023: Image validation does not cap decoded pixels (decompression bomb)
- Location: `backend/app/sanitize.py:84-101`
- Severity: Low | Confidence: High | Category: security
- Description: `validate_image` caps the encoded upload at 5 MB and rejects animated GIFs (good controls), then calls `img.verify()`, re-opens, `convert("RGB")`, and `thumbnail((2048, 2048))`. It never sets `Image.MAX_IMAGE_PIXELS`. A small, highly compressed PNG or WEBP can decode to a very large bitmap during `convert`/`thumbnail`. Pillow's built-in DecompressionBombWarning around 89 megapixels only warns; it does not raise until roughly twice that.
- Impact: A small upload can consume hundreds of MB of RAM per request during decode, a DoS vector against the single worker.
- Fix approach: Set an explicit conservative `Image.MAX_IMAGE_PIXELS`, check decoded dimensions before `convert`/`thumbnail`, and treat the bomb warning as an error.
- Effort: S | Depends on: none

### SEC-024: Content image URLs and avatars render with no scheme allowlist
- Location: `frontend/src/components/sections/AuthorContextSection.tsx:26-32`, `frontend/src/components/sections/CoreIdeasSection.tsx:29-35`, `frontend/src/components/Avatar.tsx` (`resolveUrl` passes any absolute URL through), `frontend/src/components/BookCover.tsx:91`
- Severity: Low | Confidence: High | Category: security
- Description: Content-supplied image URLs go into `<img src>` unvalidated. On the server this is only prevented for the books format (see SEC-008), so non-books posts can carry arbitrary hosts. The real book cover path in `BookCover.tsx` is gated by a rights record, but that record (including `verified_by_human`) lives in content-supplied `feed_card.cover`, so the frontend trusts a content-set flag. Images cannot execute script, so this is not XSS.
- Impact: Reader IP and referrer leak to arbitrary hosts, mixed-content warnings, and possible objectionable-image embedding.
- Fix approach: Restrict image sources to `http:`/`https:` and ideally an allowlisted or proxied host set, and treat `verified_by_human` as a server-asserted flag, not a content-asserted one.
- Effort: S | Depends on: SEC-008

### SEC-025: `feed_card` SVG is not re-sanitized on post creation
- Location: `backend/app/routers/posts.py:19-39` (`_sanitize_sections_svgs` walks sections only; feed_card is not passed through)
- Severity: Low | Confidence: Medium | Category: security
- Description: On post creation the server re-sanitizes `visual_svg` fields found in the sections array as defense in depth, but it does not run the feed_card (for example a `card_visual.svg`) through `sanitize_svg_text`. A user post's feed_card SVG is therefore stored without the second sanitization pass. On the web this does not become XSS because user content renders SVG as a base64 `<img>` (see SEC-026 and the verified split), where script cannot run, but the stored value skips a control the sections enjoy.
- Impact: Unsanitized SVG stored in user feed_card; no web XSS today because of the base64 render path, but the defense-in-depth pass is inconsistent and other clients could render it differently.
- Fix approach: Extend the create-time SVG re-sanitization to feed_card SVG fields as well as section fields.
- Effort: S | Depends on: none

### SEC-026: `BookCover` defaults `isUserContent` to false (fails open)
- Location: `frontend/src/components/BookCover.tsx:72` (`isUserContent = false` default), unsafe path at BookCover.tsx:63 (`dangerouslySetInnerHTML`)
- Severity: Low | Confidence: High | Category: security
- Description: The baked cover SVG can be injected via `dangerouslySetInnerHTML` and is content-supplied (`feed_card.cover.svg`). The `isUserContent` prop defaults to `false`, the trusted path. All three current callers pass the real flag correctly (verified in PostCard, the detail page, and my-posts), but a future caller that omits the prop silently takes the unsafe path for user content.
- Impact: A latent hardening gap: one future caller omission would render a user SVG through the raw HTML path, which is XSS.
- Fix approach: Make the prop required, or default it to `true` so the safe path is the fallback.
- Effort: S | Depends on: none

### SEC-027: SVG `<use>` is allowed while its href is not whitelisted (latent risk)
- Location: `backend/app/sanitize.py:12-19` (`use` in `ALLOWED_ELEMENTS`), sanitize.py:21-36 (`SAFE_ATTRIBUTES` has no `href`/`xlink:href`), sanitize.py:196-197 (href check)
- Severity: Low | Confidence: Medium | Category: security
- Description: `<use>` stays in the element whitelist, but neither `href` nor `xlink:href` is in the attribute whitelist, so those attributes are stripped and a `<use>` is left inert. The result is safe, but safe as a side effect of attribute stripping rather than by an explicit local-only href rule. The parser also sets `no_network=True`, so external references cannot load. If `href` were ever added to the whitelist for another feature, `<use href="#...">` combined with the whitelisted `pattern`/`mask`/`filter` elements could revive reference-based tricks.
- Impact: No exploit today; a maintenance trap if the attribute whitelist is extended later.
- Fix approach: Either drop `<use>` from the element whitelist, or if it is needed, add `href`/`xlink:href` with explicit `#`-only enforcement so the safety is intentional.
- Effort: S | Depends on: none

### SEC-028: User search does not escape LIKE wildcards
- Location: `backend/app/routers/search.py` (`User.username.ilike(f"%{q}%")`)
- Severity: Low | Confidence: High | Category: security
- Description: `q` is capped at 100 chars and rate-limited and is bound as a parameter by SQLAlchemy, so this is not SQL injection. The value is interpolated into an ILIKE pattern without escaping `%`, `_`, or `\`, so those act as wildcards.
- Impact: Minor: a query of `%` or `_` matches broadly. No data exposure beyond what search already returns.
- Fix approach: Escape `%`, `_`, and `\` in `q` and set an ESCAPE clause before building the pattern.
- Effort: S | Depends on: none

### SEC-029: WebSocket TLS gate trusts a spoofable `x-forwarded-proto`
- Location: `backend/app/routers/chat.py:314`, `backend/app/routers/battle.py:40`
- Severity: Low | Confidence: High | Category: security
- Description: The "must be secure" gate returns true when `x-forwarded-proto` is `https` or `wss`. A direct, non-proxied client can send that header on a plain `ws://` connection and pass. The JWT is still validated in the first frame, so this is a transport-downgrade risk, not an auth bypass. Previously accepted; the intended real enforcement is a TLS-terminating proxy that strips inbound forwarding headers. Related to the `--forwarded-allow-ips=*` setting in SEC-004.
- Impact: If the socket port is ever reachable without the TLS-terminating proxy, the wss guarantee is defeated and the first-frame JWT can travel in cleartext.
- Fix approach: Honor `x-forwarded-proto` only when the immediate peer is a trusted proxy, ensure the proxy overwrites the header, and keep this as a deploy checklist item.
- Effort: S | Depends on: SEC-004

### SEC-030: Frontend dependencies: three moderate npm advisories
- Location: `frontend/package.json` (next 16.2.6); `npm audit` output
- Severity: Low | Confidence: High | Category: security
- Description: `npm audit` reports three moderate advisories, all transitive through Next's build tooling: postcss below 8.5.10 has an XSS in its CSS stringify output (GHSA-qx2v-qp2m-jg93, reached via next), and js-yaml 4.0.0 to 4.1.1 has a quadratic-complexity DoS in merge-key handling (GHSA-h67p-54hq-rp68). These live on the build and dev path rather than in the served runtime bundle, so real production impact is limited. Next.js 16.2.6 is current and there is no `middleware.ts`, so the known Next middleware-bypass advisory does not apply. React 19.2.4 and katex 0.17.0 are current.
- Impact: Low in production (build-time tooling), but they are flagged advisories that should be cleared before launch.
- Fix approach: Run `npm audit fix` (or bump the transitive postcss and js-yaml via the Next toolchain), then re-run `npm audit` to confirm zero advisories.
- Effort: S | Depends on: none

### SEC-031: Backend dependency: python-jose pulls ecdsa with an unfixed timing advisory
- Location: `backend/requirements.txt` (python-jose[cryptography]); installed `python-jose 3.5.0`, `ecdsa 0.19.2`
- Severity: Low | Confidence: Low | Category: security
- Description: pip-audit is not installed in the backend venv, so this is a version-based manual assessment rather than a scanned result (stated here for honesty about method). python-jose 3.5.0 is current and past its algorithm-confusion and JWT-bomb advisories. It depends on ecdsa 0.19.2, which carries CVE-2024-23342 (a Minerva timing side-channel), which the ecdsa maintainers have stated they will not fix (no side-channel resistance is a stated non-goal), so no upgraded version resolves it. The app signs and verifies with HS256 (auth.py:22), so the ECDSA code path is not on the token path today.
- Impact: Negligible for the current HS256 configuration; it would matter only if the app ever adopted ES256 or another ECDSA scheme.
- Fix approach: Install and run pip-audit in CI to get authoritative results, keep HS256 (which avoids the ecdsa path), and if ECDSA is ever needed, move to a library with constant-time signing.
- Effort: S | Depends on: none

## Coverage notes

Reviewed:
- Backend auth and authorization across all 16 routers (two independent passes plus direct reads of auth.py, admin.py, posts.py, quiz.py, events.py, train.py, feed.py, stats.py). JWT handling, IDOR, privilege escalation, and WebSocket auth were traced end to end.
- Input validation and SQL: schemas.py and every raw-SQL site were read. SQL injection is not present: the four `text()` sites (stats.py:93, stats.py:384, stats.py:597, follows.py profile) are either fully static or use bound parameters, and the dialect helpers pass only hardcoded format strings.
- Config and secrets: CORS (main.py, `*` stripped, credentials with an explicit allowlist), the JWT secret load, upload_config.py, the tracked tree (only `.env.example` files tracked; real `.env`, `*.db`, and `user_uploads/` are gitignored), and docs/SERVER.md (which is where the `--forwarded-allow-ips=*` and port-binding facts came from). No secrets are committed and none are logged (the only logging is SVG node warnings in sanitize.py).
- SSRF and path traversal: no runtime server-side URL fetch exists in `backend/app` (no httpx/requests/urllib usage). The only URL-fetching code is offline operator scripts (`backend/download_seed_images.py`, `backend/tests/perf_probe.py`), which are not request-reachable, so there is no SSRF surface. Upload storage keys are UUID-forced, so there is no path traversal.
- Frontend XSS and tokens: all `dangerouslySetInnerHTML` sites (SvgBlock, MathText, BookCover, and the formalism sections) were opened. The user-vs-official SVG security split is correctly implemented and threaded (verified across PostCard, the detail page, my-posts, and SectionRenderer). KaTeX runs with the default `trust: false`. The token is in localStorage but never in a URL or log. The only `NEXT_PUBLIC_` value is the public API URL; the Supabase service key is server-only.

Not reviewed (out of scope or not opened):
- The mobile app, post JSON content and schema, and the non-security review domains.
- The running production values of `JWT_SECRET`, `DATABASE_URL`, and `SUPABASE_SERVICE_KEY` (secrets live outside the repo in `/etc/deepscroll/backend.env`); SEC-003 is about the absence of a startup strength check, not the current value.
- The live reverse-proxy behavior. Several findings (SEC-004, SEC-022, SEC-029) hinge on whether a proxy strips inbound forwarding headers and whether port 8000 is internet reachable; SERVER.md indicates a Tailscale-only setup today with no proxy in front, which is what makes SEC-004 a live concern at launch.
- Whether the production database actually has the declared indexes applied (referenced by one-time scripts in ARCHITECTURE.md), which affects the real-world severity of the DoS findings (SEC-006, SEC-020).

Low-confidence items to re-check before acting:
- SEC-009 (href scheme): confidence Medium on exploitability because `target="_blank" rel="noopener noreferrer"` plus current browser behavior blocks `javascript:` today; the underlying gap (no scheme allowlist) is certain and worth fixing regardless.
- SEC-010 (KaTeX fallback): confidence Low on triggerability because `throwOnError: false` handles ordinary parse errors; the raw-HTML fallback path is certain and cheap to remove.
- SEC-014 (identity-key hijack): confidence Medium; the activation mechanism is confirmed, but real impact depends on verified status and on latent edges existing for the chosen target.
- SEC-031 (ecdsa advisory): confidence Low because pip-audit could not run; install it in CI to confirm the backend dependency posture authoritatively.
