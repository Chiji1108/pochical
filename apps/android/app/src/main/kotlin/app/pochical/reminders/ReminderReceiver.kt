package app.pochical.reminders

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The system's broadcasts the reminders hear (ReminderAlarms): their alarm going off, and what takes
 * the system's alarms away or moves the clock they were set by, the device starting, the app updated,
 * the clock or its time zone changed and the exact alarms' access granted, after which the next one
 * is asked for again.
 */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarms = (context.applicationContext as ReminderAlarms.Holder).reminderAlarms
    when (intent.action) {
      ACTION_FIRE -> alarms.woke(intent.getLongExtra(EXTRA_AT, 0), goAsync()::finish)
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> alarms.woke(null, goAsync()::finish)
    }
  }

  companion object {
    /** The reminders' alarm, for the minute [EXTRA_AT], in milliseconds since the epoch. */
    const val ACTION_FIRE = "app.pochical.reminders.FIRE"
    const val EXTRA_AT = "at"
  }
}
