package app.pochical.baselineprofile

import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The app's Baseline Profile, from its start and the journeys, and its startup profile, from a cold
 * start alone: `./gradlew :app:generateBaselineProfile` with an emulator and `mise run server`
 * running (AGENTS.md, Android).
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
  @get:Rule val rule = BaselineProfileRule()

  /** Ready before the profile is recorded, so the first run's questions stay out of it. */
  @Before fun prepared() = MacrobenchmarkScope(PACKAGE, launchWithClearTask = true).prepare()

  @Test
  fun start() =
    rule.collect(PACKAGE, includeInStartupProfile = true) {
      killProcess()
      startActivityAndWait()
    }

  @Test
  fun journeys() =
    rule.collect(PACKAGE) {
      killProcess()
      startActivityAndWait()
      openCalendar()
      scrollMonth()
      openGroups()
      openChat()
    }
}
