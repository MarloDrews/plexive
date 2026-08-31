#!/usr/bin/env bash
# CW-5  check: backend-checks / Ruff and Mypy      finding: F9
# EXPECT_RC=0
#
# A SCOPE-EQUALITY CASE, not a green-gate case, and the tree it builds is deliberately not
# correct work: the new file carries a plain type error. What is asserted is that ruff and
# mypy now look at the SAME set of files, so that error is visible to both.
#
# Before the fix: ruff 83 files, mypy 82, and the type error invisible while both steps
# reported green -- the silent half of the same defect F3 shows loudly.
# After the fix: 83 and 83.
#
# The mypy step itself correctly goes RED on this tree (202 errors against a ratchet of 201),
# which is the check working. That is why this case reads the two counts rather than the
# step's exit code.
#
# Copied from plexive-docs/research/gate-batches-verification-2026-08-31.md, section "The
# stored correct-work inputs"; the two greps are the report's, the comparison is what turns
# them into a pass or a fail instead of two numbers a human has to read.
set -eo pipefail

mkdir -p backend/services
printf 'def build(n: int) -> str:\n    return n\n' > backend/services/digest.py

cd backend
ruff_files=$(RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-ruff.sh" 2>&1 \
  | sed -n 's/^ruff would check \([0-9]*\) files$/\1/p' | head -n 1)
mypy_files=$( { RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-mypy.sh" 2>&1 || true; } \
  | sed -n 's/^MYPY_ERRORS=[0-9]* MYPY_FILES_CHECKED=\([0-9]*\)$/\1/p' | head -n 1)

echo "RUFF_FILES=${ruff_files:-none} MYPY_FILES_CHECKED=${mypy_files:-none}"

# ANTI-VACUITY. Two empty strings compare equal, which is a green tick meaning nothing.
if [ -z "$ruff_files" ] || [ -z "$mypy_files" ]; then
  echo "FAIL: one of the two counts was not parsed, so nothing was compared."
  exit 1
fi
if [ "$ruff_files" -lt 60 ]; then
  echo "FAIL: ruff reports only $ruff_files files, so neither number means anything."
  exit 1
fi
if [ "$ruff_files" != "$mypy_files" ]; then
  echo "FAIL: ruff checks $ruff_files files and mypy checks $mypy_files."
  echo "A file one of them sees and the other does not is a gap a green gate hides."
  exit 1
fi
echo "OK: ruff and mypy both check $ruff_files files, so the new top-level package is in both."
