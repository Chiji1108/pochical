package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.change
import app.pochical.v1.hlc
import app.pochical.v1.preferenceValue
import app.pochical.v1.WeekPreference
import app.pochical.v1.themePreference
import app.pochical.v1.weekPreference
import com.google.protobuf.ByteString
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SyncedSettingsTest {
  @get:Rule val folder = TemporaryFolder()

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val database = testDatabase()
  private val settings by lazy {
    SyncedSettings(deviceSettingsStore({ File(folder.root, "settings.json") }, scope), database, OwnEdits(database), scope)
  }

  @After
  fun end() {
    scope.cancel()
    database.close()
  }

  /** A preference as the account sends it, set on the user's iPad. */
  private fun fromIpad(key: String, message: ByteString) = change {
    preference = preferenceValue {
      this.key = key
      this.message = message
      hlc = hlc {
        physicalMs = 1
        deviceId = "ipad"
      }
    }
  }

  /** The keys of the edits waiting to go, in the order they were made. */
  private suspend fun waiting(): List<String> = database.write { outbox() }.map { Change.parseFrom(it.change).preference.key }

  @Test
  fun aPreferenceChangedGoesAsAnEditAndTheDevicesOwnStaysHome() = runBlocking {
    settings.change { it.copy(themeId = "zen", appearance = Appearance.Dark) }
    settings.change { it.copy(picture = it.picture.copy(dark = true)) }
    // The second change is kept after the first one's edits are written.
    withTimeout(5_000) { settings.settings.first { it.picture.dark == true } }

    assertEquals(listOf("theme"), waiting())
    assertEquals("zen", settings.settings.first().themeId)
  }

  @Test
  fun aChangeIsMadeOnWhatTheAccountHoldsThen() = runBlocking {
    settings.settings.first()
    database.write { takeOwn(fromIpad("week", weekPreference { start = 1; sunday = false; saturday = true; holiday = true }.toByteString())) }
    settings.change { it.copy(week = it.week.copy(saturday = false)) }

    val kept = withTimeout(5_000) { settings.settings.first { !it.week.saturday } }
    assertEquals(Week(start = 1, sunday = false, saturday = false), kept.week)
    val sent = database.write { outbox() }.single().let { Change.parseFrom(it.change).preference }
    assertEquals(weekPreference { start = 1; sunday = false; saturday = false; holiday = true }, WeekPreference.parseFrom(sent.message))
  }

  @Test
  fun aPreferenceFromAnotherDeviceIsTaken() = runBlocking {
    settings.settings.first()
    database.write { takeOwn(fromIpad("theme", themePreference { id = "sakura" }.toByteString())) }

    val taken = withTimeout(5_000) { settings.settings.first { it.themeId == "sakura" } }
    assertEquals(Appearance.System, taken.appearance)
    assertEquals(emptyList<String>(), waiting())
  }
}
