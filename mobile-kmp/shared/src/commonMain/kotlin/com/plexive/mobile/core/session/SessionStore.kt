package com.plexive.mobile.core.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.annotation.Provided
import org.koin.core.annotation.Single

// The one owner of "is anybody signed in". Holds the token in memory as a StateFlow so the HTTP
// client can read it synchronously on every request and screens can react to it, and writes every
// change through to TokenStorage so the session survives a restart.
//
// Only the token lives here, not the user record: core is what every feature shares, and the user
// profile belongs to the auth feature.
//
// @Provided on the constructor parameter: TokenStorage is bound by a hand-written platform
// module, so the Koin compiler plugin cannot see it and would otherwise fail the build with
// KOIN-D001 "Missing dependency". The annotation says the binding arrives at runtime.
@Single
class SessionStore(@Provided private val storage: TokenStorage) {

    // Read once at construction. Koin builds this eagerly enough that the token is present before
    // the first screen requests anything.
    private val _token = MutableStateFlow(storage.read())
    val token: StateFlow<String?> = _token.asStateFlow()

    fun set(token: String) {
        storage.write(token)
        _token.value = token
    }

    // Used both by an explicit sign-out and by the HTTP client when the backend rejects the token
    // (see SessionAuth in NetworkModule).
    fun clear() {
        storage.clear()
        _token.value = null
    }
}
