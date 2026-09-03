#!/usr/bin/env bash
# CW-13  check: backend-checks / surface budget      THE REFUSAL DIRECTION
# EXPECT_RC=1
#
# THE INPUT IS A BUDGET FILE WITH ONE CONTAINER IN IT. Verbatim from the verification report of
# 2026-08-31, F7, which used it to demonstrate that MIN_BUDGET_ENTRIES=23 could never fire:
#
#     Demonstrated: a budget file cut to a single container failed at "NO BUDGET: ..." and never
#     reached the floor.
#
# The set-equality assertion between the file keys and the step 24-name METRICS list runs BEFORE
# the floor and refuses in both directions, so any file reaching the floor already had exactly 24
# entries. The floor was decoration -- a threshold that cannot fire, sitting inside the step
# written to enforce the rule that a check must be able to report what it watches for.
#
# IT WAS TAKEN OUT RATHER THAN MADE ABLE TO FIRE. Moving it above the set-equality check would
# have kept a second detector for a condition the first one already catches, and every failure it
# could produce is one set-equality produces with a better message. The anti-vacuity guard is now
# named as what it actually is: the 24-name METRICS literal, compared against the file both ways.
#
# THIS CASE DOES NOT DISCRIMINATE ON THE EXIT CODE and cannot: rc=1 before the fix and rc=1
# after, because the assertion that always did the work still does it. What it pins is that the
# refusal survived the removal of the dead floor.
set -eo pipefail

python3 - <<'PY'
import json

with open("tools/surface-budget.json", "rb") as fh:
    document = json.loads(fh.read().replace(b"\r\n", b"\n").decode("utf-8"))
if len(document["containers"]) < 2:
    raise SystemExit("input drift: the file already holds fewer than 2 containers")

first = sorted(document["containers"])[0]
document["containers"] = {first: document["containers"][first]}
with open("tools/surface-budget.json", "w", encoding="utf-8", newline="\n") as fh:
    json.dump(document, fh, indent=2)
print("cut tools/surface-budget.json down to one container: %s" % first)
PY

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
