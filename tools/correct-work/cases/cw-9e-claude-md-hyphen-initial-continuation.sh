#!/usr/bin/env bash
# CW-9e  check: backend-checks / surface budget      THE KNOWN RESIDUAL, PINNED
# EXPECT_RC=1
#
# THIS CASE IS NOT A DEFECT REPORT. It pins the one shape the F1 definition still gets wrong, so
# that the residual lives in a file that runs rather than only in a sentence somebody reads once.
# A residual recorded only in prose is what F1 itself was.
#
# A rule is counted by its opening line: a "- " bullet at column 0, or the first line of a
# blank-line-separated paragraph at column 0. A CONTINUATION LINE THAT ITSELF BEGINS "- " IS
# INDISTINGUISHABLE FROM A BULLET, textually and to a markdown parser both -- CommonMark reads
# that line as a new list item too. So one bullet added here moves claude_md_rules by two.
#
# THE INPUT COULD NOT BE BUILT BY REWRAPPING AN EXISTING BULLET, and that is the measurement of
# how bounded the residual is: measured 2026-08-31, not one of the six bullets in "## Rules"
# contains a standalone hyphen token, so no wrap width can produce this line from the text that
# is there. The case therefore adds ONE bullet whose own dash clause falls on the wrap boundary.
#
# rc=1 because claude_md_rules goes to 8 against a ceiling of 7 (one real bullet, one phantom),
# and claude_md_unconditional_rules follows it. The declaration is the behaviour as it stands
# TODAY, not an endorsement of it. If someone later teaches the parser to tell a continuation
# from a bullet, this case flips to 0 and run_all.sh reports the flip in that direction as loudly
# as in the other. Do not "fix" the residual to make this case green: a definition that handles
# every wrapping style is a parser nobody can read, and the cost of this one is one bounded,
# stored, visible case.
set -eo pipefail

python3 - <<'PY'
import textwrap

# 97 columns before the dash clause, so a 98-column wrap breaks immediately in front of it.
BULLET = ("- One rule, one bullet, wrapped at 98 columns onto a second line which itself opens"
          " with a hyphen - and that second line is a continuation, not a rule.")

wrapped = textwrap.wrap(BULLET, width=98)
if " ".join(wrapped).split() != BULLET.split():
    raise SystemExit("input drift: the rewrap changed the text")
if len(wrapped) < 2 or not wrapped[1].startswith("- "):
    raise SystemExit("input drift: the wrap no longer lands on the hyphen, so this case would "
                     "pin nothing: %r" % (wrapped,))

blob = open("CLAUDE.md", "rb").read().replace(b"\r\n", b"\n").decode("utf-8")
lines = blob.split("\n")
inside = False
last_bullet = None
for i, ln in enumerate(lines):
    if ln.startswith("## "):
        inside = ln.strip() == "## Rules"
        continue
    if inside and ln.startswith("- "):
        last_bullet = i
if last_bullet is None:
    raise SystemExit("input drift: no bullet found under ## Rules")

lines[last_bullet + 1:last_bullet + 1] = wrapped
open("CLAUDE.md", "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("added ONE bullet, wrapped onto %d lines, the second beginning '- '" % len(wrapped))
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
