package com.plexive.mobile.features.auth.data

import com.plexive.mobile.core.network.API_BASE_URL
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import org.koin.core.annotation.Single

// The auth feature's data access. The token itself is not stored here: SessionStore owns it, because
// the HTTP client needs it too.
@Single
class AuthRepository(private val client: HttpClient) {

    // Ktor is left at its default expectSuccess = false, so a failure arrives as a status rather
    // than an exception and the body of a 401 is an error document, not a TokenResponse. Hence the
    // explicit status check before parsing.
    suspend fun login(email: String, password: String): TokenResponse {
        val response = client.post("$API_BASE_URL/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(LoginRequest(email.trim(), password))
        }
        when {
            response.status.isSuccess() -> return response.body()
            response.status == HttpStatusCode.Unauthorized ->
                throw AuthException("Invalid email or password.")
            // The backend rate limits sign-in at 30 per IP and 10 per email per 5 minutes
            // (check_rate_limit in backend/app/routers/auth.py). Worth its own message, because it
            // is not a wrong password and waiting fixes it.
            response.status == HttpStatusCode.TooManyRequests ->
                throw AuthException("Too many sign-in attempts. Wait a few minutes and try again.")
            else -> throw AuthException("Sign-in failed (${response.status.value}).")
        }
    }

    // Who the stored token belongs to, or null if the backend will not accept it. GET /api/auth/me
    // uses get_current_user, so it is the one endpoint here that answers 401 to a revoked token; the
    // feed uses get_optional_user and would quietly answer anonymously instead. The SessionAuth
    // plugin has already discarded the token by the time null is returned.
    suspend fun me(): AuthUser? {
        val response = client.get("$API_BASE_URL/api/auth/me")
        return if (response.status.isSuccess()) response.body() else null
    }
}
