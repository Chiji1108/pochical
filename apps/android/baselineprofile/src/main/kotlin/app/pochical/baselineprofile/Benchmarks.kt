package app.pochical.baselineprofile

import android.net.ConnectivityManager
import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * What the Baseline Profile gains: the cold start and the journeys' frames, without it (nothing
 * compiled ahead) and with it, in the release build the profile ships in.
 * `./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest` (AGENTS.md, Android).
 */
@RunWith(AndroidJUnit4::class)
class Benchmarks {
  @get:Rule val rule = MacrobenchmarkRule()

  @Before fun prepared() = MacrobenchmarkScope(PACKAGE, launchWithClearTask = true).prepare()

  @Test fun startWithoutProfile() = start(CompilationMode.None())

  @Test fun startWithProfile() = start(CompilationMode.Partial(BaselineProfileMode.Require))

  /**
   * The splash waits only on what the device keeps, never on the network (#939): in airplane mode, a
   * start with the person's days comes as fast as online, and a first start, which can never sign
   * in, still shows the first run's questions. A splash waiting for signing in or sync to succeed
   * would stay, and starting would fail.
   */
  @Test fun startOffline() = offline { start(CompilationMode.Partial(BaselineProfileMode.Require)) }

  @Test
  fun firstStartOffline() = offline {
    start(CompilationMode.Partial(BaselineProfileMode.Require), shows = By.text("はじめる")) {
      // Block Store's session goes with the app's data too.
      device.executeShellCommand("pm clear $PACKAGE")
    }
  }

  @Test fun journeysWithoutProfile() = journeys(CompilationMode.None())

  @Test fun journeysWithProfile() = journeys(CompilationMode.Partial(BaselineProfileMode.Require))

  private fun start(compilation: CompilationMode, shows: BySelector? = null, setup: MacrobenchmarkScope.() -> Unit = {}) =
    rule.measureRepeated(
      packageName = PACKAGE,
      metrics = listOf(StartupTimingMetric()),
      compilationMode = compilation,
      startupMode = StartupMode.COLD,
      iterations = 10,
      setupBlock = {
        pressHome()
        setup()
      },
    ) {
      startActivityAndWait()
      shows?.let { find(it) }
    }

  private fun journeys(compilation: CompilationMode) =
    rule.measureRepeated(
      packageName = PACKAGE,
      metrics = listOf(FrameTimingMetric()),
      compilationMode = compilation,
      iterations = 5,
      setupBlock = {
        killProcess()
        startActivityAndWait()
      },
    ) {
      openCalendar()
      scrollMonth()
      openGroups()
      openChat()
    }

  /** [measure] in airplane mode, once the device has no network left to reach the server by. */
  private fun offline(measure: () -> Unit) {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val device = UiDevice.getInstance(instrumentation)
    val connectivity = instrumentation.context.getSystemService(ConnectivityManager::class.java)
    device.executeShellCommand("cmd connectivity airplane-mode enable")
    try {
      check(device.wait({ connectivity.activeNetwork == null }, WAIT)) { "Still online in airplane mode" }
      measure()
    } finally {
      device.executeShellCommand("cmd connectivity airplane-mode disable")
    }
  }
}
