package com.plexive.mobile.navigation

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel

class NavigationViewModel : ViewModel() {
    val backStack = mutableStateListOf<Screen>(Screen.FeedRoot)

    
}