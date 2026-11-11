package app.pochical.groups

import androidx.compose.material3.ExperimentalMaterial3Api
import app.pochical.kit.groupEndDay
import app.pochical.kit.groupEndsAt
import app.pochical.repeat.DaysFrom
import app.pochical.repeat.pickerDay
import app.pochical.repeat.pickerMillis
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The day picked for a group's end, from Material's date picker to the moment sent and back to the
 * day shown: the picker names a day by the moment it starts in UTC, whatever the device's time
 * zone, so on a device far from UTC that moment falls on another day by its own clock.
 */
@OptIn(ExperimentalMaterial3Api::class)
class GroupEndPickedDayTest {
  private val zones = listOf("Pacific/Auckland", "Asia/Tokyo", "UTC", "America/Los_Angeles", "Pacific/Honolulu", "Pacific/Kiritimati", "Asia/Beirut")
  private val days = listOf("2026-11-11", "2026-12-31", "2027-01-01", "2028-02-29", "2026-03-08", "2026-03-28", "2026-11-01").map(LocalDate::parse)
  private val device = TimeZone.getDefault()

  @After
  fun restore() {
    TimeZone.setDefault(device)
  }

  private fun eachZone(check: (ZoneId) -> Unit) {
    for (zone in zones) {
      TimeZone.setDefault(TimeZone.getTimeZone(zone))
      check(ZoneId.systemDefault())
    }
  }

  @Test
  fun aDayGoesToThePickerAndComesBackAsItselfWhereverTheDeviceIs() = eachZone { zone ->
    for (day in days) {
      val picked = pickerMillis(day)
      // As Material names it: midnight in UTC.
      assertEquals("$day in $zone", "${day}T00:00:00Z", Instant.ofEpochMilli(picked).toString())
      assertEquals("$day in $zone", day, pickerDay(picked))
    }
  }

  @Test
  fun theDayPickedIsTheDayTheGroupEndsOnAndTheDayShown() = eachZone { zone ->
    for (day in days) {
      val endsAtMs = groupEndsAt(pickerDay(pickerMillis(day)), zone)
      assertEquals("$day in $zone", day, groupEndDay(endsAtMs, zone))
      // The whole of the day picked comes before the end, by the device's clock.
      assertEquals("$day in $zone", day, Instant.ofEpochMilli(endsAtMs - 1).atZone(zone).toLocalDate())
      assertEquals("$day in $zone", day.plusDays(1), Instant.ofEpochMilli(endsAtMs).atZone(zone).toLocalDate())
      assertTrue("$day in $zone", endsAtMs > day.atStartOfDay(zone).toInstant().toEpochMilli())
    }
  }

  @Test
  fun theDaysFromTodayAreTheDevicesNotUtcs() = eachZone { zone ->
    // The device's today at moments when UTC's day is another: early morning east of UTC, late
    // evening west of it.
    for (moment in listOf("2026-11-11T00:30:00Z", "2026-11-11T11:30:00Z", "2026-11-11T23:30:00Z").map(Instant::parse)) {
      val today = moment.atZone(zone).toLocalDate()
      val from = DaysFrom(today)
      assertFalse("$moment in $zone", from.isSelectableDate(pickerMillis(today.minusDays(1))))
      assertTrue("$moment in $zone", from.isSelectableDate(pickerMillis(today)))
      assertTrue("$moment in $zone", from.isSelectableDate(pickerMillis(today.plusDays(1))))
      assertTrue(from.isSelectableYear(today.year))
      assertFalse(from.isSelectableYear(today.year - 1))
      // Today's end is still to come at any moment of today.
      assertTrue("$moment in $zone", groupEndsAt(today, zone) > moment.toEpochMilli())
    }
  }
}
