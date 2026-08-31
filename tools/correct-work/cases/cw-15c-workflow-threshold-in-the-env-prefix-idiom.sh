#!/usr/bin/env bash
# CW-15c  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS ONE NEW THRESHOLD WRITTEN THE WAY THIS FILE WRITES THEM. F4 of the
# verification report of 2026-08-31 quotes six lines of backend-checks.yml to make the point:
#
#     198:          MIN_BUDGET_ENTRIES=23
#     200:          MIN_BUDGET_ENTRIES="$MIN_BUDGET_ENTRIES" python3 - <<PY
#     696:          MAX_RUFF_FINDINGS=37
#     725:          MAX_RUFF_FINDINGS="$MAX_RUFF_FINDINGS" REPORT="$RUNNER_TEMP/ruff.json" \
#     826:          MAX_MYPY_ERRORS=201
#     874:          MAX_MYPY_ERRORS="$MAX_MYPY_ERRORS" MIN_MYPY_FILES="$MIN_MYPY_FILES" \
#
#     Ten matching lines in backend-checks.yml; seven distinct named thresholds.
#
# PROVENANCE, SAID PLAINLY: this is the one input in this set the verification session did not
# run standalone. It is that quoted idiom turned into a fixture, and it is labelled rather than
# passed off as reproduced. It does not discriminate on the exit code either -- 18+2 against 20
# before, 12+1 against 13 after, both under -- because the double count only shows up as a
# number, which is what this case pins: one threshold in this idiom now costs ONE unit of
# headroom, and the whole headroom is one.
set -eo pipefail

cat >> .github/workflows/backend-checks.yml <<'STEP'

      - name: A new assertion step, one threshold in the env-prefix idiom
        run: |
          MIN_ONE_THING=1
          MIN_ONE_THING="$MIN_ONE_THING" python3 -c "import os; print(os.environ['MIN_ONE_THING'])"
STEP

added=$(grep -c '^ *MIN_ONE_THING=' .github/workflows/backend-checks.yml)
if [ "$added" -ne 2 ]; then
  echo "FAIL: the idiom produced $added matching lines, not the 2 this case exists to store."
  exit 2
fi
echo "appended one step with ONE named threshold written on 2 assignment lines"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
