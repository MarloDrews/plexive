# Static analysis toolchain spike, mobile-kmp, 2026-08

Branch: `spike/static-analysis-toolchain`. Nothing here is wired into `check`, a git hook, or CI, and
nothing is merged to `main`. The deliverable is evidence, not a gate.

Every version below was resolved from a build, a Gradle dependency report, or a POM fetched from
Maven Central during this spike. None is carried over from the briefing. Each is attributed.

---

## 1. Claims verdict

| # | Claim | Verdict | Decided by |
|---|---|---|---|
| 1 | Kotlin pinned at 2.4.0 | **CONFIRMED** | `mobile-kmp/gradle/libs.versions.toml:14` |
| 2 | No CI configuration anywhere, any provider | **CONFIRMED** | `git ls-files` filtered for every provider directory returns empty; no `.github/` at repo root |
| 3 | Remote is GitHub, so Actions is available | **CONFIRMED** | `git remote -v` gives `https://github.com/MarloDrews/plexive.git` |
| 4 | No JVM target, so Konsist has no source set without adding one or using androidUnitTest | **PARTIAL** - premise confirmed, conclusion refuted | `shared/build.gradle.kts:60-84`; but `withHostTest { }` at line 81 already creates a JVM host-test source set, and a separate JVM subproject is a third option |
| 5 | Konsist (latest) parses this Kotlin 2.4.0 source without a parser error | **CONFIRMED**, heavily bounded | 0.17.3 resolved from Maven Central metadata; scope over `shared/src` returned 32 files and the rule evaluated. See the bound in section 7 |
| 6 | Detekt stable fails outright, or emits false positives, or internal compiler errors under K2 | **PARTIAL** - refuted for hard failure and internal errors, confirmed for false positives | 1.23.8 ran both with and without type resolution, zero internal errors; but 8 `FunctionNaming` findings are false positives on `@Composable` functions |
| 7 | A Detekt 2.0 alpha exists built against Kotlin 2.4.x and runs cleanly here | **CONFIRMED** | `dev.detekt:detekt-core:2.0.0-alpha.6` POM declares `kotlin-compiler` 2.4.10; both modes ran with zero internal errors |
| 8 | ktlint at current release supports Kotlin 2.4.0 source and reports no parse errors | **PARTIAL** - no parse errors confirmed, "supports Kotlin 2.4.0" refuted as stated | 136 style findings, zero parse errors; but `ktlint-rule-engine:1.8.0` embeds `kotlin-compiler-embeddable` **2.2.21**, two minor versions behind the project |

---

## 2. Toolchain as pinned today

| Thing | Value | Evidence |
|---|---|---|
| Kotlin | `2.4.0` | `gradle/libs.versions.toml:14` |
| AGP | `9.0.1` | `gradle/libs.versions.toml:2` |
| Gradle | `9.1.0` | `gradlew -v` |
| Launcher JVM | Temurin `25.0.2` | `gradlew -v` |
| Daemon JVM | Amazon Corretto `21.0.11` | `gradlew -v`; pinned by `gradle/gradle-daemon-jvm.properties:12` |
| IDE project JDK | `JDK_23`, `temurin-23` | `.idea/misc.xml:2` - **not installed on this machine** |
| Bytecode target | `JVM_11` | `shared/build.gradle.kts:76`, `androidApp/build.gradle.kts:43,77,78` |
| KMP targets | `iosArm64`, `iosSimulatorArm64`, `androidLibrary` | `shared/build.gradle.kts:60-84` |
| Android SDK | `compileSdk 36`, platforms 36 / 36.1 present | `ANDROID_HOME` unset; no `local.properties` |

**The JDK situation is four-way inconsistent**, not three-way: the IDE says 23, the Gradle daemon
runs 21, the compiler emits 11 bytecode, and the launcher JVM is 25. The JDK the IDE names
(`temurin-23`) is not installed anywhere on this machine. The only JDKs present are Temurin 25,
Corretto 21 (Gradle-provisioned) and Android Studio's JBR 21.

`mobile-kmp/` is a **standalone Gradle build** with its own `settings.gradle.kts` and wrapper. There
is no root `settings.gradle`, so `:mobile-kmp:assembleDebug` does not exist as a task.

---

## 3. Baseline

Command, from `mobile-kmp/`, with `ANDROID_HOME` exported per invocation:

```
./gradlew clean --no-build-cache --no-configuration-cache
./gradlew :androidApp:assembleDebug --no-build-cache --no-configuration-cache
```

`gradle.properties:6-7` enables the configuration cache and the build cache; both flags override it.

| Run | Daemon | Wall clock | Task outcomes |
|---|---|---|---|
| 1 | cold (daemon stopped, outputs cleaned) | **1m 12s** | 57 executed, 1 up-to-date |
| 2 | warm | **30s** | 57 executed, 1 up-to-date |
| 3 | warm | **24s** | 57 executed, 1 up-to-date |

No task reported `FROM-CACHE` in any run, so the compiler genuinely ran each time.

**Per-tool deltas below are measured against the warm figure, about 27s**, because that is the state
a repeated local or CI run is actually in. The cold number is reported separately and is not averaged
with the warm ones; a median across all three would describe no real state.

On Windows the iOS targets do not compile, so `assembleDebug` is an Android-only build. Konsist and
ktlint still see `iosMain`, because both read source as text.

---

## 4. ktlint

**Versions.** CLI `1.8.0`, from `com/pinterest/ktlint/ktlint-cli/maven-metadata.xml`. Gradle wrapper
`org.jlleitschuh.gradle.ktlint:14.2.0`, from the Gradle Plugin Portal metadata. The plugin's resolved
tool version was confirmed from the build itself: `:shared:dependencies --configuration ktlint` shows
`com.pinterest.ktlint:ktlint-cli:1.8.0`.

**Plugin choice.** jlleitschuh 14.2.0 over jmailen/kotlinter 5.7.0, because it is the more widely
used of the two wrappers. kotlinter was not built. The CLI was tested alongside it so that a wrapper
problem could not be mistaken for a ktlint problem.

**Embedded parser.** `kotlin-compiler-embeddable` **2.2.21** (`ktlint-rule-engine-1.8.0.pom`).

### Positive

CLI over all 34 Kotlin files:

```
java -jar ktlint-cli-1.8.0-all.jar "shared/src/**/*.kt" "androidApp/src/**/*.kt"
```

Exit 1, **2 seconds**, **136 findings, zero parse errors**. Largest rule groups:
`multiline-expression-wrapping` 19, `class-signature` 18, `function-signature` 14,
`no-empty-first-line-in-class-body` 11, `function-naming` 9.

The Gradle plugin agrees: `ktlintCommonMainSourceSetCheck` and `ktlintAndroidMainSourceSetCheck` both
FAILED on real findings.

### Negative

Scratch file `shared/src/commonMain/kotlin/com/plexive/mobile/ScratchKtlintViolation.kt`: wildcard
import, 3-space indentation, PascalCase function name, missing spacing around `:`, `,` and `+`, and
no trailing newline. ktlint produced **27 findings attributed to that file** and exit 1 (136 to 169
total). File removed; tree verified clean.

### Configuration required

- **Generated sources must be excluded.** Without a filter the plugin lints
  `shared/build/generated/compose/resourceGenerator/.../ActualResourceCollectors.kt` and fails on a
  package name the Compose generator chose. Fixed with a `filter { exclude { ... } }` block matching
  `/build/` in the file path.
- `function-naming` fires on `@Composable` functions, which are PascalCase by Compose convention.
  Needs `ktlint_function_naming_ignore_when_annotated_with=Composable` before adoption.

### Cost

| Measurement | Wall clock |
|---|---|
| CLI, standalone, 34 files | **2s** |
| `ktlintCheck` alone, clean tree, warm daemon | **24s** |
| `assembleDebug` + `ktlintCheck`, clean tree | **1m 12s** (+45s over the 27s warm baseline) |

The 12x gap between the CLI and the Gradle plugin doing the same work is the plugin spawning a worker
per KMP source set; this module has more than ten.

**Verdict: usable now, with restrictions** - exclude generated sources and configure Compose naming.
Prefer the CLI if speed matters.

---

## 5. Konsist

**Version.** `com.lemonappdev:konsist:0.17.3`, the latest on Maven Central
(`com/lemonappdev/konsist/maven-metadata.xml`). The briefing's 0.17.3 was correct.

**Embedded parser.** `kotlin-compiler-embeddable` **2.0.21** (`konsist-0.17.3.pom`), not around
2.0.20.

### Host: isolated `:architecture-tests` subproject

Chosen because Konsist pins an embeddable that its maintainers block past 2.1.0. An isolated JVM
subproject resolves that dependency on its own classpath, containing any conflict with Kotlin 2.4.0.
`androidHostTest` would put the 2.0.21 embeddable on the same classpath as the module's own 2.4.0
test compilation, which is exactly where a conflict would surface. Adding a `jvm()` target to
`shared` was rejected regardless of whether it works, because it changes the production build graph
to accommodate a test tool.

**The subproject does not depend on `:shared`.** Konsist reads source by path, not by dependency.

Options and what each costs in build files:

| Option | Build-file change |
|---|---|
| `:architecture-tests` (chosen) | `settings.gradle.kts` +1 include; new `architecture-tests/build.gradle.kts`; `konsist` library and `kotlinJvm` plugin alias in the catalog; **and one line in the root `build.gradle.kts`** |
| `androidHostTest` | `androidHostTest.dependencies { }` in `shared/build.gradle.kts`, plus test sources under `shared/src/androidHostTest/` |
| `jvm()` target | New target in `shared/build.gradle.kts`; every `commonMain` dependency must also resolve for JVM |

The root build file edit was not anticipated. Applying `org.jetbrains.kotlin.jvm` with a version in
the subproject fails with "the plugin is already on the classpath with an unknown version", because
the root declares the Kotlin plugins with `apply false`. The fix is
`alias(libs.plugins.kotlinJvm) apply false` in the root `plugins { }` block.

### Toolchain the subproject actually resolves

Read from the build, not assumed, via a `reportToolchain` task:

```
architecture-tests kotlin plugin = 2.4.0
architecture-tests daemon java   = 21.0.11
```

**No pin was needed.** With no `jvmToolchain(...)` declared, the subproject compiles and runs on the
Gradle daemon JDK. Pinning would have been a trap: `settings.gradle.kts` has no
`foojay-resolver-convention`, so Gradle cannot provision a JDK that is not already installed, and the
only locally installed JDKs are 21 and 25. Had a pin been required, 21 was the correct choice.

### The rule

`architecture-tests/src/test/kotlin/com/plexive/architecture/FeatureLayeringTest.kt` asserts that no
class under a feature's `data/` package is imported from another feature's package.

The rule is not vacuous on the clean tree: `FeedRoot.kt` already imports
`com.plexive.mobile.features.auth.presentation.SessionViewModel`, a cross-feature import the rule
deliberately permits because it crosses into `presentation`, not `data`.

### Positive

```
./gradlew :architecture-tests:test --no-build-cache --no-configuration-cache
```

BUILD SUCCESSFUL, **4s**, with `KONSIST scope 'shared/src' contains 32 Kotlin files` printed, so the
pass is demonstrably not vacuous.

### Negative, three directions

| Direction | Setup | Result |
|---|---|---|
| Scope path does not exist | `-Pplexive.sharedSrc=shared/no-such-dir` | **FAILED** - `IllegalArgumentException: Directory does not exist`. Konsist throws rather than returning an empty scope |
| Scope path exists, holds no Kotlin | `-Pplexive.sharedSrc=gradle` | **FAILED** - scope reported 0 files and the guard fired with its own message |
| Real layering violation | Scratch `ScratchLayeringViolation.kt` under `features/feed/presentation/` importing `features.auth.data.AuthRepository` | **FAILED** - `Cross-feature data imports found: ScratchLayeringViolation (feature=feed) imports com.plexive.mobile.features.auth.data.AuthRepository`; scope 33 files, so the guard passed and the rule itself caught it |

Scratch file removed; scope back to 32 files and green.

The non-empty guard is therefore proven in both directions, and it matters: it is the only thing
standing between a mistyped path that does exist and a suite that passes while asserting nothing.

### Configuration required

**Konsist 0.17.3 `scopeFromDirectory` cannot take an absolute path.** Given one it concatenates the
working directory onto it and throws:

```
Directory does not exist: C:\...\mobile-kmp\C:\...\mobile-kmp\shared\src
```

The path must be relative to the JVM working directory, which for a Gradle test is the **build root**
and not the subproject. So the scope path is `shared/src`, not `../shared/src`. This is passed in as
a system property from the build rather than hardcoded, so it cannot silently drift.

### Cost

`:architecture-tests:test` on a clean tree, warm daemon: **4-5s**, three actionable tasks. Negligible
against the 27s baseline, and it does not depend on `assembleDebug` at all.

**Verdict: usable now.** The 2.0.21 embeddable parsed all 32 files without complaint. Read the bound
in section 7 before treating that as a general guarantee.

---

## 6. Detekt

### 6a. Stable 1.23.8

**Version.** `io.gitlab.arturbosch.detekt:1.23.8`, the latest on Maven Central and, from the build,
`io.gitlab.arturbosch.detekt.gradle.plugin:1.23.8` resolved via `:shared:buildEnvironment`. Published
February 2025. **Embedded parser: `kotlin-compiler-embeddable` 2.0.21** (`detekt-parser-1.23.8.pom`),
which matches the briefing exactly.

**Plugin choice.** The official first-party plugin. The third-party wrappers are not maintained
against Gradle 9.

The plugin resolved and configured on Gradle 9.1.0 / AGP 9.0.1 / Kotlin 2.4.0 without complaint.

**A trap worth recording: `:shared:detekt` reports `NO-SOURCE`.** The bare `detekt` task targets a
JVM source layout that a KMP module does not have. It exits 0 in 2 seconds having analysed nothing.
Anyone who wires that task up as a gate gets a permanently green check that inspects zero files. The
real work is in the per-source-set tasks.

| Mode | Task | Result |
|---|---|---|
| No type resolution | `:shared:detektMetadataCommonMain` | **29 findings**, zero internal errors |
| With type resolution | `:shared:detektAndroidMain` | Ran, **5 findings**, failed with "Analysis failed with 3 weighted issues" - a findings failure, not a crash |

Zero internal errors, zero stack traces, no `NoSuchMethod` or `NoClassDefFound` in either mode.

**Type resolution is genuinely live, not silently degraded.** Proven with a scratch file containing
one syntactic violation and one that only a working type resolver can see:

```kotlin
fun redundantNotNull(): Int {
    val nonNullable: String = "plexive"
    return nonNullable!!.length
}
```

Both fired: `EmptyCatchBlock` (syntactic) and `UnnecessaryNotNullOperator` (requires knowing
`nonNullable` is non-null). The Kotlin compiler itself independently flagged the same line, which
corroborates it. Scratch file removed.

**False positives on inspection.** 8 of the 29 commonMain findings are `FunctionNaming` on
`@Composable` functions. `App.kt:29` was opened and confirmed to carry `@Composable` and `@Preview`.
Compose functions are PascalCase by convention, so these are wrong on inspection, not wrong in
Detekt. They are a configuration matter, not a defect, and a restricted rule set is therefore a
viable fallback.

**Cost:** `detektMetadataCommonMain` alone on a clean tree, **3s**. `assembleDebug` plus both modes:
**1m 29s** (+62s over the 27s warm baseline). The type-resolution task needs a compiled classpath,
which is where the bulk of that goes.

**Verdict: usable with restrictions** - use the per-source-set tasks, never the bare `detekt` task,
and configure `FunctionNaming` for Compose.

### 6b. 2.0.0-alpha.6

**Version.** `dev.detekt:2.0.0-alpha.6`. Resolved from
`dev/detekt/detekt-gradle-plugin/maven-metadata.xml` and confirmed on the Gradle Plugin Portal, where
the `dev.detekt` marker lists alpha.1 through alpha.6. **This is a new group and a new plugin id**,
not a version bump of `io.gitlab.arturbosch.detekt` - that coordinate stops at 1.23.8.

**Embedded parser: `kotlin-compiler` 2.4.10** (`detekt-core-2.0.0-alpha.6.pom`), reached through
`detekt-kotlin-analysis-api` and `detekt-kotlin-analysis-api-standalone`. This is the only tool in
the spike whose parser is at or ahead of the project's Kotlin 2.4.0.

The two Detekt versions **cannot be applied side by side** - both register `detekt*` task names - so
this replaced the stable plugin in its own commit rather than joining it.

**Config compatibility.** The 1.x `detekt { buildUponDefaultConfig = true; ignoreFailures = false }`
block was accepted unchanged. Task names changed: `detektCommonMainSourceSet` where 1.23.8 had
`detektMetadataCommonMain`, and `detektMainAndroid` where 1.23.8 had `detektAndroidMain`. Any script
or CI file naming tasks explicitly will break on upgrade.

| Mode | Task | Result |
|---|---|---|
| No type resolution | `:shared:detektCommonMainSourceSet` | **22 findings** on real source, zero internal errors |
| With type resolution (Analysis API) | `:shared:detektMainAndroid` | Ran, "Analysis failed with 25 issues", zero internal errors |

The Analysis API backend ran on the daemon's **JDK 21**; it did not require anything newer.

**Type resolution proven live** with the same scratch file: `UnnecessaryNotNullOperator` fired
alongside `EmptyCatchBlock`. Scratch file removed.

**Configuration required, and it is a regression against 1.23.8.** Detekt 2.0 alpha pulls generated
Compose resource sources under `build/` into its source sets; 1.23.8 did not. 6 of the original 28
findings were on generated files. Excluding them is fiddlier than it looks: a plain
`exclude("**/build/**")` does **nothing**, because `SourceTask` patterns are matched relative to each
source root and the generated roots are themselves inside `build/`, so `build` never appears in the
relative path. The working form matches the absolute path:

```kotlin
exclude { it.file.invariantSeparatorsPath.contains("/build/generated/") }
```

**Cost:** `detektCommonMainSourceSet` alone on a clean tree, **3s**. `assembleDebug` plus both modes:
**1m 20s** (+53s over the 27s warm baseline), slightly cheaper than 1.23.8's 1m 29s.

**Verdict: usable now, with the caveat that it is an alpha.** It is the only tool here whose parser
matches the project's Kotlin, its type resolution works, and it is marginally faster than stable. The
risks are alpha churn, the group/id and task-name migration, and the generated-source regression.

---

## 7. The bound on every green result in this report

**This module contains no Kotlin syntax newer than 2.0.** All 34 files were scanned for context
parameters, multidollar string interpolation, `when` guards, nested typealiases, non-local
`break`/`continue`, and `@all:` use-site targets. None are present, and there is no `languageVersion`
or `apiVersion` override anywhere in the build.

That bound matters more than any individual result above:

- ktlint's parser is 2.2.21, Konsist's and Detekt stable's are 2.0.21, and the project is on 2.4.0.
- Every one of them passed. **They passed because there is nothing here that a 2.0 parser cannot
  read**, not because they have been shown to handle Kotlin 2.4.0.

A green run today proves these tools handle *these files*. It does not generalise. The first file
that uses a 2.1+ language feature is the real test, and on the evidence here only Detekt 2.0 alpha
(parser 2.4.10) is positioned to survive it. If any of these become gates, that is the failure mode
to expect, and it will arrive as a parse error on a new file rather than as a gradual degradation.

---

## 8. Cost summary

Warm baseline `:androidApp:assembleDebug`, clean outputs: **27s**.

| Tool | Standalone, clean tree | With `assembleDebug`, clean tree | Delta vs 27s |
|---|---|---|---|
| ktlint CLI 1.8.0 | 2s | n/a (outside Gradle) | n/a |
| ktlint Gradle 14.2.0 | 24s | 1m 12s | +45s |
| Konsist 0.17.3 | 4-5s | independent of assembleDebug | about +5s |
| Detekt 1.23.8, both modes | 3s (no type resolution) | 1m 29s | +62s |
| Detekt 2.0.0-alpha.6, both modes | 3s (no type resolution) | 1m 20s | +53s |

---

## 9. Proof that nothing was left wired as a gate

Every tool is guarded so it runs only when invoked by name.

| Check | Result |
|---|---|
| `:shared:check` with 136 live ktlint violations | **BUILD SUCCESSFUL**, all ktlint tasks SKIPPED |
| `:shared:check` with 29 live Detekt findings | **BUILD SUCCESSFUL**, detekt SKIPPED |
| `:architecture-tests:check` with a live layering violation | **BUILD SUCCESSFUL**, test SKIPPED |
| root `check` with a live layering violation | **BUILD SUCCESSFUL**, test SKIPPED |
| `:architecture-tests:test` with the same violation | **BUILD FAILED**, as it should |

Two guard bugs were found and fixed while establishing this, both worth knowing:

1. **Filtering `check`'s `dependsOn` does not work for ktlint on a KMP module.** The hierarchy source
   sets (`appleMain`, `nativeMain`, `iosTest`) are materialized *after* both a plain and a nested
   `afterEvaluate`, so their ktlint tasks re-attach to `check` afterwards. `configureEach` with an
   `onlyIf` is ordering-proof and is what is used.
2. **A substring guard on the task path is wrong.** An `onlyIf` matching `"architecture-tests"`
   anywhere in the requested task name let `:architecture-tests:check` through, because the path
   contains the string. It silently became the gate the spike was supposed to avoid, and only the
   violation-present test caught it. The guard now matches the task name after the last colon.

No CI file was created. No git hook was touched. `ARCHITECTURE.md` was deliberately **not** updated:
it describes the state of `main`, and this is a throwaway spike branch whose tooling is explicitly
being removed rather than adopted.

---

## 10. Things that contradict the brief

1. **`:mobile-kmp:assembleDebug` does not exist.** `mobile-kmp/` is a standalone Gradle build with
   its own `settings.gradle.kts` and wrapper; the repo root has no settings file. The equivalent is
   `./gradlew :androidApp:assembleDebug` from `mobile-kmp/`.
2. **The JDK 23 pin is real, and it is in `.idea/`.** An earlier search here covered `*.kts`,
   `*.properties` and `*.gradle` and reported the claim refuted. That search did not cover the place
   the claim pointed at. `.idea/misc.xml:2` has `languageLevel="JDK_23" project-jdk-name="temurin-23"`,
   and `.idea/` is committed. The inconsistency is **four-way, not three-way**: IDE 23, daemon 21,
   bytecode 11, launcher JVM 25. Worse, `temurin-23` is not installed on this machine at all, so the
   committed IDE config names a JDK nobody here has.
3. **Detekt 2.0 changed group and plugin id** to `dev.detekt`. Latest is `2.0.0-alpha.6`. The old
   `io.gitlab.arturbosch.detekt` coordinate stops at 1.23.8 and will never see a 2.x.
4. **ktlint is behind the project's Kotlin, not level with it.** Claim 8 said current ktlint
   "supports Kotlin 2.4.0"; `ktlint-rule-engine:1.8.0` embeds `kotlin-compiler-embeddable` 2.2.21.
   It reported no parse errors here, but for the reason in section 7, not because it is current.
5. **Konsist's embeddable is 2.0.21, not "around 2.0.20".** Minor, but the artifact is exact.
6. **Claim 4's conclusion is wrong.** `shared` really declares no `jvm()` target, but a Konsist JUnit
   test does not require adding one. `withHostTest { }` at `shared/build.gradle.kts:81` already
   creates a JVM host-test source set, and a separate JVM subproject is a third option. Three routes
   exist, not two, and the one chosen needed a root build file edit that none of the three
   descriptions anticipated.
7. **Detekt stable does not misbehave under K2 the way the brief expected.** No hard failure, no
   internal errors, and type resolution demonstrably works. The only defect is a class of false
   positive (`FunctionNaming` on `@Composable`) that configuration fixes. A restricted rule set is
   therefore viable, which is the opposite of what the claim implied.
8. **The bare `:shared:detekt` task is `NO-SOURCE` on this KMP module** and passes in 2s having read
   nothing. This is the single most dangerous result in the spike: it is the task name a person would
   naturally wire into a gate.
9. **Konsist cannot take an absolute scope path** and mangles one into `<cwd>\<absolute path>` on
   Windows. Undocumented as far as this spike found.
10. **Detekt 2.0 alpha analyses generated sources; 1.23.8 does not.** A regression, and the obvious
    exclusion pattern silently does nothing.
11. **ktlint's Gradle wrapper is 12x slower than its CLI** on identical work (24s vs 2s), because it
    spawns a worker per KMP source set.

---

## 11. Unrelated hygiene noted, not fixed

Per the spike rules these were left alone.

- `androidApp/src/main/kotlin/com/plexive/mobile/MainActivity.kt` has no final newline; six other
  files share the same issue.
- `shared/src/commonMain/kotlin/com/plexive/mobile/App.kt:12` is a wildcard import.
- Broad exception handling worth a look on its own merits, flagged independently by both Detekt
  versions: `LoginViewModel.kt:51`, `SessionViewModel.kt:40` (also `SwallowedException`),
  `FeedViewModel.kt:39`, `AndroidKeystoreTokenStorage.kt:38` (also `SwallowedException`).
- `AuthRepository.kt:23` has more than two `throw` statements in `login` (`ThrowsCount`).
- `.idea/` is committed and pins a JDK that is not installed. Whether the IDE config belongs in
  version control at all is a separate decision from this spike.
- Two untracked files predate this branch and were not touched:
  `docs/MOBILE_ARCHITECTURE_DECISIONS.md`, `docs/MOBILE_QUESTION_TRIAGE.md`.
