# Batch 9 (Backend Concurrency, Realtime, Deployment), Implementation Notes and Residuals
Date: 2026-07-09 | Branch: fix/backend-concurrency

This batch implemented M138 through M153 plus decisions 9 (single-process
invariant), 10 (deleted-account lifecycle), and 11 (group-to-DM error). What
follows is the record of what was left open on purpose: accepted residuals,
deferred items, and the deploy/migration actions the owner must take.

## Deploy config the owner must verify (M138)

- `backend/railway.toml` pins the start command (one uvicorn worker) and
  `numReplicas = 1`. It assumes the Railway service's Root Directory is
  `backend/`. **Verify in the Railway dashboard**: (a) the service root is
  `backend/` (if it is the repo root, move railway.toml there and prefix the
  start command with `cd backend &&`), (b) config-as-code is being picked up
  after the next deploy (the deploy log prints the start command), (c) the
  replica count shows 1. The app additionally refuses to boot when
  `WEB_CONCURRENCY`/`UVICORN_WORKERS` is set above 1.
- Railway's deploy overlap mode (ARCH-006) could not be determined from the
  repo. If zero-downtime overlap is enabled, two processes coexist briefly per
  deploy: live chat between users split across the two instances pauses until
  reconnect (history persists), and rate limits are effectively doubled for
  the window. If that matters, prefer stop-then-start for this service.

## Migrations the owner must apply (not run against the live DB here)

Run by hand against Supabase (both idempotent, order irrelevant):

1. `backend/scripts/add_conversation_dm_key.py` (M145/BUG-036): adds
   `conversations.dm_key`, backfills the oldest DM per pair, creates the
   unique index. If any pair already forked into duplicate DMs, the script
   prints them and leaves them keyless for manual merge.
2. `backend/scripts/add_deleted_user_sentinel.py` (M150): creates the
   `deleted_user` sentinel and runs the full lifecycle over any
   previously-soft-deleted rows. Needs `backend/.env` with DATABASE_URL and
   JWT_SECRET.

## Accepted residuals (documented, not fixed)

- **Deleted-account pending drafts stay on the scrambled row.** They are
  invisible to everyone forever (author-only visibility, the author can no
  longer log in) but are not hard-deleted. Decision 10 forbids hard-deleting
  published content; pending drafts simply follow the softest path.
- **A severed post's author link dead-ends.** Cards show the neutral
  `deleted_user` author; tapping it lands on the 404 page because the sentinel
  is an inactive account (profiles of inactive accounts 404 by design).
  Special-casing the sentinel in the frontend is deferred.
- **Old comments and group-chat member lists show the scrambled name**
  (`deleted-<id>`), which carries no personal data. Reassigning comments to
  the sentinel was out of scope.
- **`users_over_time` in global stats stays all-time and includes deleted
  accounts**: it counts historical registrations; filtering by is_active would
  rewrite history.
- **Battle frames without a battle_id are still relayed** (legacy tolerance
  for the old mobile client). The web client always sends one; once mobile is
  rebuilt on the new protocol, the server can require it.
- **The single-process invariant remains load-bearing** for the rate limiter,
  both socket registries, the pre-auth counters, and the stats caches. The
  Redis-backed shared store stays the deferred horizontal-scaling track.

## WebSocket contract changes (frontend updated in this batch)

Additive unless noted: `battle_start`/`opponent_progress`/`opponent_finish`/
`opponent_left` carry `battle_id`; clients send `battle_id` in
`progress`/`finish` (validated when present); `opponent_unavailable` carries
`reason: "offline"|"busy"`; battle `error` frames carry an optional machine
code (`not_in_battle`, `stale_battle`, `in_battle`); chat `send` accepts an
optional `tag` echoed in the broadcast. Behavioral: after both finish frames
the room is gone (rematch = fresh challenge); a mid-battle challenger gets an
error instead of orphaning their opponent; a missing Authorization header on
REST returns 401 (was 403).

## Noticed outside this batch (left alone)

- `docs/SERVER.md` still documents the Raspberry Pi systemd deployment in
  full; only a banner marking it historical (and deferring to railway.toml)
  was added. A rewrite belongs to the deployment-docs track.
- The chat conversation LIST endpoint sorts in Python over all of a user's
  conversations; fine at launch scale, noted during M145 work, not a Batch 9
  finding.
- The mobile app still implements the pre-M142 battle protocol and the old
  fixed-3s socket reconnect; mobile is being rebuilt separately.
