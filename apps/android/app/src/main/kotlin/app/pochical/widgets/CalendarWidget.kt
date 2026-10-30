package app.pochical.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.pochical.R
import app.pochical.calendar.headingMonth
import app.pochical.calendar.monthText
import app.pochical.calendar.weekdayLetter
import app.pochical.kit.Week
import app.pochical.kit.WidgetDay
import app.pochical.kit.WidgetTone
import java.time.YearMonth

/**
 * カレンダー (/design's TwoWeeksMedium and CalendarLarge; spec/widgets.md, Views): this week and
 * the next in the 4×2, and the month in the 4×4, drawn as the app's month draws its days.
 */
class CalendarWidget : PochicalWidget(previews = setOf(MEDIUM, LARGE)) {
  @Composable
  override fun Content(drawn: Drawn) {
    when {
      drawn.entry.nothingEntered -> FirstRun(drawn)
      LocalSize.current.height >= LARGE_HEIGHT -> MonthView(drawn)
      else -> TwoWeeksView(drawn)
    }
  }
}

/** Where a widget is two cells tall or more past the medium's: the large one's room. */
private val LARGE_HEIGHT = 250.dp

/** Where the month has room, its marks grow, as on most launchers' 4×4. */
private val MONTH_ROOMY = 360.dp

/** Where the two weeks have room, their marks grow. */
private val WEEKS_ROOMY = 150.dp

/**
 * This week and the next, seven across from the week start as the calendar lays them, days already
 * gone faint so the weeks keep their shape; with room, larger marks and more space between the weeks.
 */
@Composable
private fun TwoWeeksView(drawn: Drawn) {
  val entry = drawn.entry
  val roomy = LocalSize.current.height >= WEEKS_ROOMY
  val markSize = (if (roomy) 28.dp else 22.dp) - (if (drawn.named) 4.dp else 0.dp)
  Column(GlanceModifier.fillMaxSize().opening(dayLink(entry.date))) {
    WeekdayHeads(drawn.settings.week, drawn, GlanceModifier.padding(bottom = 4.dp))
    for (row in 0 until 2) {
      if (row == 1) Spacer(GlanceModifier.height(if (roomy) 8.dp else 4.dp))
      Row(GlanceModifier.fillMaxWidth().defaultWeight()) {
        for (day in entry.twoWeeks.subList(row * 7, row * 7 + 7)) {
          GridDay(day, drawn, markSize, inMonth = true, inWeek = true, gone = day.date < entry.date)
        }
      }
    }
  }
}

/**
 * The month with every day's mark, and today's change over it. A month of six weeks is 42 days, so
 * a day is drawn in few views and the month leaves room under the 500 Glance gives a widget (#1059).
 */
@Composable
private fun MonthView(drawn: Drawn) {
  val entry = drawn.entry
  val colors = drawn.colors
  val roomy = LocalSize.current.height >= MONTH_ROOMY
  val markSize = (if (roomy) 24.dp else 20.dp) - (if (drawn.named) 4.dp else 0.dp)
  Column(GlanceModifier.fillMaxSize().opening(dayLink(entry.date))) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      // The month as the calendar titles it: 9月, or sep.
      val month = YearMonth.from(entry.date)
      Words(if (drawn.english) month.headingMonth else month.monthText, colors.words, 20.sp, bold = true, modifier = GlanceModifier.defaultWeight())
      entry.today.change?.let { Words("${drawn.words.inDays(0)} $it", colors.secondary, 13.sp) }
    }
    WeekdayHeads(drawn.settings.week, drawn, GlanceModifier.padding(top = 8.dp, bottom = 4.dp))
    for (week in entry.month) {
      Row(GlanceModifier.fillMaxWidth().defaultWeight()) {
        for (day in week) GridDay(day, drawn, markSize, inMonth = day.date.month == entry.date.month)
      }
    }
  }
}

/** The weekdays over the days, from the person's week start, in Sunday's and Saturday's colors. */
@Composable
private fun WeekdayHeads(week: Week, drawn: Drawn, modifier: GlanceModifier) {
  Row(modifier.fillMaxWidth()) {
    for (index in 0 until 7) {
      val weekday = (week.start + index) % 7
      val tone =
        when {
          weekday == 0 && week.sunday -> WidgetTone.Holiday
          weekday == 6 && week.saturday -> WidgetTone.Saturday
          else -> WidgetTone.Plain
        }
      Words(weekdayLetter(weekday, drawn.english), drawn.colors.weekday(tone), 11.sp, modifier = GlanceModifier.defaultWeight(), center = true)
    }
  }
}

/**
 * A day in a grid of days, drawn as the calendar's day: the date at the top, red only for a
 * holiday, today's in the accent, heavier and framed; the mark in the room under it; a day off on
 * its tile; days of the months beside, and days gone in the two weeks, faded.
 *
 * The tile is the day's background, which Glance draws in the Box it puts round a day that opens
 * something, with the tap's ripple: the Box, the tile and the ripple are the day's only views
 * besides what it shows.
 */
@Composable
private fun RowScope.GridDay(
  day: WidgetDay,
  drawn: Drawn,
  markSize: Dp,
  inMonth: Boolean,
  inWeek: Boolean = false,
  gone: Boolean = false,
) {
  val off = OffDrawing(day, drawn, inWeek)
  val tiled = off.tile && inMonth
  var cell = GlanceModifier.defaultWeight().fillMaxHeight()
  if (tiled) cell = cell.background(WidgetShape.dayTile, colorFilter = ColorFilter.tint(drawn.tileColor(day)))
  cell = cell.opening(dayLink(day.date)).spoken(day, drawn.words).padding(R.dimen.widget_day_gap)
  if (day.date == drawn.entry.date) {
    // Today's frame: the accent's, round the day, as the calendar frames it.
    Box(cell) {
      Fill(WidgetShape.frame, drawn.colors.accentFrame)
      DayFace(day, drawn, markSize, inMonth, gone, off, tiled, GlanceModifier.fillMaxSize().padding(R.dimen.widget_frame_width))
    }
  } else {
    DayFace(day, drawn, markSize, inMonth, gone, off, tiled, cell)
  }
}

/** A day's date over its mark, inside [modifier]. */
@Composable
private fun DayFace(day: WidgetDay, drawn: Drawn, markSize: Dp, inMonth: Boolean, gone: Boolean, off: OffDrawing, tiled: Boolean, modifier: GlanceModifier) {
  val colors = drawn.colors
  val isToday = day.date == drawn.entry.date
  Column(modifier.padding(vertical = 3.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    val faded = !inMonth || gone
    val dateColor = if (isToday) colors.accent else if (day.holiday) colors.holiday else colors.words
    Text(
      day.date.dayOfMonth.toString(),
      GlanceModifier.noteStroke(day.noted, drawn.strokeColor(day, onTile = tiled)),
      style =
        TextStyle(
          color = if (faded) colors.secondary else dateColor,
          fontSize = 11.sp,
          fontWeight = if (isToday) FontWeight.Bold else if (inMonth) FontWeight.Medium else FontWeight.Normal,
        ),
    )
    if (day.pattern != null && !off.hidden) {
      DayMark(day, drawn, markSize, faint = off.faint || faded, named = drawn.named, onItsTile = tiled, modifier = GlanceModifier.fillMaxWidth().defaultWeight())
    }
  }
}

class CalendarWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget = CalendarWidget()
}

