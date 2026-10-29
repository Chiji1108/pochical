package app.pochical.baselineprofile

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
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

  @Test fun startWithoutProfile() = start(CompilationMode.None())

  @Test fun startWithProfile() = start(CompilationMode.Partial(BaselineProfileMode.Require))

  @Test fun journeysWithoutProfile() = journeys(CompilationMode.None())

  @Test fun journeysWithProfile() = journeys(CompilationMode.Partial(BaselineProfileMode.Require))

  private fun start(compilation: CompilationMode) =
    rule.measureRepeated(
      packageName = PACKAGE,
      metrics = listOf(StartupTimingMetric()),
      compilationMode = compilation,
      startupMode = StartupMode.COLD,
      iterations = 10,
      setupBlock = {
        prepare()
        pressHome()
      },
    ) {
      startActivityAndWait()
    }

  private fun journeys(compilation: CompilationMode) =
    rule.measureRepeated(
      packageName = PACKAGE,
      metrics = listOf(FrameTimingMetric()),
      compilationMode = compilation,
      iterations = 5,
      setupBlock = { prepare() },
    ) {
      openCalendar()
      scrollMonth()
      openGroups()
      openChat()
    }
}
