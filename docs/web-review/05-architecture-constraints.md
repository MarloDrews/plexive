# Web Review — Architecture Constraints
Date: 2026-07-06 | Model: Fable 5 | Scope: backend/app/rate_limit.py, backend/app/main.py, backend/app/database.py, backend/app/routers/chat.py, backend/app/routers/battle.py, backend/app/routers/stats.py (cache mechanics), backend/app/routers/auth.py (rate-limit sites), backend/app/routers/search.py (rate-limit site), backend/app/upload_config.py, README.md, docs/SERVER.md, docs/SECURITY_REVIEW.md (items 7 and 10), repo-wide search for deployment config and module-level mutable state

## Files reviewed

- backend/app/rate_limit.py (full)
- backend/app/main.py (full)
- backend/app/database.py (full)
- backend/app/routers/chat.py (full)
- backend/app/routers/battle.py (full)
- backend/app/routers/stats.py (lines 1-140 plus the cache write at line 370; the rest of the endpoint body is pass 03 territory)
- backend/app/routers/auth.py (lines 20-95, the IP/email rate-limit sites)
- backend/app/routers/search.py (rate-limit call site, via search)
- backend/app/upload_config.py (full)
- README.md (full), docs/SERVER.md (full), docs/SECURITY_REVIEW.md (deferred items section)
- Repo-wide glob for Procfile, railway.json, railway.toml, nixpacks.toml, Dockerfile, docker-compose.yml, start.sh, fly.toml, render.yaml: no matches
- Repo-wide grep for module-level mutable globals, locks, caches, and `global` statements in backend/app: the only process-local mutable state is `rate_limit._counters` and `_last_sweep`, `chat.manager`, `battle.manager`, and `stats._global_stats_cache`

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|---|---|---|---|---|---|
| ARCH-001 | Single-replica, single-worker constraint is not encoded anywhere in the repo | High | High | architecture | S |
| ARCH-002 | IP-based rate limiting assumes real client IPs, which only a dashboard-side proxy-headers setting can provide | High | Medium | architecture | S |
| ARCH-003 | Rate limiter check-then-append is not atomic, parallel bursts can exceed and partially reset limits | Medium | Medium | bug | S |
| ARCH-004 | Battle rooms are never unpaired after a finished duel, both players stay "busy" to challengers | Medium | High | bug | S |
| ARCH-005 | WebSocket broadcast has no send timeout, one slow consumer stalls the sender's receive loop | Medium | Medium | bug | M |
| ARCH-006 | Deploy overlap or restart transiently breaks the single-process assumption and wipes limiter state | Medium | Low | architecture | M |
| ARCH-007 | Rate limiter timestamps come from datetime.utcnow().timestamp(), wall-clock and DST sensitive | Low | High | bug | S |
| ARCH-008 | Rate limiter memory is attacker-inflatable for up to 24 hours via ip: and email: buckets | Low | High | perf | S |
| ARCH-009 | The 10-minute limiter sweep can run inside the event loop when triggered from a WebSocket frame | Low | High | perf | S |
| ARCH-010 | Sweep can pop a bucket concurrently with a fresh append, losing one recorded request | Low | Medium | bug | S |
| ARCH-011 | No cap on chat WebSocket connections per user, the registry set can grow without bound | Low | High | perf | S |
| ARCH-012 | pair() silently detaches a third user's room without notifying them | Low | High | bug | S |
| ARCH-013 | Global stats cache is per-process: divergent snapshots and multiplied DB load under workers/replicas | Low | High | architecture | S |
| ARCH-014 | create_all runs DDL on every boot and races if two instances start concurrently | Low | Medium | architecture | M |
| ARCH-015 | The wss gate trusts x-forwarded-proto, and the documented uvicorn flags trust every forwarder | Low | High | architecture | S |

## Findings

### ARCH-001 — Single-replica, single-worker constraint is not encoded anywhere in the repo

- Location: repo root and backend/ (absence of any deployment config); docs/SERVER.md:34-35; backend/app/routers/chat.py:270-272; backend/app/routers/battle.py:53-57; docs/SECURITY_REVIEW.md:83-86
- Severity: High
- Confidence: High
- Category: architecture
- Description: The backend is only correct at exactly one replica with exactly one uvicorn worker (in-memory rate limiter, chat ConnectionManager, BattleManager, stats cache). A glob across the repo finds no Procfile, railway.json, railway.toml, nixpacks.toml, Dockerfile, or start script, so the start command, worker count, and replica count live entirely in the Railway dashboard where this review cannot see them and where nothing prevents changing them. No `--workers` flag or multi-worker gunicorn config exists in the repo (the checklist item is clean on that front), but only because no production start command exists in the repo at all. The constraint is recorded only in code comments (chat.py:270-272, battle.py:53-57) and in docs/SECURITY_REVIEW.md item 7. The one deployment document that does exist, docs/SERVER.md, describes a Raspberry Pi systemd deployment ("Port 8000, single uvicorn-Worker", line 34) and never mentions Railway, so it is stale as a description of production and cannot serve as the guardrail.
- Impact: One dashboard change (replica slider, or adding `--workers N` to the start command) silently splits the rate limiter and both WebSocket registries into N independent copies: rate limits multiply by N, chat messages between users landing on different processes are not delivered live (history still persists via the DB), and battle challenges see online opponents as offline. Nothing fails loudly; the app degrades in ways that look like flaky product bugs.
- Fix approach: Commit the deployment config as code: a railway.json (or railway.toml) with the explicit start command (uvicorn, no workers flag, proxy-headers flags as decided in ARCH-002/015) and a comment stating replicas must be 1. Add a short "deployment invariants" section to README.md or a refreshed SERVER.md naming the three pieces of single-process state. Optionally add a startup log/warning in main.py's lifespan if `WEB_CONCURRENCY` or a workers-related env var is set above 1 (replica count cannot be detected from inside the process, so documentation plus config-as-code is the realistic enforcement).
- Effort: S
- Depends on: none

### ARCH-002 — IP-based rate limiting assumes real client IPs, which only a dashboard-side proxy-headers setting can provide

- Location: backend/app/routers/auth.py:25-26, 66, 88; backend/app/routers/search.py:20-21; docs/SERVER.md:35-37
- Severity: High
- Confidence: Medium
- Category: architecture
- Description: `_client_ip()` returns `request.client.host` directly (auth.py:25-26). It performs no X-Forwarded-For parsing of its own, so it is entirely dependent on uvicorn's ProxyHeadersMiddleware (`--proxy-headers` plus `--forwarded-allow-ips`) rewriting `client.host` from the forwarded headers. That flag pair is exactly the part of the start command that, per ARCH-001, is not in the repo. On Railway all traffic arrives via the edge proxy, so without `--proxy-headers` every request presents the proxy's internal IP.
- Impact: If the Railway start command lacks `--proxy-headers --forwarded-allow-ips=...`, all users share one `ip:` bucket: registration collapses to 10 signups per hour platform-wide (auth.py:66), login to 30 attempts per 5 minutes platform-wide (auth.py:88), and anonymous search to 60 per minute total (search.py:20-21). That is a site-wide lockout under normal launch traffic, and it would present as intermittent 429s that are hard to attribute. The per-email login limit (auth.py:89) keeps working either way. Confidence is Medium only because the actual dashboard start command cannot be verified from the repo; the code-side dependency itself is certain.
- Fix approach: Pin the start command in repo config with the proxy flags (see ARCH-001). Consider a startup sanity log that prints whether proxy headers are active, or a comment at `_client_ip` stating the uvicorn flag dependency so the coupling is discoverable.
- Effort: S
- Depends on: ARCH-001

### ARCH-003 — Rate limiter check-then-append is not atomic, parallel bursts can exceed and partially reset limits

- Location: backend/app/rate_limit.py:36-41
- Severity: Medium
- Confidence: Medium
- Category: bug
- Description: `check_rate_limit` runs a three-step read-modify-write with no lock: filter-and-reassign the bucket list (line 38), length check (line 39), append (line 41). It executes concurrently in FastAPI's threadpool (all sync endpoints) and also directly on the event loop (chat.py:345, battle.py:140). Two interleavings matter. First, two threads can both pass the length check before either appends, admitting more requests than `max_count`. Second, thread A can build its filtered copy of the list, thread B appends its timestamp to the old list, then A's assignment at line 38 replaces the list and discards B's timestamp entirely, so B's request is never counted. The GIL makes each individual operation safe but not the sequence.
- Impact: A deliberately parallel burst (for example concurrent login attempts against `email:` and `ip:` buckets, where bcrypt verification keeps many threads in flight simultaneously) can both exceed the limit and erase some of its own footprint, weakening the 10/5min per-email brute-force limit. Ordinary sequential traffic is unaffected, which is why this has not been visible.
- Fix approach: Guard the bucket update with a single module-level `threading.Lock` (the critical section is microseconds, and the process is single-worker by design, so one lock is fine). This also makes ARCH-010 moot if the sweep takes the same lock.
- Effort: S
- Depends on: none

### ARCH-004 — Battle rooms are never unpaired after a finished duel, both players stay "busy" to challengers

- Location: backend/app/routers/battle.py:86-89, 166-168, 263-268
- Severity: Medium
- Confidence: High
- Category: bug
- Description: `_rooms` entries are created in `pair()` and removed only in `disconnect()` (battle.py:86-89) or overwritten by a later `pair()`. The `finish` frame handler (battle.py:263-268) relays the score and leaves the room intact. So after a completed duel, while both players sit in the lobby with the Battle tab still open (the socket stays connected), `opponent_of(target_id)` still returns the old partner, and a challenge from any third user hits the busy check at battle.py:166-168 and gets `opponent_unavailable`.
- Impact: Players who finished a battle appear permanently busy to everyone except their previous opponent until they close the tab or the socket drops. On a small launch userbase this reads as "battles randomly do not work". The persistence is presumably what makes rematch work (either side re-challenges within the pair), so the fix has to keep that path.
- Fix approach: Track a finished flag per room (or clear the pairing once both sides have sent `finish`), and let a new incoming challenge to a user whose room is in the finished state proceed instead of returning `opponent_unavailable`. Direction only; the rematch flow must keep working.
- Effort: S
- Depends on: none

### ARCH-005 — WebSocket broadcast has no send timeout, one slow consumer stalls the sender's receive loop

- Location: backend/app/routers/chat.py:290-298, 376; backend/app/routers/battle.py:112-121
- Severity: Medium
- Confidence: Medium
- Category: bug
- Description: `ConnectionManager.send_to_users` (chat.py:290-298) snapshots the target sockets under the lock (good: the lock is not held during I/O) and then awaits `ws.send_json` on each socket sequentially with no timeout. `_handle_send` awaits it at chat.py:376, inside the sender's own receive loop. A recipient whose TCP receive buffer is full (backgrounded mobile browser, dead network path before the TCP timeout fires) makes `send_json` block for as long as the transport allows. `BattleManager.send` (battle.py:112-121) has the same shape, though battle payloads are tiny and per-recipient.
- Impact: One stalled group member freezes message delivery for the whole conversation and blocks the sender's socket handler, so the sender also stops receiving pings and messages. The exception path at chat.py:296-298 only helps once the send actually fails; backpressure is not an exception. Severity is capped by the 20-member group limit and small frames, and confidence is Medium because whether uvicorn buffers or blocks here depends on transport internals this review did not exercise.
- Fix approach: Wrap each send in `asyncio.wait_for` with a short timeout and treat a timeout like a dead socket, or dispatch sends as fire-and-forget tasks so the caller never blocks on a recipient. Direction only.
- Effort: M
- Depends on: none

### ARCH-006 — Deploy overlap or restart transiently breaks the single-process assumption and wipes limiter state

- Location: backend/app/rate_limit.py:7; backend/app/routers/chat.py:301; backend/app/routers/battle.py:124 (the three in-memory stores); no in-repo deploy config to constrain it
- Severity: Medium
- Confidence: Low
- Category: architecture
- Description: Even with replicas pinned to 1, two lifecycle events violate the single-process assumption. First, if Railway performs zero-downtime deploys (old instance keeps serving until the new one is healthy), two processes run concurrently for a window: two rate limiters, two socket registries, chat/battle peers split across them exactly as in the multi-replica case. Whether Railway overlaps instances depends on a dashboard setting this review cannot see, hence Confidence Low. Second, and certain: every restart discards `_counters`, so long-window limits reset (a user who exhausted 20 posts/day at posts.py:65 or 10 registrations/hour per IP gets a fresh allowance after any deploy), and all sockets drop (benign: both frontends reconnect after 3 seconds per frontend/src/lib/chatSocket.ts and battleSocket.ts).
- Impact: During deploys, live chat delivery between users on different instances silently fails (messages still persist to the DB and appear on refetch); rate limits are effectively doubled for the overlap window and reset after it. Low practical impact at launch scale, but worth knowing when reading bug reports filed right after a deploy.
- Fix approach: Confirm and document the Railway deploy mode; if overlap is enabled and this matters, prefer stop-then-start for this service. The full fix (Redis-backed limiter and pub/sub) is the known long-term direction already named in the code comments and is out of scope here.
- Effort: M
- Depends on: ARCH-001

### ARCH-007 — Rate limiter timestamps come from datetime.utcnow().timestamp(), wall-clock and DST sensitive

- Location: backend/app/rate_limit.py:32
- Severity: Low
- Confidence: High
- Category: bug
- Description: `datetime.utcnow()` returns a naive datetime carrying UTC wall time, and `.timestamp()` interprets a naive datetime as local time. On a host whose local timezone is not UTC, the derived value is offset from the true epoch; that is internally consistent until the offset changes at a DST transition, at which point `now` jumps one hour relative to stored timestamps (spring-forward instantly expires every short-window entry, momentarily lifting limits; fall-back extends windows by an hour). `datetime.utcnow()` is also deprecated since Python 3.12 and the deployment runs 3.13. Railway containers default to UTC, so in practice this likely never fires, hence Low severity despite High confidence in what the code does.
- Impact: Rate limit windows can distort by up to one hour twice a year on a non-UTC host; plus a deprecation warning on a supported Python.
- Fix approach: Use `time.monotonic()` for both the timestamps and the sweep clock (single-process state, never serialized, so monotonic is strictly better here), or `time.time()` if epoch semantics are wanted.
- Effort: S
- Depends on: none

### ARCH-008 — Rate limiter memory is attacker-inflatable for up to 24 hours via ip: and email: buckets

- Location: backend/app/rate_limit.py:7-13, 36; backend/app/routers/auth.py:88-89
- Severity: Low
- Confidence: High
- Category: perf
- Description: The sweep correctly bounds steady-state memory (idle buckets dropped after `_SWEEP_IDLE_SECONDS`), but that bound is 24 hours for every bucket regardless of its window, because the sweep cannot know a bucket's window (the comment at rate_limit.py:9-11 acknowledges this: 86400 is the largest window in use). Bucket keys are partly attacker-controlled: every login attempt creates an `email:<anything>@<anything>` bucket (auth.py:89), and IP rotation creates `ip:` buckets. Each bucket is small (key string plus a short float list), so growth is roughly linear in unique-key request volume over 24 hours; on the order of 100 MB per million unique keys per day.
- Impact: Not unbounded growth over time (the checklist question: the sweep does its job), but a sustained key-spray can hold tens of megabytes hostage for a day at a time. At one Railway replica with typical memory limits this is a nuisance, not an outage.
- Fix approach: Store the window alongside the bucket (or key the sweep threshold per bucket) so short-window buckets die in minutes, and/or cap total bucket count with oldest-idle eviction. Direction only.
- Effort: S
- Depends on: none

### ARCH-009 — The 10-minute limiter sweep can run inside the event loop when triggered from a WebSocket frame

- Location: backend/app/rate_limit.py:33-35; backend/app/routers/chat.py:345; backend/app/routers/battle.py:140
- Severity: Low
- Confidence: High
- Category: perf
- Description: `check_rate_limit` triggers `_sweep` inline in whichever context crosses the 10-minute mark. The sweep docstring (rate_limit.py:19-21) says it "runs in the threadpool alongside other requests", but the function is also called from async WebSocket handlers (chat.py:345 for every chat message, battle.py:140 for every challenge), where it executes on the event loop. The sweep iterates a snapshot of every bucket key; with a large `_counters` dict (see ARCH-008) that is a single synchronous scan blocking all WebSocket traffic and every other coroutine for its duration.
- Impact: Occasional latency blips on all connections, worst when the dict is large, which is exactly when an abuse wave is in progress. Milliseconds in the normal case, so Low.
- Fix approach: Move the sweep to a periodic asyncio background task started in the lifespan (or offload it via `run_in_executor` when triggered from async context). Direction only.
- Effort: S
- Depends on: none

### ARCH-010 — Sweep can pop a bucket concurrently with a fresh append, losing one recorded request

- Location: backend/app/rate_limit.py:22-25, 41
- Severity: Low
- Confidence: Medium
- Category: bug
- Description: `_sweep` decides a bucket is stale from a snapshot (`timestamps[-1] < now - 86400`, line 24) and then pops it. A request in another thread can append a fresh timestamp to that same list between the staleness check and the pop; the pop then discards the just-recorded request. The defaultdict recreates the bucket on the requester's next access, so nothing crashes, but that one request goes uncounted. Only buckets exactly crossing the 24-hour idle boundary are exposed, so the window is tiny.
- Impact: At most one free request per bucket per sweep, and only for buckets that were idle a full day. Practically negligible; reported for completeness.
- Fix approach: Covered for free by the lock proposed in ARCH-003 (sweep and update take the same lock).
- Effort: S
- Depends on: ARCH-003

### ARCH-011 — No cap on chat WebSocket connections per user, the registry set can grow without bound

- Location: backend/app/routers/chat.py:278-280, 416
- Severity: Low
- Confidence: High
- Category: perf
- Description: `ConnectionManager.connect` adds every authenticated socket to a per-user set with no per-user or global cap, and there is no rate limit on opening WebSocket connections (the auth handshake at chat.py:391-414 costs a JWT decode plus one DB query each time). Cleanup on disconnect is correct (the `finally` at chat.py:441-442 always unregisters, and empty sets are pruned at chat.py:287-288), so this is not a leak; it is unbounded fan-in from a single account. Battle is safe by construction: latest-connection-wins closes the previous socket (battle.py:64-76).
- Impact: One scripted account can hold thousands of open sockets, each a registry entry plus server-side connection state, and each broadcast to that user iterates all of them (chat.py:292). Memory and broadcast-time growth, single-replica so no horizontal escape valve.
- Fix approach: Cap sockets per user in `connect` (close the oldest, or reject beyond N), and consider a `check_rate_limit` call on WebSocket auth. Direction only.
- Effort: S
- Depends on: none

### ARCH-012 — pair() silently detaches a third user's room without notifying them

- Location: backend/app/routers/battle.py:100-110
- Severity: Low
- Confidence: High
- Category: bug
- Description: When `pair(a, b)` finds either participant already roomed with some third user, it pops that third user's `_rooms` entry (battle.py:105-108) but sends them nothing. Their next `progress` or `finish` frame gets the generic "You are not in a battle." error via `_relay_to_opponent` (battle.py:184-187), with no `opponent_left` event, so their client never runs its opponent-left handling. The code comment calls this path defensive ("the UI challenges from the lobby only"), and given ARCH-004 keeps finished rooms alive, a stale finished room being overwritten is exactly when this fires.
- Impact: The detached user's client shows a battle that silently stopped responding until they act and receive an error. Cosmetic-to-minor given current UI flows.
- Fix approach: Send the detached user an `opponent_left` frame inside `pair` (it already knows the popped id). Direction only.
- Effort: S
- Depends on: ARCH-004

### ARCH-013 — Global stats cache is per-process: divergent snapshots and multiplied DB load under workers/replicas

- Location: backend/app/routers/stats.py:74-88, 370
- Severity: Low
- Confidence: High
- Category: architecture
- Description: `_global_stats_cache` is a module-level tuple guarded only by the atomicity of single assignments (the comment at stats.py:74-78 is accurate for one process). Under N workers or replicas each process holds its own snapshot and refills it independently, so the roughly 16-round-trip pipeline runs N times per minute and different replicas can serve stats snapshots up to 60 seconds apart. This adds to the ARCH-001 inventory of state that silently duplicates rather than breaks. The separate thundering-herd-at-expiry issue in the same code (no in-flight marker) was already reported in pass 03 (docs/web-review/03-backend-endpoints.md:332) and is not re-counted here.
- Impact: At one replica, none. If the replica assumption is ever violated, extra remote-DB load and mildly inconsistent public stats; benign compared to what happens to chat and rate limiting in the same scenario.
- Fix approach: Nothing needed while single-replica holds; the entry belongs in the documented single-process-state inventory (ARCH-001) so it is not forgotten if a shared store is ever introduced for the limiter.
- Effort: S
- Depends on: ARCH-001

### ARCH-014 — create_all runs DDL on every boot and races if two instances start concurrently

- Location: backend/app/main.py:17-20; docs/SERVER.md:199-201
- Severity: Low
- Confidence: Medium
- Category: architecture
- Description: The lifespan runs `Base.metadata.create_all(bind=engine)` against the production Supabase database on every process start (main.py:19). `create_all` is check-then-create, not atomic: two instances booting at once (scale-out mistake, or a deploy overlap per ARCH-006) can both see a table missing and both issue CREATE TABLE, and the loser crashes on a duplicate-object error, likely entering a restart loop. docs/SERVER.md:199-201 already flags the adjacent limitation that create_all never adds columns and that Alembic is the eventual answer.
- Impact: None in the steady single-replica state (all tables exist, create_all no-ops). It is a boot-time landmine only in exactly the misconfiguration scenarios this review is about.
- Fix approach: Short term, tolerate the duplicate-object error on startup or gate create_all behind an env flag that production leaves off. Long term, Alembic migrations run as a deploy step instead of app-startup DDL. Direction only.
- Effort: M
- Depends on: ARCH-001, ARCH-006

### ARCH-015 — The wss gate trusts x-forwarded-proto, and the documented uvicorn flags trust every forwarder

- Location: backend/app/routers/chat.py:314; backend/app/routers/battle.py:40; docs/SERVER.md:35-37
- Severity: Low
- Confidence: High
- Category: architecture
- Description: `_is_secure_or_local` accepts a connection as secure whenever `x-forwarded-proto` says https/wss (chat.py:314, battle.py:40), and the only documented start command sets `--forwarded-allow-ips=*` (SERVER.md:35), which tells uvicorn to trust forwarding headers from any peer. On Railway, where only the edge proxy can reach the process, this is fine in practice; the mismatch is that the code's security assumption (a trustworthy proxy that strips inbound forwarding headers) is enforced only by network topology configured outside the repo. docs/SECURITY_REVIEW.md item 10 (lines 94-97) already records the spoofing concern; this finding adds the deployment-config side: the flag choice is undocumented for the Railway setup and interacts with ARCH-002 (the same flag pair controls whether rate-limit IPs are real).
- Impact: None while Railway's ingress is the only route to the process. The risk materializes only if the service is ever exposed directly or the proxy stops normalizing forwarded headers.
- Fix approach: When pinning the start command (ARCH-001), scope `--forwarded-allow-ips` to Railway's proxy range if Railway documents one, and note the trust assumption next to the flag. Direction only.
- Effort: S
- Depends on: ARCH-001, ARCH-002

## Coverage notes

- Reviewed: the complete in-memory rate limiter (rate_limit.py) and every one of its 17 call sites (grep-verified across all routers); the chat ConnectionManager and full WebSocket handler; the BattleManager and full WebSocket handler; the stats in-process cache read and write paths; main.py startup, middleware, and router registration; database.py engine and session setup; upload_config.py module state (Supabase client singleton, effectively immutable after import, no finding); a repo-wide search for deployment config files (none exist) and for module-level mutable state, locks, caches, and `global` statements in backend/app (all hits accounted for in the findings above).
- Not reviewed: the Railway dashboard itself (start command, replica count, deploy overlap mode, health checks) because it is not represented in the repository; that absence is itself ARCH-001. The bodies of the stats queries, endpoint-level logic beyond rate-limit call sites, the mobile app, and post content schemas are other passes' domains. Database-level concurrency (for example read-modify-write of users.knowledge_rating in elo.py under parallel quiz answers) was deliberately left out: it is DB state, not process-local state, and behaves the same at any replica count; flagging it here would be out of scope but it may deserve a look in a data-integrity pass. The frontend was touched only to confirm the 3-second WebSocket reconnect behavior cited in ARCH-006.
- Low-confidence: ARCH-002 (real Railway start command unknown), ARCH-003 and ARCH-010 (races are code-verified but not reproduced under load), ARCH-005 (depends on transport backpressure behavior not exercised), ARCH-006 (Railway deploy overlap mode unknown), ARCH-014 (duplicate-DDL crash inferred from create_all semantics, not reproduced).
