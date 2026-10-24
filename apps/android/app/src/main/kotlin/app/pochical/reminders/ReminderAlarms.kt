package app.pochical.reminders

import android.app.AlarmManager
import android.app.Application
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
  /** The time on the device's clock, in its time zone as it is now. */
  private val clock: () -> ZonedDateTime = { ZonedDateTime.now() },
) {
  /** The app, which holds the one ReminderAlarms for the system's broadcasts, as [ReminderReceiver]. */
  interface Holder {
    val reminderAlarms: ReminderAlarms
  }

  private val alarms = checkNotNull(application.getSystemService(AlarmManager::class.java))

  /** The minute of the alarm set and not yet gone off, kept for as long as the system keeps the alarm. */
  private val kept = application.getSharedPreferences("reminder-alarm", Context.MODE_PRIVATE)

  /** One at a time: the alarm set, shown or taken away by one before another reads it. */
  private val turn = Mutex()
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
        if (firedAt == null) readExact()
        turn.withLock {
          val scheduled = current()
          if (firedAt != null) fired(firedAt, scheduled)
          // Woken by anything but the alarm, the system may hold it no more.
          set(scheduled, cleared = firedAt == null)
        }
      } finally {
        done()
      }
    }
  }

  /**
   * The system brought the alarm of [at]: what is due since, if it may be shown, up to an hour late.
   * One it brings again, as when it was set anew while already on its way, is the alarm spent.
   */
  private fun fired(at: Long, scheduled: Scheduled) {
    if (at != kept.getLong(KEY_SET_FOR, 0)) return
    kept.edit { remove(KEY_SET_FOR) }
    if (!scheduled.allowed) return
    val now = clock()
    val since = maxOf(at - 1, now.toInstant().toEpochMilli() - LATE_MOST_MILLIS)
    scheduled.reminders.sending(scheduled.calendar, Instant.ofEpochMilli(since).atZone(now.zone), now).forEach { show(it, now.zone) }
  }

  private suspend fun current() = Scheduled(calendar.first(), reminders.first(), allowed.value)

  private suspend fun schedule(scheduled: Scheduled) = turn.withLock { set(scheduled, cleared = false) }

  /**
   * Asks the system to wake the app at the next reminder; for none while the app may not notify. One
   * already set and due, which the system has not brought yet (without exact alarms it may come up
   * to an hour late), is left with the system, so setting the next never takes it away; set again
   * only once the system's alarms may be [cleared], as the device started or the app was updated.
   */
  private fun set(scheduled: Scheduled, cleared: Boolean) {
    val now = clock()
    val zone = now.zone
    val setFor = kept.getLong(KEY_SET_FOR, 0)
    val from = searchFrom(setFor, now.toInstant().toEpochMilli())
    if (scheduled.allowed && from < setFor && !cleared) return
    val after = Instant.ofEpochMilli(from).atZone(zone)
    // The nearest days first: most reminders go off within them, and these run on every change.
    val next =
      if (!scheduled.allowed) null
      else
        scheduled.reminders.sending(scheduled.calendar, after, now.plusDays(NEAR_DAYS)).firstOrNull()
          ?: scheduled.reminders.sending(scheduled.calendar, after, now.plusDays(LOOK_AHEAD_DAYS)).firstOrNull()
    if (next == null) {
      kept.edit { remove(KEY_SET_FOR) }
      return alarms.cancel(waking())
    }
    val at = next.at(zone).toInstant().toEpochMilli()
    kept.edit { putLong(KEY_SET_FOR, at) }
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
    const val KEY_SET_FOR = "setFor"

    /** The reminders' notifications are told apart by their tags, the reminder and the shift's day. */
    const val TAG_PREFIX = "reminder."
    const val NOTIFICATION_ID = 2

    /** How far ahead the next one is looked for, a year: with none in it, a change to the days asks again. */
    const val LOOK_AHEAD_DAYS = 366L

    /** The days looked at first, two weeks, as iOS puts in the system's queue. */
    const val NEAR_DAYS = 14L
  }
}

/** How late a reminder the system has not brought yet is still shown: the hour Android 12 may hold an inexact alarm. */
internal const val LATE_MOST_MILLIS = 60 * 60 * 1000L

/**
 * What the next reminder is looked for after, at [now]: just before the alarm set for [setFor]
 * while it is due and the system has not brought it yet, up to [LATE_MOST_MILLIS] late, so setting
 * the next keeps it; else now. Nothing set is 0.
 */
internal fun searchFrom(setFor: Long, now: Long): Long = if (setFor in (now - LATE_MOST_MILLIS)..now) setFor - 1 else now
