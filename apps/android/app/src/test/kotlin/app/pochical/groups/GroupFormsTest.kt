package app.pochical.groups

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import app.pochical.kit.GoingIn
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupRow
import app.pochical.kit.InGroup
import app.pochical.kit.NewGroupDraft
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
 * グループを編集 and グループを作る act on what the page holds at the tap: their button's own action
 * is run with no frame after the name is typed, and again at once, as a touch's frames would let
 * the page be drawn again in between (#1185).
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

  /** Types [name] into the field labelled [label] and runs [button]'s action twice, before any frame. */
  private fun typeAndTapTwice(label: String, name: String, button: String) {
    compose.mainClock.autoAdvance = false
    compose.onNode(hasSetTextAction() and hasText(label)).performTextReplacement(name)
    repeat(2) { compose.onNodeWithText(button).performSemanticsAction(SemanticsActions.OnClick) }
    compose.mainClock.autoAdvance = true
    compose.waitForIdle()
  }

  @Test
  fun aGroupsNameSavedBeforeThePageIsDrawnAgainIsTheNameTypedSavedOnce() {
    val saved = mutableListOf<String>()
    val group = GroupRow("group-1", "家族", joinedAtMs = 0, mark = GroupMarkValue(emoji = "🏠"))
    // A save still under way as the second tap comes.
    show {
      EditForm(group, onBack = {}) { name, _ ->
        saved += name
        CompletableDeferred<Unit>().await()
      }
    }

    typeAndTapTwice("グループ名", "実家", "保存")
    assertEquals(listOf("実家"), saved)
  }

  @Test
  fun aGroupMadeBeforeThePageIsDrawnAgainHasTheNameTypedAndIsAskedForOnce() {
    val asked = mutableListOf<NewGroupRequest>()
    val making = GoingIn<NewGroupDraft> { draft, _, _ -> CompletableDeferred<InGroup>().also { asked += draft.sent!! } }
    show { NewGroupPage(onBack = {}, onMade = {}, making = making) }
    // The person's name first, asked for as they have no usual one.
    compose.onNodeWithText("名前を入れてください").performClick()
    compose.onNode(hasSetTextAction() and hasText("名前")).performTextReplacement("さくら")
    compose.onNodeWithContentDescription("閉じる").performClick()
    compose.waitForIdle()

    typeAndTapTwice("グループ名", "忘年会", "作る")
    assertEquals(listOf("忘年会" to "さくら"), asked.map { it.name to it.displayName })
  }

  /** The page opened again while its group is still being made shows it under way, not an empty form. */
  @Test
  fun thePageOpenedWhileAGroupIsBeingMadeShowsItUnderWay() {
    val making = GoingIn<NewGroupDraft> { _, _, _ -> CompletableDeferred() }
    val call = making.begin(NewGroupDraft("忘年会", sent = NewGroupRequest.asking("忘年会", GroupMarkValue(emoji = "🍻"), "さくら", last = null)), app.pochical.kit.JoinFace.Usual, asUsual = false)
    making.left(call)
    show { NewGroupPage(onBack = {}, onMade = {}, making = making) }

    compose.onNode(hasSetTextAction() and hasText("忘年会")).assertExists()
    compose.onNodeWithText("作る").assertDoesNotExist()
  }

  /**
   * 作る asked with a name typed for the person, the page left and opened again while the group is
   * being made, and the call failed: the page shows that name, and 作る again with nothing changed
   * is the same request, so a group the server did make is not made twice.
   */
  @Test
  fun thePageOpenedAgainRetriesExactlyWhatWasAsked() {
    val asked = mutableListOf<NewGroupRequest>()
    val answers = mutableListOf<CompletableDeferred<InGroup>>()
    val making = GoingIn<NewGroupDraft> { draft, _, _ -> CompletableDeferred<InGroup>().also { asked += draft.sent!!; answers += it } }
    var open by mutableStateOf(true)
    show { if (open) NewGroupPage(onBack = {}, onMade = {}, making = making) }
    compose.onNodeWithText("名前を入れてください").performClick()
    compose.onNode(hasSetTextAction() and hasText("名前")).performTextReplacement("幹事")
    compose.onNodeWithContentDescription("閉じる").performClick()
    compose.onNode(hasSetTextAction() and hasText("グループ名")).performTextReplacement("忘年会")
    compose.onNodeWithText("作る").performClick()
    compose.waitForIdle()

    compose.runOnUiThread { open = false }
    compose.waitForIdle()
    compose.runOnUiThread { open = true }
    compose.onNodeWithText("幹事").assertExists()
    answers.single().completeExceptionally(IllegalStateException("offline"))
    compose.onNodeWithText("OK").performClick()
    compose.onNodeWithText("作る").performClick()
    compose.waitForIdle()

    assertEquals(2, asked.size)
    assertEquals(asked[0], asked[1])
  }

  /**
   * 作る asked with a mark picked by hand, the page left and opened again while the group is being
   * made, and the call failed: the mark is the person's still, so the name corrected then keeps it,
   * where a mark the name gave would follow the name.
   */
  @Test
  fun aMarkPickedByHandStaysAsTheNameIsChangedInThePageOpenedAgain() {
    val picked = GroupMarkValue(icon = "house", color = 4)
    val asked = mutableListOf<NewGroupRequest>()
    val answers = mutableListOf<CompletableDeferred<InGroup>>()
    val making = GoingIn<NewGroupDraft> { draft, _, _ -> CompletableDeferred<InGroup>().also { asked += draft.sent!!; answers += it } }
    // As the page that was left began it.
    val call = making.begin(NewGroupDraft("忘年会", pickedMark = picked, sent = NewGroupRequest.asking("忘年会", picked, "さくら", last = null)), app.pochical.kit.JoinFace.Usual, asUsual = false)
    making.left(call)
    show { NewGroupPage(onBack = {}, onMade = {}, making = making) }
    compose.waitForIdle()
    answers.single().completeExceptionally(IllegalStateException("offline"))
    compose.onNodeWithText("OK").performClick()

    compose.onNode(hasSetTextAction() and hasText("忘年会")).performTextReplacement("新年会")
    compose.onNodeWithText("作る").performClick()
    compose.waitForIdle()

    assertEquals(listOf("忘年会" to picked, "新年会" to picked), asked.map { it.name to it.mark })
  }
}
