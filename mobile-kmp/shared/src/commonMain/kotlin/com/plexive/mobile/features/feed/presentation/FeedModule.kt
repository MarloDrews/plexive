package com.plexive.mobile.features.feed.presentation

import com.plexive.mobile.navigation.Screen
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.Module
import org.koin.dsl.module
import org.koin.dsl.navigation3.navigation

@Module
@ComponentScan
@Configuration
class FeedModule

val feedNavModule = module {
    navigation<Screen.FeedRoot> {
        FeedRoot()
    }
}