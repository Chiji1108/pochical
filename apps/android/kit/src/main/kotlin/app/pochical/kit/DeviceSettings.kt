package app.pochical.kit

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Serializer
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import app.pochical.design.Days
import app.pochical.design.Theme
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlinx.serialization.json.encodeToStream

/**
 * What the person set for their own screens, kept on the device, as iOS's DeviceSettings and
 * /design's device settings are. The parts that are the person's own liking are kept with the
 * account too (Preferences.kt); 外観, the reminders and a picture's light or dark stay with the device.
 */
@Serializable
data class DeviceSettings(
  /** The テーマ's id, as /design's preset, kept as it came so one this app does not know survives. */
  @SerialName("theme") val themeId: String = Theme.Pochical.id,
  val appearance: Appearance = Appearance.System,
  val look: Look = Look(),
  val week: Week = Week(),
  /** シフトの期間: what each page of the calendar holds. */
  val period: ShiftPeriod = ShiftPeriod(),
  val heading: Heading = Heading(),
  /** How a month saved as a picture looks, apart from the app's own look. */
  val picture: PictureLook = PictureLook(),
  /** What 端末カレンダーに追加 puts in besides the shifts, as last left. */
  val calendarAdd: CalendarAdd = CalendarAdd(),
  /** The device's calendar 端末カレンダーに追加 put events in last, picked first next time; the device's own. */
  val deviceCalendar: Long? = null,
  /**
   * Reminders of the person's shifts, sent by this device on its own, so kept with it rather than
   * the account: on every device they would go off on each (spec/sync-protocol.md).
   */
  @Serializable(with = KeptReminders::class) val reminders: List<Reminder> = Reminder.defaults,
  /** The reminders were offered once, after shifts were first entered; never again, whatever the answer. */
  val reminderOffered: Boolean = false,
  /**
   * A repeating order was set up (新しい仕事にする): it fills the days without ポチポチ入力, so the
   * calendar offers the reminders as it next shows.
   */
  val reminderOfferWaiting: Boolean = false,
  /**
   * Android 13's question whether the app may notify was turned down for good, refused once more
   * after being refused before: only the system's settings turn notifications on now.
   */
  val notificationsRefused: Boolean = false,
  /** Android 13's question whether the app may notify was put once at least, whatever the answer. */
  val notificationsAsked: Boolean = false,
) {
  /** The テーマ in use; one no longer known is the app's own. */
  val theme: Theme
    get() = Theme.entries.find { it.id == themeId } ?: Theme.Pochical
}

/** 外観 (/design's Appearance): following the phone, or always light or dark. A テーマ drawn dark wins over it. */
@Serializable
enum class Appearance {
  @SerialName("system") System,
  @SerialName("light") Light,
  @SerialName("dark") Dark,
}

/** How a pattern's mark is drawn: its icon, its emoji or its letter on a tile. */
@Serializable
enum class MarkStyle {
  @SerialName("icon") Icon,
  @SerialName("emoji") Emoji,
  @SerialName("badge") Badge;

  /** Its name as the account keeps it. */
  val id: String
    get() = name.lowercase()
}

/**
 * How a day off shows: on a tint of its color (強調), as a mark alone (印だけ), or left blank
 * (空白), faint again while entering and in a day's week.
 */
@Serializable
enum class OffLook {
  @SerialName("highlight") Highlight,
  @SerialName("mark") Mark,
  @SerialName("blank") Blank;

  /** Its name as the account keeps it. */
  val id: String
    get() = name.lowercase()
}

/**
 * How the person's own month draws days in one shape (/design's CalendarOptions): the shift's name
 * under its mark, and how each pattern that counts as off shows, so 休み can be left blank while
 * 有休 is tinted; a pattern not set yet shows as [off].
 */
@Serializable
data class MarkOptions(
  val names: Boolean = false,
  val off: OffLook = OffLook.Mark,
  val offs: Map<String, OffLook> = emptyMap(),
) {
  /** How the days of the pattern [id] show, when it counts as off. */
  fun offLook(id: String): OffLook = offs[id] ?: off

  /**
   * Sets how the days of the pattern [id] show, and drops the patterns no longer among
   * [offPatterns], so what is kept with the account does not grow with each pattern ever deleted; a
   * look the same as [off] is not kept either, as it says nothing.
   */
  fun withOffLook(look: OffLook, id: String, offPatterns: Collection<String>): MarkOptions =
    copy(offs = offs.filterKeys { it in offPatterns && it != id } + listOfNotNull(if (look == off) null else id to look))
}

/**
 * The marks' look (/design's スタイル): the shape, an icon's fill, whether each shift keeps its own
 * color (色分け) or all take the テーマ's (ワントーン), and the options kept for each shape, so each
 * finds its own as it was left. Icons start with days off highlighted; letters sit on tiles already
 * and emoji bring their own colors, so they start without.
 */
@Serializable
data class Look(
  val style: MarkStyle = MarkStyle.Icon,
  /** Filled (塗り) or outlined (線); icons alone have the choice. */
  val fill: Boolean = true,
  val colored: Boolean = true,
  val icon: MarkOptions = MarkOptions(off = OffLook.Highlight),
  val emoji: MarkOptions = MarkOptions(),
  val badge: MarkOptions = MarkOptions(),
) {
  /** The options of the shape in use. */
  val options: MarkOptions
    get() =
      when (style) {
        MarkStyle.Icon -> icon
        MarkStyle.Emoji -> emoji
        MarkStyle.Badge -> badge
      }

  /** The options of the shape in use changed by [change]. */
  fun withOptions(change: (MarkOptions) -> MarkOptions): Look =
    when (style) {
      MarkStyle.Icon -> copy(icon = change(icon))
      MarkStyle.Emoji -> copy(emoji = change(emoji))
      MarkStyle.Badge -> copy(badge = change(badge))
    }

  /**
   * Sets how the days of the pattern [id] show in the shape in use, and drops from every shape the
   * patterns no longer among [offPatterns].
   */
  fun withOffLook(look: OffLook, id: String, offPatterns: Collection<String>): Look {
    fun MarkOptions.kept() = copy(offs = offs.filterKeys { it in offPatterns })
    return copy(icon = icon.kept(), emoji = emoji.kept(), badge = badge.kept())
      .withOptions { it.withOffLook(look, id, offPatterns) }
  }
}

/**
 * The calendar's week (設定 > カレンダー, kept with the account): the day it starts on, 0 for
 * Sunday through 6 for Saturday, and whether Sundays and Saturdays color the weekdays' heading and
 * holidays their date.
 */
@Serializable
data class Week(
  val start: Int = 0,
  val sunday: Boolean = true,
  val saturday: Boolean = true,
  val holiday: Boolean = true,
) {
  /** The weekday of the week's [column], 0 its first, counted from the day it starts on. */
  fun weekdayAt(column: Int): Int = (start + column) % 7

  /**
   * How [weekday] is colored, a national [holiday] when the day is one: Sundays and holidays in
   * Sunday's color, Saturdays in theirs, each unless turned off.
   */
  fun tone(weekday: Int, holiday: Boolean = false): DayTone =
    when {
      (holiday && this.holiday) || (weekday == 0 && sunday) -> DayTone.Holiday
      weekday == 6 && saturday -> DayTone.Saturday
      else -> DayTone.Plain
    }
}

/** How a weekday's name, or a day's date, is colored as the カレンダー settings have it ([Week.tone]). */
enum class DayTone { Holiday, Saturday, Plain }

/**
 * シフトの期間 (spec/calendar.md, The shift period): the day of the month a page starts on, 1 for
 * the month itself, else 2 to [Days.periodLastStart].
 */
@Serializable
data class ShiftPeriod(val start: Int = 1) {
  companion object {
    val STARTS = 1..Days.periodLastStart
  }
}

/**
 * The calendar's month heading: 月と曜日 in Japanese or English, and what a tap on the month's name
 * does, with おたのしみ's sky (/design's monthName, monthTap and sky).
 */
@Serializable
data class Heading(
  /** 月と曜日 set to English: months as Sep, weekdays as Thu. */
  val english: Boolean = false,
  /** A tap on the month's name lights おたのしみ's sky rather than picking a month. */
  val surprise: Boolean = false,
  /** Which sky is up, kept until the next tap; none until the name is first tapped. */
  val sky: String? = null,
)

/**
 * How a month saved as a picture looks (/design's ImageOptions): it goes to people who do not know
 * the marks, so names start on, and days off are shown, since they could not tell an empty day
 * from one not entered. Light or dark is the screen's until picked.
 */
@Serializable
data class PictureLook(
  val options: MarkOptions = MarkOptions(names = true, off = OffLook.Highlight),
  /** Dark, light, or none to follow the screen. */
  val dark: Boolean? = null,
)

/**
 * What 端末カレンダーに追加 puts in (spec/calendar.md): the patterns picked otherwise than they
 * start, the day's memo and those on it, the last two off until turned on.
 */
@Serializable
data class CalendarAdd(
  val chosen: Map<String, Boolean> = emptyMap(),
  val notes: Boolean = false,
  val people: Boolean = false,
)

/**
 * The device settings kept in the file [produceFile] names, asked for as DataStore first reads, off
 * the main thread. A setting missing from what was kept, or one this app cannot
 * read, takes its default, and a file that cannot be read at all is the defaults, as on iOS.
 */
fun deviceSettingsStore(
  produceFile: () -> File,
  scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
): DataStore<DeviceSettings> =
  DataStoreFactory.create(
    serializer = DeviceSettingsSerializer,
    corruptionHandler = ReplaceFileCorruptionHandler { DeviceSettings() },
    scope = scope,
    produceFile = produceFile,
  )

/** The settings as kept, the defaults while the disk cannot be read, as DataStore's data says to. */
val DataStore<DeviceSettings>.settings: Flow<DeviceSettings>
  get() = data.catch { if (it is IOException) emit(DeviceSettings()) else throw it }

private object DeviceSettingsSerializer : Serializer<DeviceSettings> {
  private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    encodeDefaults = true
  }

  override val defaultValue = DeviceSettings()

  override suspend fun readFrom(input: InputStream): DeviceSettings =
    try {
      json.decodeFromStream(input)
    } catch (e: SerializationException) {
      throw CorruptionException("The device settings are not JSON this app reads", e)
    }

  override suspend fun writeTo(t: DeviceSettings, output: OutputStream) {
    json.encodeToStream(t, output)
  }
}
