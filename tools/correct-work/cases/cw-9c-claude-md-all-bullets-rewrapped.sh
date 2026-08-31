#!/usr/bin/env bash
# CW-9c  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS REFLOWING THE WHOLE SECTION -- every bullet in "## Rules" wrapped at 98
# columns, which is the shape any editor with a column guide produces. Verbatim from
# plexive-docs/research/surface-budget-verification-2026-08-31.md:
#
#     --- rewrap all 6
#       OVER claude_md_unconditional_rules      11 / 8       headroom         rc=1
#
# Two of the six bullets already fit in 98 columns, so this adds 14 continuation lines and, under
# the old definition, 4 phantom rules on top of the 7 real ones. It is the widest version of F1
# and the one that shows the number was measuring formatting.
#
# It also crosses no other ceiling, which is the reason it is a clean test of exactly one thing:
# wrapping moves no bytes (each break replaces a space with a newline) and the 14 lines it adds
# sit inside claude_md_lines' headroom of 36. Measured, not assumed -- if a future edit to
# CLAUDE.md changes that, this case reds and says which container moved.
set -eo pipefail

REWRAP=6 python3 - <<'PY'
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
