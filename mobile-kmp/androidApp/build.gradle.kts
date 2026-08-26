import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
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
