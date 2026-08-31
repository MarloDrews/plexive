#!/usr/bin/env bash
# CW-10a  check: backend-checks / surface budget      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A SESSION USING CLAUDE CODE'S OWN /agents FLOW and not committing what it
# writes. Verbatim from plexive-docs/research/surface-budget-verification-2026-08-31.md, F2:
#
#     --- .claude/agents/scratch-reviewer.md written, never committed, "NOT ignored by git"
#       OVER project_subagents                   1 / 0       pinned
#     FAIL: project_subagents is 1, above its ceiling of 0.                   rc=1
#
# The step walked the filesystem and subtracted only what git check-ignore reported, so an
# untracked file that is not gitignored counted in full. .claude/agents/ is pinned at 0 and is
# not in .gitignore, so THE SAME COMMIT MEASURED 1 HERE AND 0 ON THE RUNNER. CI stayed green
# while run_all.sh failed on a tree nobody had changed, and the accompanying line would have
# recorded a subagent the repository does not ship.
#
# The step now enumerates with git ls-files, so membership is the index -- what the next commit
# ships -- and a file has to be added before it spends a shared ceiling. Content is still read
# from the working tree, which is what lets CW-8 measure an uncommitted correction to CLAUDE.md.
#
# The file is written with a description and a body, so it is a plausible subagent and not an
# empty file: a check that only ignored empty files would still pass this and would still be
# wrong.
set -eo pipefail

mkdir -p .claude/agents
cat > .claude/agents/scratch-reviewer.md <<'AGENT'
---
name: scratch-reviewer
description: A throwaway reviewer written by a session and never committed
---

Read the diff and report what is wrong with it.
AGENT

# The premise, asserted rather than assumed. If this path ever becomes gitignored the case would
# pass for a reason that has nothing to do with the fix.
if git check-ignore -q .claude/agents/scratch-reviewer.md; then
  echo "FAIL: .claude/agents/ is gitignored now, so this case no longer stores what F2 was about."
  exit 2
fi
git ls-files --error-unmatch .claude/agents/scratch-reviewer.md >/dev/null 2>&1 \
  && { echo "FAIL: the file is tracked, so this is not the untracked-but-unignored input."; exit 2; }
echo "wrote .claude/agents/scratch-reviewer.md: untracked, NOT ignored by git"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-budget.sh"
