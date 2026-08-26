package com.plexive.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// One post as the feed list endpoints return it. Derived from PostListOut, which extends PostOut in
// backend/app/schemas.py: only the fields a screen actually shows are modelled, the rest are
// dropped by the parser's ignoreUnknownKeys.
@Serializable
data class FeedPost(
    val id: Int,
    val title: String,
    val format: String,
    @SerialName("author_username") val authorUsername: String? = null,
    @SerialName("reading_minutes") val readingMinutes: Int = 1,
)
