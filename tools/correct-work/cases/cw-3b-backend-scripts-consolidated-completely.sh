#!/usr/bin/env bash
# CW-3b  check: backend-checks / Mypy      finding: F3
# EXPECT_RC=0
#
# ADDED BY THE INTEGRATION BATCH, and only because CW-3 was measured and found to be an
# incomplete refactor. This is the same consolidation with the sibling imports updated,
# which is what the refactor actually is. Measured 2026-08-31: 201 errors across 83 checked
# files, so the ratchet is untouched and the step passes.
#
# It is the case that discriminates on exit code: before the fix the mypy step exits 1 on
# this tree with "mypy exited 2", after the fix it exits 0.
set -eo pipefail

mkdir -p backend/app/cli
git mv backend/seed.py                 backend/app/cli/seed.py
git mv backend/content_repo.py         backend/app/cli/content_repo.py
git mv backend/download_seed_images.py backend/app/cli/download_seed_images.py
: > backend/app/cli/__init__.py
sed -i 's/^from content_repo import/from .content_repo import/' \
  backend/app/cli/seed.py backend/app/cli/download_seed_images.py

cd backend
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-mypy.sh"
