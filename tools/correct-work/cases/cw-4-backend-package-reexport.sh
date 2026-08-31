#!/usr/bin/env bash
# CW-4  check: backend-checks / Ruff       finding: F8
# EXPECT_RC=1
#
# A NEGATIVE CASE, DECLARED AS ONE. An idiomatic package re-export produces two F401s, which
# breach both the E4,E7,E9,F ratchet and the separate --select F absolute that has stood at
# exactly zero since 2026-08-27.
#
# The integration batch was asked to fix this so the re-export passes, UNLESS that could not
# be done without also letting a genuinely unused import through. It could not. Measured
# 2026-08-31 with ruff 0.16.4: the only lever is lint.per-file-ignores "__init__.py" =
# ["F401"], which is all-or-nothing per file pattern, so it passes a dead import in any
# __init__.py as readily as a re-export. ruff itself offers exactly two clean forms and names
# them in its own message -- add to __all__, or use a redundant alias -- and neither of those
# is a change to this gate.
#
# So the declared expectation is 1, and this file is what would notice if that ever silently
# became 0: run_all.sh fails on a mismatch in EITHER direction, so a case that starts passing
# when it was declared to refuse is a finding, which is the shape a quiet weakening of the F
# assertion would take.
#
# Copied verbatim from plexive-docs/research/gate-batches-verification-2026-08-31.md,
# section "The stored correct-work inputs".
set -eo pipefail

mkdir -p backend/app/services
printf 'def build_digest() -> str:\n    return "digest"\n' > backend/app/services/digest.py
printf 'def rank_posts(posts: list[str]) -> list[str]:\n    return sorted(posts)\n' > backend/app/services/ranking.py
cat > backend/app/services/__init__.py <<'PY'
from .digest import build_digest
from .ranking import rank_posts
PY

cd backend
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-ruff.sh"
