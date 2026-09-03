#!/usr/bin/env bash
# CW-12a  check: backend-checks / surface budget      THE REFUSAL DIRECTION
# EXPECT_RC=1
#
# THIS INPUT IS NOT CORRECT WORK AND THE CASE DECLARES A REFUSAL. It is stored because the step
# used to call it correct. Verbatim from the verification report of 2026-08-31, F6:
#
#     --- .claude/settings.json deleted (8 deny rules and both PreToolUse hooks with it)
#       ok settings_hook_events 0/1   settings_hook_matchers 0/2   settings_hook_commands 0/2
#       ok settings_permissions_allow 0/4   settings_permissions_deny 0/8
#     OK: all 23 containers at or under their ceilings.   (23 on the day; 24 since 2026-09-03)                       rc=0
#
# Six of those eight deny rules are git push guards. The hooks were two when that output was
# taken and are THREE now: the Bash gate, which carries the commit-rules injection and the
# backup gate, the Write/Edit gate, and the Stop rule-behaviour log added 2026-09-02. The
# step read settings as an empty dict when the file was absent and every container floored at
# zero, under budget: THE WHOLE GOVERNANCE SURFACE DISAPPEARING
# READ AS COMPLIANCE, inside the step written to watch that surface as a whole.
#
# The fix is not a new check and adds no container. It removes a silent default from a step whose
# own comment already forbade them -- no dict.get() with a default anywhere on the budget side,
# because a default is how a check keeps passing after its input is gone. The file it reads is
# now required to exist, exactly as tools/surface-budget.json is.
#
# The other half of F6 is CW-12b, and it still passes. A ceiling fires upward only.
set -eo pipefail

test -f .claude/settings.json || { echo "FAIL: .claude/settings.json is already gone."; exit 2; }
rm .claude/settings.json
echo "deleted .claude/settings.json (8 deny rules, 4 allow rules, both PreToolUse hooks)"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
