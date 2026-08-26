import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

// The shared module has a single Android variant, so the base URL cannot vary by build type and is
// a per-invocation choice. A persistent override in ~/.gradle/gradle.properties would otherwise
// follow a release assembly out to a local address, so a release build refuses anything but https.
abstract class VerifyReleaseApiBaseUrl : DefaultTask() {

    @get:Input
    abstract val baseUrl: Property<String>

    @TaskAction
    fun verify() {
        val url = baseUrl.get().trim()
        if (!url.startsWith("https://")) {
            throw GradleException(
                "A release build needs an https base URL, but plexive.api.baseUrl is \"$url\". " +
                    "Local overrides are for debug builds only."
            )
        }
    }
}

val verifyReleaseApiBaseUrl = tasks.register<VerifyReleaseApiBaseUrl>("verifyReleaseApiBaseUrl") {
    baseUrl.set(providers.gradleProperty("plexive.api.baseUrl").orElse(""))
}

androidComponents {
    // registerPreBuild puts the check ahead of everything the release variant builds, so the guard
    // runs before any release artifact exists rather than after it has been assembled.
    onVariants(selector().withBuildType("release")) { variant ->
        variant.lifecycleTasks.registerPreBuild(verifyReleaseApiBaseUrl)
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_11
    }
}
dependencies {
    implementation(projects.shared)

    implementation(libs.androidx.activity.compose)

    implementation(libs.compose.uiToolingPreview)
    debugImplementation(libs.compose.uiTooling)
}

android {
    namespace = "com.plexive.mobile"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.plexive.mobile"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// Spike only: ktlint is evaluated here, not adopted.
ktlint {
    version.set(libs.versions.ktlintTool)
    // The KMP source set detection otherwise picks up generated Compose resource collectors under
    // build/, which are not ours to format and fail on a package name the generator chooses.
    filter {
        exclude { it.file.path.replace('\\', '/').contains("/build/") }
    }
}

// The jlleitschuh plugin wires ktlintCheck into the check lifecycle task, and it does so for each
// KMP source set as that source set is created, which is after this build script is evaluated.
// afterEvaluate is therefore the only point where every ktlint task already exists to be detached.
// The spike must leave no gate behind.
// Detaching ktlint from check via dependsOn filtering does not work on this KMP module: the
// hierarchy source sets (appleMain, nativeMain, iosTest) are materialized after both a plain and a
// nested afterEvaluate, so their ktlint tasks re-attach to check afterwards. configureEach applies
// to tasks created at any point, so the guard below is ordering-proof: ktlint runs only when it is
// asked for by name, and is skipped when reached through check. The spike leaves no gate behind.
tasks.matching { it.name.contains("ktlint", ignoreCase = true) }.configureEach {
    onlyIf {
        gradle.startParameter.taskNames.any { it.contains("ktlint", ignoreCase = true) }
    }
}

// Spike only: Detekt is evaluated here, not adopted. Same ordering-proof guard as ktlint, so Detekt
// runs only when asked for by name and never gates check.
detekt {
    buildUponDefaultConfig = true
    ignoreFailures = false
}
tasks.matching { it.name.contains("detekt", ignoreCase = true) }.configureEach {
    onlyIf {
        gradle.startParameter.taskNames.any { it.contains("detekt", ignoreCase = true) }
    }
}
