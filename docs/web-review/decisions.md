# Web Review: Open Decisions Briefing

Date: 2026-07-07 | For: product owner | Scope: decisions only, no code changes

Status: all sixteen decided on 2026-07-07 (recorded on each Decision line below).

This file collects every product decision the review left open, so you can answer
them all at once. Each entry says what is actually being decided in plain terms,
which findings and batches it touches, the realistic options with their concrete
cost, a recommendation, and a blank `Decision:` line for you.

## How to read this

Every option below is grounded in a file I opened while writing this. Where a
"conflict" in the master report turned out to be already handled in the current
code, I say so plainly instead of presenting a fake choice.

## Summary

Sixteen decisions surfaced in total.

The four decisions the master report flagged as gating Batches 3, 5, and 6 (the
feed ordering model, the per-format elo sections, the raw `connections` array,
and the per-card likes fetch) are **already resolved in the current code**. They
need at most a yes/no confirmation, and **none of them still blocks Batches 3, 5,
or 6.** They are listed first (numbers 1 to 4) because you asked for the 3/5/6
items first.

That leaves twelve genuinely open decisions (numbers 5 to 16). They cluster in
Batch 8 (security), Batch 9 (concurrency and account lifecycle), and Batch 10
(accessibility), plus the deferred rename track and one Batch 1 housekeeping
confirm. The two highest-impact open ones are number 5 (private accounts' posts
are currently public) and number 6 (verification currently also grants
publish-and-verify-others power).

---

# Part A: flagged as blocking Batches 3, 5, 6, but already resolved in code

## 1. Feed ordering model (confirm only)

- What is being decided: whether the "For You" feed should keep a stable order
  while you page through it, or reshuffle freely. A reshuffle mid-scroll can show
  the same post twice or skip one; a fully fixed order feels stale.
- Findings and batch: M028, M030, M066 (BE-001, FE-DATA-025). Batch 3, fills the
  "ordering model" placeholder that pagination sits on.
- Current state in code: `backend/app/routers/feed.py` already ranks with a
  per-session seed (`effective_seed = user_id + client salt`) and pages with a
  `cursor` that walks the deterministic order exactly (a vanished anchor ends the
  feed rather than guessing). `backend/app/scoring.py` `_jitter` is a deterministic
  hash of `(seed, post_id)` when a seed is passed, random only when it is absent.
  So the model chosen is: stable within one session, fresh shuffle on the next
  visit.
- Options:
  - Keep the seeded-per-session model (already built). Cost: none, it is live.
  - Switch to a globally fixed order. Cost: a rewrite of a working system, and
    the feed would look identical every visit.
- Recommendation: keep the seeded-per-session model. It is implemented, correct
  for paging, and already the behavior in the code.
- Decision: Keep the seeded-per-session order (already built).

## 2. Per-format elo/knowledge sections (confirm only)

- What is being decided: whether the profile and stats screens should show a
  knowledge score broken down per content format, or a single unified score.
- Findings and batch: M034 (FE-DATA-005). Batch 3, and it was said to gate the
  stats work in Batches 5 and 6.
- Current state in code: `backend/app/elo.py` `elo_summary` returns a single
  rounded rating and the module comment states "responses no longer carry a
  formats dict." `frontend/src/app/stats/FriendsTab.tsx:258` confirms the frontend
  no longer reads it ("the always-empty formats dict the backend no longer
  sends"). So the decision was already made: unified score, per-format removed.
- Options:
  - Keep the unified score (already built). Cost: none.
  - Reintroduce real per-format scoring server-side. Cost: new per-format storage
    and update logic on every answer, plus rebuilt UI. This is a feature, not a fix.
- Recommendation: keep the unified score. Re-adding per-format data is new product
  scope, not a launch fix.
- Decision: Keep the unified score; per-format stays removed.

## 3. Raw `connections` array in post responses (mobile check only)

- What is being decided: whether to fully retire the raw authoring-layer
  `connections` array from the API, which no web screen reads.
- Findings and batch: M033 (BE-042, FE-DATA-016). Batch 3.
- Current state in code: `backend/app/schemas.py` `PostOut` already does not
  serialize `connections` at all (only the resolved `read_next` list ships). The
  web side is done. The only residual is the master report's note that a mobile
  consumer was never checked before removing the underlying field.
- Options:
  - Confirm mobile does not read `connections`, then it is fully closed. Cost: one
    check by whoever owns the mobile app.
  - Leave the ORM column in place indefinitely. Cost: nothing on web, mild dead
    data on the row.
- Recommendation: have the mobile owner confirm, then treat it as closed. Nothing
  on web is blocked either way.
- Decision: Drop connections fully. Mobile is being rebuilt, so there is no
  current reader to confirm against; treat it as fully closed.

## 4. Per-card likes fetch priority (confirm only)

- What is being decided: how urgent it is to stop every feed card from firing its
  own likes request, which passes 1 and 2 rated High and the bug sweep rated Low.
- Findings and batch: M055 (FE-RENDER-014, FE-DATA-002, BUG-105). Batches 5 and 6.
- Current state in code: `frontend/src/components/PostCard.tsx:165-175` already
  fetches like state lazily on intersection through one shared observer and "at
  most once," with the comment "the feed no longer fires one /likes request per
  mounted card." The storm the High rating worried about is already gone.
- Options:
  - Treat it as done (already built). Cost: none.
  - Reopen it for further batching (for example carrying counts in the list
    payload). Cost: a backend contract change for a problem already mitigated.
- Recommendation: treat as done. The lazy-on-intersection fetch resolved the
  concern that split the severity vote.
- Decision: Done. The lazy-on-intersection fetch stays.

---

# Part B: genuinely open decisions

## 5. Private accounts' posts are currently public

- What is being decided: when a user marks their account private, should their
  posts become restricted (followers only), or does "private" only cover the
  social graph (who follows whom) and not the content itself?
- Findings and batch: M117 (BUG-009). Batch 8, High severity. Fills the "private
  content rule" placeholder.
- Grounding: `backend/app/routers/feed.py` `get_user_feed` serves any user's
  published posts to anyone; its `_current_user` dependency is loaded but never
  used, and `get_feed` (For You) applies only `status == "published"` with no
  privacy filter. Per BUG-009 the same gap exists in search. Meanwhile privacy
  already gates follower lists and chat, so today a private account hides who
  follows it but shows all its posts to the public.
- Options:
  - Enforce privacy on content: a private author's posts are visible only to the
    owner and accepted followers, and are excluded from For You and search for
    everyone else. Cost: extra `is_active`/follow joins on the feed, user-feed, and
    search queries, and private authors get much less reach. Matches what users
    almost certainly expect "private" to mean.
  - Keep content public, and relabel the feature so it clearly only means "private
    follower list." Cost: no query changes, but the word "private" stays
    misleading and this is a trust risk at launch.
  - Middle path: hide private authors' posts from For You and search, but let a
    direct profile visit show them. Cost: partial protection, more rules to keep
    consistent.
- Recommendation: enforce privacy on content (option 1). A privacy toggle that
  leaves posts public is the kind of gap that becomes a launch-day complaint.
- Decision: Enforce privacy on content. A private author's posts are visible only
  to the owner and accepted followers, and are excluded from For You and search.

## 6. What "verified" grants: badge, publishing, and verifying others

- What is being decided: today a single flag (`is_verified`) does three jobs at
  once, a trust badge, the right to publish without moderation, and the right to
  verify other users. Which of these should verification actually grant, and who
  is allowed to hand it out?
- Findings and batch: M116 (SEC-001, SEC-002, BE-043, BUG-074). Batch 8, High
  severity. The engineering half (a separate `is_admin` capability, seeding the
  first admin out of band, an audit log) is already specified; the open part is
  the moderation policy.
- Grounding: `backend/app/routers/admin.py` gates the verify endpoint only on
  `current_user.is_verified < 1`, then sets the target's `is_verified = 1`, so any
  verified user can verify anyone, who can then verify others. Per SEC-001 the same
  `is_verified` flag decides publication in `posts.py` (`status = "published" if
  verified else "pending"`). So one leaked verified account can mint verified
  accounts and grant unlimited auto-publish.
- Options:
  - Verification is only a badge. Publishing is gated by a separate rule and
    verifying others is admin-only. Cost: you need a moderation path for normal
    posts (a pending queue someone reviews), but the trust model stops being
    self-propagating.
  - Keep "verified users auto-publish," but make verifying others admin-only.
    Cost: less moderation work, but being verified still means unmoderated
    publishing, so admins must grant it carefully.
  - Status quo. Cost: not viable for launch, one compromised account collapses
    moderation.
- Recommendation: option 1 (badge only, publishing and verifying decoupled), with
  the auto-publish trust reserved for an explicit admin-granted level. It is the
  only choice that contains the "one account collapses the model" risk SEC-001
  describes. If you have no moderation capacity at launch, option 2 is the
  pragmatic fallback.
- Decision: Split the single is_verified flag into three. (a) A cosmetic badge.
  (b) can_publish, granted deliberately, and back-filled to all currently-verified
  users in the migration so their publishing behavior does not change. (c)
  is_admin (verify others plus release pending posts), held only by me (the owner)
  at launch. Releasing a pending post becomes an admin action, which implies a
  small moderation surface later.

## 7. Anonymous likes and views

- What is being decided: should logged-out visitors be able to like and rack up
  view counts, or should engagement require an account?
- Findings and batch: M119 (SEC-005, BE-016, BUG-029 to BUG-032). Batch 8. Fills
  the "events auth policy" placeholder.
- Grounding: `backend/app/routers/events.py` accepts events with optional auth and
  stores anonymous events with `user_id = None`. Dedup only runs for authenticated
  users (the `already_liked_ids` query is inside `if optional_user`), so anonymous
  likes are counted with no dedup and no identity, and `get_likes` counts every
  like row. An anonymous client can inflate counts freely.
- Options:
  - Require auth for like events; keep views anonymous but rate-limited and
    clamped. Cost: logged-out users cannot like, but like counts become
    trustworthy. Simplest to reason about.
  - Allow anonymous likes but dedup them by IP. Cost: keeps the logged-out like,
    but IP dedup is weak (shared IPs undercount, rotating IPs overcount) and adds
    state.
  - Leave anonymous likes uncounted (accept the event for view purposes but do not
    add it to `like_count`). Cost: the button appears to work while doing nothing
    for anon users, which is confusing.
- Recommendation: require auth for likes, keep views anonymous but rate-limited
  and duration-clamped (option 1). It makes the public like count meaningful with
  the least new machinery.
- Decision: Require auth for like events. Keep views anonymous but rate-limited
  and duration-clamped.

## 8. Where the session token lives

- What is being decided: the login token is kept in the browser's localStorage.
  Should it move to a more locked-down storage (an httpOnly cookie), or should we
  only add a safety net (a Content-Security-Policy) around the current approach?
- Findings and batch: M125 (SEC-011). Batch 8. Depends on SEC-012 (token lifetime).
- Grounding: `frontend/src/lib/auth.tsx` reads and writes the JWT in localStorage
  (`TOKEN_KEY`), and it travels as an `Authorization` header, not in URLs. Per
  SEC-011, `next.config.ts` sets no CSP. The residual risk is that any script
  injection could read localStorage and steal a 30-day token.
- Options:
  - Add a CSP only (at least `script-src 'self'`) and shorten the token lifetime.
    Cost: low effort, keeps the current login flow, but the token is still
    reachable by script if a CSP gap exists.
  - Move the session to an httpOnly cookie. Cost: the token becomes unreadable by
    script, but you take on CSRF protection (an anti-forgery token or same-site
    cookie rules) and the socket/first-frame auth needs reworking.
  - Both, over time: CSP now, cookie later. Cost: staged effort.
- Recommendation: add the CSP and shorten the token lifetime now (option 1), and
  treat the cookie move as a follow-up. The June audit already accepted
  localStorage; the CSP is the high-value backstop for launch, and the cookie
  switch carries a CSRF cost better done deliberately, not under launch pressure.
- Decision: Add a CSP now. Shorten the token lifetime only if a refresh flow
  already exists; otherwise keep the current lifetime. The httpOnly-cookie move is
  its own batch after Batch 8. Implementer note: no token-refresh endpoint was
  seen in the reviewed auth code, so in practice the lifetime likely stays as-is;
  confirm before changing it.

## 9. Single-process deployment: hard launch rule or documented assumption

- What is being decided: several backend features only work if the app runs as
  exactly one process (one worker, one replica). Do you make that a hard,
  enforced launch rule, or just document the assumption for now?
- Findings and batch: M138 (ARCH-001, ARCH-006, SEC-019) versus the "just
  internals" view in M139 (BE-046). Batch 9. Anchors the batch.
- Grounding: `backend/app/rate_limit.py` keeps all counters in a module-global
  `_counters` dict in memory. If you run two workers, each has its own dict, so
  every rate limit is effectively doubled and the socket registries for chat and
  battle (also in-memory) would not see each other's connections.
- Options:
  - Treat it as a hard launch invariant: pin the deploy to one worker/one replica
    and document it prominently. Cost: no horizontal scaling until a shared store
    (Redis) is added later, which the review already defers. Safe and cheap now.
  - Treat it as documentation only and rely on operators knowing. Cost: a
    scale-up later silently breaks rate limits and realtime, with no guardrail.
  - Build the shared store now. Cost: significant new infrastructure, explicitly
    out of scope for launch per the master report.
- Recommendation: pin to one worker and document it as an invariant (option 1). It
  matches the current in-memory design, costs nothing, and the shared-store path
  stays a known future step.
- Decision: Pin the deploy to one worker / one replica and document it as a hard
  launch invariant.

## 10. What happens to a deleted account's identity and content

- What is being decided: account deletion is a soft delete (the row stays,
  `is_active = False`). Two policies are unset: can that person re-register with
  the same email, and should their old posts, follower entries, and leaderboard
  spots still show up?
- Findings and batch: M150 (BUG-019 to BUG-022). Batch 9. Fills the "account
  lifecycle" placeholder.
- Grounding: `backend/app/routers/auth.py` register (lines 71 to 74) checks email
  and username uniqueness with no `is_active` filter, so a deleted user's email is
  locked forever ("Email already registered."). Per BUG-022 the soft-deleted row
  also stays in follower lists, profile counts, and stats leaderboards as dead
  links, while direct profile lookups 404, so the surfaces disagree.
- Options for re-registration:
  - Reactivate the existing row on a matching register/login. Cost: the returning
    user keeps their history, but you must define what "reactivate" restores.
  - Scramble the email and username at delete time to free them. Cost: clean
    re-registration, but the old account is truly gone and its content authorship
    is orphaned.
- Options for visibility:
  - Hide deactivated users and their posts everywhere (add `is_active` joins to
    lists, counts, stats, feed, search). Cost: consistent, but touches several
    queries.
  - Keep their posts but remove the dead profile links. Cost: content survives the
    author, which may or may not be intended.
- Recommendation: scramble email/username on delete (simplest, avoids a
  half-defined reactivation), and hide deactivated users and their content
  everywhere for one consistent rule. If keeping user history matters more to you
  than email reuse, say so and I will flag reactivation instead.
- Decision: On delete, scramble the email and username to free them. Keep the
  user's published posts but sever authorship to a neutral placeholder. Hide the
  profile and account everywhere. Do not hard-delete content. (Implies a
  placeholder-author concept for the severed posts.)

## 11. A group chat that collapses into a one-to-one chat

- What is being decided: if someone tries to start a group conversation but the
  recipient list collapses to a single other person (duplicates or themselves
  removed), should the app quietly make a plain direct message, or tell them the
  group could not be formed?
- Findings and batch: M145 (BUG-088). Batch 9. Minor.
- Grounding: `backend/app/routers/chat.py` `create_conversation` silently skips the
  caller and duplicates, computes `is_group` from the deduped count, and for a
  one-person result returns the existing direct message (dropping any group name).
  So a "group" request with one real recipient becomes an old DM with no signal.
- Options:
  - Error when the deduped set changes the requested shape (group asked, DM
    produced). Cost: one extra check, clearer behavior.
  - Keep silently degrading. Cost: none to build, but the response does not match
    what was asked and a provided group name is lost.
- Recommendation: error when a group request collapses to a DM (option 1). It is a
  cheap guard against a confusing silent outcome.
- Decision: Error out when a group request collapses to a DM, instead of silently
  degrading.

## 12. Alt text for person portraits (screen readers)

- What is being decided: for the small round portrait next to a person's name
  (cast members, authors, key figures), should the image's alt text be the
  person's name, or empty (treated as decorative because the name is already
  written next to it)? The code currently does both in different sections.
- Findings and batch: M157 (A11Y-005). Batch 10. Fills the "portrait alt
  convention" placeholder.
- Grounding: `StorySection.tsx` uses `alt={fig.name}` for the key-figure portrait,
  while `CastSection.tsx` and `AuthorsContextSection.tsx` use `alt=""` for the
  identical portrait-next-to-name pattern. So screen-reader users hear the name
  twice in one section and not at all in another.
- Options:
  - Empty alt everywhere (decorative). Cost: none, and it is correct practice when
    the name is right beside the image, avoids the double announcement.
  - Name as alt everywhere. Cost: none to build, but screen readers read the name
    twice per card.
- Recommendation: empty alt everywhere the name is adjacent (option 1). The name
  is already visible text next to the portrait, so the image adds nothing for a
  screen reader and the empty alt is the standard decorative-image choice. This is
  largely a taste call; the code gives no reason to prefer the double read.
- Decision: Empty alt everywhere the name is already adjacent.

## 13. Hidden scrollbars

- What is being decided: the app hides scrollbars everywhere for a clean look.
  Should that stay, or should scrollbars be shown (at least under an accessibility
  setting) so people who drag the scrollbar or need a scroll-position indicator
  are not stuck?
- Findings and batch: M164 (A11Y-026). Batch 10. Marked "Depends on: product
  decision" in the source.
- Grounding: `frontend/src/app/globals.css` (around line 111) hides scrollbars
  app-wide on both axes with `* { scrollbar-width: none }` plus a webkit rule, a
  deliberate design rule. The cost noted in A11Y-026 is that no scroll-position
  indicator exists and drag-to-scroll users (some motor impairments) lose that
  affordance on long pages like the create wizard and stats.
- Options:
  - Keep them hidden everywhere. Cost: the clean look you designed, but the
    accessibility loss stands.
  - Show scrollbars under a future accessibility setting or when reduced motion is
    requested. Cost: a small conditional, keeps the default look while offering an
    escape hatch.
  - Show scrollbars everywhere. Cost: changes the app's visual identity.
- Recommendation: keep the hidden default but plan a scrollbar toggle under a
  future accessibility setting (option 2), and in the meantime make sure keyboard
  scrolling stays healthy. This is a pure taste-versus-access tradeoff; the code
  shows no functional blocker either way.
- Decision: Keep scrollbars hidden. Defer a visible-scrollbar toggle to a future
  accessibility setting.

## 14. Create-wizard interest cap value (confirm only)

- What is being decided: the post creation form lets an author pick at most 5
  interests, while the backend accepts up to 10. Keep the friendlier cap of 5 or
  raise the form to the backend's 10?
- Findings and batch: M110 (BUG-110). Batch 7. The other two BUG-110 items are
  already handled: `create/page.tsx:528` discards authored content on a format
  switch, and the cap is enforced at `create/page.tsx:161` (`if (prev.length >= 5)
  return prev`).
- Options:
  - Keep the cap at 5. Cost: none, it is a deliberate product choice already in
    the code and surfaced in the UI counter. Fewer, more focused tags per post.
  - Raise the form cap to 10 to match the backend. Cost: one number change,
    authors can tag more broadly.
- Recommendation: keep 5. It is already implemented and surfaced, and a tighter
  tag set keeps the feed's interest matching sharper. Confirm only.
- Decision: Keep the cap at 5, surfaced with the counter.

## 15. Rename storage-key migration (deferred track)

- What is being decided: the app is being renamed from Deepscroll to Plexive (name
  already chosen). The risky part is the browser storage keys still named
  `deepscroll_*`. Do you migrate them (read-old-write-new) or rename hard?
- Findings and batch: DEAD-016, DEAD-017, DEAD-018. Deferred rename track; touches
  M011 and M015 in Batch 2. Not a batch blocker.
- Grounding: `frontend/src/lib/storage.ts` defines `TOKEN_KEY = "deepscroll_token"`
  and comments that the rename is "a separate, migration-gated task."
  `frontend/src/lib/likedPosts.ts` shows the other per-account keys
  (`deepscroll_liked`, `deepscroll_like_counts`, `deepscroll_like_sent`). A naive
  rename logs everyone out and drops their liked, saved, and interest state.
- Options:
  - Read-old-write-new migration: on load, if a `plexive_*` key is missing, copy
    the `deepscroll_*` value over, then use the new key. Cost: a small migration
    shim per key, but no user loses their session or data.
  - Hard rename with no migration. Cost: trivial to write, but every existing user
    is logged out and loses interests, likes, and saves.
  - Defer the whole rename to its own track and keep `deepscroll_*` keys for now.
    Cost: the internal name lingers, but zero user impact.
- Recommendation: when the rename runs, use read-old-write-new (option 1); until
  then keep the keys as-is. Never do the hard rename, it silently wipes real user
  state.
- Decision: Deferred rename track. When the rename runs, use read-old-write-new;
  never the hard rename.

## 16. Which file is the canonical legacy-data preservation copy (Batch 1)

- What is being decided: Batch 1 wants to delete a stale root `seed_content.json`
  and some legacy scripts, but that is blocked until you confirm which artifact is
  the intended "keep this copy of the old data" file.
- Findings and batch: M006, M007 (DEAD-006, DEAD-007, DEAD-008). Batch 1. Blocks
  those two deletions only.
- Grounding: this is owner knowledge, not something the code states. The DEAD-007
  finding notes a `seed_content.legacy.README.md` may already be the preservation
  copy, in which case the root `seed_content.json` is redundant. I did not open the
  legacy data files themselves, so I am flagging the question rather than asserting
  which one is canonical.
- Options:
  - Confirm the legacy README/snapshot is the canonical copy, then delete the root
    `seed_content.json`. Cost: none if the snapshot truly holds the data.
  - Keep both. Cost: mild repo clutter, no risk.
- Recommendation: confirm the legacy snapshot is canonical and delete the root
  copy. If you are unsure the snapshot is complete, keep both, the cost of keeping
  is only clutter.
- Decision: Delete the root seed_content.json only after verifying it is
  redundant. If it cannot be confirmed, leave it and flag it.
