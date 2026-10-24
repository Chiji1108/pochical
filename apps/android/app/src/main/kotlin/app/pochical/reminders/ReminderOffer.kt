package app.pochical.reminders

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.pochical.R
import app.pochical.kit.DeviceSettings
import app.pochical.kit.Reminder

// The reminders offered once (spec/calendar.md, Reminders): the first time ポチポチ入力 closes with
// shifts entered, or as the calendar shows after 新しい仕事にする set up a repeating order. Kept on
// this device only, never offered again whatever the answer, as iOS's ReminderOffer.

/**
 * The time the offer says, 21:00, when it is to be made now: never made, Android's question still
 * to be put ([mayAsk]), and a 前日 reminder on, the evening's the offer speaks of.
 */
fun DeviceSettings.reminderOfferTime(mayAsk: Boolean): String? {
  if (reminderOffered || !mayAsk) return null
  return reminders.firstNotNullOfOrNull { reminder -> (reminder.kind as? Reminder.Kind.DayBefore)?.takeIf { reminder.on }?.time }
    ?.removePrefix("0")
}

/** The offer, in few words: what the reminder is for, at [time]; お知らせする brings Android's question. */
@Composable
fun ReminderOfferDialog(time: String, onAccept: () -> Unit, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.reminder_offer)) },
    text = { Text(stringResource(R.string.reminder_offer_about, time)) },
    confirmButton = {
      TextButton(
        onClick = {
          onDismiss()
          onAccept()
        }
      ) {
        Text(stringResource(R.string.reminder_offer_yes))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.reminder_offer_later)) } },
  )
}
