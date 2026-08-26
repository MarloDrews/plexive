package com.plexive.mobile.navigation

import androidx.compose.runtime.mutableStateListOf
import org.koin.core.annotation.Single

// The back stack, held by Koin rather than only by NavigationViewModel so a screen registered in a
// navigation module can pop itself. Entries are declared as `Scope.(NavKey) -> Unit`, so a Koin
// lookup is the only handle they have on anything outside themselves.
@Single
class NavigationBackStack {
    val entries = mutableStateListOf<Screen>(Screen.FeedRoot)

    fun push(screen: Screen) {
        entries.add(screen)
    }

    // Never empties the stack: something has to stay on screen.
    fun pop() {
        if (entries.size > 1) entries.removeAt(entries.lastIndex)
    }
}
