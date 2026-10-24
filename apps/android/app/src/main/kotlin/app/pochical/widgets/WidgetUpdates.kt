package app.pochical.widgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.pochical.kit.AppDatabase
import app.pochical.kit.SyncedSettings
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

// When the widgets are drawn again (spec/widgets.md, When an entry is made), as iOS's
// WidgetReloads and its timeline: as what they show changes on the device, and as the date turns
// at midnight. Glance draws a widget again when asked (updateAll), and WorkManager wakes the app for
// midnight; nothing asks on a clock of its own.

/** Every kind of widget, drawn again. */
suspend fun updateAllWidgets(context: Context) {
  for (widget in listOf(SimpleWidget(), UpcomingWidget(), CalendarWidget(), NextOffWidget())) widget.updateAll(context)
}

/**
 * The tables a widget's entry is read from: the person's own, and their groups' for the widgets set
 * to someone.
 */
private val WIDGET_TABLES =
  arrayOf("days", "patterns", "patternOrder", "repeatOrders", "groups", "groupMembers", "memberDays", "memberPatterns", "memberOrders")

/**
 * Draws the widgets again whenever, while the app runs, sync or an edit changes the tables they
 * read, or the settings they are drawn in change. A burst of changes is drawn once more after the
 * drawing under way, not once for each.
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

/** Draws the widgets again for the new day, as the date turns at midnight. */
class MidnightWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    updateAllWidgets(applicationContext)
    return Result.success()
  }

  companion object {
    private const val TAG = "widget-midnight"

    /**
     * Asks WorkManager to wake the app at the next midnight, as every widget drawn asks: once a
     * day, named by that day, so a widget drawn again does not put it off, and the one running
     * at midnight does not stand in the way of the next.
     */
    fun schedule(context: Context) {
      val next = LocalDate.now().plusDays(1)
      val delay = Duration.between(ZonedDateTime.now(), next.atStartOfDay(ZoneId.systemDefault()))
      WorkManager.getInstance(context)
        .enqueueUniqueWork(
          "$TAG-$next",
          ExistingWorkPolicy.KEEP,
          OneTimeWorkRequestBuilder<MidnightWorker>().setInitialDelay(delay).addTag(TAG).build(),
        )
    }

    /** Forgets the midnight asked for, which the clock or the time zone moved. */
    fun cancel(context: Context) {
      WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    }
  }
}

/**
 * The clock set or the time zone changed (broadcasts Android still delivers to the manifest): the
 * day may be another, and midnight comes at another time.
 */
class WidgetClockReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_TIME_CHANGED && intent.action != Intent.ACTION_TIMEZONE_CHANGED) return
    val pending = goAsync()
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
      try {
        MidnightWorker.cancel(context)
        // Each widget drawn asks for the next midnight again.
        updateAllWidgets(context)
      } finally {
        pending.finish()
      }
    }
  }
}
