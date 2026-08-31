#!/usr/bin/env bash
# CW-10b  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS INSTALLING A CLAUDE CODE PLUGIN ON ONE MACHINE. Verbatim from
# plexive-docs/research/surface-budget-verification-2026-08-31.md, F2:
#
#     --- two files under .claude/plugins/ (a plugin install's config and cache)
#       OVER project_plugins                     2 / 0       pinned
#     FAIL: project_plugins is 2, above its ceiling of 0.                     rc=1
#
# The same defect as CW-10a with one extra edge: .claude/plugins is walked with NO SUFFIX FILTER
# AT ALL, so every file a plugin install drops there counted, cache included. Neither file is in
# any commit, so the runner measured 0 for the identical tree.
set -eo pipefail

mkdir -p .claude/plugins/repos
cat > .claude/plugins/config.json <<'CFG'
{"installed": {"some-plugin": {"version": "1.2.3"}}}
CFG
cat > .claude/plugins/repos/cache.bin <<'BIN'
a plugin cache file, not markdown, which the unfiltered walk counted too
BIN

if git check-ignore -q .claude/plugins/config.json; then
  echo "FAIL: .claude/plugins/ is gitignored now, so this case no longer stores what F2 was about."
  exit 2
fi
echo "wrote 2 files under .claude/plugins/: untracked, NOT ignored by git"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
