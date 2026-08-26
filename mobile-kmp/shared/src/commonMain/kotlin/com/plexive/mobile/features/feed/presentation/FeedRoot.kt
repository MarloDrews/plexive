package com.plexive.mobile.features.feed.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.plexive.mobile.core.model.FeedPost
import com.plexive.mobile.features.auth.presentation.SessionViewModel
import com.plexive.mobile.navigation.NavigationBackStack
import com.plexive.mobile.navigation.Screen
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel

// The feed screen. Deliberately plain: this batch exists to prove the app can reach the backend and
// show what came back, so there is no theming, no images and no navigation into a post yet.
@Composable
fun FeedRoot() {
    val viewModel = koinViewModel<FeedViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        SessionHeader()
        FeedList(state, onRetry = viewModel::load)
    }
}

// The only place the app shows who is signed in, and the only way to reach the login screen. A
// batch that makes navigation react to session state comes later; this is a header with a button.
@Composable
private fun SessionHeader() {
    val viewModel = koinViewModel<SessionViewModel>()
    val session by viewModel.state.collectAsStateWithLifecycle()
    val backStack = koinInject<NavigationBackStack>()

    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = when {
                session.checking -> "Checking session..."
                session.username != null -> "Signed in as ${session.username}"
                else -> "Signed out"
            },
            style = MaterialTheme.typography.bodyMedium,
        )
        if (session.username != null) {
            TextButton(onClick = viewModel::signOut) {
                Text("Sign out")
            }
        } else if (!session.checking) {
            TextButton(onClick = { backStack.push(Screen.Login) }) {
                Text("Sign in")
            }
        }
    }
}

@Composable
private fun FeedList(state: FeedUiState, onRetry: () -> Unit) {
    when {
        state.loading -> Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator()
        }

        state.error != null -> Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Could not load the feed",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = state.error.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            Button(onClick = onRetry) {
                Text("Retry")
            }
        }

        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(state.posts, key = { it.id }) { post ->
                PostRow(post)
            }
        }
    }
}

@Composable
private fun PostRow(post: FeedPost) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = post.title,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "${post.format} - ${post.authorUsername ?: "unknown"} - ${post.readingMinutes} min read",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
