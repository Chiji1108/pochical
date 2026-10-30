package app.pochical.groups

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createComposeRule
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

  @Test
  fun aFaceChosenBeforeJoiningOutlivesTheActivityMadeAnew() {
    val chosen = listOf(JoinFace.None, JoinFace.Held("photo-1"), JoinFace.Usual)
    val restoration = StateRestorationTester(compose)
    var faces = emptyList<MutableState<JoinFace>>()
    restoration.setContent {
      faces = chosen.map { rememberSaveable(stateSaver = JoinFaceSaver) { mutableStateOf<JoinFace>(JoinFace.Usual) } }
    }
    compose.runOnIdle { faces.zip(chosen).forEach { (face, choice) -> face.value = choice } }
    faces = emptyList()
    restoration.emulateSavedInstanceStateRestore()
    compose.runOnIdle { assertEquals(chosen, faces.map { it.value }) }
  }
}
