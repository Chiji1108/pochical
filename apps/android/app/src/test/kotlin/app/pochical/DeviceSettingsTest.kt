package app.pochical

import androidx.datastore.core.DataStore
import app.pochical.design.Theme
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DeviceSettingsTest {
  @get:Rule val folder = TemporaryFolder()

  private val file by lazy { File(folder.root, "device-settings.json") }

  /** Runs `use` on a store opened anew on the file, as the app does when it starts again, then closes it. */
  private suspend fun <T> withStore(use: suspend (DataStore<DeviceSettings>) -> T): T {
    val job = Job()
    try {
      return use(deviceSettingsStore(file, CoroutineScope(job + Dispatchers.IO)))
    } finally {
      job.cancelAndJoin()
    }
  }

  private suspend fun readAgain(): DeviceSettings = withStore { it.settings.first() }

  @Test
  fun aDeviceNeverSetShowsPochicalAsThePhoneIs() = runTest {
    assertEquals(DeviceSettings(Theme.Pochical.id, Appearance.System), readAgain())
  }

  @Test
  fun whatIsSetIsKeptForTheNextStart() = runTest {
    withStore { store ->
      store.updateData { it.copy(themeId = Theme.Sakura.id, appearance = Appearance.Dark) }
    }

    val kept = readAgain()
    assertEquals(Theme.Sakura, kept.theme)
    assertEquals(Appearance.Dark, kept.appearance)
  }

  @Test
  fun aThemeThisAppDoesNotKnowIsPochicalAndKeptAsItCame() = runTest {
    file.writeText("""{"theme":"aurora","appearance":"light"}""")

    val kept = readAgain()
    assertEquals(Theme.Pochical, kept.theme)
    assertEquals("aurora", kept.themeId)
    assertEquals(Appearance.Light, kept.appearance)
  }

  @Test
  fun aSettingMissingTakesItsDefault() = runTest {
    file.writeText("""{"theme":"matcha"}""")

    assertEquals(DeviceSettings(Theme.Matcha.id, Appearance.System), readAgain())
  }

  @Test
  fun anAppearanceThisAppDoesNotKnowLeavesTheThemeAsItWas() = runTest {
    file.writeText("""{"theme":"sakura","appearance":"auto"}""")

    assertEquals(DeviceSettings(Theme.Sakura.id, Appearance.System), readAgain())
  }

  @Test
  fun aFileThatCannotBeReadIsTheDefaults() = runTest {
    file.writeText("not json")

    assertEquals(DeviceSettings(), readAgain())
  }
}
