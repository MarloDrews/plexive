#!/usr/bin/env bash
# CW-6c  check: android-build / test assertion     the allow direction
# EXPECT_RC=0
#
# Tests declared AND executed: the branch the F2 fix must leave exactly as it was. Gradle is
# not available on this machine (ANDROID_HOME unset), so the log and the JUnit report are
# written by hand in the shape a real run produces. That is a rehearsal of the ASSERTION and
# not of Gradle, and this comment is where that limit is recorded rather than in a footnote.
set -eo pipefail

cd mobile-kmp
mkdir -p shared/src/commonTest/kotlin/com/plexive/mobile
cat > shared/src/commonTest/kotlin/com/plexive/mobile/SamplePassingTest.kt <<'KT'
package com.plexive.mobile

import kotlin.test.Test
import kotlin.test.assertEquals

class SamplePassingTest {
    @Test
    fun one() = assertEquals(1, 1)

    @Test
    fun two() = assertEquals(2, 2)

    @Test
    fun three() = assertEquals(3, 3)
}
KT
mkdir -p "$RUNNER_TEMP" shared/build/test-results/testAndroidHostTest
cat > "$RUNNER_TEMP/gradle.log" <<'LOG'
> Task :shared:compileAndroidHostTest
> Task :shared:testAndroidHostTest
LOG
cat > shared/build/test-results/testAndroidHostTest/TEST-com.plexive.mobile.SamplePassingTest.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.plexive.mobile.SamplePassingTest" tests="3" skipped="0" failures="0" errors="0">
  <testcase name="one" classname="com.plexive.mobile.SamplePassingTest"/>
  <testcase name="two" classname="com.plexive.mobile.SamplePassingTest"/>
  <testcase name="three" classname="com.plexive.mobile.SamplePassingTest"/>
</testsuite>
XML
bash --noprofile --norc -eo pipefail "$STEPS/an-test.sh"
