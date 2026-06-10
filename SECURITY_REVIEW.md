# Security Review — June 2026 (branch feature/chat-secure)

Full audit of backend and frontend, done alongside the real-time chat feature.
Verification: `backend/tests/security_test.py` (18 checks) covers the fixes,
`backend/tests/chat_test.py` (34 checks) covers chat authorization. Both pass.

## Fixed in this branch

| # | Finding | Fix |
|---|---------|-----|
| 1 | Pending (unreviewed) posts leaked data: anyone who guessed the id could list comments, comment, and read like counts | Comments list/create and `GET /posts/{id}/likes` now return 404 unless the post is published or the caller is the author — same rule as `GET /posts/{id}` |
| 2 | `POST /api/events` accepted unlimited batches and events for nonexistent posts | Batch capped at 50; events referencing unknown post ids are dropped |
| 3 | No brute-force protection on login/register | Login: 10 attempts per email + 30 per IP per 5 min. Register: 10 per IP per hour |
| 4 | No username format validation (odd usernames end up in URLs; was flagged in the earlier review) | Forward-only rule `^[A-Za-z0-9._-]{3,30}$` on register and username change. Existing accounts are untouched |
| 5 | Private users got an empty list for their own followers/following | Owner can always see their own lists; the privacy rule for others is unchanged |
| 6 | CORS origin hardcoded to localhost | `FRONTEND_ORIGIN` env var (comma-separated); `*` is explicitly stripped so a config mistake cannot open it wide |
| 7 | No request body size limit (multi-MB JSON accepted) | 10 MB cap middleware; uploads keep their own much smaller chunked-read limits |
| 8 | Search endpoints: unbounded query length on a Python-side full scan, no rate limit | Query capped at 100 chars; 60 searches/min per user (or per IP when anonymous) |
| 9 | No abuse limits on comments and follows | Comments 30 / 5 min, follows 60 / hour per user |
| 10 | Event `stored` count was an existence oracle for pending post ids (found by the independent verifier pass) | Events only count posts visible to the caller (published, or own pending) |

## Chat security model (built secure by design)

- WebSocket auth: first frame must be `{"type":"auth","token":<jwt>}` — the
  token is never placed in a URL, so it cannot land in access logs.
- Plain `ws://` handshakes are rejected (close 4403) unless the client is
  local or behind a TLS-terminating proxy (`x-forwarded-proto: https`).
- Participant-only authorization is re-checked server-side against the DB on
  every send and every history/list request; non-participants get the same
  404/error as nonexistent conversations (no existence probing).
- Conversations can only be started with users connected by an accepted
  follow in either direction — private accounts are unreachable until they
  approve a follow.
- Message bodies: plain text, 1–2000 chars, rendered only through React's
  text path; 30 messages/min per user; 20 new conversations/hour.
- Message content never appears in URLs or server logs.
- No end-to-end encryption — deliberate decision (transport security via TLS
  plus server-side authorization instead; E2E would split the message system
  in two and block future moderation).

## Verified safe — no change needed

- `dangerouslySetInnerHTML` exists only in `SvgBlock.tsx` for seed/official
  SVGs (documented path); user SVGs render as base64 `<img>`. Comments,
  bios, usernames and chat messages all render through React's text path.
- Quiz `answer_index`/`explanation` are stripped from every post payload;
  correctness is decided server-side only.
- Passwords: bcrypt, 72-byte limit rejected (not silently truncated),
  identical error for unknown email vs wrong password.
- Uploads: magic-byte check, Pillow re-encode, animated GIF rejection, UUID
  filenames, `/uploads/` prefix enforcement on user image URLs, chunked-read
  size limits, upload dir outside the Python path.
- Secrets: `.env`, `*.db`, `user_uploads/` gitignored; nothing sensitive in
  the repo; the server refuses to start without `JWT_SECRET`.
- Soft-deleted accounts immediately lose access (`is_active` filtered in
  `get_current_user` and the chat socket auth).
- Stats endpoints expose usernames/counters only — no emails or ids.
- Ownership checks present on comment delete, profile patch/delete, avatar
  upload, follow accept/reject, follow-requests list, posts/mine, quiz state.

## Left for you to decide (not changed — judgment calls)

1. **Private accounts' posts are public.** `is_private` only gates follow
   approval and follower lists; posts still appear in the public feed,
   search, and the profile page for everyone. Hiding them means touching
   feed/search/stats/profile plus frontend empty states. Decide what
   "private" should mean before launch.
2. **Anonymous like inflation.** Logged-out clients can send unlimited
   `like` events (no identity to dedupe on), inflating public counts.
   Options: count only authenticated likes (changes existing counts),
   per-IP limiting, or accept until like storage moves server-side.
3. **Any verified user can verify others** (existing design). It is a
   transitive privilege chain — consider a separate `is_admin` flag before
   real users arrive.
4. **Retroactive username cleanup.** Existing usernames that violate the new
   format keep working. Enforcing retroactively needs a migration and could
   lock out users.
5. **JWTs live 30 days and survive a password change.** Revocation requires
   token versioning or a denylist; fine pre-launch.
6. **Token in localStorage.** Stealable by XSS in principle (no XSS path
   found in this audit). httpOnly-cookie auth is a larger refactor with its
   own CSRF tradeoffs.
7. **Single-process in-memory state.** Rate limits and the chat connection
   registry live in process memory — correct for the current single-worker
   SQLite stage, but both need a shared store (e.g. Redis) before running
   multiple workers.
8. **Global stats include pending posts' like/comment counters** (activity
   volume only, never content). Cosmetic; filter by `status == "published"`
   if it bothers you.
9. **Chat follow gate is creation-time only.** Unfollowing or going private
   later does not remove someone from an existing conversation, and a group
   creator can bridge two users who have no relationship with each other.
   Standard messenger behavior; add leave/block features if you want more.
10. **The wss requirement trusts `x-forwarded-proto`,** which a direct
   client can spoof. Real enforcement is the production reverse proxy
   terminating TLS and stripping inbound forwarding headers — standard
   setup, but worth remembering at deploy time.
11. **The 10 MB body cap reads Content-Length only;** a chunked request
   without the header bypasses it (uploads have their own chunked-read
   limits). A streaming-aware cap belongs in the reverse proxy.
