package app.pochical

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.Menu
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnDays
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.LocalValues
import app.pochical.chat.LocalChats
import app.pochical.chat.LocalPhotoFiles
import app.pochical.chat.LocalPhotoUploads
import app.pochical.kit.PochicalKit
import app.pochical.kit.SyncedSettings
import app.pochical.widgets.followForWidgetPreviews
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.notifications.LocalNotificationPermission
import app.pochical.notifications.rememberNotificationAsking
import app.pochical.notifications.NotificationPermission
import app.pochical.kit.AppLink
import app.pochical.notifications.LocalChatNotifier
import app.pochical.notifications.LocalChatNotificationSwitches
import app.pochical.notifications.Push
import app.pochical.reminders.LocalReminderAlarms
import app.pochical.reminders.ReminderAlarms
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesIntoMap
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.binding
import dev.zacsweers.metrox.android.ActivityKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@ContributesIntoMap(AppScope::class, binding<Activity>())
@ActivityKey
@Inject
class MainActivity(
  private val deviceSettings: SyncedSettings,
  private val firstFrame: FirstFrame,
  private val ownDays: OwnDays,
  private val kit: PochicalKit,
  private val push: Push,
  private val notificationPermission: NotificationPermission,
  private val reminderAlarms: ReminderAlarms,
  private val appleSignIn: AppleSignIn,
  private val signIns: SignIns,
  private val accountActions: AccountActions,
) : ComponentActivity() {
  init {
    // Before the activity is created, as the Auth Tab's result launcher must be.
    appleSignIn.attach(this)
  }
  /** Whether what the launching intent asks of a debug build is taken: at once in an activity made anew, which has none to take. */
  private var launchOptionsTaken by mutableStateOf(false)
  private val links = OpenedLinks()

  override fun onCreate(savedInstanceState: Bundle?) {
    // The splash stays until the first frame can be drawn in the person's テーマ, with their days:
    // what the device keeps alone, never the network or sync (Benchmarks' offline starts, #939).
    installSplashScreen().setKeepOnScreenCondition {
      firstFrame.settings.value == null || !launchOptionsTaken || !firstFrame.daysRead.value || firstFrame.firstRunDone.value == null
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Made again, the activity's navigation keeps the place the first intent opened.
    // From Recents, Android hands the intent the task began with again: no link was opened now.
    if (savedInstanceState == null && intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) take(intent)
    addOnNewIntentListener(::take)
    launchOptionsTaken = savedInstanceState != null
    if (!launchOptionsTaken) {
      lifecycleScope.launch {
        // Not cancelled with the activity, so a sample is never left half put in. The calendar, which
        // the reminders follow from the app's start, shows it as the database tells of its writes.
        withContext(NonCancellable) { takeLaunchOptions(intent, kit) }
        launchOptionsTaken = true
      }
    }
    // The widgets' previews in the picker follow the settings the screens change.
    lifecycleScope.launch { followForWidgetPreviews(this@MainActivity, deviceSettings.settings) }
    // Set while the app is in front, where the system does not limit how often (spec/shortcuts.md).
    if (savedInstanceState == null) lifecycleScope.launch(Dispatchers.Default) { publishShortcuts(applicationContext) }
    setContent {
      // There at once in an activity made anew (FirstFrame).
      val settings by firstFrame.settings.collectAsStateWithLifecycle()
      val firstRunDone by firstFrame.firstRunDone.collectAsStateWithLifecycle()
      val daysRead by firstFrame.daysRead.collectAsStateWithLifecycle()
      val device = settings ?: return@setContent
      if (!launchOptionsTaken || !daysRead) return@setContent
      val done = firstRunDone ?: return@setContent
      val firstRun = remember(done) { FirstRunState(done, kit.firstRun) }
      val state = remember(device) { DeviceSettingsState(device, deviceSettings::change) }
      CompositionLocalProvider(
        LocalDeviceSettings provides state,
        LocalOwnDays provides ownDays,
        LocalAccount provides kit.account,
        LocalAppleSignIn provides appleSignIn,
        LocalSignIns provides signIns,
        LocalAccountActions provides accountActions,
        LocalGroupCalls provides kit.groups,
        LocalValues provides kit.database.values(),
        LocalChats provides kit.chats,
        LocalPhotoUploads provides kit.photoUploads,
        LocalPhotoFiles provides kit.photoFiles,
        LocalOpenedLinks provides links,
        LocalNotificationPermission provides notificationPermission,
        LocalReminderAlarms provides reminderAlarms,
        LocalChatNotifier provides push.notifier,
        LocalChatNotificationSwitches provides kit.chatNotifications,
        LocalFirstRun provides firstRun,
      ) {
        // Asked from here, under every page, so an answer reaches the app after its page closed.
        CompositionLocalProvider(LocalNotificationAsking provides rememberNotificationAsking()) {
          PochicalTheme(device) { AccountRoot() }
        }
      }
    }
  }

  /**
   * Esc does what back does, when there is something to go back from: a menu or a sheet the app
   * draws itself closes, a page goes (spec/chat.md, A keyboard and a mouse). At the calendar, with
   * nothing behind it, it leaves the app where it is rather than closing it. Compose's own dialogs and
   * menus close by it themselves, before it gets here.
   */
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode != KeyEvent.KEYCODE_ESCAPE || !onBackPressedDispatcher.hasEnabledCallbacks()) return super.onKeyDown(keyCode, event)
    // Tracked as the back key is, so an Esc let go elsewhere, or cancelled, goes back from nothing.
    event.startTracking()
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode != KeyEvent.KEYCODE_ESCAPE || !event.isTracking || event.isCanceled) return super.onKeyUp(keyCode, event)
    onBackPressedDispatcher.onBackPressed()
    return true
  }

  override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>, menu: Menu?, deviceId: Int) {
    super.onProvideKeyboardShortcuts(data, menu, deviceId)
    data += keyboardShortcuts(this)
  }

  /** Where [intent] opens the app at, for the screens; a chat's notification tapped goes, as it is read. */
  private fun take(intent: Intent) {
    val link = links.take(intent)
    if (link is AppLink.Chat) push.notifier.opened(link.groupId, link.threadId)
  }
}
