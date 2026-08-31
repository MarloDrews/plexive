#!/usr/bin/env bash
# CW-8  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A CORRECTION TO CLAUDE.md THAT A STANDING RULE REQUIRED. This is the
# input the surface budget is most likely to red on wrongly, and the one CI cannot produce on
# its own, so it is stored rather than argued about.
#
# CLAUDE.md carries a rule that a change making existing documentation false must correct it in
# the same commit or the same batch. That rule makes commits of this exact shape RECUR: a batch
# changes something, CLAUDE.md now says something untrue, and the batch adds lines to CLAUDE.md
# without adding a single rule to it. The replay found the largest such commit at f2f49f95
# (2026-08-31, "docs(claude-md): record the exact commands the three required checks run"),
# which added 36 lines and 2,809 bytes and was required work by any reading.
#
# So the claude_md_lines ceiling is set at the measured count plus exactly those 36 lines, and
# this case appends a 36-line correction to prove the ceiling admits one. It sits ON the
# boundary deliberately. Anyone who later tightens claude_md_lines to a pin -- which is the
# obvious-looking change, and which the first draft of the batch that wrote this step proposed
# -- turns this case red, and run_all.sh reports it as a mismatch rather than as a silence.
#
# The block below adds NO "## " heading and NO bullet under "## Rules", because those are the
# counts that are pinned hard. That is the point of the split: prose corrections move bytes and
# lines, and only a deliberate addition moves a section or a rule.
#
# Written on 2026-08-31 in the same batch as the step it exercises, so it agrees with its own
# fix by construction. That is the same weakness CW-7 declares about itself, and it is recorded
# here for the same reason rather than left for a reader to notice.
set -eo pipefail

# 36 lines exactly: 12 paragraphs of two lines each, separated by 11 blanks, plus one leading
# blank to separate the block from the paragraph above it. Counted by the assertion below
# rather than by trusting the heredoc, because a block that silently arrived with 35 lines
# would make this case pass for the wrong reason.
before=$(python3 -c "print(len(open('CLAUDE.md','rb').read().replace(b'\r\n',b'\n').decode('utf-8').splitlines()))")

{
  echo ""
  for n in 1 2 3 4 5 6 7 8 9 10 11 12; do
    echo "Correction $n, of the shape the same-batch documentation rule produces: a paragraph"
    echo "that replaces a statement this batch made false, adding no rule and no section."
    if [ "$n" -lt 12 ]; then echo ""; fi
  done
} >> CLAUDE.md

after=$(python3 -c "print(len(open('CLAUDE.md','rb').read().replace(b'\r\n',b'\n').decode('utf-8').splitlines()))")
added=$((after - before))
echo "appended $added lines to CLAUDE.md (before=$before after=$after)"
if [ "$added" -ne 36 ]; then
  echo "FAIL: this case appended $added lines, not the 36 it exists to store."
  echo "The input drifted, so whatever the step says next would be about a different input."
  exit 2
fi

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
