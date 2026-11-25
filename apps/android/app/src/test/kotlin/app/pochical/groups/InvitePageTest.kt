package app.pochical.groups

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.DpRect
import app.pochical.DeviceSettingsState
import app.pochical.LocalAccount
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.kit.DeviceSettings
import app.pochical.kit.PochicalKit
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * メンバーを招待's first screenful holds the QR code and 招待リンクを送る together, in a window as
 * tall as a phone's upright and as short as one on its side, where the code is smaller (#1179).
 */
@RunWith(RobolectricTestRunner::class)
class InvitePageTest {
  @get:Rule val compose = createComposeRule()

  private val kit = PochicalKit(RuntimeEnvironment.getApplication())

  /** The page in a window of [qualifiers], its code read by [inviteCode]. */
  private fun show(qualifiers: String, inviteCode: suspend (Boolean) -> String) {
    RuntimeEnvironment.setQualifiers(qualifiers)
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalGroupCalls provides kit.groups,
        LocalValues provides kit.database.values(),
        LocalAccount provides kit.account,
      ) {
        PochicalTheme(settings) { InvitePage("group-1", onBack = {}, inviteCode = inviteCode) }
      }
    }
  }

  /** The page in a window of [qualifiers], its link read; the QR code's bounds and the button's. */
  private fun inviteIn(qualifiers: String): Pair<DpRect, DpRect> {
    show(qualifiers) { "abcdefghjkmn" }
    compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("招待のQRコード")).fetchSemanticsNodes().isNotEmpty() }
    return compose.onNodeWithContentDescription("招待のQRコード").getUnclippedBoundsInRoot() to
      compose.onNodeWithText("招待リンクを送る").getUnclippedBoundsInRoot()
  }

  @Test
  fun aPhoneUprightShowsTheCodeAtItsFullSize() {
    val (qr, send) = inviteIn("w411dp-h891dp")
    assertEquals(200f, (qr.right - qr.left).value, 1f)
    assertTrue(send.top >= qr.bottom)
  }

  @Test
  fun aTabletOnItsSideShowsTheCodeAtItsFullSize() {
    val (qr, _) = inviteIn("w824dp-h800dp")
    assertEquals(200f, (qr.right - qr.left).value, 1f)
  }

  @Test
  fun aPhoneOnItsSideShowsTheButtonUnderASmallerCode() {
    // The pane a phone 411dp tall on its side gives a page beside the tabs, less the room its status
    // and navigation bars and its taller app bar there take, which a test's window does not have.
    val (qr, send) = inviteIn("w458dp-h335dp")
    assertTrue("招待リンクを送る ends at ${send.bottom}", send.bottom.value <= 335f)
    assertEquals(88f, (qr.right - qr.left).value, 1f)
    assertTrue(send.top >= qr.bottom)
  }

  @Test
  fun aPhoneOnItsSideKeepsTheRetryWholeOverTheCardsWords() {
    show("w458dp-h335dp") { throw IOException("offline") }
    compose.waitUntil(5_000) { compose.onAllNodes(hasText("リンクを読み込めませんでした")).fetchSemanticsNodes().isNotEmpty() }
    val retry = compose.onNodeWithText("もう一度確認する").assertIsDisplayed().getUnclippedBoundsInRoot()
    val words = compose.onNodeWithText("リンクを読み込めませんでした").getUnclippedBoundsInRoot()
    assertTrue("もう一度確認する ends at ${retry.bottom}, its words start at ${words.top}", retry.bottom <= words.top)
  }
}
