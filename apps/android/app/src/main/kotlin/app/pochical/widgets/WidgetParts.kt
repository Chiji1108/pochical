package app.pochical.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.pochical.MainActivity
import app.pochical.PochicalApplication
import app.pochical.R
import app.pochical.calendar.fullText
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.holidayName
import app.pochical.calendar.shortMonth
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayName
import app.pochical.design.Theme
import app.pochical.design.ThemeColors
import app.pochical.kit.DeviceSettings
import app.pochical.kit.OffLook
import app.pochical.kit.dayName
import app.pochical.kit.ownCalendar
import app.pochical.mark
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.flow.first

// The pieces every kind of widget draws days with (iOS's WidgetParts.swift; /design's
// design-widgets.tsx): the colors, a day's mark or dash and its name, a day off's look, the memo's
// stroke, the words a day is written and read in, and where a tap opens the app.

/**
 * The widget's colors (spec/widgets.md, Colors): the ground and words the wallpaper's (Material
 * You, Glance's own), and what carries meaning the テーマ's, light or dark as the launcher draws.
 */
class WidgetColors(theme: Theme) {
  private val light = theme.colors(dark = false)
  private val dark = theme.colors(dark = true)

  private fun of(role: (ThemeColors) -> Color): ColorProvider = ColorProvider(day = role(light), night = role(dark))

  val ground: ColorProvider
    @Composable get() = GlanceTheme.colors.surface

  val words: ColorProvider
    @Composable get() = GlanceTheme.colors.onSurface

  val secondary: ColorProvider
    @Composable get() = GlanceTheme.colors.onSurfaceVariant

  /** Lines: Glance's roles have no outlineVariant, and surfaceVariant is the nearest to it. */
  val line: ColorProvider
    @Composable get() = GlanceTheme.colors.surfaceVariant

  /** Quieter than secondary words: a dash's, and a weekday's without a color of its own. */
  val quiet: ColorProvider
    @Composable get() = GlanceTheme.colors.outline

  /** Today's date and frame: the calendar's accent, as the marks keep the テーマ's. */
  val accent = of { it.accentDefault }
  val accentFrame = of { it.accentFocus }
  val holiday = of { it.calendarHoliday }
  val saturday = of { it.calendarSaturday }
  val noteMarker = of { it.calendarNoteMarker }

  /** A day off in the group's tables: the テーマ's light tint, whatever the pattern. */
  val groupTint = of { it.accentContainer }

  fun mark(slot: Int) = of { it.mark(slot).color }

  fun markTint(slot: Int) = of { it.mark(slot).tint }

  /** A memo's stroke on a day off's tile: the tile's color a step deeper. */
  fun noteOnTint(slot: Int) = of { it.mark(slot).noteOnTint }

  /** A weekday's color over a column of days: Sunday's and Saturday's as the person colors them, else quiet. */
  @Composable
  fun weekday(tone: WidgetTone): ColorProvider =
    when (tone) {
      WidgetTone.Holiday -> holiday
      WidgetTone.Saturday -> saturday
      WidgetTone.Plain -> quiet
    }
}

/** What a widget is drawn from: the entry, and the settings it is drawn in. */
class Drawn(val entry: WidgetEntry, val settings: DeviceSettings) {
  val colors = WidgetColors(settings.theme)
  val look = settings.look
  val english = settings.heading.english
  val words = WidgetWords(english)

  /** Shift names under the marks, as the person's calendar shows them. */
  val named = look.options.names

  /** Where a day opens: the group's table set to someone or a group, else the calendar. */
  fun link(day: LocalDate): String = entry.with?.let { groupLink(it.groupId, day) } ?: dayLink(day)
}

/** The link that opens the app on a day (spec/widgets.md, Opening the app). */
fun dayLink(day: LocalDate) = "pochical://day/$day"

/** The group's table at a day, or its top, where whose days make it count can be seen. */
fun groupLink(groupId: String, day: LocalDate? = null) = "pochical://group/$groupId" + (day?.let { "/day/$it" } ?: "")

/** Opens the app on [link], as a tap on a widget does. */
fun open(context: Context, link: String): Action =
  actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java))

/** The modifier that opens [link] on a tap. */
@Composable
fun GlanceModifier.opening(link: String): GlanceModifier = clickable(open(LocalContext.current, link))

/** The modifier that reads a whole day aloud as one. */
fun GlanceModifier.spoken(day: WidgetDay, english: Boolean): GlanceModifier = semantics { contentDescription = day.spoken(english) }

/**
 * Every kind of widget: the person's own days, read from the kit's database when the widget is
 * drawn, in the size the launcher gives it (Glance's LocalSize), the next midnight asked for.
 */
abstract class PochicalWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val drawn = read(context, id)
    MidnightWorker.schedule(context)
    provideContent {
      GlanceTheme {
        Box(GlanceModifier.fillMaxSize().background(drawn.colors.ground).padding(WIDGET_MARGIN)) { Content(drawn) }
      }
    }
  }

  /** What this widget is drawn from now. */
  protected open suspend fun read(context: Context, id: GlanceId): Drawn = readOwn(context)

  @Composable protected abstract fun Content(drawn: Drawn)
}

/** The room Material keeps between a widget's edge and what is in it. */
val WIDGET_MARGIN = 16.dp

/** The person's own entry for today, and the settings, as the database and the device keep them. */
suspend fun readOwn(context: Context, today: LocalDate = LocalDate.now()): Drawn {
  val sources = (context.applicationContext as PochicalApplication).widgetSources
  val settings = sources.settings.settings.first()
  val calendar = sources.kit.database.values().ownCalendar().first()
  val country = holidayCountry()
  return Drawn(calendar.widgetEntry(today, settings.week, { it.holidayName(country) != null }), settings)
}

/** How a day off shows, following 休みの見せ方 for its pattern as the calendar does. */
class OffDrawing(day: WidgetDay, drawn: Drawn, inWeek: Boolean) {
  /** On its pattern's tile (強調). */
  val tile: Boolean

  /** Its mark faint (空白, in a week of days) or none (空白). */
  val faint: Boolean
  val hidden: Boolean

  init {
    val look = day.pattern?.takeIf { day.off }?.let { drawn.look.options.offLook(it.id) }
    tile = look == OffLook.Highlight
    faint = look == OffLook.Blank && inWeek
    hidden = look == OffLook.Blank && !inWeek
  }
}

/** A day off's tile color: its pattern's tint, the テーマ's in ワントーン. */
fun Drawn.tileColor(day: WidgetDay): ColorProvider = colors.markTint(if (look.colored) day.pattern?.color ?: 0 else 0)

/**
 * A day's mark, or a quiet dash where nothing is entered; with names on, the name small under it,
 * the two one group. [reserve] keeps the name's line on a day without one, so the marks of a row
 * stay level.
 */
@Composable
fun DayMark(day: WidgetDay, drawn: Drawn, size: Dp, faint: Boolean = false, named: Boolean = false, reserve: Boolean = false, large: Boolean = false) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    val pattern = day.pattern
    if (pattern != null) {
      WidgetShiftMark(pattern, size, day.timeChange, drawn.look, drawn.colors, faint)
    } else {
      NothingMark(size, drawn.colors)
    }
    if (named && (pattern != null || reserve)) {
      Text(
        pattern?.let { dayName(it.name) } ?: " ",
        style = TextStyle(color = drawn.colors.secondary, fontSize = if (large) 11.sp else 9.sp),
        maxLines = 1,
      )
    }
  }
}

/**
 * [content] with a memo's stroke under it, the calendar's highlighter, when [noted]: the lower part
 * of its box, a little wider than it, drawn behind it.
 */
@Composable
fun NoteStroke(noted: Boolean, color: ColorProvider, content: @Composable () -> Unit) {
  if (!noted) return content()
  Box(
    GlanceModifier.background(ImageProvider(R.drawable.widget_note_stroke), colorFilter = ColorFilter.tint(color))
      .padding(horizontal = 3.dp)
  ) {
    content()
  }
}

/** Text in a widget, one line unless said. */
@Composable
fun Words(text: String, color: ColorProvider, size: TextUnit, bold: Boolean = false, modifier: GlanceModifier = GlanceModifier, center: Boolean = false, maxLines: Int = 1) {
  Text(
    text,
    modifier,
    style =
      TextStyle(
        color = color,
        fontSize = size,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
        textAlign = if (center) TextAlign.Center else null,
      ),
    maxLines = maxLines,
  )
}

/** Before anything is entered: where the days will come from, in the middle of the widget's room. */
@Composable
fun FirstRun(drawn: Drawn) {
  Box(GlanceModifier.fillMaxSize().opening(dayLink(drawn.entry.date)), contentAlignment = Alignment.Center) {
    Words(drawn.words.firstRun, drawn.colors.secondary, 13.sp, center = true, maxLines = 2)
  }
}

/** The widgets' few words in Japanese or English (/design's useWords), as 月と曜日 sets. */
class WidgetWords(val english: Boolean) {
  /** A date as a widget names a day: 9月24日(木), or Thu, Sep 24. */
  fun date(day: LocalDate): String =
    if (english) "${weekdayName(day.weekday, true)}, ${shortMonth(day)} ${day.dayOfMonth}" else day.fullText

  /** A date short, as a widget heads one day: 9月24日, Sep 24. */
  fun shortDate(day: LocalDate): String = if (english) "${shortMonth(day)} ${day.dayOfMonth}" else "${day.monthValue}月${day.dayOfMonth}日"

  private fun shortMonth(day: LocalDate) = YearMonth.from(day).shortMonth(true)

  /** The month small before the first column's date: 9/, or Sep. */
  fun columnMonth(day: LocalDate): String = if (english) "${shortMonth(day)} " else "${day.monthValue}/"

  /** When a day comes: 今日, 明日, else how many days on. */
  fun inDays(count: Int): String =
    when {
      english -> if (count == 0) "Today" else if (count == 1) "Tomorrow" else "in $count days"
      else -> if (count == 0) "今日" else if (count == 1) "明日" else "${count}日後"
    }

  val tomorrow = if (english) "Tomorrow" else "明日"
  val nothingYet = if (english) "Nothing yet" else "まだ入っていません"
  val firstRun = if (english) "Shifts you enter\nshow here" else "シフトを入れると\nここに出ます"
}

/** The whole day read aloud: its date, the shift and its hours, in the language its date is shown in. */
fun WidgetDay.spoken(english: Boolean): String {
  val parts = listOfNotNull(WidgetWords(english).date(date), pattern?.name ?: "予定なし", time, if (noted) (if (english) "memo" else "メモあり") else null)
  return parts.joinToString(if (english) ", " else "、")
}

/** The words a day says under its mark: what changed, 予定なし where nothing is entered, else nothing. */
val WidgetDay.news: String?
  get() = if (pattern == null) "予定なし" else change
