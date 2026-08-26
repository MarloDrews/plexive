import org.jetbrains.kotlin.gradle.plugin.getKotlinPluginVersion
plugins {
    alias(libs.plugins.kotlinJvm)
}

// Spike only: this subproject exists to find out whether Konsist can run against this repository's
// Kotlin, and is not a gate.
//
// It deliberately does NOT depend on :shared. Konsist reads Kotlin source by path rather than by
// dependency, so keeping :shared off this classpath means Konsist's kotlin-compiler-embeddable
// 0.17.3 pins (2.0.21) never shares a classpath with the module's own Kotlin 2.4.0 compilation.
// That containment is the whole reason for a separate subproject rather than androidHostTest.
dependencies {
    testImplementation(libs.konsist)
    testImplementation(libs.junit)
}

// No jvmToolchain is declared: the subproject compiles and runs on the Gradle daemon JDK. Pinning a
// toolchain here would be a trap, because settings.gradle.kts has no foojay-resolver-convention, so
// Gradle cannot provision a JDK it does not already have locally.

// The spike must leave no gate behind, so the Konsist test runs only when asked for by name and is
// skipped when reached through check.
tasks.withType<Test>().configureEach {
    useJUnit()
    // Konsist 0.17.3 resolves every scopeFromDirectory path against the JVM working directory and
    // rejects an absolute one, so this must stay relative. A test's working directory is the build
    // root, not this subproject, which is why the path is "shared/src" and not "../shared/src".
    // The Gradle property override lets the negative test aim the scope somewhere else.
    systemProperty(
        "plexive.sharedSrc",
        providers.gradleProperty("plexive.sharedSrc").getOrElse("shared/src"),
    )
    // Matching on the task name after the last colon, not on a substring of the whole path:
    // ":architecture-tests:check" contains "architecture-tests" too, so a substring guard would let
    // check run the test and quietly become the gate this spike must not leave behind.
    onlyIf {
        gradle.startParameter.taskNames.any { requested ->
            requested.substringAfterLast(':').equals("test", ignoreCase = true) ||
                requested.contains("konsist", ignoreCase = true)
        }
    }
    testLogging { showStandardStreams = true }
}

// Reports the versions this subproject actually resolves, rather than the ones we assume it does.
tasks.register("reportToolchain") {
    val kotlinPluginVersion = project.getKotlinPluginVersion()
    val javaVersion = System.getProperty("java.version")
    doLast {
        logger.lifecycle("architecture-tests kotlin plugin = $kotlinPluginVersion")
        logger.lifecycle("architecture-tests daemon java   = $javaVersion")
    }
}
