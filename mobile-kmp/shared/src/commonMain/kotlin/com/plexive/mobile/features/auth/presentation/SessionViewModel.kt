package com.plexive.mobile.features.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.plexive.mobile.core.session.SessionStore
import com.plexive.mobile.features.auth.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.core.annotation.KoinViewModel

// Turns the stored token into something a screen can show, and is where a restored session is
// confirmed. On every change of the token, including the one SessionStore reads from secure storage
// at startup, this asks the backend who the token belongs to.
//
// That call is also the app's only 401 path: GET /api/auth/me rejects a revoked token, while the
// feed endpoint takes an optional viewer and would answer anonymously instead. The SessionAuth
// plugin discards the token on that 401, which comes back here as another token change and leaves
// the screen signed out.
@KoinViewModel
class SessionViewModel(
    private val repository: AuthRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(SessionUiState())
    val state: StateFlow<SessionUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            sessionStore.token.collect { token ->
                if (token == null) {
                    _state.value = SessionUiState()
                    return@collect
                }
                _state.value = SessionUiState(checking = true)
                val user = try {
                    repository.me()
                } catch (e: Exception) {
                    // A transport failure is not a rejected token, so the token stays; the header
                    // just shows nothing until the next attempt.
                    null
                }
                _state.value = SessionUiState(username = user?.username, checking = false)
            }
        }
    }

    fun signOut() {
        sessionStore.clear()
    }
}
