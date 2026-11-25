package app.pochical.groups

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * メンバーを招待's first screenful holds the QR code and 招待リンクを送る together, in a window as
 * tall as a phone's upright and as short as one on its side (#1179).
 */
@RunWith(RobolectricTestRunner::class)
class InvitePageTest {
  @get:Rule val compose = createComposeRule()

  private val kit = PochicalKit(RuntimeEnvironment.getApplication())

  /** The page in a window of [qualifiers], its link read; the QR code's bounds and the button's. */
  private fun inviteIn(qualifiers: String): Pair<DpRect, DpRect> {
    RuntimeEnvironment.setQualifiers(qualifiers)
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalGroupCalls provides kit.groups,
        LocalValues provides kit.database.values(),
        LocalAccount provides kit.account,
      ) {
        PochicalTheme(settings) { InvitePage("group-1", onBack = {}, inviteCode = { "abcdefghjkmn" }) }
      }
    }
    compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("招待のQRコード")).fetchSemanticsNodes().isNotEmpty() }
    return compose.onNodeWithContentDescription("招待のQRコード").getUnclippedBoundsInRoot() to
      compose.onNodeWithText("招待リンクを送る").getUnclippedBoundsInRoot()
  }

  @Test
  fun aPhoneUprightShowsTheCodeAtItsFullSize() {
    val (qr, send) = inviteIn("w411dp-h891dp")
    assertEquals(200f, (qr.right - qr.left).value, 1f)
    assertTrue(send.bottom.value <= 891f)
  }

  @Test
  fun aPhoneOnItsSideShowsTheButtonUnderASmallerCode() {
    // The pane a phone 411dp tall on its side gives a page beside the tabs, less the room its status
    // and navigation bars and its taller app bar there take, which a test's window does not have.
    val (qr, send) = inviteIn("w458dp-h335dp")
    assertTrue("招待リンクを送る ends at ${send.bottom}", send.bottom.value <= 335f)
    val side = (qr.right - qr.left).value
    assertTrue("the code is $side wide", side in 72f..200f)
    assertEquals(side, (qr.bottom - qr.top).value, 1f)
  }
}
