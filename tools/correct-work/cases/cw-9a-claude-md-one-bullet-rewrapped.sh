#!/usr/bin/env bash
# CW-9a  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS REFLOWING ONE BULLET. No rule is added, no rule is removed and no
# character of text changes -- the bullet is simply wrapped at 98 columns instead of running
# to 818. This is finding F1 of plexive-docs/research/surface-budget-verification-2026-08-31.md,
# stored verbatim: the metric was bullets + paragraphs, where a paragraph was any run of
# non-blank non-bullet lines inside "## Rules", so a continuation line registered as a rule.
#
# The verification session measured this exact input at claude_md_unconditional_rules 8 / 8,
# rc=0 -- the margin of one spent, but not exceeded. IT IS THEREFORE THE ONE F1 FIXTURE THAT
# DOES NOT DISCRIMINATE ON THE EXIT CODE, and it is stored anyway, because what it pins is the
# number: 7 after the fix, 8 before it. CW-9b is the same input at two bullets, where the
# margin runs out and the exit code moves.
#
# The text is asserted identical after the rewrap. A case that quietly reworded a bullet would
# be measuring something else entirely and would still look like it passed.
set -eo pipefail

REWRAP=1 python3 - <<'PY'
import os
import textwrap

LIMIT = int(os.environ["REWRAP"])
blob = open("CLAUDE.md", "rb").read().replace(b"\r\n", b"\n").decode("utf-8")
lines = blob.split("\n")

# The bullets of "## Rules" only. A bullet under any other heading is not what this metric counts.
inside = False
bullets = []
for i, ln in enumerate(lines):
    if ln.startswith("## "):
        inside = ln.strip() == "## Rules"
        continue
    if inside and ln.startswith("- "):
        bullets.append(i)

targets = sorted(bullets, key=lambda i: len(lines[i]), reverse=True)[:LIMIT]
if len(targets) != LIMIT:
    raise SystemExit("input drift: wanted %d bullets, found %d" % (LIMIT, len(bullets)))

out = []
added = 0
for i, ln in enumerate(lines):
    if i in targets:
        wrapped = textwrap.wrap(ln, width=98)
        if " ".join(wrapped).split() != ln.split():
            raise SystemExit("input drift: the rewrap changed the text of line %d" % i)
        added += len(wrapped) - 1
        out.extend(wrapped)
    else:
        out.append(ln)
if added < 1:
    raise SystemExit("input drift: nothing wrapped, so this case would measure nothing")
open("CLAUDE.md", "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("rewrapped %d bullet(s) at 98 columns, +%d continuation line(s), text unchanged"
      % (LIMIT, added))
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
