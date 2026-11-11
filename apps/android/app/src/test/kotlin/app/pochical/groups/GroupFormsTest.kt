package app.pochical.groups

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import app.pochical.DeviceSettingsState
import app.pochical.LocalAccount
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.kit.DeviceSettings
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupRow
import app.pochical.kit.InGroup
import app.pochical.kit.NewGroupRequest
import app.pochical.kit.PochicalKit
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * グループを編集 and グループを作る send what the page holds at the tap: their button's own action is
 * run with no frame after the name is typed, as a touch's frames would let the page be drawn
 * again before it (#1185).
 */
@RunWith(RobolectricTestRunner::class)
class GroupFormsTest {
  @get:Rule val compose = createComposeRule()

  private val kit = PochicalKit(RuntimeEnvironment.getApplication())

  private fun show(page: @Composable () -> Unit) {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalGroupCalls provides kit.groups,
        LocalValues provides kit.database.values(),
        LocalAccount provides kit.account,
      ) {
        PochicalTheme(settings) { page() }
      }
    }
    compose.waitForIdle()
  }

  /** Types [name] into the field labelled [label] and runs [button]'s action before any frame. */
  private fun typeAndTap(label: String, name: String, button: String) {
    compose.mainClock.autoAdvance = false
    compose.onNode(hasSetTextAction() and hasText(label)).performTextReplacement(name)
    compose.onNodeWithText(button).performSemanticsAction(SemanticsActions.OnClick)
    compose.mainClock.autoAdvance = true
    compose.waitForIdle()
  }

  @Test
  fun aGroupsNameSavedBeforeThePageIsDrawnAgainIsTheNameTyped() {
    val renamed = mutableListOf<String>()
    val group = GroupRow("group-1", "家族", joinedAtMs = 0, mark = GroupMarkValue(emoji = "🏠"))
    show { EditForm(group, onBack = {}) { name, _ -> renamed += name } }

    typeAndTap("グループ名", "実家", "保存")
    assertEquals(listOf("実家"), renamed)
  }

  @Test
  fun aGroupMadeBeforeThePageIsDrawnAgainHasTheNameTyped() {
    val asked = mutableListOf<NewGroupRequest>()
    show { NewGroupPage(onBack = {}, onMade = {}, make = { request, _, _ -> asked += request; CompletableDeferred<InGroup>() }) }
    // The person's name first, asked for as they have no usual one.
    compose.onNodeWithText("名前を入れてください").performClick()
    compose.onNode(hasSetTextAction() and hasText("名前")).performTextReplacement("さくら")
    compose.onNodeWithContentDescription("閉じる").performClick()
    compose.waitForIdle()

    typeAndTap("グループ名", "忘年会", "作る")
    assertEquals(listOf("忘年会" to "さくら"), asked.map { it.name to it.displayName })
  }
}
