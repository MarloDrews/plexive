package com.plexive.mobile.features.auth.presentation

import com.plexive.mobile.navigation.NavigationBackStack
import com.plexive.mobile.navigation.Screen
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.Module
import org.koin.dsl.module
import org.koin.dsl.navigation3.navigation

@Module
@ComponentScan("com.plexive.mobile.features.auth")
@Configuration
class AuthModule

// Minimal wiring, matching feedNavModule: one entry, reachable from the feed header. Nothing here
// reacts to session state; deciding what the app shows based on whether anyone is signed in is a
// later batch.
val authNavModule = module {
    navigation<Screen.Login> {
        val backStack = get<NavigationBackStack>()
        LoginScreen(
            onSignedIn = { backStack.pop() },
            onCancel = { backStack.pop() },
        )
    }
}
