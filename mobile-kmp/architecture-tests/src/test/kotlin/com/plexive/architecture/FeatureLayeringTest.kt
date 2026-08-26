package com.plexive.architecture

import com.lemonappdev.konsist.api.Konsist
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The layering rule this project actually cares about: a feature's data package is private to that
 * feature. Cross-feature traffic, if it happens at all, goes through presentation.
 *
 * Spike only. This is evidence that Konsist can express the rule on this toolchain, not a gate.
 */
class FeatureLayeringTest {

    private val scope = Konsist.scopeFromDirectory(SHARED_SRC)

    /**
     * A scopeFromDirectory over a wrong or empty path yields zero declarations, and every assertion
     * built on it then passes vacuously. Every other test here asserts this guard first.
     */
    @Test
    fun `scope is not empty`() {
        assertGuard(scope.files.size)
    }

    @Test
    fun `no feature imports another feature's data package`() {
        val files = scope.files
        assertGuard(files.size)

        val violations = files.flatMap { file ->
            val importingFeature = featureOf(file.packagee?.name)
            file.imports
                .filter { import ->
                    val importedFeature = featureOf(import.name)
                    importedFeature != null &&
                        importedFeature != importingFeature &&
                        import.name.contains(".$DATA_PACKAGE.")
                }
                .map { "${file.name} (feature=$importingFeature) imports ${it.name}" }
        }

        assertTrue(
            "Cross-feature data imports found:\n" + violations.joinToString("\n"),
            violations.isEmpty(),
        )
    }

    private fun assertGuard(fileCount: Int) {
        println("KONSIST scope '$SHARED_SRC' contains $fileCount Kotlin files")
        assertTrue(
            "Konsist scope over '$SHARED_SRC' contains no files. Every assertion built on this " +
                "scope would pass vacuously, so the scope path is treated as a test failure.",
            fileCount > 0,
        )
    }

    private fun featureOf(qualifiedName: String?): String? {
        val name = qualifiedName ?: return null
        if (!name.startsWith(FEATURE_PREFIX)) return null
        return name.removePrefix(FEATURE_PREFIX).substringBefore('.')
    }

    private companion object {
        val SHARED_SRC: String = System.getProperty("plexive.sharedSrc")
            ?: error("plexive.sharedSrc was not set by the build")
        const val FEATURE_PREFIX = "com.plexive.mobile.features."
        const val DATA_PACKAGE = "data"
    }
}
