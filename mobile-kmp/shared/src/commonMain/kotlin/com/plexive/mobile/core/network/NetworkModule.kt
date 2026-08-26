package com.plexive.mobile.core.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
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
    fun httpClient(): HttpClient = HttpClient(CIO) {
        install(ContentNegotiation) {
            // ignoreUnknownKeys: the backend sends far more per post than any model here reads
            // (feed_card, sections, tags, thumbnail_url and so on). Without this, one unmodelled
            // field would fail the whole parse.
            json(Json { ignoreUnknownKeys = true })
        }
        install(Logging) {
            // Ktor's default logger is SLF4J, which is a no-op on Android without a binding, so
            // requests would be invisible. println goes to logcat, and works on iOS too.
            logger = object : Logger {
                override fun log(message: String) {
                    println("[Ktor] $message")
                }
            }
            // INFO prints the method, the URL and the response status. Not the body: the feed
            // response is large and no one needs it in a log.
            level = LogLevel.INFO
        }
    }
}
