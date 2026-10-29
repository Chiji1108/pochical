package app.pochical.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The app's Baseline Profile, from its start and the journeys, and its startup profile, from the
 * start alone: `./gradlew :app:generateBaselineProfile` with an emulator and `mise run server`
 * running (AGENTS.md, Android).
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
  @get:Rule val rule = BaselineProfileRule()

  @Test
  fun start() =
    rule.collect(PACKAGE, includeInStartupProfile = true) {
      prepare()
      pressHome()
      startActivityAndWait()
    }

  @Test
  fun journeys() =
    rule.collect(PACKAGE) {
      prepare()
      openCalendar()
      scrollMonth()
      openGroups()
      openChat()
    }
}
