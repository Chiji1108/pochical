package app.pochical.kit

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// A group's end (spec/sync-protocol.md, A group's end; spec/vectors/group-end.json): one moment for
// everyone, picked and shown as a day by each device's own clock.

/**
 * The moment a group whose end date is [day] ends, picked on a device in [zone], in ms since the
 * epoch: the first moment of the day after, which is not always midnight nor 24 hours after [day]
 * began.
 */
fun groupEndsAt(day: LocalDate, zone: ZoneId): Long = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()

/**
 * The end date a device in [zone] shows for a group ending at [endsAtMs]: the day the moment just
 * before it falls on by that device's clock, so the device that picked a day shows that day.
 */
fun groupEndDay(endsAtMs: Long, zone: ZoneId): LocalDate = Instant.ofEpochMilli(endsAtMs - 1).atZone(zone).toLocalDate()

/**
 * The first day that can be chosen as a group's end on a device whose day is [today]: tomorrow,
 * never today, whose end could be minutes away and would take everyone's chat and photos with it
 * (spec/vectors/group-end.json, firstDay).
 */
fun firstGroupEndDay(today: LocalDate): LocalDate = today.plusDays(1)

/**
 * The first day the date picker offers for a group whose end is [current], none for a group with
 * no end: [firstGroupEndDay], or [current] when that is earlier, as an end set yesterday for today
 * is: the day the group ends on stays there to see and to go back to, and picking it changes
 * nothing.
 */
fun groupEndPickerFirstDay(today: LocalDate, current: LocalDate?): LocalDate = minOf(firstGroupEndDay(today), current ?: firstGroupEndDay(today))
