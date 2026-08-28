#!/usr/bin/env bash
# tools/probe_public_surface.sh
#
# The reproducible definition of "what does Plexive serve to somebody holding
# nothing at all". Sends NO Authorization header, NO cookie and NO session to
# every endpoint and page worth asking about, and prints the status and body
# size for each.
#
# THE FINDING IS A NON-EMPTY RESULT. This script does not pass or fail; it
# reports. Under the closed beta (backend CLOSED_BETA=1, frontend BETA_PASSWORD)
# the only anonymous 200 should be /health, and every line in the FAILURES
# summary at the end is content reachable without a credential.
#
# Written for the 2026-08 closed-beta batch, and kept rather than thrown away
# because the question it answers comes back the day the gate lifts: whoever
# reopens the beta has to know exactly what reopened with it. Re-run it then and
# diff the two outputs.
#
# Usage:
#   bash tools/probe_public_surface.sh                       # production
#   API=http://localhost:8000 WEB=http://localhost:3000 bash tools/probe_public_surface.sh
#
# Note the post id and username below are seeded content that exists in
# production. Against a fresh local database they will 404 rather than 200, and
# a 404 is not evidence of a gate -- read the status column, not the summary
# alone, when running locally.

set -uo pipefail

API="${API:-https://api.plexive.org}"
WEB="${WEB:-https://plexive.org}"
POST_ID="${PLEXIVE_POST_ID:-6}"
# NOT named USERNAME: that name is already set by Windows (and by some CI
# images) to the OS login, so ${USERNAME:-Marlo} silently probed the wrong
# account and reported 404 for four profile endpoints that were in fact wide
# open. A probe that reads as closed because it asked the wrong question is
# exactly the failure this script exists to catch, so it must not contain one.
PLEXIVE_USER="${PLEXIVE_USER:-Marlo}"

# Anonymous 200 here is EXPECTED and deliberate: a monitor needs it, and it
# returns {"status":"ok"} with no application content. Everything else that
# answers 200 is a finding.
EXPECTED_OPEN="/health"

leaked=0
checked=0

probe() {
  local base="$1" method="$2" path="$3" label="$4"
  local out code size
  out=$(curl -s -X "$method" -o /dev/null -w "%{http_code} %{size_download}" \
        --max-time 20 "${base}${path}" 2>/dev/null) || out="000 0"
  code="${out%% *}"
  size="${out##* }"
  checked=$((checked + 1))
  local flag="    "
  if [ "$code" = "200" ] && [ "$path" != "$EXPECTED_OPEN" ]; then
    flag="LEAK"
    leaked=$((leaked + 1))
  fi
  printf '%s %-6s %-9s %-45s %5s %10s\n' "$flag" "$method" "$label" "$path" "$code" "$size"
}

echo "Anonymous probe -- no token, no cookie, no session"
echo "API=$API"
echo "WEB=$WEB"
echo
printf '%s %-6s %-9s %-45s %5s %10s\n' 'FLAG' 'METHOD' 'TARGET' 'PATH' 'CODE' 'BYTES'
echo "-------------------------------------------------------------------------------------"

# --- the API -----------------------------------------------------------------
for p in \
  /health \
  /docs \
  /redoc \
  /openapi.json \
  /api/interests \
  /api/stats/global \
  /api/stats/me \
  "/api/feed?limit=2" \
  "/api/feed/following?limit=2" \
  "/api/feed/user/${PLEXIVE_USER}" \
  "/api/posts/${POST_ID}" \
  "/api/posts/${POST_ID}/comments" \
  "/api/posts/${POST_ID}/likes" \
  /api/posts/mine \
  "/api/search?q=eye" \
  "/api/search/users?q=${PLEXIVE_USER}" \
  "/api/users/${PLEXIVE_USER}/profile" \
  "/api/users/${PLEXIVE_USER}/elo" \
  "/api/users/${PLEXIVE_USER}/followers" \
  "/api/users/${PLEXIVE_USER}/following" \
  "/api/users/${PLEXIVE_USER}/follow-requests" \
  /api/graph \
  /api/auth/me \
  /api/quiz/answered \
  "/api/quiz/state/${POST_ID}" \
  /api/train/leaderboard \
  /api/chat/conversations ; do
  probe "$API" GET "$p" api
done

# --- the web app -------------------------------------------------------------
for p in / /login /register /search /onboarding /saved-posts /stats \
         "/post/${POST_ID}" "/profile/${PLEXIVE_USER}" /favicon.ico ; do
  probe "$WEB" GET "$p" web
done

# The static-asset check, which has to be READ rather than scanned for LEAK.
# A proxy carrying the commonly copied negative-lookahead matcher excludes
# /_next/static, which leaves the whole app shell, its JS and its CSS readable
# to anyone. Neither outcome here is a 200, so the LEAK column cannot show it --
# the STATUS is the signal. It deliberately asks for a file that does not exist,
# so the answer is about coverage rather than about the file:
#   401 -> the gate runs on static assets (what the closed beta wants)
#   404 -> Next served the miss itself, so the gate did NOT cover it
STATIC_PROBE="/_next/static/chunks/does-not-exist-probe.js"
static_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
              "${WEB}${STATIC_PROBE}" 2>/dev/null) || static_code="000"
printf '%s %-6s %-9s %-45s %5s %10s\n' '    ' 'GET' 'web' "$STATIC_PROBE" "$static_code" '-'
checked=$((checked + 1))

echo
echo "-------------------------------------------------------------------------------------"
echo "Checked $checked paths. Anonymous 200s other than ${EXPECTED_OPEN}: $leaked"
if [ "$leaked" -gt 0 ]; then
  echo "Each LEAK line above answered a caller holding no credential."
else
  echo "Nothing answered 200 except ${EXPECTED_OPEN}."
fi
echo
case "$static_code" in
  401) echo "Static assets: covered by the web gate (${STATIC_PROBE} -> 401)." ;;
  404) echo "Static assets: NOT covered -- Next answered ${STATIC_PROBE} itself (404)."
       echo "               If the gate is meant to be on, its matcher excludes /_next." ;;
  *)   echo "Static assets: inconclusive (${STATIC_PROBE} -> ${static_code}); read by hand." ;;
esac
echo
echo "Not covered here, and needing their own check:"
echo "  - the three websockets (/api/{chat,battle,arena}/ws), which authenticate"
echo "    on the first frame rather than by header, so a 101 upgrade is not a leak"
echo "    on its own -- what matters is whether a content frame arrives."
echo "  - registration: POST /api/auth/register, which this script never sends"
echo "    because probing it with a real body would create an account."
