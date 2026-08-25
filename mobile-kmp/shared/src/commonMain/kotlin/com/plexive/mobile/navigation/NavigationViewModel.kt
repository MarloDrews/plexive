package com.plexive.mobile.navigation

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import org.koin.core.annotation.KoinViewModel

@KoinViewModel
class NavigationViewModel : ViewModel() {
    val backStack = mutableStateListOf<Screen>(Screen.FeedRoot)

    
}