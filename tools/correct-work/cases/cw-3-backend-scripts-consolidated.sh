#!/usr/bin/env bash
# CW-3  check: backend-checks / Mypy       finding: F3
# EXPECT_RC=1
#
# Correct work, INCOMPLETELY DONE, and the declared exit code says so rather than hiding it.
# The move is verbatim from the report. It leaves `from content_repo import ...` at two call
# sites, so the tree really does carry two unresolvable imports and no correct type checker
# can pass it. Measured 2026-08-31: mypy reports 203 errors, 2 more than the ratchet of 201,
# both [import-not-found] at app/cli/seed.py:14 and app/cli/download_seed_images.py:24.
#
# WHAT THIS CASE PROVES IS THE MESSAGE, NOT THE CODE. Before the fix the step said "mypy
# exited 2, which is mypy failing rather than mypy finding something", which is FALSE: mypy
# was fine and the argument list was empty. After the fix it names the two broken imports.
# cw-3b is the same consolidation done completely, and that one discriminates on exit code.
#
# Copied verbatim from plexive-docs/research/gate-batches-verification-2026-08-31.md,
# section "The stored correct-work inputs".
set -eo pipefail

mkdir -p backend/app/cli
git mv backend/seed.py                 backend/app/cli/seed.py
git mv backend/content_repo.py         backend/app/cli/content_repo.py
git mv backend/download_seed_images.py backend/app/cli/download_seed_images.py

cd backend
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-mypy.sh"
