package com.plexive.mobile.features.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.plexive.mobile.core.session.SessionStore
import com.plexive.mobile.features.auth.data.AuthException
import com.plexive.mobile.features.auth.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.core.annotation.KoinViewModel

// Holds the login screen's state. Same shape as FeedViewModel: a StateFlow of an immutable UI state,
// so this class can be tested without a Compose runtime.
@KoinViewModel
class LoginViewModel(
    private val repository: AuthRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onEmailChange(value: String) {
        _state.value = _state.value.copy(email = value, error = null)
    }

    fun onPasswordChange(value: String) {
        _state.value = _state.value.copy(password = value, error = null)
    }

    fun submit() {
        val current = _state.value
        if (current.submitting) return
        if (current.email.isBlank() || current.password.isBlank()) {
            _state.value = current.copy(error = "Enter your email and password.")
            return
        }
        _state.value = current.copy(submitting = true, error = null)
        viewModelScope.launch {
            try {
                val response = repository.login(current.email, current.password)
                // Storing the token is what signs the app in: SessionStore persists it and every
                // later request picks it up from there.
                sessionStore.set(response.accessToken)
                // The password is dropped from state along with everything else. Nothing keeps it.
                _state.value = LoginUiState(signedIn = true)
            } catch (e: AuthException) {
                _state.value = _state.value.copy(submitting = false, error = e.message)
            } catch (e: Exception) {
                // Transport failures (no network, wrong base URL, DNS). Several carry no message at
                // all, so fall back to the class name rather than an empty string.
                _state.value = _state.value.copy(
                    submitting = false,
                    error = e.message ?: e::class.simpleName ?: "Request failed",
                )
            }
        }
    }
}
