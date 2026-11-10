package app.pochical

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.retain.retain
import androidx.compose.runtime.retain.retainRetainedValuesStoreRegistry
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation3.runtime.NavEntryDecorator
import kotlinx.coroutines.flow.Flow

// What a screen reads from the device's database, held while the screen is away: a tab gone to
// another, the tabs under a page pushed over them, the window remade. Back, the screen's first frame
// draws what it last read, as iOS's reads have it at once, rather than an empty screen until the
// database answers again (#1150).

/**
 * What [read] gives, by [keys]: null until it has first given anything, then the latest, read again
 * as it changes while the screen is started. Held while its screen is away, so a screen coming back
 * draws at once what it showed, and only one shown for the first time waits for the database.
 */
@Composable
fun <T : Any> rememberRead(vararg keys: Any?, read: () -> Flow<T>): T? {
  val held = retain(*keys) { HeldRead(read()) }
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  LaunchedEffect(held, lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { held.flow.collect { held.value = it } } }
  return held.value
}

/** A read and what it last gave. */
private class HeldRead<T : Any>(val flow: Flow<T>) {
  var value by mutableStateOf<T?>(null)
}

/**
 * Holds what each of NavDisplay's entries reads ([rememberRead]) while it is not shown, as a page
 * covers it, until it is popped, as its saved state is.
 */
@Composable
fun <T : Any> rememberHeldReadsDecorator(): NavEntryDecorator<T> {
  val stores = retainRetainedValuesStoreRegistry()
  return remember(stores) {
    NavEntryDecorator(onPop = stores::clearChild) { entry -> stores.LocalRetainedValuesStoreProvider(entry.contentKey) { entry.Content() } }
  }
}
