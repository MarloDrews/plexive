#!/usr/bin/env bash
# CW-6d  check: android-build / lint ratchet       the allow direction
# EXPECT_RC=0
#
# MAX_LINT_FINDINGS HAS NO LOWER BOUND. A report with zero findings must pass, because a gate
# that reds when somebody fixed ObsoleteSdkInt fires on correct work. As with CW-6c the report
# is written by hand: AGP is not runnable here, so this rehearses the assertion and not lint.
# The by= attribute is the pin the step asserts on and is copied from CI job 99334047958.
set -eo pipefail

cd mobile-kmp
mkdir -p "$RUNNER_TEMP" androidApp/build/reports
cat > "$RUNNER_TEMP/gradle.log" <<'LOG'
> Task :androidApp:lintAnalyzeDebug
> Task :androidApp:lintReportDebug
LOG
cat > androidApp/build/reports/lint-results-debug.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<issues format="6" by="lint 9.0.1" type="baseline">
</issues>
XML
bash --noprofile --norc -eo pipefail "$STEPS/an-lint.sh"
