package app.pochical.notifications

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.WindowInfo
import androidx.compose.ui.test.junit4.createComposeRule
import app.pochical.kit.Localized
import app.pochical.kit.PushedAlert
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** A chat's page in front, its window focused, is on the screen; the shade over it takes the focus. */
@RunWith(RobolectricTestRunner::class)
class ShowingChatTest {
  @get:Rule val compose = createComposeRule()

  private val context: Application = RuntimeEnvironment.getApplication()
  private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val notifier = ChatNotifier(context, { "me" }, { emptyList() }, { null }, TestConversations(context))

  /** The window's focus as the test sets it. */
  private class Window : WindowInfo {
    override var isWindowFocused by mutableStateOf(true)
  }

  @Before
  fun allow() {
    shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    Channels.create(context)
  }

  private fun line(seq: Long) =
    PushedAlert(
      title = Localized("CHAT_TITLE", listOf("いとこ会")),
      body = Localized("CHAT_GROUP_TEXT", listOf("さくら", "今週どう？")),
      groupId = "g1",
      threadId = "group",
      line = PushedAlert.Line("writer", seq),
      recipientId = "me",
    )

  @Test
  fun theShadeOverTheChatLetsItsLinesNotify() {
    val window = Window()
    compose.setContent {
      CompositionLocalProvider(LocalChatNotifier provides notifier, LocalWindowInfo provides window) { ShowingChat("g1", "group") }
    }
    compose.waitForIdle()
    runBlocking { notifier.show(line(2)) }
    assertEquals(0, manager.activeNotifications.size)

    // The shade pulled down over it: still resumed, its window no longer focused.
    window.isWindowFocused = false
    compose.waitForIdle()
    runBlocking { notifier.show(line(3)) }
    assertEquals(1, manager.activeNotifications.size)
  }
}
