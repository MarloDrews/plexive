package com.plexive.mobile.features.auth.presentation

// Everything the login screen needs to draw itself, in one immutable value.
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
    // Flips once the backend accepted the credentials and the token is stored. The screen watches
    // this to leave.
    val signedIn: Boolean = false,
)

// What the feed header shows about the current session.
data class SessionUiState(
    val username: String? = null,
    // True while the stored token is being checked against the backend at startup.
    val checking: Boolean = false,
)
