plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.androidMultiplatformLibrary) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlinMultiplatform) apply false
    // Spike only: needed so the :architecture-tests JVM subproject can apply the Kotlin JVM plugin.
    // Requesting a version in that subproject fails, because the Kotlin plugin is already on the
    // build classpath from the declarations above with an unknown version.
    alias(libs.plugins.kotlinJvm) apply false
}