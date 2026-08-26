package com.plexive.mobile.navigation

import androidx.lifecycle.ViewModel
import org.koin.core.annotation.KoinViewModel

@KoinViewModel
class NavigationViewModel(private val stack: NavigationBackStack) : ViewModel() {
    val backStack get() = stack.entries
}
