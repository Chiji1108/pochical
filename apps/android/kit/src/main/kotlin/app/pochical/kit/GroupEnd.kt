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
