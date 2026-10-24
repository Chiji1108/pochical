package app.pochical.widgets

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
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
import app.pochical.mark
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import androidx.datastore.preferences.core.Preferences
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.glance.LocalSize
import androidx.compose.ui.unit.DpSize
import androidx.compose.runtime.collectAsState

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
  actionStartActivity(Intent(Intent.ACTION_VIEW, link.toUri(), context, MainActivity::class.java))

/** The modifier that opens [link] on a tap. */
@Composable
fun GlanceModifier.opening(link: String): GlanceModifier = clickable(open(LocalContext.current, link))

/** The modifier that reads a whole day aloud as one, in [words]' language. */
fun GlanceModifier.spoken(day: WidgetDay, words: WidgetWords): GlanceModifier = semantics { contentDescription = words.spoken(day) }

/**
 * Every kind of widget: the person's own days, read from the kit's database when the widget is
 * drawn and again as they change while Glance keeps its session, in the size the launcher gives it
 * (Glance's LocalSize), the next midnight asked for. [chooses] is who a widget may be set to
 * (spec/widgets.md, 次の休み with someone or a group), kept in its Glance state; [previews] the
 * sizes the picker's preview is drawn at.
 */
abstract class PochicalWidget(
  private val chooses: Choosing = Choosing.Nobody,
  previews: Set<DpSize>,
) : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact

  override val stateDefinition = PreferencesGlanceStateDefinition

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val sources = (context.applicationContext as PochicalApplication).widgetSources
    val country = holidayCountry()
    // What is there now, so the first drawing is whole; then again as it changes, while the
    // session runs.
    val calendar = sources.calendar.first()
    val settings = sources.settings.first()
    val firstChoice = choiceIn(getAppWidgetState(context, stateDefinition, id))
    val firstRead = Companion(firstChoice, firstChoice?.let { sources.values.companion(it, LocalDate.now()).first() })
    WidgetDayReceiver.schedule(context)
    provideContent {
      val shownCalendar by sources.calendar.collectAsState(calendar)
      val shownSettings by sources.settings.collectAsState(settings)
      val today by sources.today.collectAsState(LocalDate.now())
      val choice = choiceIn(currentState())
      val read by
        remember(choice, today) {
          choice?.let { picked -> sources.values.companion(picked, today).map { Companion(picked, it) } } ?: flowOf(Companion(null, null))
        }
          .collectAsState(firstRead)
      val drawn =
        remember(shownCalendar, shownSettings, today, read) {
          // Read for another choice than the one now kept: the person's own days until it is.
          val companion = read.companion.takeIf { read.choice == choice }
          val entry = shownCalendar.widgetEntry(today, shownSettings.week, { it.holidayName(country) != null }, companion)
          // Picked, but no longer there: what the widget shows changes only when the person changes it.
          val gone = choice != null && read.choice == choice && companion == null
          Drawn(entry.copy(pickAgain = choice?.groupId?.takeIf { gone }), shownSettings)
        }
      Framed(drawn)
    }
  }

  /** The picker's generated preview (Android 15 on): the sample week, in the person's settings. */
  override val previewSizeMode = SizeMode.Responsive(previews)

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val settings = (context.applicationContext as PochicalApplication).widgetSources.settings.first()
    val drawn = Drawn(sampleWidgetEntry(LocalDate.now(), settings.week), settings)
    provideContent { Framed(drawn) }
  }

  @Composable
  private fun Framed(drawn: Drawn) {
    GlanceTheme {
      Box(GlanceModifier.fillMaxSize().background(drawn.colors.ground).padding(WIDGET_MARGIN)) { Content(drawn) }
    }
  }

  /** Who the widget is set to, as [state] keeps it; groups themselves only where they may be picked. */
  private fun choiceIn(state: Preferences): WidgetChoice? =
    when (chooses) {
      Choosing.Nobody -> null
      Choosing.People -> WidgetChoice.of(state[WidgetChoice.KEY]) as? WidgetChoice.Member
      Choosing.PeopleAndGroups -> WidgetChoice.of(state[WidgetChoice.KEY])
    }

  @Composable protected abstract fun Content(drawn: Drawn)

  /** Who a kind of widget can be set to. */
  enum class Choosing { Nobody, People, PeopleAndGroups }

  /** Who [choice] is, as last read. */
  private data class Companion(val choice: WidgetChoice?, val companion: WidgetCompanion?)
}

/** A phone's 2×2, 4×2 and 4×4, the sizes a kind's preview is drawn at among those it offers (/design's android families). */
val SMALL = DpSize(179.dp, 202.dp)
val MEDIUM = DpSize(373.dp, 202.dp)
val LARGE = DpSize(373.dp, 415.dp)

/** The room Material keeps between a widget's edge and what is in it. */
val WIDGET_MARGIN = 16.dp

/** The room inside a widget, its size less the margins round it. */
val innerSize: DpSize
  @Composable get() = LocalSize.current.let { DpSize(it.width - WIDGET_MARGIN * 2, it.height - WIDGET_MARGIN * 2) }

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

/** A day's slot in the テーマ's shift colors: its pattern's, the テーマ's own in ワントーン. */
fun Drawn.slot(day: WidgetDay): Int = if (look.colored) day.pattern?.color ?: 0 else 0

/** A day off's tile color: its pattern's tint. */
fun Drawn.tileColor(day: WidgetDay): ColorProvider = colors.markTint(slot(day))

/** A memo's stroke under a day's date, on its tile when it is on one. */
fun Drawn.strokeColor(day: WidgetDay, onTile: Boolean): ColorProvider = if (onTile) colors.noteOnTint(slot(day)) else colors.noteMarker

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

  /** The whole day read aloud: its date, the shift and its hours, and a memo. */
  fun spoken(day: WidgetDay): String {
    val shift = day.pattern?.name ?: if (english) "No shift" else "予定なし"
    val memo = if (day.noted) (if (english) "memo" else "メモあり") else null
    return listOfNotNull(date(day.date), shift, day.time, memo).joinToString(if (english) ", " else "、")
  }

  val tomorrow = if (english) "Tomorrow" else "明日"
  val nothingYet = if (english) "Nothing yet" else "まだ入っていません"
  val firstRun = if (english) "Shifts you enter\nshow here" else "シフトを入れると\nここに出ます"
}

/** The words a day says under its mark: what changed, 予定なし where nothing is entered, else nothing. */
val WidgetDay.news: String?
  get() = if (pattern == null) "予定なし" else change
