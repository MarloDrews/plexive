# Batch 8 (Security), Implementation Notes and Residuals
Date: 2026-07-08 | Branch: security/pre-launch

This batch implemented the pre-launch security findings M116 through M137 plus the
CSP (M125). What follows is the record of what was left open on purpose: accepted
risks, deferred items, and known partial coverage. Nothing here blocks launch; each
line is a conscious decision, not an oversight.

## Accepted risks (documented, not fixed)

- **ecdsa Minerva timing advisory (PYSEC-2026-1325 / CVE-2024-23342).** Pulled in
  transitively by `python-jose`. It affects only ECDSA signing / key generation /
  ECDH; we sign JWTs with HS256 (HMAC) and never touch an ECDSA code path, so it is
  not exploitable here. The python-ecdsa maintainers consider side-channel attacks
  out of scope and have no planned fix, so there is nothing to upgrade to. Recorded
  inline in `backend/requirements.txt`. Re-check with `python -m pip_audit -r
  requirements.txt` before each release (pip-audit is now in requirements-dev.txt).

- **Registration email-existence oracle (SEC-016).** `POST /auth/register` still
  returns a distinguishable error when an email is already taken. Fixing this well
  needs an email-verification flow (send-and-confirm) that does not exist yet;
  papering over it with a generic message would break the "email already registered"
  UX for the common honest case. Accepted for launch.

## Deferred (tracked follow-ups, out of this batch's scope)

- **httpOnly cookie auth.** The JWT is still stored in `localStorage`
  (`deepscroll_token`) and sent as a Bearer header, so it is reachable from
  JavaScript. The CSP added in M125 substantially narrows the XSS surface that could
  read it, but the durable fix is to move the token to an httpOnly, Secure,
  SameSite cookie. That is a coordinated frontend+backend change (CSRF handling, the
  WS auth-frame flow, the Plexive rename touching the storage key) and is left as a
  tracked open item.

- **Short-lived tokens plus a refresh flow.** There is currently **no token refresh
  flow**: the backend mints a single ~30-day token and the frontend only discards it
  on a 401. Decision 8 kept the 30-day lifetime for launch precisely because there is
  no refresh path to make a short lifetime usable. `token_version` (M126) already lets
  a password change revoke every live token immediately, and live WebSockets now
  re-check `token_version`/`is_active` per frame (M137). The follow-up is to add a
  refresh endpoint and then shorten the access-token lifetime.

## Known partial coverage (account privacy, M117)

Account-level privacy (a private account's posts are visible only to the owner and
accepted followers, and are excluded from For You and search for everyone else) is
enforced on the post-read, feed, and search paths. Two surfaces still leak limited
signal about a private author's content and were left as-is for launch:

- **Stats leaderboards aggregate private authors' posts count-only.** Global stats
  and leaderboards include private authors in aggregate counts. No post content,
  title, or body is exposed, only that the aggregate is one higher. Low signal.

- **`read_next` can surface a private post's title.** The resolved "read next" graph
  can include a latent or resolved edge whose target is a private author's post,
  exposing its title (not its body) as a suggestion. Closing this means threading the
  viewer's visibility filter through the graph-edge resolution, which is a larger
  change than this batch scoped.

## Migrations the owner must apply (not run against the live DB here)

Run by hand against Supabase, in this order (each is idempotent):

1. `backend/scripts/add_capability_columns.py` — adds `can_publish` / `is_admin`,
   back-fills `can_publish = true` for currently-verified users (M116).
2. `backend/scripts/add_token_version.py` — adds `token_version` (M126).
3. `backend/scripts/add_like_unique_index.py` — **destructive**: deletes existing
   anonymous likes and duplicate likes, then adds the partial unique index that
   makes a like idempotent per (user, post) (M119). Review before running.

## Config the owner must set

- `TRUSTED_PROXY_IPS` (backend env): leave empty for the current Tailscale setup;
  set to a TLS-terminating reverse proxy's IP/CIDR only if one is added (M136). The
  systemd start command must drop `--proxy-headers --forwarded-allow-ips=*` (see
  `docs/SERVER.md`).
- `NEXT_PUBLIC_API_URL` (frontend build env): already required; the M125 CSP derives
  its `connect-src` API and WebSocket origins from it, so it must be set at build time.
