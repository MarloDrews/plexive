#!/usr/bin/env bash
# CW-7  check: backend-checks / rules paths: scope     the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS ADDING A SECOND RULES FILE. The tree as it stands is already
# exercised on every pull request, because this gate runs over the real .claude/rules/
# each time; the input CI never produces on its own is the directory GROWING. That is
# the direction a floor written as an equality would red on, and the whole point of
# .claude/rules/ is that more rules move into it later.
#
# The new file is correct in the one way this gate cares about: a top-level paths: key
# inside the frontmatter. It deliberately also carries a description, so the case would
# still catch a check that had accidentally started asserting on key ORDER.
set -eo pipefail

mkdir -p .claude/rules
cat > .claude/rules/cw7-example.md <<'RULE'
---
description: A second rules file, correctly scoped
paths:
  - "backend/alembic/**/*.py"
---

# Example

A rule that fires on a migration.
RULE

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-rules.sh"
