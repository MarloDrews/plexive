package com.plexive.mobile

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import com.plexive.mobile.navigation.Screen

@Composable
@Preview
fun App() {
    MaterialTheme {
        Surface(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.primaryContainer)
                .safeContentPadding()
                .fillMaxSize()
        ) {
            NavDisplay(
                backStack = navigationViewModel.backStack, // Your custom-managed back stack
                modifier = modifier,
                transitionSpec = { // Define custom transitions for screen changes
                    fadeIn(tween(300)) togetherWith fadeOut(tween(300))
                },
                entryDecorators = listOf(
                    // Add the default decorators for managing scenes and saving state
                    rememberSceneSetupNavEntryDecorator(),
                    rememberSavedStateNavEntryDecorator(),
                ),
                entryProvider = entryProvider {
                    entry<Screen.FeedRoot> {
                    }
                    entry<Screen.Stats> {
                    }
                    entry<Screen.ChatList> {

                    }
                    entry<Screen.Profile> {

                    }
                    entry<Screen.Creator> {

                    }
                    entry<Screen.UserProfile> { (userId) ->

                    }
                }
            )
        }
    }
}