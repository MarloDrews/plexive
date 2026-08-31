#!/usr/bin/env bash
# CW-16a  check: .claude/hooks/pretooluse_bash.py commit-rules injection   the deliver direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS THE SKILL SITTING WHERE CLAUDE CODE DISCOVERS IT. Written 2026-08-31
# with the move it exercises, so it agrees with its fix by construction -- the weakness CW-7
# and CW-8 declare in their own headers, declared here too.
#
# WHY IT EXISTS ANYWAY: the commit rules reach a session through TWO paths, and only one of
# them was broken. The skill loader never registered .claude/skills/commit.md (measured the
# same day: "Loaded 2 unique skills ... project: 2" with three skill files on disk). The
# PreToolUse hook, meanwhile, read that exact path on every git commit and delivered the body
# -- so the move that fixed the loader could have broken the delivery path that already
# worked, while everyone watched the one that did not. This case is that risk, stored.
#
# IT DOES NOT DISCRIMINATE ON THE EXIT CODE, like CW-9a and CW-13. The hook exits 0 whether
# it injects the rules or injects nothing at all; that indistinguishability IS the defect
# this pair is about. What discriminates is the asserted stdout.
set -eo pipefail

test -f .claude/skills/commit/SKILL.md || {
  echo "FAIL: .claude/skills/commit/SKILL.md is not there, so this case no longer stores"
  echo "the layout it was written for."; exit 2; }

OUT=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"x\""}}' \
      | python .claude/hooks/pretooluse_bash.py)
RC=$?
echo "hook rc=$RC, ${#OUT} bytes of stdout"

printf '%s' "$OUT" | grep -qF 'Use conventional commits' || {
  echo "FAIL: the commit rules body did not arrive. The hook read no rules from"
  echo ".claude/skills/commit/SKILL.md, and exited 0 saying nothing about it."; exit 2; }
printf '%s' "$OUT" | grep -qF 'No co-author lines' || {
  echo "FAIL: the body arrived truncated -- 'No co-author lines' is missing."; exit 2; }
# ONE JSON DOCUMENT, never two concatenated: the same assertion hook_cases.py makes, because
# the message at risk of being dropped is the backup warning that shares this stdout.
printf '%s' "$OUT" | python -c 'import json,sys; json.loads(sys.stdin.read())' || {
  echo "FAIL: stdout is not exactly one JSON document."; exit 2; }
echo "OK: the rules body arrived through the hook, as one JSON document."
