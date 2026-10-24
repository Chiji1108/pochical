package app.pochical.reminders

import android.app.AlarmManager
import android.app.Application
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.pochical.MainActivity
import app.pochical.R
import app.pochical.kit.OwnCalendar
import app.pochical.kit.Reminder
import app.pochical.kit.ReminderFiring
import app.pochical.kit.sending
import app.pochical.notifications.Channels
import app.pochical.notifications.postIfAllowed
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * The reminders' notifications, sent by the device itself (spec/calendar.md, Reminders): the system
 * wakes the app at the next one through AlarmManager, the app shows what is due on the reminders'
 * channel and asks for the one after. It is asked anew whenever the days, the patterns, the
 * reminders or the permissions change, sync's changes among them, and as the clock or its time zone
 * changes, the device starts or the app is updated, which take the system's alarms away.
 *
 * Exact alarms, as a reminder says its time to the minute (21:00に通知が届きます, 開始の15分前), with
 * the special access Android 14 leaves to the person (SCHEDULE_EXACT_ALARM). Without it the system
 * may bring one up to an hour late, so the reminders' page asks for it.
 */
class ReminderAlarms(
  private val application: Application,
  private val calendar: Flow<OwnCalendar>,
  private val reminders: Flow<List<Reminder>>,
  private val allowed: StateFlow<Boolean>,
  private val scope: CoroutineScope,
) {
  /** The app, which holds the one ReminderAlarms for the system's broadcasts, as [ReminderReceiver]. */
  interface Holder {
    val reminderAlarms: ReminderAlarms
  }

  private val alarms = checkNotNull(application.getSystemService(AlarmManager::class.java))
  private val mutableExact = MutableStateFlow(AlarmManagerCompat.canScheduleExactAlarms(alarms))

  /** Whether the system lets the app wake at the minute, as it last said. */
  val exact = mutableExact.asStateFlow()

  /** Follows what the reminders read, as the app starts. */
  fun start() {
    scope.launch {
      combine(calendar, reminders, allowed, exact) { calendar, reminders, allowed, _ -> Scheduled(calendar, reminders, allowed) }
        .collectLatest(::schedule)
    }
  }

  /** Reads again whether the app may wake at the minute: the person may have changed it in the system's settings. */
  fun readExact() {
    mutableExact.value = AlarmManagerCompat.canScheduleExactAlarms(alarms)
  }

  /**
   * The system woke the app for the reminders' alarm of [firedAt], or else as its alarms were taken
   * away or their clock moved: what is due is shown, and the next one set; [done] once it is.
   */
  fun woke(firedAt: Long?, done: () -> Unit) {
    scope.launch {
      try {
        if (firedAt != null) fired(firedAt) else readExact()
        schedule(current())
      } finally {
        done()
      }
    }
  }

  /** The system woke the app for the reminders at [at]: what is due since, if it may be shown. */
  private suspend fun fired(at: Long) {
    val (calendar, reminders, allowed) = current()
    if (!allowed) return
    val zone = ZoneId.systemDefault()
    val since = Instant.ofEpochMilli(at - 1).atZone(zone)
    reminders.sending(calendar, since, ZonedDateTime.now(zone)).forEach { show(it, zone) }
  }

  private suspend fun current() = Scheduled(calendar.first(), reminders.first(), allowed.value)

  /** Asks the system to wake the app at the next reminder; for none while the app may not notify. */
  private fun schedule(scheduled: Scheduled) {
    val zone = ZoneId.systemDefault()
    val now = ZonedDateTime.now(zone)
    val next =
      if (scheduled.allowed) scheduled.reminders.sending(scheduled.calendar, now, now.plusDays(LOOK_AHEAD_DAYS)).firstOrNull() else null
    val wake = waking()
    if (next == null) return alarms.cancel(wake)
    val at = next.at(zone).toInstant().toEpochMilli()
    val fire = waking(at)
    if (AlarmManagerCompat.canScheduleExactAlarms(alarms)) {
      AlarmManagerCompat.setExactAndAllowWhileIdle(alarms, AlarmManager.RTC_WAKEUP, at, fire)
    } else {
      AlarmManagerCompat.setAndAllowWhileIdle(alarms, AlarmManager.RTC_WAKEUP, at, fire)
    }
  }

  /** The one alarm the reminders keep, for [at]; its extras do not tell it apart, so any one of it cancels it. */
  private fun waking(at: Long = 0): PendingIntent =
    PendingIntent.getBroadcast(
      application,
      0,
      Intent(application, ReminderReceiver::class.java).setAction(ReminderReceiver.ACTION_FIRE).putExtra(ReminderReceiver.EXTRA_AT, at),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** [firing] on the reminders' channel: the shift as its title, its hours under it; a tap opens the app. */
  private fun show(firing: ReminderFiring, zone: ZoneId) {
    val notification =
      NotificationCompat.Builder(application, Channels.REMINDER)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(firing.title)
        .setContentText(firing.body)
        .setWhen(firing.at(zone).toInstant().toEpochMilli())
        .setShowWhen(true)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setAutoCancel(true)
        .setContentIntent(
          PendingIntent.getActivity(application, 0, Intent(application, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        )
        .build()
    NotificationManagerCompat.from(application)
      .postIfAllowed(application, "$TAG_PREFIX${firing.reminderId}.${firing.shiftDay}", NOTIFICATION_ID, notification)
  }

  private data class Scheduled(val calendar: OwnCalendar, val reminders: List<Reminder>, val allowed: Boolean)

  private companion object {
    /** The reminders' notifications are told apart by their tags, the reminder and the shift's day. */
    const val TAG_PREFIX = "reminder."
    const val NOTIFICATION_ID = 2

    /** How far ahead the next one is looked for, a year: with none in it, a change to the days asks again. */
    const val LOOK_AHEAD_DAYS = 366L
  }
}
