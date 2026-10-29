package app.pochical.widgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.edit
import app.pochical.BuildConfig
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import app.pochical.kit.AppDatabase
import app.pochical.kit.DeviceSettings
import app.pochical.kit.OwnCalendar
import app.pochical.kit.SyncedSettings
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// When the widgets are drawn again (spec/widgets.md, When an entry is made), as iOS's
// WidgetReloads and its timeline. A widget drawn by Glance follows its data itself while its
// session runs (the flows below, collected in provideContent); outside one, Glance draws it again
// only when asked (updateAll): as the data changes while the app runs, and as the date turns.

/**
 * What every widget draws from, read from the kit's database and the device's settings, again as
 * they change: shared by the widgets drawn at once, read while any is.
 */
class WidgetSources(
  database: AppDatabase,
  /** The person's own calendar (PochicalKit.ownCalendar). */
  val calendar: Flow<OwnCalendar>,
  settings: SyncedSettings,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  /** What the database holds, for who a widget is set to. */
  val values = database.values()

  // Read while a widget draws; once none does, what was read is forgotten, so the next session
  // starts from the database as it is then, not from the last session's reading.
  private val whileDrawn = SharingStarted.WhileSubscribed(replayExpirationMillis = 0)

  /** The settings the widgets are drawn in. */
  val settings: Flow<DeviceSettings> = settings.settings.shareIn(scope, whileDrawn, replay = 1)

  /** Today, and the next day as the date turns at midnight, for a widget drawn across it. */
  val today: Flow<LocalDate> = flow {
    while (true) {
      emit(LocalDate.now())
      delay(untilMidnight().toMillis())
    }
  }
}

/** Every kind of widget, drawn again. */
suspend fun updateAllWidgets(context: Context) {
  for (widget in listOf(SimpleWidget(), UpcomingWidget(), CalendarWidget(), NextOffWidget())) widget.updateAll(context)
}

/**
 * Keeps the picker's previews drawn in the settings that draw the widgets (the theme, the marks, the
 * week) and on today's date, while the app's screens are open, where the settings change (sync too
 * runs only then): published once for each version of the app in each, the last the system took
 * kept across runs.
 */
suspend fun followForWidgetPreviews(
  context: Context,
  settings: Flow<DeviceSettings>,
  publish: suspend () -> Boolean = { publishWidgetPreviews(context) },
) =
  withContext(Dispatchers.IO) {
    val published = context.getSharedPreferences("widget-previews", Context.MODE_PRIVATE)
    settings
      .map { "${BuildConfig.VERSION_CODE} ${LocalDate.now()} ${listOf(it.themeId, it.look, it.week, it.heading.english)}" }
      .distinctUntilChanged()
      .filter { it != published.getString("drawn", null) }
      // Kept only once the system took every kind's, so one it refused is tried again.
      .collect { drawn -> if (publish()) published.edit { putString("drawn", drawn) } }
  }

/**
 * Gives the picker each kind's generated preview, the sample week in the person's settings (Android
 * 15 on); whether the system took them all, as it takes a few an hour.
 */
suspend fun publishWidgetPreviews(context: Context): Boolean {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return true
  val manager = GlanceAppWidgetManager(context)
  return listOf(SimpleWidgetReceiver::class, UpcomingWidgetReceiver::class, CalendarWidgetReceiver::class, NextOffWidgetReceiver::class)
    .map { manager.setWidgetPreviews(it) }
    .all { it == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS }
}

/**
 * The tables a widget's entry is read from: the person's own, and their groups' for the widgets set
 * to someone.
 */
private val WIDGET_TABLES =
  arrayOf("days", "patterns", "patternOrder", "repeatOrders", "groups", "groupMembers", "memberDays", "memberPatterns", "memberOrders")

/**
 * Draws the widgets again whenever, while the app runs, sync or an edit changes the tables they
 * read, or the settings they are drawn in change: a widget with no session running then reads them
 * anew. A burst of changes is drawn once more after the drawing under way, not once for each.
 */
fun followForWidgets(context: Context, database: AppDatabase, settings: SyncedSettings) {
  CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
    merge(
        database.invalidationTracker.createFlow(*WIDGET_TABLES, emitInitialState = false).map {},
        settings.settings.distinctUntilChanged().drop(1).map {},
      )
      .conflate()
      .collect { updateAllWidgets(context) }
  }
}

/** How long until the next local midnight. */
private fun untilMidnight(): Duration =
  Duration.between(ZonedDateTime.now(), LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()))

/**
 * The date turning, the clock set or the time zone changed: the widgets are drawn for the day it
 * is now, and the next midnight is asked for. Midnight comes as an alarm the system delivers in
 * Doze too (setAndAllowWhileIdle), as a widget's day must turn with the clock's, not hours later.
 */
class WidgetDayReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in ACTIONS) return
    val pending = goAsync()
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
      try {
        schedule(context)
        updateAllWidgets(context)
      } finally {
        pending.finish()
      }
    }
  }

  companion object {
    private const val DAY_TURNED = "app.pochical.widgets.DAY_TURNED"
    private val ACTIONS = setOf(DAY_TURNED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)

    /** Asks for the next midnight, in place of any asked for before: every widget drawn asks. */
    fun schedule(context: Context) {
      val turn = Intent(context, WidgetDayReceiver::class.java).setAction(DAY_TURNED)
      val alarm = PendingIntent.getBroadcast(context, 0, turn, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      context
        .getSystemService(AlarmManager::class.java)
        .setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + untilMidnight().toMillis(), alarm)
    }
  }
}
