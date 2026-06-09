# Full Codebase Review — June 2026

Audit of the entire app (backend FastAPI + frontend Next.js) on branch `review/full-pass`.
Each finding lists the file and a one-line rationale. Items marked **[fixed]** are implemented
in this branch; items marked **[noted]** are intentionally left for a human decision.

## Bugs

1. **[fixed]** `frontend/src/app/components/PostCard.tsx:249` (and same pattern in
   `search/page.tsx`, `my-posts/page.tsx`, `post/[id]/page.tsx`, `create/page.tsx`) —
   the production build is broken on `main`: `feed_card` is `Record<string, unknown>`, so
   accessing `fc?.essence`, `post.feed_card.cover_url` etc. fails TypeScript. Fixed with a
   small typed accessor helper instead of scattered `as` casts.
2. **[fixed]** `frontend/src/app/search/page.tsx:23` — `Snippet` reads `post.hook ?? post.body`,
   fields removed in the sections/feed_card migration; snippets were always empty. Now reads
   `feed_card.essence` / `headline`.
3. **[fixed]** `frontend/src/app/lib/api.ts` — `apiFetch` always forces
   `Content-Type: application/json`, which corrupts `FormData` requests (multipart boundary is
   never set). The cover-image upload in the create wizard could not work. Header is now only
   set for non-FormData bodies.
4. **[fixed]** `frontend/src/app/lib/eventQueue.ts` — events are flushed with a raw `fetch`
   without the Authorization header, so likes/views from logged-in users are stored
   anonymously (`user_id = NULL`). Backend per-user like dedup and `GET /likes` `liked` flag
   never worked. The flush now attaches the stored token.
5. **[fixed]** `backend/app/routers/auth.py:173` — `DELETE /api/auth/me` hard-deletes the user
   row. SQLite does not enforce FKs here, so comments/posts/events/follows are orphaned, and
   `GET /posts/{id}/comments` then crashes (500) on `comment.user.username`. Changed to
   soft-delete (`is_active = False`), which the login/lookup paths already filter on.
6. **[fixed]** `frontend/src/app/components/PostCard.tsx:107` — `saveCount` starts at 0, so
   unsaving a post saved in a previous session displays "-1". The count was never real data
   (local, session-only); it now derives from the saved state (0/1, clamped).
7. **[fixed]** `frontend/src/app/components/PostCard.tsx:133` — with `prefers-reduced-motion`,
   the IntersectionObserver is never registered, so those users generate no view events and
   like state never refreshes on scroll. View tracking now always runs; only the animation is
   skipped.
8. **[fixed]** `frontend/src/components/sections/*` — 5 of 8 duplicated `SvgBlock` copies use
   bare `btoa(svg)`, which throws on any non-ASCII character (é, em-dash) in user-content SVGs.
   Consolidated into one shared `SvgBlock` using the UTF-8-safe encoding everywhere. The
   security rule (user content → base64 `<img>`, seed → `dangerouslySetInnerHTML`) is unchanged.
9. **[fixed]** `backend/app/routers/events.py` — duplicate "like" events inside the same batch
   are not deduplicated for authenticated users (only checked against the DB). Now also deduped
   within the batch.
10. **[fixed]** `frontend/src/app/lib/auth.tsx` — on 422 validation errors FastAPI returns
    `detail` as an array, so login/register shows "[object Object]". Error extraction now
    normalizes string/array shapes.
11. **[fixed]** `frontend/src/app/post/[id]/page.tsx` — a failed or 404 post fetch leaves the
    page on "Loading..." forever. Added a not-found state with a back action.
12. **[fixed]** `backend/app/routers/stats.py:14` + `frontend/src/app/stats/page.tsx` — the
    by-format stats lists omit `academy` although it is a valid `PostCreate` format, so academy
    posts would be invisible in every per-format breakdown.

## Inconsistencies

13. **[fixed]** `_attach_counts` is copy-pasted in `posts.py`, `feed.py`, and `search.py` —
    extracted to a shared `backend/app/post_counts.py` helper (also batches the per-post
    COUNT queries for lists instead of 2 queries per post).
14. **[fixed]** `backend/app/routers/events.py:53` — inline `from fastapi import HTTPException`
    inside a function; moved to module imports.
15. **[fixed]** Format accent colors/labels are defined in four places (`page.tsx` TABS,
    `PostCard.tsx` FORMAT_STYLES, `stats/page.tsx` FORMAT_COLORS, `create/page.tsx` FORMATS)
    — centralized in `frontend/src/lib/formats.ts` as the single source of truth.
16. **[fixed]** Verified-badge SVG is duplicated ~7 times with drifting sizes/colors —
    extracted `VerifiedBadge` component.
17. **[fixed]** `relativeTime` is implemented 3 times with different logic (`my-posts` shows
    "0m ago" for fresh posts, no week/date fallback) — extracted `lib/relativeTime.ts`.
18. **[fixed]** Loading spinner markup duplicated ~8 times — extracted `Spinner` component.
19. **[fixed]** Section headers use two competing label styles
    (`font-semibold tracking-widest` vs `tracking-wide`) — unified via a shared `SectionLabel`.
20. **[fixed]** `profile/[username]/page.tsx` — `PostsTab` and `PrivateTabContent` duplicate
    the same post-row markup — extracted a shared `PostRow`.
21. **[fixed]** `PostCard.tsx` inlines a `heartBoom` keyframe in a `<style>` tag while
    `heart-pop` lives in `globals.css` — moved to `globals.css`.
22. **[fixed]** `globals.css` defaults to a white background with dark only via media query,
    although the app is permanently dark (`bg-zinc-950` everywhere) — base is now always dark,
    eliminating the white flash on light-preference devices.
23. **[fixed]** Dead code: `FollowRequestOut` (follows.py, never used), `PostOut` import in
    follows.py, `CryptContext`/`post_interests` imports in seed.py, `ALLOWED_IMAGE_TYPES` in
    upload_config.py, unused `LikeButton.tsx` component, unused `format` prop on
    `SectionRenderer`.
24. **[fixed]** `.gitignore` — `frontend/dev.log` was untracked noise; log files now ignored.
25. **[noted]** `ARCHITECTURE.md` self-contradicts (mentions a "Following first" tab bar and a
    `FollowingTabPage` that do not exist in `page.tsx`; `lib/savedPosts.ts` is listed under the
    backend tree) — corrected as part of the final docs commit.

## Incomplete / half-finished

26. **[fixed]** `post/[id]/page.tsx` — `animatingSave` state is set but never rendered
    (`void animatingSave` hack); now actually animates the save icon like the feed card does.
27. **[fixed]** `PostCard.tsx` — `commentsCount` never updates after commenting through the
    bottom sheet; the sheet now reports count changes back.
28. **[fixed]** `create/page.tsx` success screen always says "It will appear once approved",
    but verified users' posts publish immediately — copy is now conditional.
29. **[noted]** `backend/seed.py` — `FORMAT_INTEREST_SLUGS` has no `people` entry, so the
    People seed post gets no interest tags (its own comment says to add one per format).
    Choosing the tags is editorial, so left for you.
30. **[noted]** `backend/app/routers/uploads.py:47` — sanitized SVGs are written to disk but
    the file is never referenced again (response returns the content inline). Either an audit
    trail (keep) or dead weight (remove) — your call.
31. **[noted]** `backend/app/scoring.py` — TODO says engagement bonuses should become
    per-user now that auth exists; changing ranking behavior was out of scope.
32. **[noted]** `backend/app/routers/search.py` — search does not cover People `feed_card.name`
    or Facts teasers (title covers most cases since seeds derive title from headline/name).
33. **[noted]** `stats/me` returns `posts_saved: -1 / posts_liked: -1` sentinels that the
    frontend overwrites from localStorage — fine until saves/likes move server-side
    (the existing TODO in `savedPosts.ts`/`likedPosts.ts`).
34. **[noted]** Saved/liked state lives in localStorage (per-device, lost on clear) — known
    TODO, needs backend endpoints + migration, deliberately not attempted here.

## Security suggestions (nothing weakened)

35. **[fixed, strictly additive]** eventQueue auth header (item 4) improves like-event
    attribution; the backend already supported it.
36. **[noted]** `backend/app/rate_limit.py` — in-memory dict is not thread-safe and resets on
    restart; fine for SQLite-scale, revisit with PostgreSQL.
37. **[noted]** JWT lifetime is 30 days with no rotation/refresh — acceptable for now, worth a
    refresh-token scheme later.
38. **[noted]** CORS origin is hardcoded to `http://localhost:3000` — should come from an env
    var before any deployment.
39. **[noted]** `username` has no format validation (length/charset); odd usernames are
    currently possible and end up in URLs (`/profile/{username}`). Suggest a
    `^[A-Za-z0-9_.]{3,30}$` rule — left unimplemented because it could lock out existing names.

## Design

### Direction

Deepscroll is a calm, intellectual anti-doomscroll reader, and the existing SVG standard
(flat, stroke-based, no shadows/gradients/filters) already defines its voice. The house style
extends that into the UI: **editorial dark** — a permanent zinc-950 base, generous vertical
rhythm, a strict typographic hierarchy (Geist), and exactly one accent per surface, supplied
by the post format. Accents are reserved for meaning (format identity, primary emphasis,
links to action), never decoration. Surfaces are flat zinc layers separated by hairline
borders rather than shadows or glows; motion is short and functional (150ms state changes,
300ms surface transitions).

### Token set (globals.css `@theme` + `src/lib/formats.ts`)

- **Surfaces**: `surface-0` #09090b (zinc-950 page), `surface-1` zinc-900/60 (cards),
  `surface-2` zinc-800 (inputs/inner), `surface-overlay` zinc-950/95 (bars/sheets).
- **Borders**: `edge` zinc-800/60 (hairline dividers), `edge-strong` zinc-700 (inputs, outline buttons).
- **Text levels**: `ink` white (headings), `ink-body` zinc-300, `ink-dim` zinc-400 (secondary),
  `ink-muted` zinc-500 (labels/meta), `ink-faint` zinc-600 (fine print).
- **Radii**: `card` 1rem (rounded-2xl surfaces), `field` 0.75rem (inputs), pill = full.
- **Motion**: `fast` 150ms, `base` 300ms; ease-out for entrances.
- **Format accents**: the existing 8 colors, exported once from `formats.ts`
  (label, hex accent, Tailwind text/dot/border classes, RGB triple) and consumed by the feed
  tabs, PostCard, EmptyState, search chips, create wizard, and stats.
- **Recurring elements** unified as components: `VerifiedBadge`, `Spinner`, `SectionLabel`,
  `PostRow` (list cards), shared `SvgBlock`; one button vocabulary (primary = white pill on
  dark, secondary = hairline outline pill, destructive = red) and one card recipe
  (`surface-1` + `radius-card`, no borders unless interactive).

The stats page (2,116 lines of charts) was deliberately left out of the restyle to limit
churn; it already follows the zinc + format-accent palette.
