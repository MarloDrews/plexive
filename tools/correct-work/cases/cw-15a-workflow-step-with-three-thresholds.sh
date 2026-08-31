#!/usr/bin/env bash
# CW-15a  check: backend-checks / surface budget      THE REFUSAL DIRECTION
# EXPECT_RC=1
#
# THE INPUT IS A NEW ASSERTION STEP CARRYING THREE NAMED THRESHOLDS. Verbatim from the
# verification report of 2026-08-31, F4, which used it to measure the headroom this container
# actually has:
#
#     Confirmed in the other direction -- a new step with 3 named thresholds reds at 21/20, with
#     2 it passes.
#
# It reds before the fix and after it, for different arithmetic: 18+3 against a ceiling of 20
# before, 12+3 against a ceiling of 13 after. Both refusals are the mechanism working -- the
# accompanying line records three thresholds that really are in the file -- so this is the
# refusal direction and the case declares it.
#
# The pair to this one is CW-15b, which is the case whose verdict the re-derived ceiling changed.
set -eo pipefail

cat >> .github/workflows/backend-checks.yml <<'STEP'

      - name: A new assertion step, carrying three named thresholds
        run: |
          MIN_FIRST_THING=1
          MIN_SECOND_THING=2
          MAX_THIRD_THING=3
          echo "$MIN_FIRST_THING $MIN_SECOND_THING $MAX_THIRD_THING"
STEP

added=$(grep -c '^          M\(IN\|AX\)_.*_THING=' .github/workflows/backend-checks.yml)
if [ "$added" -ne 3 ]; then
  echo "FAIL: appended $added threshold assignments, not the 3 this case exists to store."
  exit 2
fi
echo "appended one step with 3 named thresholds to backend-checks.yml"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
