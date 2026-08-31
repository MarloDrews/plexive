#!/usr/bin/env bash
# CW-6a  check: frontend-checks / Lint     the allow direction
# EXPECT_RC=0
#
# The greenest possible input: the repository exactly as it stands. This is the case every
# fix must not break, and it is stored separately from the four that mutate the tree because
# a runner that mutated something and forgot to restore it would show up here first.
set -eo pipefail

cd frontend
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/fe-lint.sh"
