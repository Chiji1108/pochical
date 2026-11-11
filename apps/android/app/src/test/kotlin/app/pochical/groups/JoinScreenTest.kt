package app.pochical.groups

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.text.input.TextFieldValue
import app.pochical.kit.JoinFace
import app.pochical.name
import app.pochical.string
import app.pochical.strings
import app.pochical.vectors
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class JoinScreenTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun memberLine() {
    val resources = RuntimeEnvironment.getApplication().resources
    for (case in vectors("groups", "memberLine")) {
      assertEquals(case.name(), case.string("expected"), memberLine(resources, case.strings("names")!!))
    }
  }

  /** The face, a drawing put in place among them, the name and how the person is asked: none picked or decided again. */
  @Test
  fun whatIsChosenBeforeGoingOnOutlivesTheActivityMadeAnew() {
    val chosen = listOf(Triple(JoinFace.None, true, "みどり"), Triple(JoinFace.Held("photo-1"), false, ""), Triple(JoinFace.Usual, null, "さくら"))
    val restoration = StateRestorationTester(compose)
    var profiles = emptyList<JoinProfile>()
    restoration.setContent { profiles = chosen.map { rememberSaveable(saver = JoinProfile.Saver) { JoinProfile() } } }
    compose.runOnIdle {
      profiles.zip(chosen).forEach { (profile, choice) ->
        profile.face = choice.first
        profile.asUsual = choice.second
        profile.ownName = TextFieldValue(choice.third)
      }
    }
    profiles = emptyList()
    restoration.emulateSavedInstanceStateRestore()
    compose.runOnIdle { assertEquals(chosen, profiles.map { Triple(it.face, it.asUsual, it.ownName.text) }) }
  }

  /** Decided once: a retry after the name going on made usual has come back keeps what was decided. */
  @Test
  fun howThePersonIsAskedIsDecidedOnceThroughRetries() {
    val first = JoinProfile()
    assertEquals(true, first.goingOn(usualName = ""))
    assertEquals(true, first.goingOn(usualName = "さくら"))
    val named = JoinProfile()
    assertEquals(false, named.goingOn(usualName = "さくら"))
    val known = JoinProfile(asUsual = false)
    assertEquals(false, known.goingOn(usualName = ""))
  }
}
