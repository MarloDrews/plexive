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
import io.ktor.http.URLBuilder
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
        val establishesSession = establishesSession(request.url.requestPath())
        val stored = sessionStore.token.value
        // Protection 1: a request that creates a session must never carry one. Sending a bearer
        // token to a sign-in endpoint is meaningless anyway, and it is what let a wrong password
        // answer 401 on a request that looked authenticated.
        val sentToken = stored != null && !establishesSession
        if (sentToken) {
            request.headers[HttpHeaders.Authorization] = "Bearer $stored"
        }
        val call = proceed(request)
        // Protection 2, deliberately independent of protection 1: a 401 from a session-establishing
        // endpoint never clears the stored token, even if a header somehow reached it. Either check
        // alone is enough, so the defect needs both to be wrong before it can come back.
        //
        // sentToken is still required: the backend can invalidate a token at any time through its
        // token_version counter (a password change, an account deletion), so a stored token can stop
        // working while still looking well-formed on the device. That is the case this clears for.
        if (sentToken && !establishesSession && call.response.status == HttpStatusCode.Unauthorized) {
            sessionStore.clear()
        }
        call
    }
}

// The endpoints that create a session rather than use one, read off the backend router
// (backend/app/routers/auth.py) rather than off their names: each takes no user dependency and
// returns TokenResponse, so each mints a token. They are the only three in the whole backend that
// do, and there is no logout, refresh or password reset to consider.
//
// POST /api/auth/google/link is deliberately absent. It depends on get_current_user and returns
// UserOut, so it attaches a Google identity to an account that is already signed in and needs the
// header. PATCH /api/auth/me is the same shape: it can return a fresh token after a password
// change, but it depends on get_current_user, so it uses a session rather than establishing one.
private val SESSION_ESTABLISHING_PATHS = listOf(
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google",
)

// endsWith rather than contains, so a base URL carrying a subpath still matches while
// /api/auth/google/link stays out: it contains "/api/auth/google" but does not end with it. A
// contains check would silently sweep the link endpoint onto the session-establishing side and
// strip the header it actually needs.
private fun establishesSession(path: String): Boolean =
    SESSION_ESTABLISHING_PATHS.any { path == it || path.endsWith(it) }

// URLBuilder in ktor-http 3.5.0 exposes encodedPathSegments and no encodedPath (checked with javap
// against the pinned jar, not the docs). Empty segments are dropped so a leading or trailing slash
// cannot change the result, giving a plain "/api/auth/login" for the matcher to compare.
private fun URLBuilder.requestPath(): String =
    "/" + encodedPathSegments.filter { it.isNotEmpty() }.joinToString("/")
