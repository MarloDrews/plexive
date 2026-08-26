package com.plexive.mobile.features.feed.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.plexive.mobile.features.feed.data.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.core.annotation.KoinViewModel

// Holds the feed screen's state. A StateFlow rather than Compose snapshot state, so this class can
// be tested without a Compose runtime.
@KoinViewModel
class FeedViewModel(private val repository: FeedRepository) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState(loading = true))
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = FeedUiState(loading = true)
        viewModelScope.launch {
            try {
                _state.value = FeedUiState(posts = repository.forYou())
            } catch (e: Exception) {
                // Any transport or parse failure lands here. The message is shown verbatim, since
                // the point of this screen is to make a failed request visible rather than pretty.
                _state.value = FeedUiState(error = e.message ?: "Request failed")
            }
        }
    }
}
