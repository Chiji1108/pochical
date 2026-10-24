package app.pochical.kit

import android.util.Log
import androidx.datastore.core.DataStore
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * The device settings as the screens read and change them, kept on the device, the preferences
 * among them kept with the account too, as iOS's Settings: each the user changes goes as an edit,
 * and each the account holds, from this device or another, is taken as it comes. It outlives the
 * screens, so a change made as a page closes is kept and sent all the same.
 *
 * The account's preferences as the database holds them (the latest waiting edit's, else the
 * server's) are the truth for their keys; the store keeps them for the screens and widgets, with
 * what is the device's own. Changes and what the account brings are taken one at a time, each
 * reading the database as it is then, so a change is never made on a preference older than the
 * account's.
 */
class SyncedSettings(
  private val store: DataStore<DeviceSettings>,
  private val database: AppDatabase,
  private val edits: OwnEdits,
  scope: CoroutineScope,
) {
  /** The settings as kept, and again as they change. */
  val settings: Flow<DeviceSettings> = store.settings

  /** A change to make, or null to take what the account holds now. */
  private val steps = Channel<((DeviceSettings) -> DeviceSettings)?>(Channel.UNLIMITED)

  init {
    scope.launch {
      for (step in steps) {
        try {
          take(step)
        } catch (e: IOException) {
          // The disk would not take it; the next step tries again from what is kept.
          Log.w(TAG, "The settings could not be kept", e)
        }
      }
    }
    scope.launch { database.values().preferences().collect { steps.send(null) } }
  }

  /** Changes the settings by [change], and sends the preferences it changed as edits. */
  fun change(change: (DeviceSettings) -> DeviceSettings) {
    steps.trySend(change)
  }

  private suspend fun take(change: ((DeviceSettings) -> DeviceSettings)?) {
    val held = database.values().preferences().first().associate { it.key to it.value }
    val current = store.settings.first().adopting(held)
    val after = change?.invoke(current) ?: current
    // Sent before kept, so a change cut off between the two is still the account's when the app starts again.
    after.preferencesChanged(current).takeIf { it.isNotEmpty() }?.let { edits.setPreferences(it) }
    store.updateData { after }
  }

  private companion object {
    const val TAG = "SyncedSettings"
  }
}
