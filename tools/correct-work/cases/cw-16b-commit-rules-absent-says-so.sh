#!/usr/bin/env bash
# CW-16b  check: .claude/hooks/pretooluse_bash.py commit-rules injection   the fail-open direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A COMMIT, AND A COMMIT IS NOT REFUSED OVER AN ADVISORY FILE. The
# injection fails open on purpose, opposite to the backup gate in the same hook, and this
# case pins that: rc=0 with the rules file gone.
#
# WHAT IT ALSO PINS, AND WHY IT IS THE HALF WORTH KEEPING. Until 2026-08-31 failing open
# meant failing SILENT: measured that day against a tree with no rules file, rc=0, ZERO
# bytes on stdout and ZERO on stderr. A hook whose input had vanished was byte-identical to
# a hook with nothing to add, and the identical output was the reassuring one. The file was
# at .claude/skills/commit.md at the time and was about to move, which is exactly when a
# reader that cannot say "my input is gone" costs somebody the thing it was reading.
#
# The stored input is therefore a tree carrying the hook and NO rules file -- which is also
# what a half-finished move looks like from the hook's side.
#
# IT DOES NOT DISCRIMINATE ON THE EXIT CODE. rc=0 before the fix and rc=0 after; the whole
# change is in the bytes. Like CW-9a, CW-9d, CW-13 and CW-15c, what it pins is the printed
# text rather than the verdict.
set -eo pipefail

# A COPY. The real .claude/skills/commit/SKILL.md is never moved or deleted -- the same rule
# hook_cases.py follows for its four temp trees.
T="$RUNNER_TEMP/no-rules-tree"
rm -rf "$T"; mkdir -p "$T/.claude/hooks" "$T/.claude/skills" "$T/tools"
cp .claude/hooks/pretooluse_bash.py "$T/.claude/hooks/"
cp tools/check_backup_age.sh "$T/tools/"
test -z "$(ls -A "$T/.claude/skills")" || { echo "FAIL: the copy is not empty of skills."; exit 2; }
echo "built a tree with the hook and no rules file at all"

OUT=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"x\""}}' \
      | python "$T/.claude/hooks/pretooluse_bash.py")
RC=$?
echo "hook rc=$RC, ${#OUT} bytes of stdout"

# Both halves, and the second is the one that was missing.
[ "$RC" = "0" ] || { echo "FAIL: the hook refused a commit over an advisory file."; exit 2; }
[ -n "$OUT" ] || {
  echo "FAIL: the hook said NOTHING. rc=0 with an empty stdout is what a hook with nothing"
  echo "to add looks like, so a vanished input reads as a quiet success. That is the defect."
  exit 2; }
printf '%s' "$OUT" | grep -qF '.claude/skills/commit/SKILL.md' || {
  echo "FAIL: the notice does not name the path it could not read, so nobody reading it"
  echo "can tell which file to go and look for."; exit 2; }
printf '%s' "$OUT" | grep -qF 'Use conventional commits' && {
  echo "FAIL: the rules body arrived from a tree that has no rules file. Something other"
  echo "than .claude/skills/commit/SKILL.md is supplying this text -- a second copy is"
  echo "exactly what the 2026-08-30 batch removed."; exit 2; }
printf '%s' "$OUT" | python -c 'import json,sys; json.loads(sys.stdin.read())' || {
  echo "FAIL: stdout is not exactly one JSON document."; exit 2; }
echo "OK: commit allowed, and the hook named the file it could not read."
