#!/usr/bin/env bash
# CW-2  check: android-build / test assertion      finding: F2
# EXPECT_RC=0
#
# Correct work: a shared test fixture committed before the first test that uses it.
# The gradle log is the one the build step would produce with the source set non-empty.
# Before the fix this red at "0 tests executed against 1 test files": the counter branched
# on .kt files, so a file that declares no test was read as a test that did not run.
#
# Copied verbatim from plexive-docs/research/gate-batches-verification-2026-08-31.md,
# section "The stored correct-work inputs".
set -eo pipefail

cd mobile-kmp
mkdir -p shared/src/commonTest/kotlin/com/plexive/mobile
cat > shared/src/commonTest/kotlin/com/plexive/mobile/TestFixtures.kt <<'KT'
package com.plexive.mobile

internal fun samplePostJson(): String = """{"id":1,"title":"x"}"""
KT
mkdir -p "$RUNNER_TEMP"
cat > "$RUNNER_TEMP/gradle.log" <<'LOG'
> Task :shared:compileAndroidHostTest
> Task :shared:testAndroidHostTest
> Task :androidApp:lintAnalyzeDebug
> Task :androidApp:lintReportDebug
LOG
bash --noprofile --norc -eo pipefail "$STEPS/an-test.sh"
