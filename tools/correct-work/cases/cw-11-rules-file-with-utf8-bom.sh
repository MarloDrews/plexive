#!/usr/bin/env bash
# CW-11  check: backend-checks / rules paths: scope      the allow direction
# EXPECT_RC=0
#
# THE CORRECT WORK IS A CORRECTLY SCOPED RULES FILE WRITTEN BY POWERSHELL. Verbatim from
# plexive-docs/research/surface-budget-verification-2026-08-31.md, F5:
#
#     --- .claude/rules/bom.md: UTF-8 BOM, top-level paths: present
#       UNSCOPED .claude/rules/bom.md
#     FAIL: 1 rules file(s) carry no top-level paths: key.                    rc=1
#
# The file plainly has one. The step opened it with encoding="utf-8", so the BOM landed on
# lines[0], "\ufeff---" != "---", and the frontmatter block was never entered. A real YAML parser
# reads the same bytes as {'description': ..., 'paths': [...]}. THE MESSAGE NAMED A DEFECT THE
# FILE DOES NOT HAVE, which is the half of F5 that was established regardless of what Claude
# Code's own reader does with a BOM.
#
# This is not a hypothetical shape on this machine: CLAUDE.md's Local Tooling section records
# that PowerShell's >, >> and Out-File default to UTF-8 WITH BOM here, and PowerShell is the
# primary shell. The 91 batch reasoned about CRLF on this exact parse surface and pinned
# .claude/rules/**/*.md to eol=lf for it; the BOM was the neighbouring hazard it did not test.
#
# encoding="utf-8-sig" strips a BOM if there is one and changes nothing when there is not.
set -eo pipefail

mkdir -p .claude/rules
printf '\xef\xbb\xbf' > .claude/rules/bom.md
cat >> .claude/rules/bom.md <<'RULE'
---
description: A scoped rules file written by a shell that emits a BOM
paths:
  - "backend/**/*.py"
---

# Example

A rule that fires on backend Python only.
RULE

# The premise, measured rather than trusted: three bytes of BOM, and a top-level paths: key.
head -c 3 .claude/rules/bom.md | od -An -tx1 | tr -d ' \n' | grep -qx 'efbbbf' || {
  echo "FAIL: the file carries no BOM, so this case no longer stores what F5 was about."; exit 2; }
grep -q '^paths:' .claude/rules/bom.md || {
  echo "FAIL: the file carries no top-level paths: key, so it is not correct work."; exit 2; }
echo "wrote .claude/rules/bom.md: 3-byte UTF-8 BOM, top-level paths: present"

RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/be-rules.sh"
