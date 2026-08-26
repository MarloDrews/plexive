package com.plexive.mobile.di

import com.plexive.mobile.features.auth.presentation.authNavModule
import com.plexive.mobile.features.feed.presentation.feedNavModule
import org.koin.core.annotation.KoinApplication
import org.koin.dsl.KoinAppDeclaration
import org.koin.plugin.module.dsl.startKoin

@KoinApplication
class PlexiveApplication

// Starts Koin globally, outside Compose, so code that is not a composable can reach the container.
// Classes annotated @Module @ComponentScan @Configuration are discovered by the compiler plugin,
// so only the hand-written Navigation 3 modules have to be listed here.
fun initKoin(configuration: KoinAppDeclaration? = null) {
    startKoin<PlexiveApplication> {
        configuration?.invoke(this)
        modules(feedNavModule, authNavModule)
    }
}
