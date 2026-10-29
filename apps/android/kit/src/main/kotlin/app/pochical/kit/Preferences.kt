package app.pochical.kit

import app.pochical.v1.CalendarAddPreference
import app.pochical.v1.HeadingPreference
import app.pochical.v1.LookPreference
import app.pochical.v1.PeriodPreference
import app.pochical.v1.ThemePreference
import app.pochical.v1.WeekPreference
import app.pochical.v1.calendarAddPreference
import app.pochical.v1.headingPreference
import app.pochical.v1.lookPreference
import app.pochical.v1.markOptions
import app.pochical.v1.periodPreference
import app.pochical.v1.themePreference
import app.pochical.v1.weekPreference
import com.google.protobuf.InvalidProtocolBufferException
import com.google.protobuf.MessageLite
import app.pochical.v1.MarkOptions as MarkOptionsMessage

/**
 * One part of [DeviceSettings] kept with the account (spec/sync-protocol.md, Preferences): its key,
 * and the message its value is, written and read in one place so a key never goes as one message
 * and is read as another. [take] fails on a value this app cannot read (a name it has none of, a
 * number out of its range), which leaves the device's own.
 */
class PreferencePart<M : MessageLite>(
  val key: String,
  /** The message's full name, as proto/pochical/v1/preferences.proto names it. */
  val message: String,
  private val parse: (ByteArray) -> M,
  private val write: (DeviceSettings) -> M,
  private val take: DeviceSettings.(M) -> DeviceSettings,
) {
  fun encode(settings: DeviceSettings): ByteArray = write(settings).toByteArray()

  /** [settings] with [value] taken, null for a value this app cannot read. */
  fun adopt(settings: DeviceSettings, value: ByteArray): DeviceSettings? =
    try {
      settings.take(parse(value))
    } catch (_: UnreadablePreference) {
      null
    } catch (_: InvalidProtocolBufferException) {
      null
    }
}

/** A preference holding what this app has no name for, or a number out of its range, as an app newer than it may write. */
class UnreadablePreference(message: String) : Exception(message)

/** The marks' look, which goes to the user's groups too (spec/sync-protocol.md, Profile). */
private val lookPart =
  PreferencePart("look", "pochical.v1.LookPreference", LookPreference::parseFrom, { it.look.message }) {
    copy(look = Look(it))
  }

/** The look the account keeps among [preferences], null while it keeps none or one this app cannot read. */
internal fun accountLook(preferences: Map<String, ByteArray>): Look? =
  preferences[lookPart.key]?.let { lookPart.adopt(DeviceSettings(), it)?.look }

/** The parts kept with the account, by key; 外観 and a picture's light or dark are the device's own. */
val preferenceParts: List<PreferencePart<*>> =
  listOf(
    PreferencePart(
      "theme",
      "pochical.v1.ThemePreference",
      ThemePreference::parseFrom,
      { themePreference { id = it.themeId } },
    ) {
      copy(themeId = it.id)
    },
    lookPart,
    PreferencePart("week", "pochical.v1.WeekPreference", WeekPreference::parseFrom, { it.week.message }) {
      copy(week = Week(it))
    },
    PreferencePart("period", "pochical.v1.PeriodPreference", PeriodPreference::parseFrom, { it.period.message }) {
      copy(period = ShiftPeriod(it))
    },
    PreferencePart("heading", "pochical.v1.HeadingPreference", HeadingPreference::parseFrom, { it.heading.message }) {
      copy(heading = Heading(it))
    },
    PreferencePart("picture", "pochical.v1.MarkOptions", MarkOptionsMessage::parseFrom, { it.picture.options.message }) {
      copy(picture = picture.copy(options = MarkOptions(it)))
    },
    PreferencePart(
      "calendarAdd",
      "pochical.v1.CalendarAddPreference",
      CalendarAddPreference::parseFrom,
      { it.calendarAdd.message },
    ) {
      copy(calendarAdd = CalendarAdd(it))
    },
  )

/** The parts kept with the account, each its key's message encoded. */
val DeviceSettings.preferences: Map<String, ByteArray>
  get() = preferenceParts.associate { it.key to it.encode(this) }

/** The parts [preferences] holds; a key this app has none of, or a value it cannot read, leaves the device's own. */
fun DeviceSettings.adopting(preferences: Map<String, ByteArray>): DeviceSettings =
  preferenceParts.fold(this) { settings, part ->
    preferences[part.key]?.let { part.adopt(settings, it) } ?: settings
  }

/** The keys whose value differs between [before] and this. */
fun DeviceSettings.preferencesChanged(before: DeviceSettings): Map<String, ByteArray> {
  val old = before.preferences
  return preferences.filter { (key, value) -> !value.contentEquals(old[key]) }
}

private inline fun <reified E : Enum<E>> known(id: String, ids: (E) -> String): E =
  enumValues<E>().find { ids(it) == id } ?: throw UnreadablePreference("No ${E::class.simpleName} is named $id")

private val MarkOptions.message: MarkOptionsMessage
  get() = markOptions {
    names = this@message.names
    off = this@message.off.id
    // Sorted, so options unchanged encode the same and are not sent again.
    offs.putAll(this@message.offs.toSortedMap().mapValues { it.value.id })
  }

private fun MarkOptions(message: MarkOptionsMessage) =
  MarkOptions(
    names = message.names,
    off = known(message.off, OffLook::id),
    offs = message.offsMap.mapValues { known(it.value, OffLook::id) },
  )

private val Look.message: LookPreference
  get() = lookPreference {
    style = this@message.style.id
    fill = this@message.fill
    colored = this@message.colored
    icon = this@message.icon.message
    emoji = this@message.emoji.message
    badge = this@message.badge.message
  }

private fun Look(message: LookPreference) =
  Look(
    style = known(message.style, MarkStyle::id),
    fill = message.fill,
    colored = message.colored,
    icon = MarkOptions(message.icon),
    emoji = MarkOptions(message.emoji),
    badge = MarkOptions(message.badge),
  )

private val Week.message: WeekPreference
  get() = weekPreference {
    start = this@message.start
    sunday = this@message.sunday
    saturday = this@message.saturday
    holiday = this@message.holiday
  }

private fun Week(message: WeekPreference): Week {
  if (message.start !in 0..6) throw UnreadablePreference("A week starts on day ${message.start}")
  return Week(message.start, message.sunday, message.saturday, message.holiday)
}

/** 0, the message's zero, is the month itself (1日〜末日). */
private val ShiftPeriod.message: PeriodPreference
  get() = periodPreference { startDay = if (start == 1) 0 else start }

private fun ShiftPeriod(message: PeriodPreference): ShiftPeriod {
  val start = message.startDay
  if (start == 0) return ShiftPeriod()
  if (start == 1 || start !in ShiftPeriod.STARTS) throw UnreadablePreference("A period starts on the ${start}th")
  return ShiftPeriod(start)
}

private val Heading.message: HeadingPreference
  get() = headingPreference {
    english = this@message.english
    surprise = this@message.surprise
    this@message.sky?.let { sky = it }
  }

private fun Heading(message: HeadingPreference) =
  Heading(message.english, message.surprise, if (message.hasSky()) message.sky else null)

private val CalendarAdd.message: CalendarAddPreference
  get() = calendarAddPreference {
    chosen.putAll(this@message.chosen.toSortedMap())
    notes = this@message.notes
    people = this@message.people
  }

private fun CalendarAdd(message: CalendarAddPreference) = CalendarAdd(message.chosenMap, message.notes, message.people)
