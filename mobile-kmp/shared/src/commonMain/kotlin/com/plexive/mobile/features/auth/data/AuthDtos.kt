package com.plexive.mobile.features.auth.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The wire shapes of POST /api/auth/login, taken from LoginRequest and TokenResponse in
// backend/app/routers/auth.py. The response also carries token_type ("bearer") and the rest of
// UserOut; the parser's ignoreUnknownKeys drops what no screen reads.
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    val user: AuthUser,
)

// A slice of UserOut (backend/app/schemas.py). Only the username is shown anywhere in this batch.
@Serializable
data class AuthUser(
    val id: Int,
    val username: String,
)

// A sign-in failure with a message meant for the screen. The backend answers a wrong password and an
// unknown email identically on purpose, so this cannot say which one it was.
class AuthException(message: String) : Exception(message)
