package com.plexive.mobile.core.network

import com.plexive.mobile.core.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.api.Send
import io.ktor.client.plugins.api.createClientPlugin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.Module
import org.koin.core.annotation.Single

// The shared HTTP client and its JSON parser. HttpClient is a third-party type, so it is declared
// by a provider function rather than by annotating the class. One instance for the whole app:
// a client owns a connection pool and creating one per call would leak sockets.
@Module
@ComponentScan
@Configuration
class NetworkModule {

    @Single
    fun httpClient(sessionStore: SessionStore): HttpClient = HttpClient(CIO) {
        install(ContentNegotiation) {
            // ignoreUnknownKeys: the backend sends far more per post than any model here reads
            // (feed_card, sections, tags, thumbnail_url and so on). Without this, one unmodelled
            // field would fail the whole parse.
            json(Json { ignoreUnknownKeys = true })
        }
        install(sessionAuth(sessionStore))
        install(Logging) {
            // Ktor's default logger is SLF4J, which is a no-op on Android without a binding, so
            // requests would be invisible. println goes to logcat, and works on iOS too.
            logger = object : Logger {
                override fun log(message: String) {
                    println("[Ktor] $message")
                }
            }
            // INFO prints the method, the URL and the response status. Not the body: the feed
            // response is large and no one needs it in a log. Not the headers either, which is what
            // keeps the bearer token out of logcat now that requests carry one. Verified against the
            // pinned artifact rather than the docs: in ktor-client-logging 3.5.0, LogLevel.INFO is
            // built as (info = true, headers = false, body = false). Raising this to HEADERS or ALL
            // would print the token.
            level = LogLevel.INFO
        }
    }
}

// Attaches the session token to outgoing requests and drops it when the backend rejects it. Both
// live in one plugin so no repository has to remember either: a repository that forgot the header
// would silently fetch anonymous data, and one that forgot the 401 would retry a dead token forever.
//
// The Send hook wraps the whole call, which is what lets one place see both the request going out
// and the response coming back.
private fun sessionAuth(sessionStore: SessionStore) = createClientPlugin("SessionAuth") {
    on(Send) { request ->
        val token = sessionStore.token.value
        if (token != null) {
            request.headers[HttpHeaders.Authorization] = "Bearer $token"
        }
        val call = proceed(request)
        // Only clear when this request actually carried a token. The backend can invalidate a token
        // at any time through its token_version counter (a password change, an account deletion), so
        // a stored token can stop working while still looking well-formed on the device. Gating on
        // the header also keeps a failed sign-in, which sends no token, from clearing anything.
        if (token != null && call.response.status == HttpStatusCode.Unauthorized) {
            sessionStore.clear()
        }
        call
    }
}
