#!/usr/bin/env bash
# tools/backup_scheduled.sh
#
# The scheduled half of tools/backup_supabase.sh. That script is correct and
# complete; nothing triggered it, so the backup happened when somebody
# remembered. "Somebody remembers" is not a mechanism.
#
# WHY THIS FILE EXISTS RATHER THAN A TASK-SCHEDULER ENTRY POINTING STRAIGHT AT
# backup_supabase.sh. Task Scheduler cannot run a bash script directly, and it
# cannot carry a shell pipeline, so the documented invocation --
#   PLEXIVE_BACKUP_URL="$(grep -E ... backend/.env | cut -d= -f2-)"
# -- has nowhere to live in a task definition. This is that pipeline, TRACKED,
# so it is not a file that exists on one laptop only.
#
# THE OUTPUT GOES TO ONEDRIVE, and that is the point of the directory default
# rather than a convenience. The dumps used to sit under C:\Users\marlo\GitHub\,
# on the same disk as the repositories they exist to survive: one failed SSD
# took the database copy with everything else. OneDrive on Windows is a normal
# folder that syncs, so the offsite copy is a property of WHERE the path is --
# no cloud API, no credentials, no second tool.
#
# WHAT THIS CANNOT TELL YOU: whether OneDrive actually uploaded the file. See
# the sync-state note in tools/check_backup_age.sh and the named limit under
# "Backups" in docs/SERVER.md. A local write is not an offsite copy.
#
# EVERY RUN LEAVES EVIDENCE, including the failed ones. A scheduled task that
# fails leaves nothing behind by default except a status code in a UI nobody
# opens, which is this repository's documented failure shape: local success and
# a reassuring status, with the thing that was supposed to happen not happening.
#
# Usage (every default is overridable, so the whole thing is testable without
# ever touching production):
#   bash tools/backup_scheduled.sh
#   PLEXIVE_BACKUP_DIR=/tmp/x PLEXIVE_BACKUP_URL=postgresql://... \
#     PLEXIVE_FAIL_HOLD_SECONDS=0 bash tools/backup_scheduled.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

# How long a FAILED run holds the console open. The scheduled task runs "only
# when logged on", so a window appears for about ten seconds every Sunday and
# that flash is the only unprompted evidence the mechanism still exists. A run
# that FAILS must look different from one that worked, so it lingers instead.
#
# A plain sleep, deliberately, and not a "press any key" read: the Local Tooling
# section of CLAUDE.md records that isatty() answers True for NUL on Windows, so
# a terminal test here would be the exact class of guard that is right in
# production and wrong on this laptop.
FAIL_HOLD="${PLEXIVE_FAIL_HOLD_SECONDS:-120}"

LOG=""          # set as soon as the backup directory is known
TRANSCRIPT=""

stamp () { date -u +%Y-%m-%dT%H:%M:%SZ; }

log_line () {
  [ -n "$LOG" ] || return 0
  printf '%s\n' "$1" >> "$LOG"
}

hold_then_exit () {
  local rc="$1"
  if [ "$rc" -ne 0 ] && [ "$FAIL_HOLD" -gt 0 ]; then
    echo
    echo "================================================================"
    echo "  THE BACKUP FAILED (exit $rc). Nothing usable was written."
    echo "  This window stays open ${FAIL_HOLD}s so the failure is visible;"
    echo "  a successful run closes straight away."
    echo "================================================================"
    sleep "$FAIL_HOLD"
  fi
  exit "$rc"
}

die () {                    # die <rc> <short, for the log> <long, for a human>
  local rc="$1"; shift
  local short="$1"; shift
  echo "FATAL: $*" >&2
  log_line "$(stamp) rc=$rc error=\"$short\""
  hold_then_exit "$rc"
}

# --- where the files go -----------------------------------------------------
# An explicit PLEXIVE_BACKUP_DIR wins and skips the OneDrive check entirely:
# that is the test path, and it is also the Pi fallback, where there is no
# OneDrive at all.

if [ -n "${PLEXIVE_BACKUP_DIR:-}" ]; then
  BACKUP_DIR="$PLEXIVE_BACKUP_DIR"
else
  # OneDrive is a persisted HKCU user variable written by OneDrive setup, not a
  # session-only one -- verified in the registry 2026-08-28 -- so a task running
  # under this user token has it. cygpath turns C:\Users\... into /c/Users/...
  ONEDRIVE_ROOT="${PLEXIVE_ONEDRIVE_ROOT:-${OneDrive:-$HOME/OneDrive}}"
  if command -v cygpath >/dev/null 2>&1; then
    ONEDRIVE_ROOT="$(cygpath -u "$ONEDRIVE_ROOT" 2>/dev/null || printf '%s' "$ONEDRIVE_ROOT")"
  fi
  # FATAL rather than a fallback ON PURPOSE. Quietly writing to a local folder
  # when OneDrive is missing reproduces exactly the state this script exists to
  # remove -- one copy, on one disk -- while every status signal still reads OK.
  [ -d "$ONEDRIVE_ROOT" ] || die 1 "OneDrive root not found: $ONEDRIVE_ROOT" \
"OneDrive root not found: $ONEDRIVE_ROOT
       Nothing was written, and that is deliberate: falling back to a local
       directory would produce a backup that is one disk failure from useless
       while every status check still said OK.
       Set PLEXIVE_ONEDRIVE_ROOT, or set PLEXIVE_BACKUP_DIR to choose the
       directory outright (that is also how the Pi fallback runs, where
       OneDrive does not exist)."
  BACKUP_DIR="$ONEDRIVE_ROOT/plexive-backups"
fi

mkdir -p "$BACKUP_DIR" 2>/dev/null
[ -d "$BACKUP_DIR" ] || die 1 "cannot create $BACKUP_DIR" "cannot create $BACKUP_DIR"
LOG="$BACKUP_DIR/backup-runs.log"

# --- the connection string --------------------------------------------------

ENV_FILE="${PLEXIVE_ENV_FILE:-$REPO_ROOT/backend/.env}"
URL="${PLEXIVE_BACKUP_URL:-}"

if [ -z "$URL" ]; then
  [ -f "$ENV_FILE" ] || die 2 "env file not found: $ENV_FILE" \
"env file not found: $ENV_FILE
       This is where DATABASE_URL is read from. Point PLEXIVE_ENV_FILE at it,
       or set PLEXIVE_BACKUP_URL directly."

  # ASSERT ON A COUNT, not on whether grep found something. Zero matches means
  # the key is gone; two means an ambiguous file where a first-wins guess is a
  # plausible WRONG database. Both otherwise produce a confident answer.
  ENV_HITS="$(grep -c '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | tr -d '\r')"
  [ "${ENV_HITS:-0}" -eq 1 ] || die 2 "expected 1 DATABASE_URL line in $ENV_FILE, found ${ENV_HITS:-0}" \
"expected exactly 1 line matching ^DATABASE_URL= in $ENV_FILE, found ${ENV_HITS:-0}.
       Zero means the key is gone. Two or more means the file is ambiguous, and
       any choice here would be a guess at which database to back up."

  # tr -d CR because a .env edited on Windows is CRLF, and a trailing carriage
  # return inside a connection string is not cosmetic.
  URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//')"
  [ -n "$URL" ] || die 2 "DATABASE_URL in $ENV_FILE is empty" \
"DATABASE_URL is present in $ENV_FILE but has no value."
fi

# --- the PostgreSQL client tools --------------------------------------------
# The winget install does not put these on the Git Bash PATH, and a scheduled
# task inherits even less than an interactive shell. docs/SERVER.md already
# records the export; this does it so the task needs no shell profile.

PG_BIN="${PLEXIVE_PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
if ! command -v pg_dump >/dev/null 2>&1; then
  if [ -d "$PG_BIN" ]; then
    PATH="$PG_BIN:$PATH"
    export PATH
  fi
fi
command -v pg_dump >/dev/null 2>&1 || die 3 "pg_dump not on PATH (tried $PG_BIN)" \
"pg_dump is not on PATH, and it was not at $PG_BIN either.
       Install the client tools and match the major to the SERVER:
         winget install --id PostgreSQL.PostgreSQL.17 -e
       or point PLEXIVE_PG_BIN at the bin directory."

# --- run it -----------------------------------------------------------------

TRANSCRIPT="$(mktemp "${TMPDIR:-/tmp}/plexive-backup-$TS.XXXXXX")" \
  || die 4 "cannot create a transcript file" "cannot create a temporary transcript file"

echo "plexive scheduled backup -- $(stamp)"
echo "target dir : $BACKUP_DIR"
echo

PLEXIVE_BACKUP_URL="$URL" PLEXIVE_BACKUP_DIR="$BACKUP_DIR" \
  bash "$REPO_ROOT/tools/backup_supabase.sh" 2>&1 | tee "$TRANSCRIPT"
RC="${PIPESTATUS[0]}"

# --- assert the run produced a manifest, rather than trusting exit 0 ---------
# backup_supabase.sh prints the manifest path LAST, on purpose. A count of
# exactly one is the assertion; zero with rc=0 means the script succeeded and
# produced nothing this log line could name, which is a green result that says
# nothing -- so it is reported as a failure (90) rather than as a success.

MANIFEST=""
if [ "$RC" -eq 0 ]; then
  MAN_HITS="$(grep -c '^  manifest: ' "$TRANSCRIPT" 2>/dev/null | tr -d '\r')"
  if [ "${MAN_HITS:-0}" -ne 1 ]; then
    echo "FATAL: the backup exited 0 but printed ${MAN_HITS:-0} manifest lines, expected 1." >&2
    RC=90
  else
    MANIFEST="$(grep '^  manifest: ' "$TRANSCRIPT" | head -n 1 | sed 's/^  manifest: //' | tr -d '\r')"
    if [ ! -f "$MANIFEST" ]; then
      echo "FATAL: the backup named a manifest that does not exist: $MANIFEST" >&2
      RC=90
    fi
  fi
fi

# --- one line per run, next to the backups ----------------------------------

if [ "$RC" -eq 0 ]; then
  log_line "$(stamp) rc=0 manifest=$MANIFEST"
  rm -f "$TRANSCRIPT"
  echo
  echo "logged to $LOG"
else
  # The full transcript is kept only for a FAILURE. A success already leaves the
  # manifest, which is the better record; a failure leaves nothing else at all.
  FAILLOG="$BACKUP_DIR/backup-failed-$TS.log"
  cp "$TRANSCRIPT" "$FAILLOG" 2>/dev/null
  rm -f "$TRANSCRIPT"
  ERR="$(grep -m 1 '^FATAL' "$FAILLOG" 2>/dev/null | tr -d '\r')"
  [ -n "$ERR" ] || ERR="$(grep -v '^[[:space:]]*$' "$FAILLOG" 2>/dev/null | tail -n 1 | tr -d '\r')"
  [ -n "$ERR" ] || ERR="no output"
  ERR="$(printf '%s' "$ERR" | tr '"' "'" | cut -c1-200)"
  log_line "$(stamp) rc=$RC error=\"$ERR\" log=$(basename "$FAILLOG")"
  echo
  echo "logged to $LOG, full output kept at $FAILLOG"
fi

hold_then_exit "$RC"
