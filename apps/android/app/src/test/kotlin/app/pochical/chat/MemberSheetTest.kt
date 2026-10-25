package app.pochical.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import app.pochical.design.GROUP_MAX_MEMBERS
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MemberSheetTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun aSheetOfAWholeGroupScrollsToItsLastMemberAndItsNote() {
    val members = List(GROUP_MAX_MEMBERS) { SheetMember("u$it", "メンバー$it", photoId = "", shelf = null) }
    compose.setContent { MemberSheet("個人チャットを始める", members, onDismiss = {}, note = "グループでの名前とアイコンで話します。") }
    compose.onNode(hasScrollAction()).performScrollToNode(hasText("グループでの名前とアイコンで話します。"))
    compose.onNodeWithText("メンバー${GROUP_MAX_MEMBERS - 1}").assertIsDisplayed()
  }
}
