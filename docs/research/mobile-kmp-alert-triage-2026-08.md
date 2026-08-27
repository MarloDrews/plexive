# Triage of the 50 mobile-kmp Dependabot alerts, 2026-08

## Result

**None of the 50 is on the app's runtime classpath. All 50 are build tooling.**

Nothing in this batch was upgraded, including the critical one. The point of the exercise is to make
the number actionable, not to act on it.

| | count |
| --- | --- |
| open `mobile-kmp/` alerts | 50 (1 critical, 21 high, 26 medium, 2 low) |
| distinct packages behind them | 16 |
| on any `*RuntimeClasspath` | **0** |
| on Android Gradle Plugin's Unified Test Platform | 12 packages / 47 alerts |
| on the Kotlin Multiplatform Swift-export tooling | 1 package / 1 alert |
| on the settings + root buildscript classpath | 3 packages / 3 alerts |

The headline count overstates exposure by the whole of it. It was still worth having: the alerts are
the first measurement of a build classpath nobody had looked at, and the reason the count is 50 rather
than 16 is that each advisory is its own alert, so `io.netty:netty-codec-http` alone contributes 19.

## Why the alerts cannot answer this themselves

Every one is filed against `mobile-kmp/settings.gradle.kts` with a **null scope**. That is not
Dependabot being unhelpful; it is the shape of the data it was given. Gradle's dependency graph
reaches GitHub through the Dependency Submission API rather than through static parsing, and
`gradle/actions/dependency-submission` submits the coordinates it saw resolved during a build without
a runtime/development split. So the manifest is the settings file for all of them and the scope is
null for all of them, and the split has to be recovered from the build itself.

## Method

Local toolchain: Corretto 21 already in `~/.gradle/jdks` (matching the `toolchainVendor=AMAZON` pin in
`mobile-kmp/gradle/gradle-daemon-jvm.properties`), SDK `platforms/android-36` matching
`compileSdk = 36`. Only `ANDROID_HOME` had to be supplied.

```bash
export ANDROID_HOME=/c/Users/marlo/AppData/Local/Android/Sdk
cd mobile-kmp

# Build tooling: the buildscript classpath of the root project and of both subprojects
./gradlew --console=plain --no-configuration-cache buildEnvironment                 > buildenv.txt
./gradlew --console=plain --no-configuration-cache :androidApp:buildEnvironment \
                                                   :shared:buildEnvironment         > buildenv-sub.txt

# The app's own runtime classpath, both variants
./gradlew --console=plain --no-configuration-cache \
  :androidApp:dependencies --configuration releaseRuntimeClasspath                  > rt-release.txt
./gradlew --console=plain --no-configuration-cache \
  :androidApp:dependencies --configuration debugRuntimeClasspath                    > rt-debug.txt

# Every configuration of both modules, for attribution
./gradlew --console=plain --no-configuration-cache \
  :androidApp:dependencies :shared:dependencies                                     > all-configs.txt
```

`--no-configuration-cache` because `gradle.properties` sets `org.gradle.configuration-cache=true` and
the report tasks are not worth caching. All five invocations exited 0.

The alert side, using `gh`'s built-in jq because `jq` is not on PATH on this machine:

```bash
gh api repos/:owner/:repo/dependabot/alerts --paginate \
  --jq '.[] | select(.state=="open") | select(.dependency.manifest_path|test("mobile-kmp"))
        | .dependency.package.name' | sort -u > alerts.txt      # 16 lines
```

Then each report line was attributed to the configuration heading above it, and the two sets
intersected:

```bash
awk '
  /^> Task /                        { proj=$0; sub(/^> Task /,"",proj); sub(/:dependencies$/,"",proj) }
  /^[A-Za-z_][A-Za-z0-9_-]*( - |$)/ { cfg=$1 }
  /--- / { line=$0
           while (match(line, /[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:/)) {
             c=substr(line, RSTART, RLENGTH-1); line=substr(line, RSTART+RLENGTH)
             print proj "\t" cfg "\t" c } }
' all-configs.txt | sort -u > attributed.tsv

grep -iE "RuntimeClasspath" attributed.tsv | grep -Ff alerts.txt   # -> no output
```

### Guards, because an empty grep and a broken grep look identical

Every number below is a count of something that was checked for presence first. A `grep` against a
report that failed to resolve returns the same "not on the runtime classpath" as a real absence, and
that failure mode is the whole reason the answer would otherwise be worthless.

- The reports are non-empty: 318, 1172, 1229 and 39270 dependency lines respectively.
- Sentinels known to be present were asserted present before any zero was read:
  `io.ktor:ktor-client-core` in `rt-release.txt` and `rt-debug.txt`,
  `com.android.tools.build:gradle` in the buildscript reports.
- The attribution has **0 rows with a blank configuration**, so no coordinate is silently unassigned.
  This caught two real bugs in the awk above: the first version rejected hyphens in configuration
  names, and the second rejected the leading underscore that AGP uses for exactly the configurations
  that turned out to hold 47 of the 50 alerts. Both produced a confident, wrong "absent everywhere".
- The five runtime classpaths that exist are each non-empty, so their zero is an absence and not an
  unresolved configuration:

  | configuration | coordinates |
  | --- | --- |
  | `:androidApp debugRuntimeClasspath` | 227 |
  | `:androidApp releaseRuntimeClasspath` | 221 |
  | `:androidApp debugUnitTestRuntimeClasspath` | 227 |
  | `:shared androidRuntimeClasspath` | 227 |
  | `:shared androidHostTestRuntimeClasspath` | 225 |

## The split

### Group 1 — AGP Unified Test Platform. 12 packages, 47 alerts.

Resolved on thirteen `_internal-unified-test-platform-*` configurations of `:androidApp`, all from
`com.google.testing.platform:*:0.0.9`, which AGP pulls in as the harness for instrumented tests.

| package | resolved | alerts |
| --- | --- | --- |
| `io.netty:netty-codec-http` | 4.1.93.Final, 4.1.110.Final | 19 |
| `io.netty:netty-codec-http2` | 4.1.93.Final, 4.1.110.Final | 9 |
| `io.netty:netty-handler` | 4.1.93.Final, 4.1.110.Final | 5 |
| `io.netty:netty-codec` | 4.1.93.Final, 4.1.110.Final | 3 |
| `io.netty:netty-common` | 4.1.93.Final, 4.1.110.Final | 2 |
| `io.netty:netty-handler-proxy` | 4.1.93.Final, 4.1.110.Final | 1 |
| `org.bouncycastle:bcprov-jdk18on` | 1.79 | 2 (incl. the critical) |
| `org.bouncycastle:bcpkix-jdk18on` | 1.79 | 1 |
| `com.google.protobuf:protobuf-java` | up to 3.25.5 | 1 |
| `com.google.protobuf:protobuf-kotlin` | 3.24.4 | 1 |
| `org.apache.httpcomponents:httpclient` | 4.5.6, 4.5.14 | 1 |
| `org.apache.commons:commons-lang3` | 3.16.0 | 1 |

UTP runs on the **host JVM** to drive a device or emulator. It is not compiled into the APK, and it is
absent from `releaseRuntimeClasspath`, `debugRuntimeClasspath` and the on-device and host test runtime
classpaths alike. Nothing invokes it today either: `android-build.yml` runs only
`:androidApp:assembleDebug`, and there is no `connectedAndroidTest` anywhere in the repository. The
coordinates exist in the graph because the submission action resolves configurations rather than
because a build uses them.

**The critical one, specifically.** `GHSA-574f-3g2m-x479` against `org.bouncycastle:bcprov-jdk18on`
1.79, fixed in 1.80.2. It arrives through `_internal-unified-test-platform-gradle-work-action`. The
affected surface is not reached: the app never loads BouncyCastle — Android ships its own Conscrypt
provider and nothing in `shared/` or `androidApp/` references either — and the only process that would
load this copy is a Gradle worker running instrumented tests that nothing runs. Its severity is a
property of the advisory, not of this repository's exposure to it.

### Group 2 — Kotlin Multiplatform Swift export. 1 package, 1 alert.

`io.opentelemetry:opentelemetry-api` 1.41.0, on `:shared swiftExportClasspathResolvable`. Host-side
tooling for the iOS framework export, on a configuration that resolves during configuration and
produces nothing that ships. `GHSA-rcgg-9c38-7xpx`, medium, fixed in 1.62.0.

### Group 3 — settings and root buildscript classpath. 3 packages, 3 alerts.

Absent from every `:androidApp` and `:shared` configuration and present in the buildscript reports,
which is what makes them plugin-resolution rather than project dependencies.

| package | resolved | advisory | fixed in |
| --- | --- | --- | --- |
| `org.jetbrains.kotlin:kotlin-gradle-plugin` | 2.2.10, 2.4.0 | `GHSA-r937-wjx7-w2jp`, medium | 2.4.20-Beta1 |
| `org.bitbucket.b_c:jose4j` | 0.9.5 | `GHSA-3677-xxcr-wjqv`, high | 0.9.6 |
| `org.jdom:jdom2` | 2.0.6 | `GHSA-2363-cqg2-863c`, high | 2.0.6.1 |

The Kotlin plugin is the compiler's own Gradle plugin, so "build tooling" is not an inference about it.
Note the fix version is a beta, which is its own reason not to move on it in a hurry.

## What is reached, honestly

The question "is the affected surface reached" does not arise for the app, because nothing here is in
the app. For the build it is a smaller question but not a zero one: a build-time dependency is code
that runs on a developer machine and on the CI runner, and a netty or BouncyCastle flaw there is a
real, if much narrower, exposure than the same flaw in a shipped APK. What bounds it here is that the
47 UTP alerts sit on configurations no task in this repository invokes, so the classes are resolved
into the dependency graph and never loaded into a JVM.

## Dismissing the build-only ones

Not done in this batch. What it would take, so the decision can be made with the cost visible:

```bash
gh auth refresh -s security_events    # the default gh token cannot write alerts

gh api --method PATCH repos/:owner/:repo/dependabot/alerts/<number> \
  -f state=dismissed \
  -f dismissed_reason=not_used \
  -f dismissed_comment="Build tooling only: AGP Unified Test Platform host classpath, absent from every runtime classpath of :androidApp and :shared."
```

`dismissed_reason` accepts `fix_started`, `inaccurate`, `no_bandwidth`, `not_used` and
`tolerable_risk`. `not_used` is the accurate one here and it is the only one that is a statement of
fact rather than of intent.

Alert numbers, so the loop can be written without re-deriving them:

```
netty-codec-http      31 40 42 44 48 50 51 53 54 55 63 66 67 68 69 70 71 74 77
netty-codec-http2     30 38 45 56 60 61 64 72 75
netty-handler         29 34 58 59 62
netty-codec           39 52 73
netty-common          35 36
netty-handler-proxy   49
bcprov-jdk18on        47 65        <- 65 is the critical
bcpkix-jdk18on        46
protobuf-java         32
protobuf-kotlin       33
httpclient            28
commons-lang3         37
opentelemetry-api     57
kotlin-gradle-plugin  76
jose4j                43
jdom2                 41
```

**The cost, which is the part worth deciding on.** A dismissal is per alert and per advisory, not per
package, so this is 50 API calls and the tab reads 0. It does not stay at 0. Netty publishes
advisories against 4.1.x continuously — six of the fifty are already against versions above the
4.1.110.Final in use — and each new one against a coordinate still in the graph opens a new alert that
this dismissal does not cover. The same happens wholesale on any AGP or Kotlin bump, which changes the
coordinates and therefore opens a fresh set. So dismissing is recurring maintenance, not a one-time
clear, and the honest options are:

1. **Dismiss the 50 as `not_used` and re-dismiss the trickle.** The tab reads 0 and a new alert means
   something, which is the entire argument. Costs a few minutes whenever netty publishes.
2. **Leave them and read the tab through a filter.** Costs nothing now, and gives up the property that
   makes the tab worth opening, which is that a number above zero demands attention.
3. **Remove the coordinates instead of the alerts.** UTP is 47 of the 50 and it exists to run
   instrumented tests that do not exist. If that stays true, excluding the UTP configurations from
   submission — or not submitting `androidApp`'s internal configurations at all — deletes the alerts
   at the source rather than acknowledging them one at a time. This is the only option that does not
   recur, and it is the one that needs the most thought, because it narrows what the graph covers.

Option 1 is the smallest correct step and option 3 is the one to think about afterwards. Neither is
taken here.

## What would change this answer

- Adding an instrumented test, or any `connectedAndroidTest` invocation. UTP would then actually run,
  and group 1 moves from resolved-but-never-loaded to build-time code that executes on CI.
- Adding a dependency to `shared/build.gradle.kts` that pulls netty in for real. Today's client is
  `ktor-client-cio`, which is coroutine-based and has no netty anywhere; `ktor-client-okhttp` or any
  ktor *server* artifact would change that.
- An AGP or Kotlin bump. It re-resolves the plugin classpath, so the coordinates and therefore the
  alert set change wholesale, and this triage has to be re-run rather than trusted.

Re-running it is the four commands above plus the intersection; it takes about three minutes on a warm
daemon.
