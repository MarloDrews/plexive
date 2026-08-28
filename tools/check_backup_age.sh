#!/usr/bin/env bash
# tools/check_backup_age.sh
#
# Answers one question: IS THE BACKUP STILL RUNNING. It reports the age of the
# newest manifest and exits non-zero when that age is too high.
#
# This matters more than the schedule it watches. A forgotten backup is noticed
# the moment anyone looks. A SCHEDULED one that has been failing for two months
# looks exactly like a working one until it is needed -- the failure shape this
# repository has recorded eighteen times, applied to the one thing whose absence
# ends the project.
#
# So the rule that governs this file: a checker that found nothing and a checker
# that is broken must not produce the same output, and neither may produce the
# reassuring one. It asserts on a COUNT of manifests and prints it, and ZERO IS
# THE LOUDEST STATE rather than the quietest.
#
# METADATA ONLY, NEVER CONTENT. The backups live in OneDrive, where Files
# On-Demand can leave a file as a dehydrated placeholder. Reading such a file
# downloads it; reading its timestamp does not. Measured 2026-08-28 on a
# placeholder carrying OFFLINE|RECALL_ON_DATA_ACCESS: stat reported the true
# mtime (1727957280) and the true length (3799520 bytes) without hydrating it.
# Hence find -printf and stat here, and no cat, head or grep over a manifest.
#
# Usage:
#   bash tools/check_backup_age.sh
#   PLEXIVE_BACKUP_DIR=/tmp/x PLEXIVE_BACKUP_MAX_AGE_DAYS=3 bash tools/check_backup_age.sh
#
# Exit codes, one per situation, because "different message" is easy to get
# wrong and an exit code is checkable:
#   0  a backup exists, is current, and OneDrive has taken it over
#   1  a backup exists and is STALE
#   2  NO backups found at all
#   3  a current backup exists but has NOT reached OneDrive
#
# WHAT THE SYNC STATE DOES AND DOES NOT PROVE. This was measured on 2026-08-28
# rather than reasoned about, because it is the difference between a local file
# and an offsite copy.
#
# A file OneDrive has taken over carries FILE_ATTRIBUTE_REPARSE_POINT (1024).
# One it has not touched does not. Measured in both directions:
#   - OneDrive.exe NOT running: a 4 MB file written into the folder stayed at
#     attribute 32 (ARCHIVE) for over 8 minutes, shell status "Synchronisierung
#     ausstehend". The bit never appeared.
#   - OneDrive.exe running: the bit appeared within seconds, attribute 1056
#     (ARCHIVE|REPARSE_POINT), shell status "Auf diesem Gerät verfügbar".
#
# SO THE ABSENCE OF THE BIT IS A RELIABLE NEGATIVE: OneDrive has not processed
# this file, therefore it is certainly not uploaded. That is the state this
# machine was actually in on 2026-08-28 -- the sync client was not running at
# all -- so this detector catches the failure that really happens.
#
# ITS PRESENCE IS NOT PROOF OF UPLOAD, and overclaiming here would rebuild the
# exact reassuring-but-false signal this file exists to prevent. Timed across
# four sizes, the bit appeared after 5 s (4 MB), 5 s (6 MB), 16 s (120 MB) and
# 44 s (800 MB). If that marked a completed upload the implied upstream would be
# 6.4, 9.6, 60 and 145 Mbit/s -- rising with file size, which no fixed uplink
# does. The bit marks OneDrive converting the file to a placeholder locally, not
# the bytes reaching Microsoft.
#
# THE ONLY POSITIVE CONFIRMATION IS OUT OF BAND: open onedrive.com and look for
# the newest file. docs/SERVER.md carries that as a step. The shell's own
# "Verfügbarkeitsstatus" column was tried and rejected as a signal -- it is
# COM-only, localised, and returned an empty string on repeated reads of the
# same files minutes after it had answered correctly.

set -uo pipefail

# THE THRESHOLD, derived here rather than chosen, the way the 300 s and 180 s CI
# timeouts are:
#
#     7  the nominal interval -- the task runs weekly, Sunday 12:00
#   + 7  one occurrence lost outright. StartWhenAvailable catches up a missed
#        start, but it CANNOT fire on a machine that is off, so a week away
#        from the laptop loses the slot entirely rather than deferring it
#   + 2  a weekend, during which nobody would act on the warning anyway
#   = 16 days
#
# THE DANGEROUS DIRECTION IS DOWN. A check that reds on a healthy-but-delayed
# backup is a check that gets switched off, which is the same mistake as a CI
# gate that reds during correct work -- and this one has no gate behind it, only
# a person deciding whether to keep believing it. The cost of the upper bound is
# small and measurable: at most 16 days of content, against 66 posts in total on
# 2026-08-28.
THRESHOLD_DAYS="${PLEXIVE_BACKUP_MAX_AGE_DAYS:-16}"
NOMINAL_DAYS=7          # the schedule itself, used only for the "overdue" note

# --- where the backups are (resolved exactly as tools/backup_scheduled.sh) ---

# ONEDRIVE_ROOT is resolved even when PLEXIVE_BACKUP_DIR overrides the location,
# because the sync check below needs to know whether the backups are inside
# OneDrive at all. Empty means "not on a machine with OneDrive", which makes the
# sync state n/a rather than a false alarm.
ONEDRIVE_ROOT="${PLEXIVE_ONEDRIVE_ROOT:-${OneDrive:-$HOME/OneDrive}}"
if command -v cygpath >/dev/null 2>&1; then
  ONEDRIVE_ROOT="$(cygpath -u "$ONEDRIVE_ROOT" 2>/dev/null || printf '%s' "$ONEDRIVE_ROOT")"
fi
[ -d "$ONEDRIVE_ROOT" ] || ONEDRIVE_ROOT=""

if [ -n "${PLEXIVE_BACKUP_DIR:-}" ]; then
  BACKUP_DIR="$PLEXIVE_BACKUP_DIR"
else
  BACKUP_DIR="${ONEDRIVE_ROOT:-$HOME/OneDrive}/plexive-backups"
fi

LOG="$BACKUP_DIR/backup-runs.log"

say_log_tail () {
  # The last run line, whatever it says. A run that FAILS leaves no manifest at
  # all, so a fresh failure is invisible to manifest age until day 16 -- this
  # line shows it now. Evidence, not a verdict: the verdict is the age.
  if [ -f "$LOG" ]; then
    local n
    n="$(grep -c '[^[:space:]]' "$LOG" 2>/dev/null | tr -d '\r')"
    echo "last run   : $(tail -n 1 "$LOG" | tr -d '\r')"
    echo "run log    : ${n:-0} lines in $LOG"
  else
    echo "run log    : none at $LOG (the scheduled wrapper has never written one)"
  fi
}

onedrive_tracked () {
  # Echoes: tracked | untracked | n/a
  #
  # "tracked" means OneDrive has taken the file over as a placeholder. See the
  # header: that is NOT proof of upload, but "untracked" IS proof of no upload.
  #
  # Only meaningful when the backups actually live inside OneDrive, so a Pi run
  # or a test directory answers n/a rather than reporting a false alarm. The
  # attribute is invisible to stat, ls and attrib.exe -- attrib prints [A] in
  # both states, measured -- so this shells out to PowerShell, and says n/a
  # where there is none.
  local file="$1" win
  case "${ONEDRIVE_ROOT:-}" in
    "") echo "n/a"; return ;;
  esac
  case "$file" in
    "$ONEDRIVE_ROOT"/*) ;;
    *) echo "n/a"; return ;;
  esac
  command -v cygpath      >/dev/null 2>&1 || { echo "n/a"; return; }
  command -v powershell.exe >/dev/null 2>&1 || { echo "n/a"; return; }
  win="$(cygpath -w "$file" 2>/dev/null)" || { echo "n/a"; return; }
  local attr
  attr="$(powershell.exe -NoProfile -NonInteractive -Command \
          "[int64](Get-Item -LiteralPath '$win' -Force).Attributes" 2>/dev/null | tr -d '\r' | tr -d '[:space:]')"
  case "$attr" in
    ''|*[!0-9]*) echo "n/a"; return ;;
  esac
  if [ $(( attr & 1024 )) -ne 0 ]; then echo "tracked"; else echo "untracked"; fi
}

# --- state 3 of 4: nothing here at all --------------------------------------

if [ ! -d "$BACKUP_DIR" ]; then
  echo "NO BACKUPS FOUND"
  echo "================"
  echo
  echo "The backup directory does not exist:"
  echo "  $BACKUP_DIR"
  echo
  echo "0 manifests. This is the most alarming state there is, not the quietest:"
  echo "it means no backup has ever been written here, or this check is pointed"
  echo "at the wrong directory. Supabase's free tier takes no automatic backups,"
  echo "so if this is the right directory there is currently NO copy of the"
  echo "database anywhere."
  echo
  echo "Do this now:"
  echo "  bash tools/backup_scheduled.sh"
  echo "and if that works, the scheduled task is missing or points elsewhere."
  echo "See docs/SERVER.md, section Backups."
  exit 2
fi

# find -printf, not ls: metadata only, so a dehydrated placeholder is not
# downloaded just to be counted.
MANIFESTS="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'plexive-*-manifest.txt' -printf '%T@ %p\n' 2>/dev/null | sort -rn)"
COUNT="$(printf '%s\n' "$MANIFESTS" | grep -c '[^[:space:]]')"

if [ "${COUNT:-0}" -eq 0 ]; then
  echo "NO BACKUPS FOUND"
  echo "================"
  echo
  echo "The directory exists but holds 0 manifests:"
  echo "  $BACKUP_DIR"
  echo
  say_log_tail
  echo
  echo "0 manifests is the most alarming state there is, not the quietest."
  echo "Either nothing has ever run, or every run has failed, or this check is"
  echo "pointed at the wrong directory."
  echo
  echo "Do this now:"
  echo "  bash tools/backup_scheduled.sh"
  echo "See docs/SERVER.md, section Backups."
  exit 2
fi

NEWEST_EPOCH="$(printf '%s\n' "$MANIFESTS" | head -n 1 | cut -d' ' -f1 | cut -d. -f1)"
NEWEST_PATH="$(printf '%s\n' "$MANIFESTS" | head -n 1 | cut -d' ' -f2-)"
NOW="$(date +%s)"
AGE_DAYS=$(( (NOW - NEWEST_EPOCH) / 86400 ))
NEWEST_DATE="$(date -d "@$NEWEST_EPOCH" +%Y-%m-%d 2>/dev/null)"

case "$AGE_DAYS" in
  0) AGE_PHRASE="today" ;;
  1) AGE_PHRASE="1 day ago" ;;
  *) AGE_PHRASE="$AGE_DAYS days ago" ;;
esac

SYNC="$(onedrive_tracked "$NEWEST_PATH")"
case "$SYNC" in
  tracked)   SYNC_LINE="sync state : OneDrive has taken the newest manifest over (not proof of upload -- see below)" ;;
  untracked) SYNC_LINE="sync state : NOT TAKEN OVER BY ONEDRIVE -- the newest manifest has certainly not been uploaded" ;;
  *)         SYNC_LINE="sync state : n/a (these backups are not inside a OneDrive folder on this machine)" ;;
esac

# --- state 2 of 4: there is a backup, and it is too old ---------------------

if [ "$AGE_DAYS" -gt "$THRESHOLD_DAYS" ]; then
  echo "BACKUP IS STALE"
  echo "==============="
  echo
  echo "Last backup: $AGE_PHRASE ($NEWEST_DATE)"
  echo "Threshold  : $THRESHOLD_DAYS days (weekly 7 + one lost run 7 + a weekend 2)"
  echo "manifests  : $COUNT in $BACKUP_DIR"
  echo "newest     : $NEWEST_PATH"
  echo "$SYNC_LINE"
  say_log_tail
  echo
  echo "The schedule has stopped producing backups. Do this, in order:"
  echo "  1. Take one now:   bash tools/backup_scheduled.sh"
  echo "  2. Read the log line above. A run that failed is recorded there with"
  echo "     its exit code and a backup-failed-*.log next to it."
  echo "  3. Check the task exists and still has a next run time:"
  echo "     Get-ScheduledTask -TaskName 'Plexive weekly database backup' | Get-ScheduledTaskInfo"
  echo "See docs/SERVER.md, section Backups."
  exit 1
fi

# --- state 1 of 4: current --------------------------------------------------

# --- state 4 of 4: written, current, but it never left this machine ---------
# A separate situation with its own message and its own exit code, NOT folded
# into the others: "there is no backup" and "there is a backup and it is only on
# this disk" call for different actions, and the second one is invisible to
# every other signal here. The backup ran, the log says rc=0, the age is 0 days,
# and there is still no offsite copy.

if [ "$SYNC" = "untracked" ]; then
  echo "BACKUP HAS NOT REACHED ONEDRIVE"
  echo "==============================="
  echo
  echo "Last backup: $AGE_PHRASE ($NEWEST_DATE) -- current, and LOCAL ONLY."
  echo
  echo "manifests  : $COUNT in $BACKUP_DIR"
  echo "newest     : $NEWEST_PATH"
  echo "$SYNC_LINE"
  say_log_tail
  echo
  echo "The newest manifest carries no OneDrive placeholder attribute, which"
  echo "means the sync client has not processed it. The backup exists on this"
  echo "disk and nowhere else, so a disk failure still takes it -- which is the"
  echo "entire risk the OneDrive location exists to remove."
  echo
  echo "Most likely cause, and the one seen on this machine on 2026-08-28:"
  echo "the OneDrive client is not running. Check and start it:"
  echo "  Get-Process OneDrive -ErrorAction SilentlyContinue"
  echo "  Start-Process \"\$env:LOCALAPPDATA\\Microsoft\\OneDrive\\OneDrive.exe\" -ArgumentList '/background'"
  echo
  echo "Then re-run this check."
  echo
  echo "WHY IT WAS NOT RUNNING, on 2026-08-28: OneDrive was DISABLED IN WINDOWS"
  echo "STARTUP APPS. The registry Run entry was present and correct, which is"
  echo "what made it look configured -- Windows keeps a separate enable/disable"
  echo "state that switches an entry off without removing it. Check Settings >"
  echo "Apps > Startup, and OneDrive's own 'start when I sign in' option; each"
  echo "overrides the others independently. Note also that"
  echo "OneDrive.Sync.Service.exe can be running while syncing nothing -- it is"
  echo "OneDrive.exe that matters."
  echo
  echo "Also worth ruling out: sync paused, signed out, out of quota, or a sync"
  echo "conflict on the folder."
  exit 3
fi

echo "OK  Last backup: $AGE_PHRASE ($NEWEST_DATE)"
echo
echo "manifests  : $COUNT in $BACKUP_DIR"
echo "newest     : $NEWEST_PATH"
echo "threshold  : $THRESHOLD_DAYS days (weekly 7 + one lost run 7 + a weekend 2)"
echo "$SYNC_LINE"
say_log_tail

if [ "$AGE_DAYS" -gt "$NOMINAL_DAYS" ]; then
  echo
  echo "NOTE: that is past the $NOMINAL_DAYS-day schedule, so one weekly run"
  echo "      appears to have been missed. Still within the threshold, so this"
  echo "      is not yet a failure -- but two in a row is."
fi

if [ "$SYNC" = "tracked" ]; then
  echo
  echo "NOTE: OneDrive has taken the newest manifest over, which is NOT the same"
  echo "      as proof it uploaded -- that attribute is set locally, seconds"
  echo "      after the write, long before the bytes are sent (measured across"
  echo "      four file sizes, 2026-08-28). The only positive confirmation is"
  echo "      opening onedrive.com and seeing the newest file there."
fi

exit 0
