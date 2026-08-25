package com.plexive.mobile.navigation

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

// potentially a better solution?
sealed interface Screen: NavKey {

    @Serializable data object ChatList : Screen
    @Serializable data object Stats : Screen
    @Serializable data object FeedRoot : Screen
    @Serializable data object Creator : Screen
    @Serializable data object Profile : Screen

    @Serializable data class Reader(val postId: Int) : Screen
    @Serializable data class ChatRoom(val conversationId: Int) : Screen
    @Serializable data class UserProfile(val username: String) : Screen
}