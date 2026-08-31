#!/usr/bin/env bash
# CW-9d  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A CLARIFICATION INDENTED UNDER AN EXISTING RULE. Verbatim from
# plexive-docs/research/surface-budget-verification-2026-08-31.md, F1:
#
#     --- add one nested sub-bullet under an existing rule
#       ok   claude_md_unconditional_rules       8 / 8       headroom        rc=0
#
# It is F1 in its other direction. A nested sub-bullet is not a "- " line at column 0, so the old
# parser fell through to its paragraph branch and counted a clarification of an existing rule as a
# new unconditional rule. LIKE CW-9a IT DOES NOT DISCRIMINATE ON THE EXIT CODE -- 8 was on the
# ceiling, not over it -- and what it pins is the number: 7 after the fix, 8 before.
#
# A future definition that starts counting indentation as significance turns this red, which is
# the only way anyone would find out.
set -eo pipefail

python3 - <<'PY'
blob = open("CLAUDE.md", "rb").read().replace(b"\r\n", b"\n").decode("utf-8")
lines = blob.split("\n")

inside = False
first_bullet = None
for i, ln in enumerate(lines):
    if ln.startswith("## "):
        inside = ln.strip() == "## Rules"
        continue
    if inside and ln.startswith("- ") and first_bullet is None:
        first_bullet = i
if first_bullet is None:
    raise SystemExit("input drift: no bullet found under ## Rules")

lines.insert(first_bullet + 1,
             "  - and this clarifies the rule above it rather than standing as a rule of its own")
open("CLAUDE.md", "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("inserted one nested sub-bullet under the bullet at line %d" % (first_bullet + 1))
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
