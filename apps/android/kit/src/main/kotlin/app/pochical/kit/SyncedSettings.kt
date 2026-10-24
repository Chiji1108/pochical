package app.pochical.kit

import androidx.datastore.core.DataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/**
 * The device settings as the screens read and change them, kept on the device, the preferences
 * among them kept with the account too, as iOS's Settings: each the user changes goes as an edit,
 * and each the account holds, from this device or another, is taken as it comes. It outlives the
 * screens, so a change made as a page closes is kept and sent all the same.
 */
class SyncedSettings(
  private val store: DataStore<DeviceSettings>,
  database: AppDatabase,
  edits: OwnEdits,
  scope: CoroutineScope,
) {
  /** The settings as kept, and again as they change. */
  val settings: Flow<DeviceSettings> = store.settings

  // Taken one at a time, in the order they were made, each sending its edits before the next.
  private val changes = Channel<(DeviceSettings) -> DeviceSettings>(Channel.UNLIMITED)

  init {
    scope.launch {
      for (change in changes) {
        lateinit var before: DeviceSettings
        val after = store.updateData {
          before = it
          change(it)
        }
        for ((key, value) in after.preferencesChanged(before).toSortedMap()) edits.setPreference(key, value)
      }
    }
    scope.launch {
      database.values().preferences().collect { rows ->
        val held = rows.associate { it.key to it.value }
        store.updateData { it.adopting(held) }
      }
    }
  }

  /** Changes the settings by [change], and sends the preferences it changed as edits. */
  fun change(change: (DeviceSettings) -> DeviceSettings) {
    changes.trySend(change)
  }
}
