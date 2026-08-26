package com.plexive.mobile.features.feed.presentation

import com.plexive.mobile.core.model.FeedPost

// Everything the feed screen needs to draw itself, in one immutable value. Exactly three states are
// possible: loading, an error message, or a list of posts.
data class FeedUiState(
    val posts: List<FeedPost> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)
