#!/usr/bin/env bash
# CW-9b  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS REFLOWING TWO BULLETS, and this is the F1 fixture that blocked pull
# request 92. Verbatim from plexive-docs/research/surface-budget-verification-2026-08-31.md:
#
#     --- rewrap the 2 longest bullets
#       OVER claude_md_unconditional_rules       9 / 8       headroom
#     FAIL: claude_md_unconditional_rules is 9, above its ceiling of 8.       rc=1
#
# No text was added or removed. No rule was added. The count moved anyway, and the only line the
# author could write in response was a number that means nothing: there are still six rules and
# one paragraph. That is what made F1 a block rather than a note -- the accompanying line was
# available, was one character, and was false.
#
# A rule is now counted by its OPENING line: a top-level "- " bullet at column 0, or the first
# line of a blank-line-separated paragraph at column 0. Continuation lines belong to the rule
# above them. So this input reads 7 and passes, and CW-9e pins the one shape that definition
# still gets wrong.
set -eo pipefail

REWRAP=2 python3 - <<'PY'
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
