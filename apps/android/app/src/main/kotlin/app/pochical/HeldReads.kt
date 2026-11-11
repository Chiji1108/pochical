package app.pochical

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.retain.retain
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.flow.Flow

// What a screen reads from the device's database, held while the screen is away: a tab gone to
// another, the tabs under a page pushed over them, the window remade. Back, the screen's first frame
// draws what it last read, as iOS's reads have it at once, rather than an empty screen until the
// database answers again (#1150).

/**
 * What [read] gives: null until it has first given anything, then the latest, read again as it
 * changes while the screen is started, and made anew as [keys] change, what it last gave shown
 * until the new one gives, as collectAsStateWithLifecycle keeps it. Held while its screen is away,
 * so a screen coming back draws at once what it showed, and only one shown for the first time
 * waits for the database.
 */
@Composable
fun <T : Any> rememberRead(vararg keys: Any?, read: () -> Flow<T>): T? {
  val held = retain { HeldRead<T>() }
  val flow = remember(*keys) { read() }
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  LaunchedEffect(flow, lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { flow.collect { held.value = it } } }
  return held.value
}

/** What a read last gave. */
private class HeldRead<T : Any> {
  var value by mutableStateOf<T?>(null)
}
