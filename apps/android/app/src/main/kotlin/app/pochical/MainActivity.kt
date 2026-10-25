package app.pochical

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnDays
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.LocalValues
import app.pochical.chat.LocalChats
import app.pochical.chat.LocalPhotoFiles
import app.pochical.chat.LocalPhotoUploads
import app.pochical.kit.DeviceSettings
import app.pochical.kit.PochicalKit
import app.pochical.kit.SyncedSettings
import app.pochical.widgets.followForWidgetPreviews
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.notifications.LocalNotificationPermission
import app.pochical.notifications.rememberNotificationAsking
import app.pochical.notifications.NotificationPermission
import app.pochical.kit.AppLink
import app.pochical.notifications.LocalChatNotifier
import app.pochical.notifications.Push
import app.pochical.reminders.LocalReminderAlarms
import app.pochical.reminders.ReminderAlarms
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesIntoMap
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.binding
import dev.zacsweers.metrox.android.ActivityKey
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@ContributesIntoMap(AppScope::class, binding<Activity>())
@ActivityKey
@Inject
class MainActivity(
  private val deviceSettings: SyncedSettings,
  private val ownDays: OwnDays,
  private val kit: PochicalKit,
  private val push: Push,
  private val notificationPermission: NotificationPermission,
  private val reminderAlarms: ReminderAlarms,
) : ComponentActivity() {
  private var settings by mutableStateOf<DeviceSettings?>(null)
  private val appleSignIn = AppleSignIn(this, kit.appleSignIn)
  private var calendarRead by mutableStateOf(false)
  private val links = OpenedLinks()

  override fun onCreate(savedInstanceState: Bundle?) {
    // The splash stays until the first frame can be drawn in the person's テーマ, with their days.
    installSplashScreen().setKeepOnScreenCondition { settings == null || !calendarRead }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Made again, the activity's navigation keeps the place the first intent opened.
    // From Recents, Android hands the intent the task began with again: no link was opened now.
    if (savedInstanceState == null && intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) take(intent)
    addOnNewIntentListener(::take)
    lifecycleScope.launch {
      // Not cancelled with the activity, so a sample is never left half put in; read after it, so
      // the first calendar drawn holds it.
      if (savedInstanceState == null) withContext(NonCancellable) { takeLaunchOptions(intent, kit) }
      ownDays.awaitRead()
      calendarRead = true
    }
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) { deviceSettings.settings.collect { settings = it } }
    }
    // The widgets' previews in the picker follow the settings the screens change.
    lifecycleScope.launch { followForWidgetPreviews(this@MainActivity, deviceSettings.settings) }
    setContent {
      val device = settings ?: return@setContent
      if (!calendarRead) return@setContent
      val state = remember(device) { DeviceSettingsState(device, deviceSettings::change) }
      CompositionLocalProvider(
        LocalDeviceSettings provides state,
        LocalOwnDays provides ownDays,
        LocalAccount provides kit.account,
        LocalAppleSignIn provides appleSignIn,
        LocalGroupCalls provides kit.groups,
        LocalValues provides kit.database.values(),
        LocalChats provides kit.chats,
        LocalPhotoUploads provides kit.photoUploads,
        LocalPhotoFiles provides kit.photoFiles,
        LocalOpenedLinks provides links,
        LocalNotificationPermission provides notificationPermission,
        LocalReminderAlarms provides reminderAlarms,
        LocalChatNotifier provides push.notifier,
      ) {
        // Asked from here, under every page, so an answer reaches the app after its page closed.
        CompositionLocalProvider(LocalNotificationAsking provides rememberNotificationAsking()) {
          PochicalTheme(device) { AccountRoot() }
        }
      }
    }
  }

  /** Where [intent] opens the app at, for the screens; a chat's notification tapped goes, as it is read. */
  private fun take(intent: Intent) {
    val link = links.take(intent)
    if (link is AppLink.Chat) push.notifier.opened(link.groupId, link.threadId)
  }
}
