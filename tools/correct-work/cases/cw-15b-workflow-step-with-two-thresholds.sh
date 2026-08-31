#!/usr/bin/env bash
# CW-15b  check: backend-checks / surface budget      THE REFUSAL DIRECTION
# EXPECT_RC=1
#
# THE INPUT IS A NEW ASSERTION STEP CARRYING TWO NAMED THRESHOLDS, from F4 of the verification
# report of 2026-08-31: "a new step with 3 named thresholds reds at 21/20, with 2 it passes".
#
# IT PASSED BEFORE THIS BATCH AND REDS AFTER IT, and the reason is the whole of F4. The old
# metric counted assignments BY SHAPE, so the ordinary env-prefix idiom in these files --
# NAME=value on one line and NAME="$NAME" python3 - on the next -- counted one threshold twice.
# The measured 18 was 13 real thresholds, and the ceiling of 20 was set from a "+2 for this
# batch" that never happened: the batch added ONE threshold, counted twice.
#
# Counting by distinct name per file gives 12 today, and replaying the by-name count over the
# first-parent history gives increases of +11 at the merge that created the container, then +1,
# then +1. The largest legitimate single-commit increase is therefore 1 and the ceiling is 13.
# TWO NEW THRESHOLDS NOW COST A LINE IN tools/surface-budget.json, and that line is honest: it
# records 14 named thresholds that really exist. That is the mechanism, not a false block -- the
# discriminator this repository uses is whether the number still means what it says afterwards.
#
# Stored declaring 1 rather than deleted for being inconvenient. If someone widens the ceiling
# again, this case flips to 0 and says so.
set -eo pipefail

cat >> .github/workflows/backend-checks.yml <<'STEP'

      - name: A new assertion step, carrying two named thresholds
        run: |
          MIN_FIRST_THING=1
          MIN_SECOND_THING=2
          echo "$MIN_FIRST_THING $MIN_SECOND_THING"
STEP

added=$(grep -c '^          M\(IN\|AX\)_.*_THING=' .github/workflows/backend-checks.yml)
if [ "$added" -ne 2 ]; then
  echo "FAIL: appended $added threshold assignments, not the 2 this case exists to store."
  exit 2
fi
echo "appended one step with 2 named thresholds to backend-checks.yml"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
