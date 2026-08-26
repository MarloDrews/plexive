package com.plexive.mobile.features.feed.data

import com.plexive.mobile.core.model.FeedPost
import com.plexive.mobile.core.network.API_BASE_URL
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import org.koin.core.annotation.Single

// The feed's data access. GET /api/feed is the For You feed (backend/app/routers/feed.py): it takes
// an optional viewer, so it answers without a logged-in user, which is what this batch needs. The
// interests and format parameters the Expo client sends only affect ordering, so they are omitted.
@Single
class FeedRepository(private val client: HttpClient) {

    suspend fun forYou(limit: Int = 20): List<FeedPost> =
        client.get("$API_BASE_URL/api/feed") {
            parameter("limit", limit)
        }.body()
}
