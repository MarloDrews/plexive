#!/usr/bin/env bash
# CW-1  check: frontend-checks / Lint      finding: F1
# EXPECT_RC=0
#
# Correct work: a component is moved into a subdirectory. No lint error is added.
# Before the fix this red, because the step named src/components/PostCard.tsx as the
# jsx-a11y probe and exited 1 when that exact path was absent.
#
# Copied verbatim from plexive-docs/research/gate-batches-verification-2026-08-31.md,
# section "The stored correct-work inputs".
set -eo pipefail

# mkdir first: git mv will not create the destination directory, and the report's
# transcript was taken where it already existed. The move is otherwise verbatim.
mkdir -p frontend/src/components/post
git mv frontend/src/components/PostCard.tsx frontend/src/components/post/PostCard.tsx

cd frontend
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/fe-lint.sh"
