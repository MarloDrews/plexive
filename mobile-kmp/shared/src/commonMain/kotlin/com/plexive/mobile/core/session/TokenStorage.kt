package com.plexive.mobile.core.session

// Where the backend JWT is kept between app launches. The token grants full account access, so an
// implementation must hand it to the operating system's protected store (Android Keystore, Apple
// Keychain) and never to a plain readable file. See the platform source sets for the two actuals.
//
// Deliberately not suspend: every implementation is one local read plus one decrypt, which costs
// well under a millisecond, and a synchronous read means the token is already in memory before the
// first request goes out, so the Ktor client can attach the Authorization header without awaiting
// anything.
interface TokenStorage {

    fun read(): String?

    fun write(token: String)

    fun clear()
}
