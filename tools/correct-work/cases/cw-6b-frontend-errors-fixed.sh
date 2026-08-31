#!/usr/bin/env bash
# CW-6b  check: frontend-checks / Lint     the allow direction
# EXPECT_RC=0
#
# THE RATCHET HAS NO LOWER BOUND, and this is what proves it rather than asserting it. The
# count falls well below MAX_ERRORS=88 and the step must stay green: a gate that reds because
# somebody fixed findings is the inverse defect CLAUDE.md keeps apart from the rest.
#
# The count is moved by switching off the rule that supplies 43 of the 88 findings, which is
# the same arithmetic as fixing them and does not require touching 43 files.
set -eo pipefail

cd frontend
python - <<'PY'
import io
p = "eslint.config.mjs"
s = io.open(p, encoding="utf-8").read()
marker = "]);\n\nexport default eslintConfig;"
assert s.count(marker) == 1, "eslint.config.mjs no longer ends the way this case expects"
s = s.replace(marker, '  {\n    rules: { "@typescript-eslint/no-explicit-any": "off" },\n  },\n' + marker)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
PY
RUNNER_TEMP="$RUNNER_TEMP" bash --noprofile --norc -eo pipefail "$STEPS/fe-lint.sh"
